# Zurg Library Change Detection and Efficient Fetching System

## Overview

Zurg implements a sophisticated system for detecting changes in the Real-Debrid torrent library and efficiently fetching updates. The system uses multiple optimization strategies including state-based change detection, multi-level caching, parallel processing, and intelligent diff processing.

## 1. Core Components

### 1.1 LibraryState Structure

The heart of change detection is the `LibraryState` struct that captures a snapshot of the library:

```go
type LibraryState struct {
    TotalCount     int            // Total number of torrents
    ActiveCount    int            // Number of downloading torrents
    FirstTorrentId string         // ID of first torrent (order change detection)
    log            *logutil.Logger
}
```

### 1.2 State Comparison

The comparison method detects any changes in the library:

```go
func (ls *LibraryState) Eq(a LibraryState) bool {
    if a.TotalCount != ls.TotalCount {
        ls.log.Debugf("Detected changes! Total count mismatch: was %d now %d", ls.TotalCount, a.TotalCount)
        return false
    } else if a.ActiveCount != ls.ActiveCount {
        ls.log.Debugf("Detected changes! In progress count mismatch: was %d now %d", ls.ActiveCount, a.ActiveCount)
        return false
    } else if a.FirstTorrentId != ls.FirstTorrentId {
        ls.log.Debugf("Detected changes! First torrent id mismatch: was %s now %s", ls.FirstTorrentId, a.FirstTorrentId)
        return false
    }
    return true
}
```

## 2. Initialization Phase

### 2.1 TorrentManager Creation

When Zurg starts, it creates the TorrentManager with atomic state management:

```go
func NewTorrentManager(cfg *config.ZurgConfigV1, api *realdebrid.RealDebrid, scanner *scan.MediaScanner, hasFFprobe bool, log, repairLog *logutil.Logger) *TorrentManager {
    initCtx := context.WithValue(context.Background(), rdclient.CtxOriginKey{}, "torrent_manager_init")

    t := &TorrentManager{
        requiredVersion: "0.10.0",
        Config:    cfg,
        rd:        api,
        scanner:   scanner,
        log:       log,
        repairLog: repairLog,

        DirectoryMap: cmap.New[cmap.ConcurrentMap[string, *Torrent]](),
        DownloadMap:  cmap.New[*realdebrid.Download](),

        RemountTrigger:   make(chan struct{}, 1),
        AnalyzeTrigger:   make(chan struct{}, 1),
        PlexMatchTrigger: make(chan struct{}, 1),

        RepairQueue: mapset.NewSet[*Torrent](),
        inProgressInfoAccessKeys: cmap.New[mapset.Set[string]](),

        hasFFprobe:  hasFFprobe,
        initialized: make(chan struct{}),
    }

    // Initialize latestState with atomic.Pointer
    t.latestState.Store(&LibraryState{log: log})

    // Initialize enableRepair from config
    t.enableRepair.Store(cfg.EnableRepair())

    t.initializeDirectoryMaps()

    t.RunInBackground(func() {
        t.loadCachedTorrents(initCtx)
        t.refreshTorrents(initCtx)
        // Validate and clean up stuck torrents after loading
        t.ValidateStuckTorrentsOnStartup(initCtx)
        if t.Config.ShouldSaveSTRMFiles() {
            t.createSTRMFilesForAllTorrents(initCtx)
        }
        // Signal initialization complete
        close(t.initialized)
        t.StartRefreshJob()
        t.StartDownloadsJob()
        t.StartRepairMan()
        t.StartMediaAnalysisJob()
        t.setNewLatestState(t.getCurrentState(initCtx))
        t.mountNewDownloads(initCtx)
        t.EnqueueForRepair(initCtx, nil)
        t.StartIMDBIDJob(initCtx)
    })

    return t
}
```

## 3. Change Detection System

### 3.1 Getting Current State

The system captures the current library state efficiently:

```go
func (t *TorrentManager) getCurrentState(ctx context.Context) LibraryState {
    var state LibraryState

    torrents, totalCount, err := t.rd.GetTorrents(ctx, true)
    if err != nil {
        t.log.Warnf("Checksum API Error (GetTorrents): %v", err)
        currentState := t.latestState.Load()
        state.TotalCount = currentState.TotalCount
        state.FirstTorrentId = currentState.FirstTorrentId
    } else {
        state.TotalCount = totalCount
        if len(torrents) > 0 {
            state.FirstTorrentId = torrents[0].ID
        }
    }

    count, err := t.rd.GetActiveTorrentCount(ctx)
    if err != nil {
        t.log.Warnf("Checksum API Error (GetActiveTorrentCount): %v", err)
        currentState := t.latestState.Load()
        state.ActiveCount = currentState.ActiveCount
    } else {
        state.ActiveCount = count.DownloadingCount
    }

    return state
}
```

### 3.2 State Update

Atomic state updates ensure thread safety:

```go
func (t *TorrentManager) setNewLatestState(checksum LibraryState) {
    // Create a new state object to maintain immutability
    newState := &LibraryState{
        ActiveCount:    checksum.ActiveCount,
        TotalCount:     checksum.TotalCount,
        FirstTorrentId: checksum.FirstTorrentId,
        log:            t.latestState.Load().log,
    }
    t.latestState.Store(newState)
}
```

### 3.3 Periodic Refresh Job

The refresh job runs continuously to detect changes:

```go
func (t *TorrentManager) StartRefreshJob() {
    t.RunInBackgroundWithRetry(func() {
        t.log.Debug("Starting periodic refresh job")
        refreshTicker := time.NewTicker(time.Duration(t.Config.GetRefreshEverySecs()) * time.Second)
        defer refreshTicker.Stop()

        for range refreshTicker.C {
            func() {
                defer func() {
                    if r := recover(); r != nil {
                        t.log.Warnf("Recovering from panic in refreshing torrents: %v", r)
                        time.Sleep(1 * time.Minute)
                    }
                }()
                ctx := context.WithValue(context.Background(), rdclient.CtxOriginKey{}, "refresh")
                checksum := t.getCurrentState(ctx)
                if t.latestState.Load().Eq(checksum) {
                    return
                }
                t.setNewLatestState(checksum)
                t.refreshTorrents(ctx)
            }()
        }
    }, MAX_RETRIES)
}
```

## 4. Efficient Library Fetching

### 4.1 Smart Caching with Cache Hit Detection

The system implements intelligent caching to minimize API calls:

```go
func (rd *RealDebrid) GetTorrentsWithCache(ctx context.Context, onlyOne bool, useCache bool) ([]Torrent, int, error) {
    if onlyOne {
        result := rd.fetchPageOfTorrents(ctx, 1, 1)
        if result.err != nil {
            return nil, 0, result.err
        }
        return result.torrents, result.total, nil
    }

    pageSize := rd.cfg.GetFetchTorrentsPageSize()

    firstPage := rd.fetchPageOfTorrents(ctx, 1, pageSize)
    if firstPage.err != nil {
        return nil, 0, firstPage.err
    }
    if firstPage.total == 0 {
        return []Torrent{}, 0, nil
    }

    totalCount := firstPage.total
    expectedCount := (totalCount + pageSize - 1) / pageSize * pageSize

    // Get the rest of the torrents from cache if possible and if cache usage is enabled
    if useCache {
        cachedTorrents := rd.torrentsCache.Load()
        if cachedTorrents != nil {
            for cIdx, cached := range *cachedTorrents {
                for fIdx, fresh := range firstPage.torrents {
                    cIdxEnd := len(*cachedTorrents) - 1 - cIdx
                    fIdxEnd := expectedCount - 1 - fIdx
                    if fresh.ID == cached.ID && fresh.Progress == cached.Progress && fIdxEnd == cIdxEnd {
                        allTorrents := firstPage.torrents[:fIdx]
                        allTorrents = append(allTorrents, (*cachedTorrents)[cIdx:]...)
                        return allTorrents, len(allTorrents), nil
                    }
                }
            }
        }
    }

    // Fetch all torrents in parallel
    maxPages := (totalCount + pageSize - 1) / pageSize
    rd.log.Debugf("Total torrent pages to fetch: %d (page size: %d)", maxPages, pageSize)
    resultsCh := make(chan fetchTorrentsResult, maxPages)
    for pageIdx := 2; pageIdx <= maxPages; pageIdx++ {
        pageNum := pageIdx
        go func(pageNum int) {
            resultsCh <- rd.fetchPageOfTorrents(ctx, pageNum, pageSize)
        }(pageNum)
    }

    totalFetched := len(firstPage.torrents)
    torrentPages := make([][]Torrent, maxPages)
    torrentPages[0] = firstPage.torrents
    for i := 2; i <= maxPages; i++ {
        result := <-resultsCh
        if result.err != nil {
            return nil, 0, result.err
        }
        torrentPages[result.page-1] = result.torrents
        totalFetched += len(result.torrents)
    }

    allTorrents := firstPage.torrents
    for _, page := range torrentPages[1:] {
        allTorrents = append(allTorrents, page...)
    }

    rd.torrentsCache.Store(&allTorrents)
    rd.log.Debugf("Fetched %d torrents from Real-Debrid", len(allTorrents))
    return allTorrents, len(allTorrents), nil
}
```

### 4.2 Robust Page Fetching with Infinite Retry

The system handles API failures gracefully:

```go
func (rd *RealDebrid) fetchPageOfTorrents(ctx context.Context, page, limit int) fetchTorrentsResult {
    maxRetries := rd.cfg.GetRetriesUntilFailed()
    attempt := 1

    for { // Single infinite loop for all retries
        baseURL := "https://api.real-debrid.com/rest/1.0/torrents"

        params := url.Values{}
        currentTime := strconv.FormatInt(time.Now().Unix(), 10)
        params.Set("_t", currentTime)
        params.Set("page", fmt.Sprintf("%d", page))
        params.Set("limit", fmt.Sprintf("%d", limit))

        reqURL := baseURL + "?" + params.Encode()
        req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
        if err != nil {
            return fetchTorrentsResult{
                torrents: nil,
                page:     page,
                total:    0,
                err:      err,
            }
        }

        if rd.torrentsRateLimiter != nil {
            rd.torrentsRateLimiter.Wait()
        }

        resp, err := rd.apiClient.Do(req)
        if err != nil {
            if attempt >= maxRetries {
                return fetchTorrentsResult{
                    torrents: nil,
                    page:     page,
                    total:    0,
                    err:      err,
                }
            }
            attempt++
            rd.log.Errorf("Error when executing the get torrents request (attempt %d): %v", attempt, err)
            continue
        }
        defer func() {
            _ = resp.Body.Close()
        }()

        if resp.StatusCode == http.StatusNoContent {
            return fetchTorrentsResult{
                torrents: []Torrent{},
                page:     page,
                total:    0,
                err:      nil,
            }
        }

        if resp.StatusCode != http.StatusOK {
            if attempt >= maxRetries {
                statusErr := fmt.Errorf("unexpected status code: %d", resp.StatusCode)
                return fetchTorrentsResult{
                    torrents: nil,
                    page:     page,
                    total:    0,
                    err:      statusErr,
                }
            }
            attempt++
            rd.log.Errorf("Unexpected status code (attempt %d): %d", attempt, resp.StatusCode)
            continue
        }

        totalCountHeader := resp.Header.Get("x-total-count")
        totalCount, parseErr := strconv.Atoi(totalCountHeader)
        if parseErr != nil {
            totalCount = 0
        }

        var torrents []Torrent
        decoder := json.NewDecoder(resp.Body)
        decodeErr := decoder.Decode(&torrents)
        if decodeErr != nil {
            if attempt >= maxRetries {
                return fetchTorrentsResult{
                    torrents: nil,
                    page:     page,
                    total:    0,
                    err:      decodeErr,
                }
            }
            attempt++
            rd.log.Errorf("Error when decoding response (attempt %d): %v", attempt, decodeErr)
            continue
        }

        // Check if we should have data but got an empty response
        expectedItemsInPage := limit
        if page*limit > totalCount {
            expectedItemsInPage = totalCount % limit
            if expectedItemsInPage == 0 && totalCount > 0 && page == (totalCount+limit-1)/limit {
                expectedItemsInPage = limit
            }
        }

        if len(torrents) == 0 && expectedItemsInPage > 0 {
            rd.log.Debugf("Got empty response for page %d when expecting %d items, retrying indefinitely...",
                page, expectedItemsInPage)
            if rd.torrentsRateLimiter != nil {
                rd.torrentsRateLimiter.Wait()
            }
            continue // Continue the infinite loop for empty responses
        }

        // Success case - return the result
        return fetchTorrentsResult{
            torrents: torrents,
            page:     page,
            total:    totalCount,
            err:      nil,
        }
    }
}
```

## 5. Torrent Processing Pipeline

### 5.1 Concurrent Processing with Semaphore

The system processes torrents efficiently with controlled concurrency:

```go
func (t *TorrentManager) processRefreshedTorrents(ctx context.Context, instances []realdebrid.Torrent) {
    var wg sync.WaitGroup
    var mergeChan = make(chan *Torrent, len(instances))

    // Create a semaphore to limit concurrent goroutines
    sem := make(chan struct{}, maxConcurrentTorrents)

    freshIDs := mapset.NewSet[string]()
    freshAccessKeys := mapset.NewSet[string]()
    torrents, ok := t.DirectoryMap.Get(INT_ALL)
    if !ok {
        t.log.Errorf("INT_ALL directory not found in DirectoryMap")
        return
    }
    hasDirectoriesInCfg := len(t.Config.GetDirectories()) > 0
    // referenced for assignment
    allTorrents, ok := t.DirectoryMap.Get(ALL_TORRENTS)
    if !ok {
        t.log.Errorf("ALL_TORRENTS directory not found in DirectoryMap")
        return
    }
    oldKeys := mapset.NewSet(torrents.Keys()...)

    for i := range instances {
        wg.Add(1)
        freshIDs.Add(instances[i].ID)
        idx := i

        // Acquire semaphore before starting goroutine
        sem <- struct{}{} // Block if too many goroutines are running
        t.RunInBackground(func() {
            defer wg.Done()
            defer func() { <-sem }() // Release semaphore when done

            tInfo := t.getMoreInfo(ctx, instances[idx])
            if tInfo == nil {
                mergeChan <- nil
                return
            }
            status := tInfo.Status

            // skip if error status
            if isErrorStatus(status) {
                infoAccessKey := t.GetKeyFromInfo(tInfo)
                torrent, exists := torrents.Get(infoAccessKey)
                if exists && torrent.IDsToDelete.ContainsOne(tInfo.ID) {
                    torrent.IDsToDelete.Remove(tInfo.ID)
                    // mainly for repair cases
                    t.log.Infof("Deleting repair torrent %s (id=%s) because it encountered an error status: %s", tInfo.Name, tInfo.ID, status)
                    t.DeleteByID(ctx, tInfo.ID)
                    if err := torrent.State.Set("broken_torrent"); err == nil {
                        t.log.Infof("Torrent state changed: %s [? → broken_torrent] (download error status: %s)", infoAccessKey, status)
                    }
                    t.markAsUnrepairable(torrent, FormatDownloadStatusReason(status))
                    t.SaveToZurgTorrent(torrent)

                } else if t.Config.ShouldDeleteErrorTorrents() {
                    // downloaded from outside of zurg
                    t.log.Infof("Deleting torrent %s because it encountered an error status: %s", tInfo.ID, status)
                    t.DeleteByID(ctx, tInfo.ID)

                } else {
                    t.log.Warnf("Skipping torrent %s because it encountered an error status: %s", tInfo.ID, status)
                }

                mergeChan <- nil
                return
            }

            // skip if not fully downloaded or no links (yet)
            if tInfo.Progress != 100 || len(tInfo.Links) == 0 {
                infoAccessKey := t.GetKeyFromInfo(tInfo)
                // Use Upsert for atomic add operation
                t.inProgressInfoAccessKeys.Upsert(infoAccessKey, mapset.NewSet(tInfo.ID),
                    func(exist bool, valueInMap mapset.Set[string], newValue mapset.Set[string]) mapset.Set[string] {
                        if exist && valueInMap != nil {
                            valueInMap.Add(tInfo.ID)
                            return valueInMap
                        }
                        return newValue
                    })
                mergeChan <- nil
                return
            }

            // at this point, the torrent is fully downloaded and has links

            // Clean up inProgressInfoAccessKeys for completed torrents to prevent memory leak
            infoAccessKey := t.GetKeyFromInfo(tInfo)
            // Use Upsert for atomic remove operation, then clean up empty sets
            isEmpty := false
            t.inProgressInfoAccessKeys.Upsert(infoAccessKey, nil,
                func(exist bool, valueInMap mapset.Set[string], newValue mapset.Set[string]) mapset.Set[string] {
                    if exist && valueInMap != nil {
                        valueInMap.Remove(tInfo.ID)
                        if valueInMap.Cardinality() == 0 {
                            isEmpty = true
                        }
                        return valueInMap
                    }
                    isEmpty = true
                    return nil
                })
            // Remove empty sets - there's a small race window here but worst case
            // is a temporary empty set in memory which is not critical
            if isEmpty {
                t.inProgressInfoAccessKeys.Remove(infoAccessKey)
            }

            torrent := t.convertToTorrent(ctx, tInfo)
            accessKey := t.GetKey(torrent)
            freshAccessKeys.Add(accessKey)
            // check if the torrent already exists
            if !torrents.Has(accessKey) {
                // the torrent is new, so we can add it
                torrents.Set(accessKey, torrent)
                t.SaveToZurgTorrent(torrent)
                // assign to directories
                allTorrents.Set(accessKey, torrent)
                if hasDirectoriesInCfg {
                    // Atomic assignment and side effects
                    torrent.LockOperations()
                    assignedDirs := t.AssignDirectories(ctx, torrent, false)
                    select {
                    case <-t.initialized:
                        t.ManagePreviousSTRMDirectories(torrent, assignedDirs)
                        t.InvokeDirectorySideEffects(ctx, accessKey, assignedDirs)
                        t.CreateSTRMFileForTorrent(ctx, torrent)
                    default:
                    }
                    torrent.UnlockOperations()

                }
            } else if mainTorrent, _ := torrents.Get(accessKey); !mainTorrent.DownloadedIDs.ContainsOne(tInfo.ID) {
                // the new id is not yet processed
                mergeChan <- torrent
                return
            }

            mergeChan <- nil
        })
    }

    wg.Wait()
    close(mergeChan)

    obsoleteKeys := oldKeys.Difference(freshAccessKeys)
    newKeys := freshAccessKeys.Difference(oldKeys)

    t.log.Infof("Compiling %d torrents (%d new, %d obsolete) into unique torrents", len(instances), newKeys.Cardinality(), obsoleteKeys.Cardinality())

    // note: this should stay as synchronous because of the mergeTorrents function
    for torrent := range mergeChan {
        if torrent == nil {
            continue
        }
        accessKey := t.GetKey(torrent)
        existing, ok := torrents.Get(accessKey)
        if !ok {
            t.log.Warnf("Cannot merge %s", accessKey)
            continue
        }
        mainTorrent := t.mergeTorrents(ctx, existing, torrent)
        torrents.Set(accessKey, mainTorrent)
        t.SaveToZurgTorrent(mainTorrent)
        // assign to directories
        allTorrents.Set(accessKey, torrent)
        if hasDirectoriesInCfg {
            // Atomic assignment and side effects
            mainTorrent.LockOperations()
            assignedDirs := t.AssignDirectories(ctx, mainTorrent, false)
            select {
            case <-t.initialized:
                t.ManagePreviousSTRMDirectories(mainTorrent, assignedDirs)
                t.InvokeDirectorySideEffects(ctx, accessKey, assignedDirs)
                t.CreateSTRMFileForTorrent(ctx, torrent)
            default:
            }
            mainTorrent.UnlockOperations()
        }
    }

    t.log.Infof("Finished compiling %d unique torrents", torrents.Count())

    // delete torrents that are no longer present
    obsoleteKeys.Each(func(accessKey string) bool {
        t.Delete(ctx, accessKey, false)
        return false
    })

    // Clean up empty directory maps after deleting obsolete torrents
    if obsoleteKeys.Cardinality() > 0 {
        t.cleanupEmptyDirectoryMaps()
    }

    t.RunInBackground(func() {
        // apply media info details
        if !t.hasFFprobe || !t.Config.ShouldAutoAnalyzeNewTorrents() {
            return
        }
        newKeys.Each(func(accessKey string) bool {
            torrent, ok := torrents.Get(accessKey)
            if !ok {
                return false
            }

            err := t.ApplyMediaInfoDetails(ctx, torrent, t.HasTagFilters())
            if err != nil && err.Error() == "bandwidth limit reached" {
                return true
            }
            return false
        })
        // cleanup
        t.cleanupDownloadedIDs(freshIDs)
        t.cleanupZurgInfoFiles(freshIDs)
    })
}
```

### 5.2 Torrent Info Retrieval with Caching

The system caches torrent info to disk for efficiency:

```go
func (t *TorrentManager) getMoreInfo(ctx context.Context, rdTorrent realdebrid.Torrent) *realdebrid.TorrentInfo {
    info := t.readZurgInfo(rdTorrent.ID)
    if info == nil {
        var err error
        info, err = t.rd.GetTorrentInfo(ctx, rdTorrent.ID)
        if err != nil {
            t.log.Warnf("Cannot get info for torrent %s (id=%s): %v", rdTorrent.Name, rdTorrent.ID, err)
            return nil
        }
        if err := t.saveZurgInfo(info); err != nil {
            t.log.Warnf("Cannot cache info for torrent %s (id=%s): %v", rdTorrent.Name, rdTorrent.ID, err)
        }
    }
    return info
}
```

## 6. Directory Assignment and Media Server Integration

### 6.1 Directory Assignment

Torrents are assigned to directories based on configuration:

```go
func (t *TorrentManager) AssignDirectories(ctx context.Context, tor *Torrent, dryRun bool) []string {
    accessKey := t.GetKey(tor)

    if !dryRun {
        // Remove torrent from all directories except INT_ALL and ALL_TORRENTS
        for _, directory := range t.Config.GetDirectories() {
            dirTorrents, ok := t.DirectoryMap.Get(directory)
            if ok {
                dirTorrents.Remove(accessKey)
            }
        }
    }

    if tor.UnrepairableReason == string(ReasonRarred) || tor.UnrepairableReason == string(ReasonLoneBroken) {
        if !dryRun {
            t.markAsUnplayable(ctx, tor)
        }
        return nil
    }

    torrentIDs := tor.DownloadedIDs.ToSlice()
    // Get filenames needed for directory conditions
    var filenames []string
    var fileSizes []int64
    // Iterate over selected files to get filenames and file sizes.
    // simultaneously, we track if torrent is unplayable
    unplayable := true
    for item := range tor.SelectedFiles.IterBuffered() {
        file := item.Val
        filenames = append(filenames, t.GetFilename(file))
        fileSizes = append(fileSizes, file.Bytes)
        if utils.IsVideo(file.Path) || t.IsPlayable(file.Path) {
            unplayable = false
        }
    }
    if unplayable {
        if !dryRun {
            t.markAsUnplayable(ctx, tor)
        }
        return nil
    }

    var unassignedDirs []string
    var assignedDirs []string

    // Get thread-safe copy of tags
    torTags := tor.GetTags()

    for _, groupDirectories := range t.Config.GetGroupMap() {
        for _, directory := range groupDirectories {
            directoryTag := config.GenerateDirectoryTag(directory)

            for _, tag := range torTags {
                if tag == config.DirectoryUnassignPrefix+directoryTag {
                    unassignedDirs = append(unassignedDirs, directory)
                    break
                }

                if tag == config.DirectoryAssignPrefix+directoryTag {
                    assignedDirs = append(assignedDirs, directory)
                    break
                }
            }
        }

        for _, directory := range groupDirectories {
            if t.Config.MeetsConditions(directory, accessKey, tor.ComputeTotalSize(), torrentIDs, filenames, fileSizes, torTags) {
                // check if the directory is already assigned
                alreadyAssigned := false
                for _, assignedDir := range assignedDirs {
                    if assignedDir == directory {
                        // already assigned, no need to assign again
                        alreadyAssigned = true
                        break
                    }
                }
                if !alreadyAssigned {
                    assignedDirs = append(assignedDirs, directory)
                }
                break
            }
        }
    }

    // we do post-processing of the assigned directories
    // to remove the ones that are forcefully unassigned
    var newAssignedDirs []string
    for _, assignedDir := range assignedDirs {
        assigned := true
        for _, unassignedDir := range unassignedDirs {
            if assignedDir == unassignedDir {
                assigned = false
                break
            }
        }
        if assigned {
            if !dryRun {
                dirTorrents, ok := t.DirectoryMap.Get(assignedDir)
                if ok {
                    dirTorrents.Set(accessKey, tor)
                }
            }
            newAssignedDirs = append(newAssignedDirs, assignedDir)
        }
    }

    return newAssignedDirs
}
```

### 6.2 Media Server Trigger

When directories are updated, media servers are notified:

```go
func (t *TorrentManager) InvokeDirectorySideEffects(ctx context.Context, accessKey string, assignedDirs []string) {
    if len(assignedDirs) == 0 {
        return
    }
    t.log.Infof("Assigned %s to: %s", accessKey, strings.Join(assignedDirs, ", "))
    var updatedPaths []string
    for _, dir := range assignedDirs {
        updatedPaths = append(updatedPaths, fmt.Sprintf("%s/%s", dir, accessKey))
    }
    go t.scanner.TriggerScan(ctx, updatedPaths)
    go t.onLibraryUpdateHook(ctx, updatedPaths)
}
```

## 7. Performance Optimizations

### 7.1 Multi-Level Caching Architecture

1. **Memory Cache**: Atomic pointer to torrents list for instant access
2. **Disk Cache**: `.zurginfo` files for persistent torrent details
3. **State Files**: `.zurgtorrent` files for processed torrent state

### 7.2 Optimization Strategies

- **Parallel Processing**: Up to 50 concurrent torrent processing threads
- **Smart Diff Processing**: Only processes changed torrents
- **Cache Hit Detection**: Reuses cached data when unchanged
- **Atomic Operations**: Thread-safe state management
- **Rate Limiting**: Configurable API rate limiting
- **Bandwidth Preservation**: Stops media analysis on bandwidth limit
- **Lazy Loading**: Only fetches detailed info when needed
- **Infinite Retry**: Handles temporary API failures gracefully

## 8. Flow Diagram

```
┌─────────────────┐
│ Zurg Starts     │
└────────┬────────┘
         ↓
┌─────────────────────────┐
│ Initialize TorrentManager│
│ - Create atomic state   │
│ - Load cached data      │
└────────┬────────────────┘
         ↓
┌─────────────────────────┐
│ Initial Refresh         │
│ - Fetch all torrents    │
│ - Process & cache       │
└────────┬────────────────┘
         ↓
┌─────────────────────────┐
│ Start Periodic Job      │
│ (every 15 seconds)      │
└────────┬────────────────┘
         ↓
┌─────────────────────────────────┐
│ Check for Changes               │
│ - Get current state (lightweight)│
│ - Compare with stored state     │
└────────┬───────────┬────────────┘
         ↓ No        ↓ Yes
    Wait 15s    ┌────────────────┐
         ↑      │ Full Refresh   │
         │      ├────────────────┤
         │      │ 1. Fetch page 1│
         │      │ 2. Check cache │
         │      │ 3. Parallel    │
         │      │    fetch       │
         │      │ 4. Process     │
         │      │    torrents    │
         │      │ 5. Update dirs │
         │      │ 6. Trigger     │
         │      │    media scan  │
         │      └────────┬───────┘
         └───────────────┘
```

## 9. Key Benefits

1. **Minimal API Calls**: Only checks state every 15 seconds with lightweight calls
2. **Fast Cache Hits**: Reuses cached data when library hasn't changed
3. **Parallel Processing**: Fetches and processes torrents concurrently
4. **Fault Tolerance**: Handles API failures with infinite retry logic
5. **Real-time Updates**: Detects any change in library immediately
6. **Efficient Diff Processing**: Only processes changed torrents
7. **Thread Safety**: Uses atomic operations for concurrent access
8. **Scalability**: Handles large libraries with thousands of torrents efficiently

## 10. Configuration

Key configuration options that affect library detection and fetching:

```yaml
# How often to check for library changes (seconds)
check_for_changes_every_secs: 15  # Default: 15

# Page size for fetching torrents
fetch_torrents_page_size: 2500    # Default: 2500

# Number of retries for API failures
retries_until_failed: 5           # Default: 5

# Enable/disable auto-analysis of new torrents
auto_analyze_new_torrents: true   # Default: true
```

## Conclusion

Zurg's library change detection and fetching system is a sophisticated implementation that balances efficiency with reliability. Through intelligent caching, parallel processing, and state-based change detection, it maintains real-time synchronization with the Real-Debrid library while minimizing API calls and resource usage. The system is designed to handle large libraries, network failures, and concurrent operations gracefully, making it robust for production use.