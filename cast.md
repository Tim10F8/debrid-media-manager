# Cast Button Locations

This document records all locations where cast functionality appears in the application.

## 1. TV Show Page

**File:** `src/pages/show/[imdbid]/[seasonNum].tsx`
**Lines:** 635-647

**Function:** `handleCast(hash: string, fileIds: string[])`

```typescript
async function handleCast(hash: string, fileIds: string[]) {
	await toast.promise(
		handleCastTvShow(imdbid as string, rdKey!, hash, fileIds),
		{
			loading: `Casting ${fileIds.length} episodes...`,
			success: 'Casting succeeded.',
			error: 'Casting failed.',
		},
		castToastOptions
	);
	window.open(`stremio://detail/series/${imdbid}/${imdbid}:${seasonNum}:1`);
}
```

**Details:**

- Casts TV show episodes to Stremio
- Uses `handleCastTvShow()` from `@/utils/castApiClient`
- Opens Stremio deep link after casting: `stremio://detail/series/${imdbid}/${imdbid}:${seasonNum}:1`
- Requires Real-Debrid key

---

## 2. Movie Page

**File:** `src/pages/movie/[imdbid]/index.tsx`
**Lines:** 562-573 (function), 641-649 (button in header)

**Function:** `handleCast(hash: string)`

```typescript
async function handleCast(hash: string) {
	await toast.promise(
		handleCastMovie(imdbid as string, rdKey!, hash),
		{
			loading: 'Starting RD cast in Stremio...',
			success: 'Cast started in Stremio',
			error: 'RD cast failed in Stremio',
		},
		castToastOptions
	);
	window.open(`stremio://detail/movie/${imdbid}/${imdbid}`);
}
```

**Button Location:** Header action buttons (lines 641-649)

```typescript
<button
    className="mb-1 mr-2 mt-0 rounded border-2 border-gray-500 bg-gray-900/30 p-1 text-xs text-gray-100 transition-colors hover:bg-gray-800/50"
    onClick={() => handleCast(getFirstAvailableRdTorrent()!.hash)}
>
    <b className="flex items-center justify-center">
        <Cast className="mr-1 h-3 w-3 text-gray-500" />
        Cast
    </b>
</button>
```

**Details:**

- Casts movies to Stremio
- Uses `handleCastMovie()` from `@/utils/castApiClient`
- Opens Stremio deep link: `stremio://detail/movie/${imdbid}/${imdbid}`
- Requires Real-Debrid key

---

## 3. TV Search Results Component

**File:** `src/components/TvSearchResults.tsx`
**Lines:** 410-431

**Button Code:**

```typescript
{rdKey && castableFileIds.length > 0 && (
    <button
        className={`haptic-sm inline rounded border-2 border-gray-500 bg-gray-900/30 px-1 text-xs text-gray-100 transition-colors hover:bg-gray-800/50 ${isCasting ? 'cursor-not-allowed opacity-50' : ''}`}
        onClick={() => handleCastWithLoading(r.hash, castableFileIds)}
        disabled={isCasting}
    >
        {isCasting ? (
            <>
                <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" />
                Casting...
            </>
        ) : (
            <>
                <Cast className="mr-1 inline-block h-3 w-3 text-gray-400" />
                Cast
            </>
        )}
    </button>
)}
```

**Castable File Logic (lines 230-232):**

```typescript
let epRegex1 = /S(\d+)\s?E(\d+)/i;
let epRegex2 = /[^\d](\d{1,2})x(\d{1,2})[^\d]/i;
const castableFileIds = r.files
	.filter((f) => f.filename.match(epRegex1) || f.filename.match(epRegex2))
	.map((f) => `${f.fileId}`);
```

**Details:**

- Individual cast button for each torrent result in TV show search
- Only shows when `rdKey` exists and there are castable file IDs
- Filters files by episode regex patterns (S##E## or ##x##)
- Shows loading state while casting
- Uses `Cast` icon from lucide-react

---

## 4. Movie Search Results Component

**File:** `src/components/MovieSearchResults.tsx`
**Lines:** 425-444

**Button Code:**

```typescript
{rdKey && (
    <button
        className={`haptic-sm inline rounded border-2 border-gray-500 bg-gray-900/30 px-1 text-xs text-gray-100 transition-colors hover:bg-gray-800/50 ${isCasting ? 'cursor-not-allowed opacity-50' : ''}`}
        onClick={() => handleCastWithLoading(r.hash)}
        disabled={isCasting}
    >
        {isCasting ? (
            <>
                <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" />
                Casting...
            </>
        ) : (
            <span className="inline-flex items-center">
                <Cast className="mr-1 h-3 w-3 text-gray-500" />
                Cast
            </span>
        )}
    </button>
)}
```

**Details:**

- Individual cast button for each torrent result in movie search
- Only shows when `rdKey` exists
- Shows loading state while casting
- Uses `Cast` icon from lucide-react

---

## 5. Library Page Popup - Cast All Button

**File:** `src/components/showInfo/index.ts`
**Lines:** 80-86

**Button Rendering:**

```typescript
${
    rdKey
        ? renderButton('castAll', {
                link: `/api/stremio/cast/library/${info.id}:${info.hash}`,
                linkParams: [{ name: 'rdToken', value: rdKey }],
            })
        : ''
}
```

**Details:**

- "Cast All" button in the library torrent info popup
- Appears when clicking on a torrent in the library page
- API endpoint: `/api/stremio/cast/library/${info.id}:${info.hash}`
- Passes `rdToken` as query parameter
- Only for Real-Debrid torrents (when `rdKey` exists)
- Opens in new tab via form submission

---

## 6. Library Page Popup - Individual File Cast Buttons

**File:** `src/components/showInfo/render.ts`
**Lines:** 60-77

**Button Rendering Logic:**

```typescript
if (rdKey && imdbId && (mediaType === 'movie' || (mediaType === 'tv' && isTvEpisode))) {
	actions.push(
		renderButton('cast', {
			link: `/api/stremio/cast/${imdbId}`,
			linkParams: [
				{ name: 'token', value: rdKey },
				{ name: 'hash', value: info.hash },
				{ name: 'fileId', value: String(file.id) },
				{ name: 'mediaType', value: mediaType },
			],
			text: 'Cast',
		})
	);
}
```

**Details:**

- Individual "Cast" button for each playable file in the torrent
- Shows in the file list within the library popup
- Only shows for:
    - Movie files with `imdbId` and `rdKey`
    - TV episode files with `imdbId` and `rdKey`
- API endpoint: `/api/stremio/cast/${imdbId}`
- Passes parameters: `token`, `hash`, `fileId`, `mediaType`
- Opens in new tab via form submission

---

## Cast Button Styling

**File:** `src/components/showInfo/styles.ts`

**Cast Button Style:**

```typescript
cast: 'border-2 border-gray-500 bg-gray-900/30 text-gray-100 hover:bg-gray-800/50 transition-colors',
castAll: 'border-2 border-gray-500 bg-gray-900/30 text-gray-100 hover:bg-gray-800/50',
```

**Cast Icon SVG:**

```typescript
cast: '<svg class="inline-block w-3 h-3 mr-1" style="color: #9ca3af;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m5 7 5 5-5 5"/><path d="m12 19 7-7-7-7"/></svg>',
```

**Labels:**

```typescript
cast: 'Cast',
castAll: 'Cast',
```

---

## Cast API Utilities

**File:** `src/utils/castApiClient.ts`

The following functions are used by the cast buttons:

- `handleCastMovie(imdbid: string, rdKey: string, hash: string)`
- `handleCastTvShow(imdbid: string, rdKey: string, hash: string, fileIds: string[])`

---

## Summary

### Total Cast Button Locations: 6

1. **TV Show Page** - Cast button for the current season
2. **Movie Page** - Cast button in header actions
3. **TV Search Results** - Cast button per torrent result
4. **Movie Search Results** - Cast button per torrent result
5. **Library Popup (Cast All)** - Cast all files in a torrent
6. **Library Popup (Individual Files)** - Cast individual files

### Requirements

- All cast functionality requires a Real-Debrid key (`rdKey`)
- TV show casting requires episode pattern matching (S##E## or ##x##)
- Individual file casting requires an `imdbId`
- All cast operations open Stremio deep links after completion
