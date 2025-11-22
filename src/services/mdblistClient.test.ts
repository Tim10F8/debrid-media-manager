import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMdblistClient, MDBListClient } from './mdblistClient';

vi.mock('axios');
vi.mock('./database/mdblistCache', () => ({
	getMdblistCacheService: vi.fn(() => ({
		get: vi.fn(),
		getWithMetadata: vi.fn(),
		set: vi.fn(),
		cacheMovie: vi.fn(),
		cacheShow: vi.fn(),
		cacheSearch: vi.fn(),
		cacheList: vi.fn(),
		getCachedMovie: vi.fn(),
		getCachedShow: vi.fn(),
		getCachedSearch: vi.fn(),
		getCachedList: vi.fn(),
	})),
}));

describe('MDBListClient', () => {
	let client: MDBListClient;
	const apiKey = 'test-api-key';

	beforeEach(() => {
		vi.clearAllMocks();
		client = new MDBListClient(apiKey);
	});

	describe('search', () => {
		it('constructs correct URL with keyword only', async () => {
			const mockResponse = { search: [], total: 0, response: true };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.search('Inception');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('apikey=test-api-key');
			expect(call).toContain('s=Inception');
		});

		it('includes year parameter when provided', async () => {
			const mockResponse = { search: [], total: 0, response: true };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.search('Inception', 2010);

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('y=2010');
		});

		it('includes media type parameter when provided', async () => {
			const mockResponse = { search: [], total: 0, response: true };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.search('Inception', undefined, 'movie');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('m=movie');
		});

		it('returns search response', async () => {
			const mockResponse = { search: [{ title: 'Inception' }], total: 1, response: true };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.search('Inception');

			expect(result).toEqual(mockResponse);
		});
	});

	describe('getInfoByImdbId', () => {
		it('constructs correct URL with IMDB ID', async () => {
			const mockResponse = { imdbid: 'tt1375666', type: 'movie', title: 'Inception' };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.getInfoByImdbId('tt1375666');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('apikey=test-api-key');
			expect(call).toContain('i=tt1375666');
		});

		it('returns movie/show info', async () => {
			const mockResponse = { imdbid: 'tt1375666', type: 'movie', title: 'Inception' };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.getInfoByImdbId('tt1375666');

			expect(result).toEqual(mockResponse);
		});
	});

	describe('getInfoByTmdbId', () => {
		it('constructs correct URL with TMDB ID', async () => {
			const mockResponse = { tmdbid: 27205, type: 'movie', title: 'Inception' };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.getInfoByTmdbId(27205);

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('apikey=test-api-key');
			expect(call).toContain('tm=27205');
		});

		it('accepts string TMDB ID', async () => {
			const mockResponse = { tmdbid: 27205, type: 'movie', title: 'Inception' };
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.getInfoByTmdbId('27205');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('tm=27205');
		});

		it('returns movie/show info', async () => {
			const mockResponse = {
				tmdbid: 27205,
				type: 'movie',
				title: 'Inception',
				imdbid: 'tt1375666',
			};
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.getInfoByTmdbId(27205);

			expect(result).toEqual(mockResponse);
		});
	});

	describe('searchLists', () => {
		it('constructs correct URL for list search', async () => {
			const mockResponse = [{ id: 1, name: 'Top Movies', slug: 'top-movies' }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.searchLists('action');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('/lists/search');
			expect(call).toContain('apikey=test-api-key');
			expect(call).toContain('s=action');
		});

		it('returns list search results', async () => {
			const mockResponse = [{ id: 1, name: 'Top Movies' }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.searchLists('action');

			expect(result).toEqual(mockResponse);
		});
	});

	describe('getListItems', () => {
		it('constructs correct URL for list items', async () => {
			const mockResponse = [{ id: 1, title: 'Movie 1', imdb_id: 'tt123' }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.getListItems('123');

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('/lists/123/items');
			expect(call).toContain('apikey=test-api-key');
		});

		it('returns list items', async () => {
			const mockResponse = [{ id: 1, title: 'Movie 1' }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.getListItems('123');

			expect(result).toEqual(mockResponse);
		});
	});

	describe('getTopLists', () => {
		it('constructs correct URL for top lists', async () => {
			const mockResponse = [{ id: 1, name: 'Top Movies', items: 100 }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			await client.getTopLists();

			const call = vi.mocked(axios.get).mock.calls[0][0];
			expect(call).toContain('/lists/top');
			expect(call).toContain('apikey=test-api-key');
		});

		it('returns top lists', async () => {
			const mockResponse = [{ id: 1, name: 'Top Movies', items: 100 }];
			vi.mocked(axios.get).mockResolvedValue({ data: mockResponse });

			const result = await client.getTopLists();

			expect(result).toEqual(mockResponse);
		});
	});

	describe('deprecated URL methods', () => {
		it('getSearchUrl returns correct URL', () => {
			const url = client.getSearchUrl('Inception', 2010, 'movie');

			expect(url).toContain('apikey=test-api-key');
			expect(url).toContain('s=Inception');
			expect(url).toContain('y=2010');
			expect(url).toContain('m=movie');
		});

		it('getImdbInfoUrl returns correct URL', () => {
			const url = client.getImdbInfoUrl('tt1375666');

			expect(url).toContain('apikey=test-api-key');
			expect(url).toContain('i=tt1375666');
		});

		it('getTmdbInfoUrl returns correct URL', () => {
			const url = client.getTmdbInfoUrl(27205);

			expect(url).toContain('apikey=test-api-key');
			expect(url).toContain('tm=27205');
		});

		it('getSearchListsUrl returns correct URL', () => {
			const url = client.getSearchListsUrl('action');

			expect(url).toContain('/lists/search');
			expect(url).toContain('apikey=test-api-key');
			expect(url).toContain('s=action');
		});

		it('getListItemsUrl returns correct URL', () => {
			const url = client.getListItemsUrl('123');

			expect(url).toContain('/lists/123/items');
			expect(url).toContain('apikey=test-api-key');
		});

		it('getTopListsUrl returns correct URL', () => {
			const url = client.getTopListsUrl();

			expect(url).toContain('/lists/top');
			expect(url).toContain('apikey=test-api-key');
		});
	});
});

describe('getMdblistClient', () => {
	it('throws error when MDBLIST_KEY is not set', () => {
		const originalKey = process.env.MDBLIST_KEY;
		delete process.env.MDBLIST_KEY;

		expect(() => getMdblistClient()).toThrow('MDBLIST_KEY environment variable is not defined');

		if (originalKey) {
			process.env.MDBLIST_KEY = originalKey;
		}
	});

	it('creates and returns singleton instance', () => {
		const originalKey = process.env.MDBLIST_KEY;
		process.env.MDBLIST_KEY = 'test-key';

		const client1 = getMdblistClient();
		const client2 = getMdblistClient();

		expect(client1).toBe(client2);

		if (originalKey) {
			process.env.MDBLIST_KEY = originalKey;
		} else {
			delete process.env.MDBLIST_KEY;
		}
	});
});
