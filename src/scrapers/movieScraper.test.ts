import type { Repository } from '@/services/repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediasearchMocks = vi.hoisted(() => ({
	flattenSpy: vi.fn((results: any[]) => results.flat()),
	sortSpy: vi.fn((results: any[]) => results),
}));

vi.mock('@/services/mediasearch', () => ({
	flattenAndRemoveDuplicates: mediasearchMocks.flattenSpy,
	sortByFileSize: mediasearchMocks.sortSpy,
}));

const { flattenSpy, sortSpy } = mediasearchMocks;

const checksMocks = vi.hoisted(() => ({
	grabMovieMetadata: vi.fn(() => ({
		cleanTitle: 'Movie',
		originalTitle: 'Original',
		titleWithSymbols: 'Symbols',
		alternativeTitle: 'Alt',
		cleanedTitle: 'Cleaned',
		year: '2024',
		airDate: '2024-01-01',
	})),
	getAllPossibleTitles: vi.fn(() => ['Movie']),
	filterByMovieConditions: vi.fn(() => [{ hash: 'filtered', fileSize: 1 }]),
}));

vi.mock('@/utils/checks', () => checksMocks);

const { grabMovieMetadata, getAllPossibleTitles, filterByMovieConditions } = checksMocks;

const providerMocks = vi.hoisted(() => ({
	apiBayMock: vi.fn().mockResolvedValue([{ hash: 'api', fileSize: 1 }]),
	btdiggMock: vi.fn().mockResolvedValue([{ hash: 'btdigg', fileSize: 2 }]),
	ruTorMock: vi.fn().mockResolvedValue([{ hash: 'rutor', fileSize: 3 }]),
	tgxMock: vi.fn().mockResolvedValue([{ hash: 'tgx', fileSize: 4 }]),
}));

vi.mock('./sites/apibay2', () => ({ scrapeApiBay2: providerMocks.apiBayMock }));
vi.mock('./sites/btdigg-v2', () => ({ scrapeBtdigg: providerMocks.btdiggMock }));
vi.mock('./sites/rutor', () => ({ scrapeRuTor: providerMocks.ruTorMock }));
vi.mock('./sites/tgx', () => ({ scrapeTorrentGalaxy: providerMocks.tgxMock }));

const { apiBayMock, btdiggMock, ruTorMock, tgxMock } = providerMocks;

import { scrapeMovies } from './movieScraper';

beforeEach(() => {
	vi.clearAllMocks();
	apiBayMock.mockResolvedValue([{ hash: 'api', fileSize: 1 }]);
	btdiggMock.mockResolvedValue([{ hash: 'btdigg', fileSize: 2 }]);
	ruTorMock.mockResolvedValue([{ hash: 'rutor', fileSize: 3 }]);
	tgxMock.mockResolvedValue([{ hash: 'tgx', fileSize: 4 }]);
});

describe('scrapeMovies', () => {
	it('aggregates provider data and saves the processed results', async () => {
		const db = {
			saveScrapedResults: vi.fn(),
			markAsDone: vi.fn(),
		} as unknown as Repository;

		const count = await scrapeMovies('tt123', {}, {}, db, true);

		expect(db.saveScrapedResults).toHaveBeenNthCalledWith(1, 'processing:tt123', []);
		expect(db.saveScrapedResults).toHaveBeenNthCalledWith(
			2,
			'movie:tt123',
			[{ hash: 'filtered', fileSize: 1 }],
			true,
			true
		);
		expect(db.markAsDone).toHaveBeenCalledWith('tt123');
		expect(count).toBe(1);
		expect(filterByMovieConditions).toHaveBeenCalled();
		expect(flattenSpy).toHaveBeenCalled();
	});
});
