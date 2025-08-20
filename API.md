# Movie/TV Show Metadata APIs

This document lists all external APIs used in the DMM project for fetching movie and TV show metadata.

## 1. MDBList API
- **Base URL:** `https://mdblist.com/api`
- **Purpose:** Primary metadata source for movies and TV shows
- **Used in:** 
  - `/src/services/mdblistClient.ts`
  - `/src/pages/api/info/movie.ts`
  - `/src/pages/api/info/show.ts`
- **Features:**
  - Search by keyword, year, and media type
  - Get info by IMDB ID or TMDB ID
  - Access to curated lists
  - Ratings from multiple sources
- **Authentication:** API key required (environment variable: `MDBLIST_KEY`)

## 2. Cinemeta (Stremio)
- **Base URL:** `https://v3-cinemeta.strem.io`
- **Purpose:** Fallback metadata source for movies and TV shows
- **Used in:**
  - `/src/pages/api/info/movie.ts` - `/meta/movie/{imdbId}.json`
  - `/src/pages/api/info/show.ts` - `/meta/series/{imdbId}.json`
- **Features:**
  - Movie and TV show metadata by IMDB ID
  - Episode information
  - IMDB ratings
  - Posters and backgrounds
- **Authentication:** None required

## 3. The Movie Database (TMDB)
- **Base URL:** `https://api.themoviedb.org/3`
- **Purpose:** Additional metadata for cleaning/enriching torrent data
- **Used in:**
  - `/src/services/movieCleaner.ts`
  - `/src/services/tvCleaner.ts`
- **Features:**
  - Find content by IMDB ID
  - Detailed movie and TV show information
  - Used for data validation and enrichment
- **Authentication:** API key required (environment variable: `TMDB_KEY`)

## 4. Trakt API
- **Base URL:** `https://api.trakt.tv`
- **Purpose:** Social features, lists, and trending content
- **Used in:** `/src/services/trakt.ts`
- **Features:**
  - Search suggestions
  - Trending and popular content by genre
  - User watchlists and collections
  - Personal and liked lists
  - User authentication and settings
- **Authentication:** 
  - Client ID required for public endpoints
  - OAuth access token for user-specific data

## 5. Anime Kitsu (Strem.fun)
- **Base URLs:** 
  - `https://anime-kitsu.strem.fun/meta/series/{id}.json` - Anime metadata
  - `https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-list/` - Anime search
- **Purpose:** Anime-specific metadata
- **Used in:**
  - `/src/pages/api/info/anime.ts`
  - `/src/pages/api/search/anime.ts`
- **Features:**
  - Anime series information
  - Search by keyword
  - Kitsu ID mapping
- **Authentication:** None required

## 6. Torrentio (Strem.fun)
- **Base URL:** `https://torrentio.strem.fun`
- **Purpose:** Torrent stream aggregation
- **Used in:** `/src/services/torrentio.ts`
- **Features:**
  - Movie streams: `/stream/movie/{imdbId}.json`
  - TV show streams: `/stream/series/{imdbId}:{season}:{episode}.json`
  - Quality filtering and sorting options
- **Authentication:** None required

## Additional Notes

### Image Hosting
- TMDB images are served from `image.tmdb.org` (configured in next.config.js)
- Fallback images use Unsplash random images for missing backdrops
- Placeholder images from picsum.photos for missing posters

### Environment Variables Required
- `MDBLIST_KEY` - MDBList API key
- `TMDB_KEY` - The Movie Database API key  
- `OMDB_KEY` - OMDB API key (defined but not actively used in code)
- `traktClientId` - Trakt client ID (from next.config.js)

### API Priority
1. MDBList is the primary source for metadata
2. Cinemeta/Stremio serves as fallback
3. TMDB is used for data enrichment and validation
4. Service-specific APIs (Trakt, Kitsu) for specialized content