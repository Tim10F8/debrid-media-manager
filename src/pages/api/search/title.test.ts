import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './title';

const {
	searchOmdbMock,
	searchCinemetaMoviesMock,
	searchCinemetaSeriesMock,
	mdblistSearchMock,
	getSearchResultsMock,
	saveSearchResultsMock,
} = vi.hoisted(() => {
	return {
		searchOmdbMock: vi.fn(),
		searchCinemetaMoviesMock: vi.fn(),
		searchCinemetaSeriesMock: vi.fn(),
		mdblistSearchMock: vi.fn(),
		getSearchResultsMock: vi.fn(),
		saveSearchResultsMock: vi.fn(),
	};
});

vi.mock('@/services/metadataCache', () => ({
	getMetadataCache: () => ({
		searchOmdb: searchOmdbMock,
		searchCinemetaMovies: searchCinemetaMoviesMock,
		searchCinemetaSeries: searchCinemetaSeriesMock,
	}),
}));

vi.mock('@/services/mdblistClient', () => ({
	getMdblistClient: () => ({
		search: mdblistSearchMock,
	}),
}));

vi.mock('@/services/repository', () => ({
	repository: {
		getSearchResults: getSearchResultsMock,
		saveSearchResults: saveSearchResultsMock,
	},
}));

vi.mock('user-agents', () => ({
	default: vi.fn().mockImplementation(() => ({
		toString: () => 'test-agent',
	})),
}));

describe('/api/search/title', () => {
	beforeEach(() => {
		searchOmdbMock.mockReset();
		searchCinemetaMoviesMock.mockReset();
		searchCinemetaSeriesMock.mockReset();
		mdblistSearchMock.mockReset();
		getSearchResultsMock.mockReset();
		saveSearchResultsMock.mockReset();
	});

	it('returns 400 when keyword is missing', async () => {
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Missing "keyword" query parameter',
		});
	});

	it('returns cached results when available', async () => {
		getSearchResultsMock.mockResolvedValue([
			{ imdbid: 'tt1', type: 'movie', title: 'Cached', searchTitle: 'cached' },
		]);
		const req = createMockRequest({ query: { keyword: 'cached' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: [{ imdbid: 'tt1', type: 'movie', title: 'Cached', searchTitle: 'cached' }],
		});
		expect(saveSearchResultsMock).not.toHaveBeenCalled();
	});

	it('aggregates external sources and caches new results', async () => {
		getSearchResultsMock.mockResolvedValue(null);
		searchOmdbMock.mockResolvedValue({
			Response: 'True',
			Search: [
				{
					Title: 'Matrix',
					Year: '1999',
					imdbID: 'tt0133093',
					Type: 'movie',
					Poster: 'http://poster',
				},
			],
		});
		mdblistSearchMock.mockResolvedValue({
			response: true,
			search: [
				{
					id: 'tt0234215',
					title: 'Matrix Reloaded',
					year: 2003,
					imdbid: 'tt0234215',
					type: 'movie',
					score: 2,
					score_average: 2,
				},
			],
		});
		const cinemetaPayload = {
			metas: [
				{
					id: 'matrix',
					imdb_id: 'tt0234215',
					type: 'movie',
					name: 'Matrix Reloaded',
					releaseInfo: '2003',
					poster: 'http://poster2',
				},
			],
		};
		searchCinemetaMoviesMock.mockResolvedValue(cinemetaPayload);
		searchCinemetaSeriesMock.mockResolvedValue({ metas: [] });

		const req = createMockRequest({ query: { keyword: 'matrix 1999' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = (res.json as Mock).mock.calls[0][0] as { results: any[] };
		expect(payload.results.length).toBeGreaterThan(0);
		expect(saveSearchResultsMock).toHaveBeenCalledWith('matrix 1999', expect.any(Array));
	});

	it('handles upstream errors gracefully', async () => {
		getSearchResultsMock.mockResolvedValue(null);
		searchOmdbMock.mockRejectedValue(new Error('omdb down'));
		const req = createMockRequest({ query: { keyword: 'matrix' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'An internal error occurred',
		});
	});
});
