import { MList, MMovie, MSearchResponse, MShow } from '../mdblist';
import { DatabaseClient } from './client';

export class MdblistCacheService extends DatabaseClient {
	/**
	 * Get cached MDBList data by ID
	 */
	async get(id: string): Promise<any | null> {
		try {
			const cached = await this.prisma.mdblistCache.findUnique({
				where: { id },
			});

			if (cached) {
				return cached.data;
			}

			return null;
		} catch (error) {
			console.error('Error getting MDBList cache:', error);
			return null;
		}
	}

	/**
	 * Save MDBList data to cache
	 */
	async set(id: string, type: string, data: any): Promise<void> {
		try {
			await this.prisma.mdblistCache.upsert({
				where: { id },
				update: {
					data,
					type,
				},
				create: {
					id,
					type,
					data,
				},
			});
		} catch (error) {
			console.error('Error setting MDBList cache:', error);
		}
	}

	/**
	 * Cache movie data
	 */
	async cacheMovie(imdbId: string, data: MMovie): Promise<void> {
		await this.set(imdbId, 'movie', data);
	}

	/**
	 * Cache show data
	 */
	async cacheShow(imdbId: string, data: MShow): Promise<void> {
		await this.set(imdbId, 'show', data);
	}

	/**
	 * Cache search results
	 */
	async cacheSearch(searchKey: string, data: MSearchResponse): Promise<void> {
		await this.set(searchKey, 'search', data);
	}

	/**
	 * Cache list data
	 */
	async cacheList(listId: string, data: MList | any): Promise<void> {
		await this.set(listId, 'list', data);
	}

	/**
	 * Get cached movie data
	 */
	async getCachedMovie(imdbId: string): Promise<MMovie | null> {
		return await this.get(imdbId);
	}

	/**
	 * Get cached show data
	 */
	async getCachedShow(imdbId: string): Promise<MShow | null> {
		return await this.get(imdbId);
	}

	/**
	 * Get cached search results
	 */
	async getCachedSearch(searchKey: string): Promise<MSearchResponse | null> {
		return await this.get(searchKey);
	}

	/**
	 * Get cached list data
	 */
	async getCachedList(listId: string): Promise<any | null> {
		return await this.get(listId);
	}
}

// Create singleton instance
let mdblistCacheInstance: MdblistCacheService | null = null;

export function getMdblistCacheService(): MdblistCacheService {
	if (!mdblistCacheInstance) {
		mdblistCacheInstance = new MdblistCacheService();
	}
	return mdblistCacheInstance;
}
