# Hybrid 3-Table Query Strategy

## Overview

The optimized query system now uses **all three tables** in sequence to maximize stream availability:

1. **AvailableFile** (primary) - Individual files from multi-file torrents/season packs
2. **Available** (fallback) - Single-file torrents without file-level episode data
3. **Cast** (user cache) - User-specific cached streams

## Query Flow

```typescript
async getOtherStreams(imdbId: 'tt123:1:5', userId, limit: 5) {
  // Step 1: Query AvailableFile for multi-file torrents (season packs, etc.)
  const fileStreams = await prisma.availableFile.findMany({
    where: {
      available: { imdbId: 'tt123', status: 'downloaded' },
      season: 1,
      episode: 5
    },
    take: limit * 2  // Fetch extra for diversity
  });

  if (fileStreams.length >= limit) {
    return fileStreams.slice(0, limit);
  }

  // Step 2: Query Available for single-file torrents (fallback)
  const remaining = limit - fileStreams.length;
  const torrentStreams = await prisma.available.findMany({
    where: {
      imdbId: 'tt123',
      status: 'downloaded',
      season: 1,
      episode: 5
    },
    include: {
      files: {
        where: {
          season: null,  // Only files without episode data
          episode: null  // (prevents duplicates from Step 1)
        },
        take: 1
      }
    },
    take: remaining * 2
  });

  // Step 3: Query Cast for user-cached streams
  const castStreams = await prisma.cast.findMany({
    where: {
      imdbId: 'tt123:1:5',  // Full imdbId with episode
      userId: { not: userId }
    },
    take: limit - (fileStreams.length + torrentStreams.length)
  });

  // Combine and sort by size
  return [...fileStreams, ...torrentStreams, ...castStreams]
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);
}
```

## Why This Works

### 1. AvailableFile (Primary Source)

**Best for:** Season packs, multi-episode torrents

**Example:**

```
Torrent: "Breaking Bad S01 Complete"
AvailableFile rows:
  - S01E01.mkv (season=1, episode=1)
  - S01E02.mkv (season=1, episode=2)
  - S01E05.mkv (season=1, episode=5) ← Matches query!
  ...
```

**Benefit:** Season packs contribute ALL their episodes, not just 1!

### 2. Available (Fallback)

**Best for:** Single-file torrents

**Example:**

```
Torrent: "Show.S01E05.1080p.mkv" (single file)
Available:
  season=1, episode=5
  files: [{ path: "Show.S01E05.1080p.mkv", season=null, episode=null }]
```

**Filter:** Only includes files where `season=null AND episode=null` to avoid duplicating AvailableFile results.

**Benefit:** Catches single-file torrents that wouldn't appear in AvailableFile results.

### 3. Cast (User Cache)

**Best for:** Previously played user streams

**Example:**

```
User previously cast tt123:1:5
Cast table has the exact link they used
```

**Benefit:** Fast access to proven working streams for this specific episode.

## Performance Characteristics

| Table         | Query Time     | Coverage                         | Accuracy  |
| ------------- | -------------- | -------------------------------- | --------- |
| AvailableFile | Fast (indexed) | High (season packs + multi-file) | Very High |
| Available     | Fast (indexed) | Medium (single-file only)        | High      |
| Cast          | Very Fast      | Low (user-specific)              | Very High |

**Combined:** Maximum coverage with minimal redundancy!

## Deduplication Strategy

The filter `file.season === null && file.episode === null` in the Available query ensures:

- Files already in AvailableFile (with episode data) are not duplicated
- Only truly single-file torrents are included from Available

## Logging

Each query logs source breakdown:

```javascript
[CastService] Stream sources breakdown: {
  imdbId: 'tt123:1:5',
  total: 5,
  fromFiles: 3,      // Season packs
  fromTorrents: 1,   // Single-file torrent
  fromCast: 1        // User cache
}
```

## Migration Impact

**Before:**

- Only queried Available (1 file per torrent)
- Season packs: 1 result
- Single-file: 1 result
- **Total: 2 results**

**After:**

- AvailableFile: All matching files from season packs
- Available: Single-file torrents (no duplicates)
- Cast: User cache
- **Total: 10+ results** (from same torrents!)

## Test Updates Required

All `getOtherStreams` tests need 3 mocks:

```typescript
prismaMock.availableFile.findMany.mockResolvedValueOnce([...]); // Step 1
prismaMock.available.findMany.mockResolvedValueOnce([...]);     // Step 2
prismaMock.cast.findMany.mockResolvedValueOnce([...]);          // Step 3
```

See test file for examples.
