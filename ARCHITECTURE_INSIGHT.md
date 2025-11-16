# Critical Architecture Insight: AvailableFile vs Available

## The Problem with Available-Level Queries

### Original Flawed Approach

```
Available (Torrent):
  hash: "abc123"
  filename: "Breaking Bad Season 1 Complete"
  season: 1        ← Extracted from torrent name - AMBIGUOUS!
  episode: ???     ← What episode is this?? Season packs have 10+ episodes!

  files: [take: 1] ← ONLY takes 1 file, loses 9 other episodes!
```

**Result:** A season pack with 10 episodes only contributes 1 stream to results!

### Correct Approach: Query AvailableFile

Each file path is explicit:

```
AvailableFile:
  path: "/Breaking.Bad/S01E01.mkv" → season=1, episode=1 ✓
  path: "/Breaking.Bad/S01E02.mkv" → season=1, episode=2 ✓
  path: "/Breaking.Bad/S01E03.mkv" → season=1, episode=3 ✓
  ... (all 10 episodes available)
```

**Result:** A season pack contributes ALL matching episode files!

## Database Query Comparison

### Before (Available-level)

```sql
SELECT * FROM Available
WHERE imdbId = 'tt123'
  AND status = 'downloaded'
  AND season = 1
  AND episode = 5  -- Doesn't work for season packs!
LIMIT 5
```

Then take only 1 file per torrent → Lose most episodes!

### After (AvailableFile-level)

```sql
SELECT af.link, af.path, af.bytes
FROM AvailableFile af
JOIN Available a ON af.hash = a.hash
WHERE a.imdbId = 'tt123'
  AND a.status = 'downloaded'
  AND af.season = 1
  AND af.episode = 5
ORDER BY af.bytes DESC
LIMIT 5
```

Returns ALL files matching S01E05 across all torrents AND season packs!

## Schema Design

### Both tables need season/episode:

**Available (torrent-level):**

- For single-file torrents
- For backward compatibility
- Extracted from torrent filename

**AvailableFile (file-level) - PRIMARY SOURCE:**

- For multi-file torrents/season packs
- Extracted from individual file paths
- Much more accurate and complete

## Benefits

1. **Season packs work correctly** - All episodes available, not just 1
2. **More results** - Same torrent can contribute multiple quality options
3. **Better accuracy** - File paths more reliable than torrent names
4. **Comprehensive coverage** - Single-file + multi-file torrents both work

## Implementation

### Query Change

```typescript
// OLD: Query Available, take 1 file
const items = await prisma.available.findMany({
	include: { files: { take: 1 } }, // ← Loses data!
});

// NEW: Query AvailableFile directly
const files = await prisma.availableFile.findMany({
	where: {
		available: { imdbId, status: 'downloaded' },
		season,
		episode,
	},
});
```

### Population Logic

```typescript
// Parse EACH file's path individually
selectedFiles.map((file) => {
	const info = extractEpisodeInfo(file.path);
	return {
		...file,
		season: info?.season,
		episode: info?.episode,
	};
});
```

## Migration Path

1. Add season/episode to AvailableFile table
2. Update insert logic to parse each file
3. Change queries from Available → AvailableFile
4. Backfill existing data from file paths
5. Update tests to mock AvailableFile instead of Available

## Impact

This is a **fundamental architectural improvement** that fixes:

- ❌ Season packs only returning 1 episode → ✅ All episodes available
- ❌ Ambiguous torrent-level episode data → ✅ Precise file-level data
- ❌ Limited results per torrent → ✅ All matching files returned
- ❌ Unreliable torrent filenames → ✅ Accurate file paths
