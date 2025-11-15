import { createMockRequest, createMockResponse } from '@/test/utils/api';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

const mockUserAgentString = 'TestAgent/1.0';
const mockUserAgent = vi.fn().mockImplementation(() => ({
	toString: () => mockUserAgentString,
}));

vi.mock('user-agents', () => ({
	default: mockUserAgent,
}));

const mockedAxios = vi.mocked(axios, true);

describe('/api/info/anime', () => {
	const loadHandler = async () => {
		const mod = await import('@/pages/api/info/anime');
		return mod.default;
	};

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('rejects non-GET methods', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ method: 'POST' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
		expect(mockedAxios.get).not.toHaveBeenCalled();
	});

	it('requires animeid parameter', async () => {
		const handler = await loadHandler();
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'Anime ID is required' });
	});

	it('fetches anime metadata and returns mapped response', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ query: { animeid: 'kitsu-123' } });
		const res = createMockResponse();
		mockedAxios.get.mockResolvedValue({
			data: {
				meta: {
					name: 'Anime Name',
					description: 'Desc',
					poster: 'poster.png',
					background: 'bg.png',
					imdb_id: 'tt123',
					imdbRating: '8.5',
				},
			},
		});

		await handler(req, res);

		expect(mockedAxios.get).toHaveBeenCalledWith(
			'https://anime-kitsu.strem.fun/meta/series/kitsu%3A123.json',
			expect.objectContaining({
				headers: expect.objectContaining({
					'user-agent': mockUserAgentString,
					accept: expect.any(String),
				}),
			})
		);
		expect(mockUserAgent).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			title: 'Anime Name',
			description: 'Desc',
			poster: 'poster.png',
			backdrop: 'bg.png',
			imdbid: 'tt123',
			imdbRating: 8.5,
		});
	});

	it('falls back to defaults when upstream fails', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ query: { animeid: 'kitsu-123' } });
		const res = createMockResponse();
		mockedAxios.get.mockRejectedValue(new Error('down'));

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			title: 'Unknown',
			description: 'Unknown',
			poster: 'https://picsum.photos/200/300',
			backdrop: '',
			imdbid: '',
			imdbRating: 0,
		});
	});
});
