import handler from '@/pages/api/info/show';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/mdblistClient', () => ({
	getMdblistClient: vi.fn(),
}));

vi.mock('@/services/metadataCache', () => ({
	getMetadataCache: vi.fn(),
}));

vi.mock('user-agents', () => ({
	default: vi.fn().mockImplementation(() => ({
		toString: () => 'test-agent',
	})),
}));

import { getMdblistClient } from '@/services/mdblistClient';
import { getMetadataCache } from '@/services/metadataCache';

describe('/api/info/show', () => {
	const mockMdbClient = {
		getInfoByImdbId: vi.fn(),
	};
	const mockMetadataCache = {
		getCinemetaSeries: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getMdblistClient).mockReturnValue(mockMdbClient as any);
		vi.mocked(getMetadataCache).mockReturnValue(mockMetadataCache as any);
	});

	it('requires an IMDb id', async () => {
		const req = createMockRequest();
		const res = createMockResponse();
		await handler(req, res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'IMDB ID is required' });
	});

	it('merges season metadata from both sources', async () => {
		mockMdbClient.getInfoByImdbId.mockResolvedValue({
			title: 'MDB Show',
			description: 'MDB Desc',
			poster: 'mdb-poster',
			backdrop: 'mdb-backdrop',
			ratings: [{ source: 'imdb', score: 8.5 }],
			seasons: [
				{ season_number: 1, name: 'Season 1', episode_count: 8 },
				{ season_number: 2, name: 'Season 2', episode_count: 10 },
			],
		});
		mockMetadataCache.getCinemetaSeries.mockResolvedValue({
			meta: {
				name: 'Cine Show',
				description: 'Cine Desc',
				poster: 'cine-poster',
				background: 'cine-bg',
				imdbRating: 9.1,
				videos: [{ season: 1 }, { season: 1 }, { season: 3 }, { season: 3 }, { season: 3 }],
			},
			meta_videos: [],
		});

		const req = createMockRequest({
			query: { imdbid: 'ttshow123' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockMdbClient.getInfoByImdbId).toHaveBeenCalledWith('ttshow123');
		expect(mockMetadataCache.getCinemetaSeries).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			title: 'MDB Show',
			description: 'MDB Desc',
			poster: 'mdb-poster',
			backdrop: 'mdb-backdrop',
			season_count: 3,
			season_names: ['Season 1', 'Season 2', 'Season 3'],
			imdb_score: 9.1,
			season_episode_counts: {
				1: 8,
				2: 10,
				3: 3,
			},
		});
	});

	it('returns 500 when fetching fails', async () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockMdbClient.getInfoByImdbId.mockRejectedValue(new Error('fail'));
		const req = createMockRequest({
			query: { imdbid: 'ttbroken' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch show information' });
		consoleSpy.mockRestore();
	});
});
