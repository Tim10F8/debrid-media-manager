import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMdblistCacheService } from './database/mdblistCache';
import { MetadataCacheService } from './metadataCache';

// Mock dependencies
vi.mock('axios');
vi.mock('./database/mdblistCache');

// Mock console
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('MetadataCacheService', () => {
	let service: MetadataCacheService;
	let mockCache: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCache = {
			getWithMetadata: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
		};

		vi.mocked(getMdblistCacheService).mockReturnValue(mockCache);
		service = new MetadataCacheService();
	});

	describe('isCacheExpired', () => {
		it('should return false for permanent cache (maxAge = 0)', () => {
			const updatedAt = new Date('2020-01-01');
			const result = (service as any).isCacheExpired(updatedAt, 0);
			expect(result).toBe(false);
		});

		it('should return true for expired cache', () => {
			const updatedAt = new Date(Date.now() - 2000); // 2 seconds ago
			const maxAge = 1000; // 1 second
			const result = (service as any).isCacheExpired(updatedAt, maxAge);
			expect(result).toBe(true);
		});

		it('should return false for fresh cache', () => {
			const updatedAt = new Date(Date.now() - 500); // 500ms ago
			const maxAge = 1000; // 1 second
			const result = (service as any).isCacheExpired(updatedAt, maxAge);
			expect(result).toBe(false);
		});

		it('should handle edge case of exact expiration', () => {
			const now = 1577836802000; // 2020-01-01T00:00:02.000Z in milliseconds
			const updatedAt = new Date('2020-01-01T00:00:01.000Z'); // Exactly 1 second ago
			const maxAge = 1000; // 1 second
			const result = (service as any).isCacheExpired(updatedAt, maxAge, now);
			expect(result).toBe(false); // Exactly at expiration time should not be expired yet
		});
	});

	describe('fetchWithCache', () => {
		it('should return cached data when available and fresh', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'SEARCH';
			const cachedData = { items: [1, 2, 3] };
			const updatedAt = new Date();

			mockCache.getWithMetadata.mockResolvedValue({
				data: cachedData,
				updatedAt,
			});

			const result = await service.fetchWithCache(url, cacheKey, cacheType, {}, 3600000);

			expect(result).toEqual(cachedData);
			expect(mockCache.getWithMetadata).toHaveBeenCalledWith(cacheKey);
			expect(axios.get).not.toHaveBeenCalled();
			expect(console.log).toHaveBeenCalledWith(
				`[MetadataCache] Using cached ${cacheType} data for: ${cacheKey}`
			);
		});

		it('should fetch from API when cache is expired', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'SEARCH';
			const cachedData = { items: [1, 2, 3] };
			const updatedAt = new Date(Date.now() - 7200000); // 2 hours ago
			const freshData = { items: [4, 5, 6] };

			mockCache.getWithMetadata.mockResolvedValue({
				data: cachedData,
				updatedAt,
			});

			const mockResponse = { data: freshData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			const result = await service.fetchWithCache(url, cacheKey, cacheType, {}, 3600000);

			expect(result).toEqual(freshData);
			expect(axios.get).toHaveBeenCalledWith(url, {});
			expect(mockCache.set).toHaveBeenCalledWith(cacheKey, cacheType, freshData);
			expect(console.log).toHaveBeenCalledWith(
				`[MetadataCache] Fetching ${cacheType} data from: ${url}`
			);
		});

		it('should fetch from API when no cached data exists', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'TRENDING';
			const freshData = { items: [7, 8, 9] };

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: freshData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			const result = await service.fetchWithCache(url, cacheKey, cacheType, {}, 3600000);

			expect(result).toEqual(freshData);
			expect(axios.get).toHaveBeenCalledWith(url, {});
			expect(mockCache.set).toHaveBeenCalledWith(cacheKey, cacheType, freshData);
			expect(console.log).toHaveBeenCalledWith(
				`[MetadataCache] Fetching ${cacheType} data from: ${url}`
			);
		});

		it('should use permanent cache when no maxAge provided', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'POPULAR';
			const cachedData = { items: [1, 2, 3] };
			const updatedAt = new Date('2020-01-01'); // Very old data

			mockCache.getWithMetadata.mockResolvedValue({
				data: cachedData,
				updatedAt,
			});

			const result = await service.fetchWithCache(url, cacheKey, cacheType);

			expect(result).toEqual(cachedData);
			expect(axios.get).not.toHaveBeenCalled();
			expect(mockCache.set).not.toHaveBeenCalled();
		});

		it('should handle API errors gracefully', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'SEARCH';
			const error = new Error('Network error');

			mockCache.getWithMetadata.mockResolvedValue(null);
			vi.mocked(axios.get).mockRejectedValue(error);

			await expect(service.fetchWithCache(url, cacheKey, cacheType)).rejects.toThrow(
				'Network error'
			);
			expect(mockCache.set).not.toHaveBeenCalled();
		});

		it('should handle cache errors gracefully', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'SEARCH';
			const freshData = { items: [1, 2, 3] };
			const cacheError = new Error('Cache write failed');

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: freshData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);
			mockCache.set.mockRejectedValue(cacheError);

			// Should still return the data even if caching fails
			const result = await service.fetchWithCache(url, cacheKey, cacheType);

			expect(result).toEqual(freshData);
			expect(axios.get).toHaveBeenCalledWith(url, {});
			expect(mockCache.set).toHaveBeenCalledWith(cacheKey, cacheType, freshData);
		});

		it('should pass config to axios request', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const cacheType = 'SEARCH';
			const config = {
				headers: { Authorization: 'Bearer token' },
				timeout: 5000,
			};
			const freshData = { items: [1, 2, 3] };

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: freshData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			await service.fetchWithCache(url, cacheKey, cacheType, config);

			expect(axios.get).toHaveBeenCalledWith(url, config);
		});

		it('should handle different cache types with appropriate durations', async () => {
			const url = 'https://api.example.com/data';
			const cacheKey = 'test-key';
			const freshData = { items: [1, 2, 3] };

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: freshData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			// Test SEARCH cache (1 hour)
			await service.fetchWithCache(url, 'search-key', 'SEARCH', {}, 3600000);
			expect(mockCache.set).toHaveBeenCalledWith('search-key', 'SEARCH', freshData);

			// Test TRENDING cache (1 hour)
			await service.fetchWithCache(url, 'trending-key', 'TRENDING', {}, 3600000);
			expect(mockCache.set).toHaveBeenCalledWith('trending-key', 'TRENDING', freshData);

			// Test POPULAR cache (6 hours)
			await service.fetchWithCache(url, 'popular-key', 'POPULAR', {}, 21600000);
			expect(mockCache.set).toHaveBeenCalledWith('popular-key', 'POPULAR', freshData);

			// Test TOP_LISTS cache (24 hours)
			await service.fetchWithCache(url, 'toplists-key', 'TOP_LISTS', {}, 86400000);
			expect(mockCache.set).toHaveBeenCalledWith('toplists-key', 'TOP_LISTS', freshData);
		});

		it('should handle empty API responses', async () => {
			const url = 'https://api.example.com/empty';
			const cacheKey = 'empty-key';
			const cacheType = 'SEARCH';
			const emptyData = null;

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: emptyData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			const result = await service.fetchWithCache(url, cacheKey, cacheType);

			expect(result).toBeNull();
			expect(mockCache.set).toHaveBeenCalledWith(cacheKey, cacheType, emptyData);
		});

		it('should handle array API responses', async () => {
			const url = 'https://api.example.com/array';
			const cacheKey = 'array-key';
			const cacheType = 'TRENDING';
			const arrayData = [1, 2, 3, 4, 5];

			mockCache.getWithMetadata.mockResolvedValue(null);

			const mockResponse = { data: arrayData };
			vi.mocked(axios.get).mockResolvedValue(mockResponse);

			const result = await service.fetchWithCache(url, cacheKey, cacheType);

			expect(result).toEqual(arrayData);
			expect(mockCache.set).toHaveBeenCalledWith(cacheKey, cacheType, arrayData);
		});
	});
});
