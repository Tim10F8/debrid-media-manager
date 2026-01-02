# DMM Cast - Complete Technical Documentation

## Overview

DMM Cast is a Stremio addon system integrated into Debrid Media Manager that allows users to:

- Unrestrict Real-Debrid links and "cast" them to Stremio
- Build a personal streaming library accessible via Stremio
- Share streams with other DMM users (community feature)
- Configure size limits and preferences for streams

The system operates as a **Stremio addon** that users install with their unique user ID, providing personalized catalogs and streams.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DMM Cast Architecture                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│  │   Frontend  │────▶│  API Routes │────▶│  Real-Debrid Service    │   │
│  │  Components │     │  (Next.js)  │     │  (Link Unrestriction)   │   │
│  └─────────────┘     └──────┬──────┘     └─────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│                    ┌────────────────┐                                   │
│                    │    Database    │                                   │
│                    │    (Prisma)    │                                   │
│                    │  Cast, Profile │                                   │
│                    └────────────────┘                                   │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Stremio Addon API                           │   │
│  │  /api/stremio/[userid]/manifest.json.ts                         │   │
│  │  /api/stremio/[userid]/catalog/{type}/{id}.json.ts              │   │
│  │  /api/stremio/[userid]/stream/{type}/{imdbid}.ts                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Cast Model

Stores individual casted content entries.

```prisma
model Cast {
  id        String   @id @default(uuid())
  imdbId    String           // IMDB ID (format: tt1234567 or tt1234567:S:E for episodes)
  userId    String           // 12-character hashed user ID
  hash      String           // Torrent hash
  url       String   @db.Text // Direct stream URL
  updatedAt DateTime @updatedAt
  size      BigInt   @default(0)  // File size in MB
  link      String?          // Real-Debrid link

  @@unique([imdbId, userId, hash])
  @@index([imdbId, userId, updatedAt])
}
```

### CastProfile Model

Stores user credentials and preferences.

```prisma
model CastProfile {
  userId            String   @id    // 12-character hashed user ID
  clientId          String          // RD OAuth client ID
  clientSecret      String          // RD OAuth client secret
  updatedAt         DateTime @updatedAt
  refreshToken      String          // RD refresh token
  movieMaxSize      Float    @default(0)   // Max movie size filter (GB)
  episodeMaxSize    Float    @default(0)   // Max episode size filter (GB)
  otherStreamsLimit Int      @default(5)   // Max other user streams (0-5)
}
```

---

## User ID Generation

### Token Generation Flow

**File:** `src/hooks/castToken.ts`

```
┌──────────────────────────────────────────────────────────────┐
│ User loads DMM with RD credentials stored in localStorage    │
├──────────────────────────────────────────────────────────────┤
│                          │                                   │
│                          ▼                                   │
│    ┌─────────────────────────────────────────────────────┐   │
│    │ useCastToken() hook                                 │   │
│    │ - Checks if dmmCastToken exists in localStorage     │   │
│    │ - If legacy 5-char token, clears and regenerates    │   │
│    │ - Fetches /api/stremio/id?token={accessToken}       │   │
│    └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│    ┌─────────────────────────────────────────────────────┐   │
│    │ /api/stremio/id endpoint                            │   │
│    │ - Validates access token                            │   │
│    │ - Generates 12-char userId via generateUserId()     │   │
│    └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│    ┌─────────────────────────────────────────────────────┐   │
│    │ saveCastProfile() called                            │   │
│    │ - Stores clientId, clientSecret, refreshToken       │   │
│    │ - Associates with generated userId                  │   │
│    └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│    ┌─────────────────────────────────────────────────────┐   │
│    │ Token stored in localStorage as 'rd:castToken'      │   │
│    │ Used for all Stremio addon endpoints                │   │
│    └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### User ID Generation Algorithm

**File:** `src/utils/castApiHelpers.ts`

```typescript
export const generateUserId = async (token: string): Promise<string> => {
	// 1. Get RD username from access token
	const { username } = await getCurrentUser(token);

	// 2. Use HMAC-SHA256 with salt for security
	const salt = process.env.DMMCAST_SALT ?? 'default-salt...';
	const hmac = crypto.createHmac('sha256', salt).update(username).digest('base64url');

	// 3. Return first 12 characters (collision-resistant)
	return hmac.slice(0, 12);
};
```

**Key Points:**

- User ID is derived from RD username (deterministic)
- Uses HMAC-SHA256 for cryptographic security
- 12-character ID provides collision resistance for millions of users
- Legacy 5-character tokens are auto-migrated

---

## Casting Flow

### Movie Casting

**Files:**

- `src/utils/castApiClient.ts` (client)
- `src/pages/api/stremio/cast/movie/[imdbid].ts` (API)

```
┌────────────────────────────────────────────────────────────────┐
│ User clicks "Cast" button on a movie torrent                  │
├────────────────────────────────────────────────────────────────┤
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ handleCastMovie(imdbId, rdKey, hash)                 │   │
│    │ GET /api/stremio/cast/movie/{imdbid}                 │   │
│    │ Query: token={rdKey}&hash={hash}                     │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ getBiggestFileStreamUrl(token, hash, ipAddress)      │   │
│    │ 1. Add hash as magnet to RD                          │   │
│    │ 2. Select files in torrent                           │   │
│    │ 3. Get torrent info                                  │   │
│    │ 4. Find biggest file                                 │   │
│    │ 5. Unrestrict link for that file                     │   │
│    │ 6. Delete temporary torrent from RD                  │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Save cast to database                                │   │
│    │ db.saveCast(imdbId, userId, hash, url, link, size)   │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Return success with filename                         │   │
│    │ Toast: "Casted {filename} to Stremio"                │   │
│    └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### TV Show Casting

**Files:**

- `src/utils/castApiClient.ts` (client)
- `src/pages/api/stremio/cast/series/[imdbid].ts` (API)

```
┌────────────────────────────────────────────────────────────────┐
│ User selects episodes and clicks "Cast"                       │
├────────────────────────────────────────────────────────────────┤
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ handleCastTvShow(imdbId, rdKey, hash, fileIds[])     │   │
│    │ - Groups fileIds in batches of 5                     │   │
│    │ - Runs batches concurrently (4 workers)              │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│          ┌───────────────┼───────────────┐                    │
│          ▼               ▼               ▼                    │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│    │ Batch 1  │    │ Batch 2  │    │ Batch 3  │   ...         │
│    │ 5 eps    │    │ 5 eps    │    │ 5 eps    │               │
│    └──────────┘    └──────────┘    └──────────┘               │
│          │               │               │                    │
│          └───────────────┼───────────────┘                    │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ For each file:                                        │   │
│    │ 1. getStreamUrl(token, hash, fileId, ip, 'tv')        │   │
│    │ 2. Parse season/episode from filename (parse-torrent) │   │
│    │ 3. Save cast with key: tt1234567:S:E                  │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Return results with any error episodes               │   │
│    │ Toast: "Casted X episodes to Stremio"                │   │
│    └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### Library Casting

**File:** `src/pages/api/stremio/cast/library/[torrentIdPlusHash].ts`

Used for casting entire torrents from the user's RD library:

```
┌────────────────────────────────────────────────────────────────┐
│ User clicks "Cast" on a torrent in their library              │
├────────────────────────────────────────────────────────────────┤
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ GET /api/stremio/cast/library/{torrentId}:{hash}     │   │
│    │ Query: rdToken={token}&imdbId={optional}             │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Get torrent info from RD                             │   │
│    │ Check if IMDB ID exists in database                  │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│          ┌───────────────┴───────────────┐                    │
│          ▼                               ▼                    │
│    ┌──────────────┐              ┌──────────────┐             │
│    │ IMDB Found   │              │ IMDB Missing │             │
│    │ Continue...  │              │ Return status│             │
│    └──────────────┘              │ "need_imdb"  │             │
│          │                       └──────────────┘             │
│          ▼                               │                    │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ If user provides IMDB ID:                            │   │
│    │ - Validate format (tt\d{7,})                         │   │
│    │ - Save mapping for future users                      │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ For each selected file:                              │   │
│    │ - Parse season/episode from filename                 │   │
│    │ - Save cast with stremioKey (imdbId or imdbId:S:E)   │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Return redirect URL:                                 │   │
│    │ - Movie: stremio://detail/movie/{imdbId}/{imdbId}    │   │
│    │ - Series: stremio://detail/series/{id}/{id}:S:E      │   │
│    └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Stremio Addon Endpoints

### Manifest

**File:** `src/pages/api/stremio/[userid]/manifest.json.ts`

```json
{
	"catalogs": [
		{ "id": "casted-movies", "name": "DMM Casted Movies", "type": "movie" },
		{ "id": "casted-shows", "name": "DMM Casted TV Shows", "type": "series" },
		{ "id": "casted-other", "name": "DMM Library", "type": "other" }
	],
	"id": "com.debridmediamanager.cast",
	"name": "DMM Cast",
	"resources": [
		{ "name": "stream", "types": ["movie", "series"], "idPrefixes": ["tt"] },
		{ "name": "meta", "types": ["other"], "idPrefixes": ["dmm"] }
	],
	"types": ["movie", "series", "other"],
	"version": "0.0.5"
}
```

### Catalog Endpoints

| Endpoint                                                 | Description                   |
| -------------------------------------------------------- | ----------------------------- |
| `/api/stremio/[userid]/catalog/movie/casted-movies.json` | User's casted movies          |
| `/api/stremio/[userid]/catalog/series/casted-shows.json` | User's casted TV shows        |
| `/api/stremio/[userid]/catalog/other/casted-other.json`  | User's RD library (paginated) |

**Casted Movies Response:**

```json
{
	"cacheMaxAge": 0,
	"metas": [
		{
			"id": "tt1234567",
			"type": "movie",
			"poster": "https://images.metahub.space/poster/small/tt1234567/img"
		}
	]
}
```

### Stream Endpoint

**File:** `src/pages/api/stremio/[userid]/stream/[mediaType]/[imdbid].ts`

```
┌────────────────────────────────────────────────────────────────┐
│ Stremio requests streams for content                          │
│ GET /api/stremio/{userid}/stream/{type}/{imdbid}.json         │
├────────────────────────────────────────────────────────────────┤
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Validate user profile exists                         │   │
│    │ Get size limits from profile                         │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Fetch streams in parallel:                           │   │
│    │ 1. getUserCastStreams() - User's own casts (limit 5) │   │
│    │ 2. getOtherStreams() - Community streams (limit 0-5) │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    ┌──────────────────────────────────────────────────────┐   │
│    │ Build stream list:                                   │   │
│    │ 1. "DMM Cast" - Link to DMM for casting              │   │
│    │ 2. User's own casts (with metadata)                  │   │
│    │ 3. Other users' casts (respecting size limits)       │   │
│    └──────────────────────────────────────────────────────┘   │
│                          │                                     │
│                          ▼                                     │
│    Return streams JSON                                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Link Unrestriction Process

**File:** `src/utils/getStreamUrl.ts`

### getStreamUrl() - For specific file

```typescript
// Returns: [streamUrl, rdLink, seasonNumber, episodeNumber, fileSize]
const getStreamUrl = async (rdKey, hash, fileId, ipAddress, mediaType) => {
	// 1. Add torrent hash as magnet
	const id = await addHashAsMagnet(rdKey, hash, false);

	// 2. Select files in torrent
	await handleSelectFilesInRd(rdKey, `rd:${id}`, false);

	// 3. Get torrent info
	const torrentInfo = await getTorrentInfo(rdKey, id, false);

	// 4. Find the specific file's link
	const fileIdx = torrentInfo.files.filter((f) => f.selected).findIndex((f) => f.id === fileId);
	const link = torrentInfo.links[fileIdx];

	// 5. Unrestrict the link
	const resp = await unrestrictLink(rdKey, link, ipAddress, false);

	// 6. Parse season/episode from filename
	if (mediaType === 'tv') {
		const info = ptt.parse(resp.filename);
		seasonNumber = info.season || -1;
		episodeNumber = info.episode || -1;
	}

	// 7. Cleanup - delete temporary torrent
	await deleteTorrent(rdKey, id, false);

	return [resp.download, resp.link, seasonNumber, episodeNumber, fileSize];
};
```

### getBiggestFileStreamUrl() - For movies

```typescript
// Returns: [streamUrl, rdLink, fileSize]
const getBiggestFileStreamUrl = async (rdKey, hash, ipAddress) => {
	// Same process but finds the biggest file automatically
	const biggestFile = torrent.files.reduce((prev, current) =>
		prev.bytes > current.bytes ? prev : current
	);
	// ... unrestrict and return
};
```

---

## Database Service Methods

**File:** `src/services/database/cast.ts`

| Method                  | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `saveCastProfile()`     | Upsert user profile with RD credentials                    |
| `getCastProfile()`      | Get user's RD credentials and settings                     |
| `saveCast()`            | Save a casted item (imdbId, userId, hash, url, link, size) |
| `getLatestCast()`       | Get most recent cast for an IMDB ID                        |
| `getCastURLs()`         | Get user's casts for content (30-day window)               |
| `getOtherCastURLs()`    | Get other users' casts for content                         |
| `fetchCastedMovies()`   | Get list of all user's casted movie IDs                    |
| `fetchCastedShows()`    | Get list of all user's casted show IDs                     |
| `fetchAllCastedLinks()` | Get all cast entries with metadata                         |
| `deleteCastedLink()`    | Remove a specific cast entry                               |
| `getUserCastStreams()`  | Get user's streams for a specific IMDB ID                  |
| `getOtherStreams()`     | Get available streams (files, torrents, casts)             |

### IMDB ID Format for Episodes

- Movies: `tt1234567`
- Episodes: `tt1234567:S:E` (e.g., `tt1234567:1:5` for S01E05)

### Episode Parsing Patterns

```typescript
const EPISODE_PATTERNS = [
	/s(\d{1,2})e(\d{1,2})/i, // S01E05
	/(\d{1,2})x(\d{1,2})/i, // 1x05
	/season.*(\d{1,2}).*episode.*(\d{1,2})/i,
	/episode.*(\d{1,2}).*season.*(\d{1,2})/i,
];
```

---

## Frontend Components

### useCastToken Hook

**File:** `src/hooks/castToken.ts`

```typescript
export function useCastToken() {
  // Reads from localStorage
  const [clientId] = useLocalStorage<string>('rd:clientId');
  const [clientSecret] = useLocalStorage<string>('rd:clientSecret');
  const [refreshToken] = useLocalStorage<string>('rd:refreshToken');
  const [accessToken] = useLocalStorage<string>('rd:accessToken');
  const [dmmCastToken, setDmmCastToken] = useLocalStorage<string>('rd:castToken');

  useEffect(() => {
    // Auto-generate token if missing
    // Migrate legacy 5-char tokens
    // Save profile to backend
  }, [...]);

  return dmmCastToken;
}
```

### Cast API Client Functions

**File:** `src/utils/castApiClient.ts`

```typescript
// Cast a single movie
handleCastMovie(imdbId, rdKey, hash)

// Cast multiple TV episodes (batched)
handleCastTvShow(imdbId, rdKey, hash, fileIds[])

// Save user profile
saveCastProfile(clientId, clientSecret, refreshToken)
```

### Pages Using Cast

| Page    | File                                      | Cast Features                |
| ------- | ----------------------------------------- | ---------------------------- |
| Movie   | `src/pages/movie/[imdbid]/index.tsx`      | Cast button for each torrent |
| TV Show | `src/pages/show/[imdbid]/[seasonNum].tsx` | Batch cast episodes          |
| Home    | `src/pages/index.tsx`                     | Initialize cast token        |
| Manage  | `src/pages/stremio/manage.tsx`            | View/delete all casts        |

---

## Settings & Preferences

### Size Limits

**File:** `src/pages/api/stremio/cast/updateSizeLimits.ts`

Users can configure:

- `movieMaxSize` - Maximum movie file size (GB)
- `episodeMaxSize` - Maximum episode file size (GB)
- `otherStreamsLimit` - Number of community streams (0-5)

```typescript
POST /api/stremio/cast/updateSizeLimits
{
  "clientId": "...",
  "clientSecret": "...",
  "refreshToken": "...",
  "movieMaxSize": 10,        // GB
  "episodeMaxSize": 2,       // GB
  "otherStreamsLimit": 3     // 0-5
}
```

---

## Management Page

**File:** `src/pages/stremio/manage.tsx`

Features:

- View all casted content grouped by IMDB ID
- Display movie posters
- Show episode numbers (S01E05 format)
- Single and bulk deletion
- Direct Stremio deep links
- Link to cast other torrents

```
┌─────────────────────────────────────────────────────────────┐
│                   DMM Cast - Manage                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ [Poster]    │  │ [Poster]    │  │ [Poster]    │         │
│  │ Movie Title │  │ Show Title  │  │ Movie Title │         │
│  │             │  │ S01E01 ▶ 🗑 │  │             │         │
│  │ File.mkv ▶🗑│  │ S01E02 ▶ 🗑 │  │ File.mkv ▶🗑│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Complete Data Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. USER SETUP                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Connect RD → useCastToken() → Generate userId → Save Profile │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  2. CASTING CONTENT                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Select Torrent → Cast API → Add to RD → Unrestrict →       │   │
│  │ Save to DB → Success Toast                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  3. STREMIO PLAYBACK                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Open Content → Stream Request → Fetch User Casts →          │   │
│  │ Fetch Other Streams → Return Stream List → Play             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  4. MANAGEMENT                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Manage Page → Fetch All Casts → Group by IMDB →             │   │
│  │ Display → Delete/View in Stremio                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

### Core Utilities

| File                             | Purpose                           |
| -------------------------------- | --------------------------------- |
| `src/hooks/castToken.ts`         | Token generation and storage hook |
| `src/utils/castApiClient.ts`     | Client-side cast functions        |
| `src/utils/castApiHelpers.ts`    | User ID generation, validation    |
| `src/utils/castCatalogHelper.ts` | Library fetching helpers          |
| `src/utils/getStreamUrl.ts`      | RD link unrestriction             |

### API Routes

| Route                                 | Purpose                        |
| ------------------------------------- | ------------------------------ |
| `/api/stremio/id`                     | Generate user ID from RD token |
| `/api/stremio/cast/movie/[imdbid]`    | Cast single movie              |
| `/api/stremio/cast/series/[imdbid]`   | Cast TV episodes               |
| `/api/stremio/cast/library/[id]`      | Cast from RD library           |
| `/api/stremio/cast/[imdbid]`          | Generic cast with redirect     |
| `/api/stremio/cast/saveProfile`       | Save user profile              |
| `/api/stremio/cast/updateSizeLimits`  | Update size preferences        |
| `/api/stremio/[userid]/manifest.json` | Stremio addon manifest         |
| `/api/stremio/[userid]/catalog/**`    | Catalog endpoints              |
| `/api/stremio/[userid]/stream/**`     | Stream endpoints               |

### Database

| File                            | Purpose                     |
| ------------------------------- | --------------------------- |
| `prisma/schema.prisma`          | Cast and CastProfile models |
| `src/services/database/cast.ts` | CastService class           |

### Frontend

| File                                 | Purpose             |
| ------------------------------------ | ------------------- |
| `src/pages/stremio/manage.tsx`       | Manage casted links |
| `src/components/CastSearchModal.tsx` | IMDB search modal   |
| `src/components/SettingsSection.tsx` | Size limit settings |
