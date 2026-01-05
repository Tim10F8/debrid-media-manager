import handler from '@/pages/api/poster';
import { getMdblistClient } from '@/services/mdblistClient';
import { createMockRequest } from '@/test/utils/api';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');
vi.mock('@/services/mdblistClient');

const mockedAxios = vi.mocked(axios, true);
const mockedGetMdblistClient = vi.mocked(getMdblistClient);

describe('/api/poster', () => {
	let mockReq: any;
	let mockRes: any;
	let mockMdblistClient: { getInfoByImdbId: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		vi.clearAllMocks();

		mockReq = createMockRequest();
		mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
			_getStatusCode: () => 200,
			_getData: () => ({}),
			_getHeaders: () => ({}),
			_setStatusCode: vi.fn(),
		} as any;

		// Mock mdblist client (fallback when TMDB has no poster)
		mockMdblistClient = {
			getInfoByImdbId: vi.fn().mockResolvedValue({ poster: null }),
		};
		mockedGetMdblistClient.mockReturnValue(mockMdblistClient as any);
	});

	it('should return 400 when imdbid is missing', async () => {
		mockReq.method = 'GET';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'IMDB ID is required' });
	});

	it('should return 400 when imdbid is not a string', async () => {
		mockReq.method = 'GET';
		mockReq.query = { imdbid: ['tt1234567'] };
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'IMDB ID is required' });
	});

	it('should return poster URL from TMDB when found', async () => {
		mockReq.method = 'GET';
		mockReq.query = { imdbid: 'tt1234567' };

		const mockTmdbResponse = {
			data: {
				movie_results: [{ poster_path: '/poster123.jpg' }],
				tv_results: [],
			},
		};
		mockedAxios.get.mockResolvedValue(mockTmdbResponse);

		await handler(mockReq, mockRes);

		expect(mockRes.json).toHaveBeenCalledWith({
			url: 'https://image.tmdb.org/t/p/w500/poster123.jpg',
		});
	});

	it('should return poster URL from TV results when movie not found', async () => {
		mockReq.method = 'GET';
		mockReq.query = { imdbid: 'tt1234567' };

		const mockTmdbResponse = {
			data: {
				movie_results: [],
				tv_results: [{ poster_path: '/tvposter123.jpg' }],
			},
		};
		mockedAxios.get.mockResolvedValue(mockTmdbResponse);

		await handler(mockReq, mockRes);

		expect(mockRes.json).toHaveBeenCalledWith({
			url: 'https://image.tmdb.org/t/p/w500/tvposter123.jpg',
		});
	});

	it('should return 404 when no poster found', async () => {
		mockReq.method = 'GET';
		mockReq.query = { imdbid: 'tt1234567' };

		const mockTmdbResponse = {
			data: {
				movie_results: [],
				tv_results: [],
			},
		};
		mockedAxios.get.mockResolvedValue(mockTmdbResponse);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(404);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Poster not found' });
	});

	it('should return 404 when TMDB API throws error', async () => {
		mockReq.method = 'GET';
		mockReq.query = { imdbid: 'tt1234567' };

		mockedAxios.get.mockRejectedValue(new Error('API Error'));

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(404);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Poster not found' });
	});

	it('should handle different HTTP methods', async () => {
		const methods = ['GET', 'POST', 'PUT', 'DELETE'];

		for (const method of methods) {
			vi.clearAllMocks();
			mockReq.method = method;
			mockReq.query = { imdbid: 'tt1234567' };

			const mockTmdbResponse = {
				data: {
					movie_results: [{ poster_path: '/poster123.jpg' }],
					tv_results: [],
				},
			};
			mockedAxios.get.mockResolvedValue(mockTmdbResponse);

			await handler(mockReq, mockRes);

			expect(mockRes.json).toHaveBeenCalledWith({
				url: 'https://image.tmdb.org/t/p/w500/poster123.jpg',
			});
		}
	});
});
