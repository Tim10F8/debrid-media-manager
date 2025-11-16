# Database Optimization: Season/Episode Filtering

## Problem

When requesting TV show episodes (e.g., `tt123:1:5` for S01E05), the system was:

1. Fetching hundreds/thousands of `Available` rows for the entire show
2. Ordering them by size
3. Taking top 25 rows
4. Filtering in JavaScript by episode pattern
5. Often returning 0 results even when the requested episode existed in the database

**Performance Impact:** Database was scanning and sorting 100s-1000s of rows per query, only to have JavaScript reject most/all results.

## Solution

Added `season` and `episode` columns to the `Available` table with a composite index to enable database-level filtering.

### Schema Changes

**Added to `Available` table:**

```prisma
model Available {
  // ... existing fields
  season   Int?
  episode  Int?

  @@index([imdbId, status, season, episode, bytes])
}
```

**New composite index:** Enables efficient queries filtering by imdbId, status, season, and episode, ordered by bytes.

## Query Performance

### Before

```sql
-- Scans all episodes for the show, sorts them, takes 25
SELECT * FROM Available
WHERE imdbId = 'tt123'
  AND status = 'downloaded'
ORDER BY bytes DESC
LIMIT 25  -- Then JavaScript filters these 25 to find S01E05
```

### After

```sql
-- Database directly finds S01E05 rows
SELECT * FROM Available
WHERE imdbId = 'tt123'
  AND status = 'downloaded'
  AND season = 1
  AND episode = 5
ORDER BY bytes DESC
LIMIT 5  -- Returns exactly what we need
```

**Performance Gain:**

- Before: Full table scan of 1000+ rows → sort → JavaScript filter
- After: Index seek directly to matching rows (typically < 10 rows)
- **~100-1000x reduction** in rows scanned per query

## Implementation Details

### 1. Migration

`prisma/migrations/20251116145318_add_season_episode_to_available/migration.sql`

- Adds nullable `season` and `episode` INT columns
- Creates composite index

### 2. Auto-Population on Insert

`src/services/database/availability.ts`

- `handleDownloadedTorrent()` now extracts season/episode from filename/path
- `upsertAvailability()` does the same
- Uses regex patterns to parse: S01E05, 1x05, "Season 1 Episode 5", etc.

### 3. Query Updates

`src/services/database/cast.ts`

- `getOtherStreams()` now passes season/episode filters to WHERE clause
- Removed 5x multiplier hack (was fetching extra rows to account for JS filtering)
- Removed JavaScript-side episode filtering for `Available` items

### 4. Backfill Script

`scripts/populate-season-episode.ts`

- Processes existing `Available` rows in batches of 1000
- Extracts season/episode from filename/path using same regex patterns
- Updates rows with parsed data

## How to Deploy

1. **Run migration:**

    ```bash
    npx prisma migrate deploy
    ```

2. **Backfill existing data:**

    ```bash
    npx tsx scripts/populate-season-episode.ts
    ```

3. **Monitor:** New rows will auto-populate season/episode on insert

## Supported Episode Formats

The extraction logic handles:

- `S01E05`, `S1E5` (standard)
- `1x05` (alternative notation)
- `Season 1 Episode 5` (verbose)
- `Episode 5 Season 1` (reversed)
- `Season 1` (season packs)
- `S01` (season pack notation)

## Testing

All 27 tests pass, including new tests for:

- Database-level episode filtering
- Season pack handling
- Various format patterns
- Single vs double-digit numbers

## Notes

- **Nullable columns:** `season` and `episode` are nullable to support movies and unparseable filenames
- **Cast table:** Still uses full `imdbId` (e.g., `tt123:1:5`) for filtering, no schema change needed
- **Backward compatible:** Queries without episode filters work unchanged (movies)
