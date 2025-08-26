import axios from 'axios';
import { getMdblistCacheService } from './database/mdblistCache';
import { MList, MMovie, MSearchResponse, MShow } from './mdblist';

export class MDBListClient {
	private apiKey: string;
	private baseUrl = 'https://mdblist.com/api';
	private cache = getMdblistCacheService();

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	/**
	 * Search for movies and shows by keyword
	 */
	async search(keyword: string, year?: number, mediaType?: string): Promise<MSearchResponse> {
		// Create cache key from search parameters
		const cacheKey = `search_${keyword}_${year || ''}_${mediaType || ''}`;

		// Check cache first (with 1 hour expiration for search results)
		const cached = await this.cache.getWithMetadata(cacheKey);
		const ONE_HOUR = 3600000;
		if (cached && Date.now() - cached.updatedAt.getTime() < ONE_HOUR) {
			console.log(`[MDBList] Using cached search results for: ${cacheKey}`);
			return cached.data;
		}

		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('s', keyword);

		if (year) {
			url.searchParams.append('y', year.toString());
		}

		if (mediaType) {
			url.searchParams.append('m', mediaType);
		}

		const response = (await axios.get(url.toString())).data;

		// Cache the response
		await this.cache.cacheSearch(cacheKey, response);
		console.log(`[MDBList] Cached search results for: ${cacheKey}`);

		return response;
	}

	/**
	 * Get info for a movie or show by IMDB ID
	 */
	async getInfoByImdbId(imdbId: string): Promise<MMovie | MShow> {
		// Check cache first
		const cached = await this.cache.get(imdbId);
		if (cached) {
			console.log(`[MDBList] Using cached data for IMDB ID: ${imdbId}`);
			return cached;
		}

		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('i', imdbId);

		const response = (await axios.get(url.toString())).data;

		// Determine type and cache accordingly
		const type = response.type === 'movie' ? 'movie' : 'show';
		await this.cache.set(imdbId, type, response);
		console.log(`[MDBList] Cached ${type} data for IMDB ID: ${imdbId}`);

		return response;
	}

	/**
	 * Get info for a movie or show by TMDB ID
	 */
	async getInfoByTmdbId(tmdbId: number | string): Promise<MMovie | MShow> {
		const cacheKey = `tmdb_${tmdbId}`;

		// Check cache first
		const cached = await this.cache.get(cacheKey);
		if (cached) {
			console.log(`[MDBList] Using cached data for TMDB ID: ${tmdbId}`);
			return cached;
		}

		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('tm', tmdbId.toString());

		const response = (await axios.get(url.toString())).data;

		// Determine type and cache accordingly
		const type = response.type === 'movie' ? 'movie' : 'show';
		await this.cache.set(cacheKey, type, response);
		console.log(`[MDBList] Cached ${type} data for TMDB ID: ${tmdbId}`);

		// Also cache by IMDB ID if available
		if (response.imdbid) {
			await this.cache.set(response.imdbid, type, response);
			console.log(`[MDBList] Also cached by IMDB ID: ${response.imdbid}`);
		}

		return response;
	}

	/**
	 * Search for lists by term
	 */
	async searchLists(term: string): Promise<any> {
		const cacheKey = `list_search_${term}`;

		// Check cache first
		const cached = await this.cache.getCachedList(cacheKey);
		if (cached) {
			console.log(`[MDBList] Using cached list search results for: ${term}`);
			return cached;
		}

		const url = new URL(`${this.baseUrl}/lists/search`);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('s', term);

		const response = (await axios.get(url.toString())).data;

		// Cache the response
		await this.cache.cacheList(cacheKey, response);
		console.log(`[MDBList] Cached list search results for: ${term}`);

		return response;
	}

	/**
	 * Get items from a list by list ID
	 */
	async getListItems(listId: string): Promise<any> {
		const cacheKey = `list_items_${listId}`;

		// Check cache first
		const cached = await this.cache.getCachedList(cacheKey);
		if (cached) {
			console.log(`[MDBList] Using cached list items for ID: ${listId}`);
			return cached;
		}

		const url = new URL(`${this.baseUrl}/lists/${listId}/items`);
		url.searchParams.append('apikey', this.apiKey);

		const response = (await axios.get(url.toString())).data;

		// Cache the response
		await this.cache.cacheList(cacheKey, response);
		console.log(`[MDBList] Cached list items for ID: ${listId}`);

		return response;
	}

	/**
	 * Get top lists
	 */
	async getTopLists(): Promise<MList[]> {
		const cacheKey = 'top_lists';

		// Check cache first (with 24 hour expiration for top lists)
		const cached = await this.cache.getWithMetadata(cacheKey);
		const ONE_DAY = 86400000;
		if (cached && Date.now() - cached.updatedAt.getTime() < ONE_DAY) {
			console.log(`[MDBList] Using cached top lists`);
			return cached.data;
		}

		const url = new URL(`${this.baseUrl}/lists/top`);
		url.searchParams.append('apikey', this.apiKey);

		const response = (await axios.get(url.toString())).data;

		// Cache the response
		await this.cache.cacheList(cacheKey, response);
		console.log(`[MDBList] Cached top lists`);

		return response;
	}

	/**
	 * Get URL for searching by keyword
	 * @deprecated Use search() method instead
	 */
	getSearchUrl(keyword: string, year?: number, mediaType?: string): string {
		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('s', keyword);

		if (year) {
			url.searchParams.append('y', year.toString());
		}

		if (mediaType) {
			url.searchParams.append('m', mediaType || '');
		}

		return url.toString();
	}

	/**
	 * Get URL for fetching info by IMDB ID
	 * @deprecated Use getInfoByImdbId() method instead
	 */
	getImdbInfoUrl(imdbId: string): string {
		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('i', imdbId);

		return url.toString();
	}

	/**
	 * Get URL for fetching info by TMDB ID
	 * @deprecated Use getInfoByTmdbId() method instead
	 */
	getTmdbInfoUrl(tmdbId: number | string): string {
		const url = new URL(this.baseUrl);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('tm', tmdbId.toString());

		return url.toString();
	}

	/**
	 * Get URL for searching lists
	 * @deprecated Use searchLists() method instead
	 */
	getSearchListsUrl(term: string): string {
		const url = new URL(`${this.baseUrl}/lists/search`);
		url.searchParams.append('apikey', this.apiKey);
		url.searchParams.append('s', term);

		return url.toString();
	}

	/**
	 * Get URL for fetching list items
	 * @deprecated Use getListItems() method instead
	 */
	getListItemsUrl(listId: string): string {
		const url = new URL(`${this.baseUrl}/lists/${listId}/items`);
		url.searchParams.append('apikey', this.apiKey);

		return url.toString();
	}

	/**
	 * Get URL for fetching top lists
	 * @deprecated Use getTopLists() method instead
	 */
	getTopListsUrl(): string {
		const url = new URL(`${this.baseUrl}/lists/top`);
		url.searchParams.append('apikey', this.apiKey);

		return url.toString();
	}
}

// Create a singleton instance with the API key from environment
let mdblistClientInstance: MDBListClient | null = null;

export function getMdblistClient(): MDBListClient {
	if (!mdblistClientInstance) {
		const apiKey = process.env.MDBLIST_KEY;

		if (!apiKey) {
			throw new Error('MDBLIST_KEY environment variable is not defined');
		}

		mdblistClientInstance = new MDBListClient(apiKey);
	}

	return mdblistClientInstance;
}
