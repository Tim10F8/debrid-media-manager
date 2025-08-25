import { getUserTorrentsList } from '@/services/realDebrid';
import { UserTorrentResponse, UserTorrentsResult } from '@/services/types';
import { UserTorrent } from '@/torrent/userTorrent';
import { convertToUserTorrent } from './fetchTorrents';

// Cache storage for torrents (similar to Zurg's atomic.Pointer)
let cachedTorrents: UserTorrent[] | null = null;
let cacheTimestamp: number = 0;

// Cache expiry time (30 minutes)
const CACHE_EXPIRY = 30 * 60 * 1000;

interface FetchResult {
	torrents: UserTorrent[];
	totalCount: number;
	cacheHit: boolean;
}

/**
 * Fetches RealDebrid torrents with Zurg-style caching strategy
 * This function implements the smart caching logic from Zurg:
 * 1. Fetches first page
 * 2. Checks if it matches cached data
 * 3. If match found, returns cached data + new items
 * 4. Otherwise fetches all pages in parallel
 */
export async function fetchRealDebridWithCache(
	rdKey: string,
	useCache: boolean = true,
	customLimit?: number
): Promise<FetchResult> {
	try {
		// Step 1: Fetch the first page to get total count and check cache
		const pageSize = 5000; // Using our increased page size
		const { data: firstPageData, totalCount } = await getUserTorrentsList(
			rdKey,
			customLimit ?? pageSize,
			1
		);

		if (!firstPageData.length || !totalCount || totalCount === 0) {
			return { torrents: [], totalCount: 0, cacheHit: false };
		}

		// Convert first page to UserTorrent format
		const firstPageTorrents = firstPageData.map(convertToUserTorrent);

		// If custom limit is small, just return the first page
		if (customLimit && customLimit <= pageSize) {
			return {
				torrents: firstPageTorrents.slice(0, customLimit),
				totalCount: customLimit,
				cacheHit: false,
			};
		}

		// Step 2: Check for cache hit (Zurg's smart caching logic)
		if (useCache && cachedTorrents && cachedTorrents.length > 0) {
			const cacheAge = Date.now() - cacheTimestamp;

			// Don't use cache if it's too old
			if (cacheAge < CACHE_EXPIRY) {
				// Try to find matching point between fresh data and cache
				for (let cacheIdx = 0; cacheIdx < cachedTorrents.length; cacheIdx++) {
					for (let freshIdx = 0; freshIdx < firstPageTorrents.length; freshIdx++) {
						const cached = cachedTorrents[cacheIdx];
						const fresh = firstPageTorrents[freshIdx];

						// Check if IDs match and progress hasn't changed
						// This indicates we found the overlap point
						if (
							fresh.id === cached.id &&
							fresh.progress === cached.progress &&
							fresh.status === cached.status
						) {
							// Calculate expected positions
							const expectedCount = Math.ceil(totalCount / pageSize) * pageSize;
							const cacheIdxFromEnd = cachedTorrents.length - 1 - cacheIdx;
							const freshIdxFromEnd = expectedCount - 1 - freshIdx;

							// If positions match, we have a cache hit
							if (freshIdxFromEnd === cacheIdxFromEnd) {
								console.log(`Cache hit! Using cached data from index ${cacheIdx}`);

								// Build result: new items + cached items
								const allTorrents = [
									...firstPageTorrents.slice(0, freshIdx),
									...cachedTorrents.slice(cacheIdx),
								];

								// Update cache with the new complete list
								cachedTorrents = allTorrents;
								cacheTimestamp = Date.now();

								return {
									torrents: allTorrents,
									totalCount: allTorrents.length,
									cacheHit: true,
								};
							}
						}
					}
				}
				console.log('Cache miss - no matching overlap found');
			} else {
				console.log('Cache expired, fetching fresh data');
			}
		}

		// Step 3: Cache miss or cache disabled - fetch all pages in parallel
		const maxPages = Math.ceil(totalCount / pageSize);
		console.log(`Fetching ${maxPages} pages (${totalCount} torrents total)`);

		if (maxPages === 1) {
			// Update cache
			cachedTorrents = firstPageTorrents;
			cacheTimestamp = Date.now();

			return {
				torrents: firstPageTorrents,
				totalCount: firstPageTorrents.length,
				cacheHit: false,
			};
		}

		// Fetch remaining pages in parallel
		const pagePromises: Promise<UserTorrentsResult>[] = [];
		for (let page = 2; page <= maxPages; page++) {
			pagePromises.push(getUserTorrentsList(rdKey, pageSize, page));
		}

		const remainingPages = await Promise.all(pagePromises);

		// Combine all pages
		const allData: UserTorrentResponse[] = [
			...firstPageData,
			...remainingPages.flatMap((page) => page.data),
		];

		// Convert all to UserTorrent format
		const allTorrents = allData.map(convertToUserTorrent);

		// Update cache
		cachedTorrents = allTorrents;
		cacheTimestamp = Date.now();

		return {
			torrents: allTorrents,
			totalCount: allTorrents.length,
			cacheHit: false,
		};
	} catch (error) {
		console.error('Error fetching torrents with cache:', error);
		throw error;
	}
}

/**
 * Clears the torrent cache
 */
export function clearTorrentCache() {
	cachedTorrents = null;
	cacheTimestamp = 0;
}
