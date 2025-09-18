/**
 * Unified library fetcher implementing Zurg's parallel fetching patterns
 * Adapts to each service's capabilities while maintaining efficiency
 */

import { MagnetStatus, getMagnetStatus } from '@/services/allDebrid';
import { getUserTorrentsList } from '@/services/realDebrid';
import { getTorrentList } from '@/services/torbox';
import { UserTorrent } from '@/torrent/userTorrent';
import {
	convertToAllDebridUserTorrent,
	convertToTbUserTorrent,
	convertToUserTorrent,
} from '@/utils/fetchTorrents';
import { CacheManager, getGlobalCache } from '../cache/CacheManager';
import { UnifiedRateLimiter, getGlobalRateLimiter } from '../rateLimit/UnifiedRateLimiter';

export interface FetchOptions {
	forceRefresh?: boolean;
	onProgress?: (progress: number, total: number) => void;
	onBatchComplete?: (batch: UserTorrent[]) => void;
	signal?: AbortSignal;
	maxItems?: number;
	concurrency?: number;
}

export class UnifiedLibraryFetcher {
	private cache: CacheManager;
	private rateLimiter: UnifiedRateLimiter;
	private fetchingPromises: Map<string, Promise<UserTorrent[]>> = new Map();

	constructor(cache?: CacheManager, rateLimiter?: UnifiedRateLimiter) {
		this.cache = cache || getGlobalCache();
		this.rateLimiter = rateLimiter || getGlobalRateLimiter();
	}

	/**
	 * Fetch library from any service with unified interface
	 */
	async fetchLibrary(
		service: 'realdebrid' | 'alldebrid' | 'torbox',
		token: string,
		options: FetchOptions = {}
	): Promise<UserTorrent[]> {
		console.log(
			`[Fetcher] Starting fetch for ${service}, forceRefresh: ${options.forceRefresh}, maxItems: ${options.maxItems}`
		);
		const totalStart = Date.now();

		// Deduplicate concurrent requests for the same service
		const fetchKey = `${service}:${token}`;
		const existingPromise = this.fetchingPromises.get(fetchKey);
		if (existingPromise && !options.forceRefresh) {
			console.log(`[Fetcher] Using existing promise for ${service}`);
			return existingPromise;
		}

		const fetchPromise = this.performFetch(service, token, options);
		this.fetchingPromises.set(fetchKey, fetchPromise);

		try {
			const result = await fetchPromise;
			const totalTime = Date.now() - totalStart;
			console.log(
				`[Fetcher] Completed fetch for ${service} in ${totalTime}ms - ${result.length} items`
			);
			return result;
		} catch (error) {
			const totalTime = Date.now() - totalStart;
			console.error(`[Fetcher] Failed to fetch ${service} after ${totalTime}ms:`, error);
			throw error;
		} finally {
			this.fetchingPromises.delete(fetchKey);
		}
	}

	private async performFetch(
		service: 'realdebrid' | 'alldebrid' | 'torbox',
		token: string,
		options: FetchOptions
	): Promise<UserTorrent[]> {
		switch (service) {
			case 'realdebrid':
				return this.fetchRealDebrid(token, options);
			case 'alldebrid':
				return this.fetchAllDebrid(token, options);
			case 'torbox':
				return this.fetchTorbox(token, options);
			default:
				throw new Error(`Unknown service: ${service}`);
		}
	}

	/**
	 * Fetch RealDebrid library with parallel pagination (like Zurg)
	 */
	private async fetchRealDebrid(token: string, options: FetchOptions): Promise<UserTorrent[]> {
		console.log(`[Fetcher] RealDebrid fetch starting, forceRefresh: ${options.forceRefresh}`);
		const rdStart = Date.now();

		const cacheKey = `rd:library:${token}`;

		// Check cache first
		if (!options.forceRefresh) {
			console.log(`[Fetcher] Checking cache for RealDebrid...`);
			const cached = await this.cache.get<UserTorrent[]>(cacheKey);
			if (cached) {
				console.log(`[Fetcher] Using cached RealDebrid data: ${cached.length} items`);
				return cached;
			}
			console.log(`[Fetcher] No cached data found for RealDebrid`);
		}

		// Step 1: Get first page to determine total count
		console.log(`[Fetcher] Getting RealDebrid total count...`);
		const countStart = Date.now();
		const firstPageResult = await this.rateLimiter.execute('realdebrid', 'rd-first-page', () =>
			getUserTorrentsList(token, 1, 1)
		);

		if (!firstPageResult.data.length) {
			console.log(`[Fetcher] No RealDebrid torrents found`);
			await this.cache.set(cacheKey, [], undefined, 5 * 60 * 1000);
			return [];
		}

		const totalCount = Math.min(firstPageResult.totalCount || 0, options.maxItems || Infinity);
		const pageSize = 1500; // Max items per page for RD
		const totalPages = Math.ceil(totalCount / pageSize);
		const concurrency = options.concurrency || 4; // Max 4 concurrent requests for RD

		console.log(
			`[Fetcher] RealDebrid total count retrieved in ${Date.now() - countStart}ms - ${totalCount} items, ${totalPages} pages, concurrency: ${concurrency}`
		);

		options.onProgress?.(0, totalCount);

		// Step 2: Create batch requests for parallel fetching
		const pages: number[] = [];
		for (let page = 1; page <= totalPages; page++) {
			pages.push(page);
		}

		// Step 3: Fetch pages in batches with controlled concurrency
		const allTorrents: UserTorrent[] = [];
		const batchSize = concurrency;
		const fetchStart = Date.now();

		console.log(
			`[Fetcher] Starting parallel fetch of ${pages.length} pages in batches of ${batchSize}`
		);

		for (let i = 0; i < pages.length; i += batchSize) {
			if (options.signal?.aborted) {
				throw new Error('Fetch aborted');
			}

			const batch = pages.slice(i, i + batchSize);
			const batchStart = Date.now();
			console.log(
				`[Fetcher] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pages.length / batchSize)}: pages ${batch.join(', ')}`
			);

			const batchPromises = batch.map((page) =>
				this.rateLimiter.execute('realdebrid', `rd-page-${page}`, () =>
					getUserTorrentsList(token, pageSize, page)
				)
			);

			const batchResults = await Promise.all(batchPromises);
			const batchTime = Date.now() - batchStart;

			let batchTorrentCount = 0;
			for (const result of batchResults) {
				const torrents = await this.processRealDebridTorrents(result.data);
				allTorrents.push(...torrents);
				batchTorrentCount += torrents.length;
				options.onBatchComplete?.(torrents);
				options.onProgress?.(allTorrents.length, totalCount);
			}

			console.log(
				`[Fetcher] Batch completed in ${batchTime}ms: ${batchTorrentCount} items, total: ${allTorrents.length}/${totalCount}`
			);
		}

		const fetchTime = Date.now() - fetchStart;
		console.log(
			`[Fetcher] All pages fetched in ${fetchTime}ms - ${allTorrents.length} total items`
		);

		// Cache the results
		console.log(`[Fetcher] Caching RealDebrid results...`);
		const cacheStart = Date.now();
		await this.cache.set(cacheKey, allTorrents, undefined, 5 * 60 * 1000);
		console.log(`[Fetcher] Results cached in ${Date.now() - cacheStart}ms`);

		const totalTime = Date.now() - rdStart;
		console.log(
			`[Fetcher] RealDebrid fetch completed in ${totalTime}ms - ${allTorrents.length} items`
		);

		return allTorrents;
	}

	/**
	 * Fetch AllDebrid library with optimized batching
	 */
	private async fetchAllDebrid(token: string, options: FetchOptions): Promise<UserTorrent[]> {
		const cacheKey = `ad:library:${token}`;

		// Check cache first
		if (!options.forceRefresh) {
			const cached = await this.cache.get<UserTorrent[]>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		// AllDebrid doesn't support pagination, fetch all at once
		const result = await this.rateLimiter.execute('alldebrid', 'ad-fetch-all', () =>
			getMagnetStatus(token)
		);

		if (!result.data?.magnets) {
			await this.cache.set(cacheKey, [], undefined, 5 * 60 * 1000);
			return [];
		}

		const magnets = result.data.magnets;
		options.onProgress?.(0, magnets.length);

		// Process magnets in batches for better performance
		const batchSize = 50;
		const allTorrents: UserTorrent[] = [];

		for (let i = 0; i < magnets.length; i += batchSize) {
			if (options.signal?.aborted) {
				throw new Error('Fetch aborted');
			}

			const batch = magnets.slice(i, i + batchSize);
			const torrents = await this.processAllDebridMagnets(batch);
			allTorrents.push(...torrents);
			options.onBatchComplete?.(torrents);
			options.onProgress?.(allTorrents.length, magnets.length);
		}

		// Cache the results
		await this.cache.set(cacheKey, allTorrents, undefined, 5 * 60 * 1000);

		return allTorrents;
	}

	/**
	 * Fetch Torbox library with pagination support
	 */
	private async fetchTorbox(token: string, options: FetchOptions): Promise<UserTorrent[]> {
		const cacheKey = `tb:library:${token}`;

		// Check cache first
		if (!options.forceRefresh) {
			const cached = await this.cache.get<UserTorrent[]>(cacheKey);
			if (cached) {
				return cached;
			}
		}

		// Torbox supports pagination but doesn't return total count reliably
		// Fetch in batches until we get an empty response
		const pageSize = 100;
		const allTorrents: UserTorrent[] = [];
		let offset = 0;
		let hasMore = true;

		while (hasMore && (!options.maxItems || allTorrents.length < options.maxItems)) {
			if (options.signal?.aborted) {
				throw new Error('Fetch aborted');
			}

			const result = await this.rateLimiter.execute('torbox', `tb-page-${offset}`, () =>
				getTorrentList(token, {
					bypass_cache: true,
					offset,
					limit: pageSize,
				})
			);

			if (!result.success || !result.data) {
				hasMore = false;
				break;
			}

			const torrentsData = Array.isArray(result.data) ? result.data : [result.data];
			if (torrentsData.length === 0) {
				hasMore = false;
				break;
			}

			const torrents = await this.processTorboxTorrents(torrentsData);
			allTorrents.push(...torrents);
			options.onBatchComplete?.(torrents);
			options.onProgress?.(allTorrents.length, allTorrents.length + pageSize);

			offset += pageSize;
			hasMore = torrentsData.length === pageSize;
		}

		// Cache the results
		await this.cache.set(cacheKey, allTorrents, undefined, 5 * 60 * 1000);

		return allTorrents;
	}

	// Conversion helpers (these would import from existing utils)
	private async processRealDebridTorrents(data: any[]): Promise<UserTorrent[]> {
		return data.map((t) => convertToUserTorrent(t));
	}

	private async processAllDebridMagnets(magnets: MagnetStatus[]): Promise<UserTorrent[]> {
		return magnets.map((m) => convertToAllDebridUserTorrent(m));
	}

	private async processTorboxTorrents(data: any[]): Promise<UserTorrent[]> {
		return data.map((t) => convertToTbUserTorrent(t));
	}

	/**
	 * Clear cache for a specific service or all services
	 */
	async clearCache(service?: string, token?: string): Promise<void> {
		if (service && token) {
			const cacheKey = `${service}:library:${token}`;
			await this.cache.clear([cacheKey]);
		} else {
			// Clear all library caches
			await this.cache.clear();
		}
	}
}
