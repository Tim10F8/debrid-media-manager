import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAnimeByKitsuIds = vi.fn();

vi.mock('@/services/repository', () => ({
	repository: {
		getAnimeByKitsuIds: mockGetAnimeByKitsuIds,
	},
}));

describe('/api/search/anime', () => {
	const originalFetch = global.fetch;

	const loadHandler = async () => {
		const mod = await import('@/pages/api/search/anime');
		return mod.default;
	};

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it('returns 400 when keyword query param is missing', async () => {
		const handler = await loadHandler();
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Missing "keyword" query parameter',
		});
		expect(mockGetAnimeByKitsuIds).not.toHaveBeenCalled();
	});

	it('fetches kitsu ids, caches them, and responds with repository results', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ query: { keyword: 'One Piece' } });
		const res = createMockResponse();
		const res2 = createMockResponse();

		const fetchMock = global.fetch as unknown as Mock;
		const fetchResponse = {
			metas: [{ id: 'kitsu:1' }, { id: 'kitsu:2' }],
		};

		fetchMock.mockResolvedValue({
			json: vi.fn().mockResolvedValue(fetchResponse),
		});
		mockGetAnimeByKitsuIds.mockResolvedValue([{ title: 'Anime' }]);

		await handler(req, res);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://anime-kitsu.strem.fun/catalog/anime/kitsu-anime-list/search=one piece.json'
		);
		expect(mockGetAnimeByKitsuIds).toHaveBeenCalledWith([1, 2]);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ results: [{ title: 'Anime' }] });

		fetchMock.mockClear();
		mockGetAnimeByKitsuIds.mockResolvedValue([{ title: 'Cached' }]);

		await handler(req, res2);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(mockGetAnimeByKitsuIds).toHaveBeenCalledWith([1, 2]);
		expect(res2.json).toHaveBeenCalledWith({ results: [{ title: 'Cached' }] });
	});

	it('handles upstream failures by logging and returning 500', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ query: { keyword: 'Naruto' } });
		const res = createMockResponse();
		const fetchMock = global.fetch as unknown as Mock;
		fetchMock.mockRejectedValue(new Error('network down'));

		await handler(req, res);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'An error occurred while fetching the data',
		});
	});
});
