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
	grabTvMetadata: vi.fn(() => ({
		cleanTitle: 'Show',
		originalTitle: 'Original Show',
		titleWithSymbols: 'Show!',
		alternativeTitle: 'Alt Show',
		cleanedTitle: 'Show',
		year: '2024',
		seasons: [
			{ season_number: 1, air_date: '2024-01-01' },
			{ season_number: 2, air_date: '2024-03-01' },
			{ season_number: 0, air_date: '2024-06-01' },
		],
	})),
	getAllPossibleTitles: vi.fn(() => ['Show']),
	padWithZero: vi.fn((num: number) => num.toString().padStart(2, '0')),
	getSeasonYear: vi.fn(() => '2025'),
	getSeasonNameAndCode: vi.fn((season: { season_number: number }) =>
		season.season_number === 2
			? { seasonName: 'Special', seasonCode: 99 }
			: { seasonName: undefined, seasonCode: undefined }
	),
	filterByTvConditions: vi.fn(
		(_results, _cleanTitle, _year, _seasonYear, seasonNumber: number) => [
			{ hash: `season-${seasonNumber}`, fileSize: seasonNumber },
		]
	),
}));

vi.mock('@/utils/checks', () => checksMocks);

const {
	grabTvMetadata,
	getAllPossibleTitles,
	padWithZero,
	getSeasonYear,
	getSeasonNameAndCode,
	filterByTvConditions,
} = checksMocks;

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

import { scrapeTv } from './tvScraper';

beforeEach(() => {
	vi.clearAllMocks();
	apiBayMock.mockResolvedValue([{ hash: 'api', fileSize: 1 }]);
	btdiggMock.mockResolvedValue([{ hash: 'btdigg', fileSize: 2 }]);
	ruTorMock.mockResolvedValue([{ hash: 'rutor', fileSize: 3 }]);
	tgxMock.mockResolvedValue([{ hash: 'tgx', fileSize: 4 }]);
});

describe('scrapeTv', () => {
	it('creates season jobs and persists filtered results', async () => {
		const db = {
			saveScrapedResults: vi.fn(),
			markAsDone: vi.fn(),
		} as unknown as Repository;

		const count = await scrapeTv('tt999', {}, {}, db, false);

		expect(db.saveScrapedResults).toHaveBeenNthCalledWith(1, 'processing:tt999', []);
		expect(db.saveScrapedResults).toHaveBeenNthCalledWith(
			2,
			'tv:tt999:1',
			[{ hash: 'season-1', fileSize: 1 }],
			true,
			false
		);
		expect(db.saveScrapedResults).toHaveBeenNthCalledWith(
			3,
			'tv:tt999:2',
			[{ hash: 'season-2', fileSize: 2 }],
			true,
			false
		);
		expect(db.markAsDone).toHaveBeenCalledWith('tt999');
		expect(count).toBe(2);
		expect(filterByTvConditions).toHaveBeenCalledTimes(2);
		expect(getAllPossibleTitles).toHaveBeenCalled();
	});
});
