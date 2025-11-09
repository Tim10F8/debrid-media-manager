import { beforeEach, describe, expect, it, vi } from 'vitest';

const metadataCacheMock = vi.hoisted(() => ({
	searchTmdbByImdb: vi.fn(),
	getTmdbMovieInfo: vi.fn(),
	getTmdbTvInfo: vi.fn(),
}));

const mdblistClientMock = vi.hoisted(() => ({
	getInfoByImdbId: vi.fn(),
}));

const movieCleanerMock = vi.hoisted(() => ({
	cleanMovieScrapes: vi.fn(),
}));

const tvCleanerMock = vi.hoisted(() => ({
	cleanTvScrapes: vi.fn(),
}));

const repoMock = vi.hoisted(() => ({
	saveScrapedResults: vi.fn(),
	markAsDone: vi.fn(),
}));

const movieScraperMock = vi.hoisted(() => ({
	scrapeMovies: vi.fn(),
}));

const tvScraperMock = vi.hoisted(() => ({
	scrapeTv: vi.fn(),
}));

vi.mock('@/services/metadataCache', () => ({
	getMetadataCache: () => metadataCacheMock,
}));
vi.mock('@/services/mdblistClient', () => ({
	getMdblistClient: () => mdblistClientMock,
}));
vi.mock('@/services/movieCleaner', () => movieCleanerMock);
vi.mock('@/services/tvCleaner', () => tvCleanerMock);
vi.mock('@/services/repository', () => ({ repository: repoMock }));
vi.mock('./movieScraper', () => movieScraperMock);
vi.mock('./tvScraper', () => tvScraperMock);

import { generateScrapeJobs } from './scrapeJobs';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('generateScrapeJobs', () => {
	it('scrapes movies when metadata indicates a film', async () => {
		mdblistClientMock.getInfoByImdbId.mockResolvedValue({
			type: 'movie',
			tmdbid: 55,
		});
		metadataCacheMock.searchTmdbByImdb.mockResolvedValue({
			movie_results: [{ id: 99, vote_count: 10 }],
			tv_results: [],
		});
		const tmdbInfo = { id: 55 };
		metadataCacheMock.getTmdbMovieInfo.mockResolvedValue(tmdbInfo);

		await generateScrapeJobs('tt1234567');

		expect(movieScraperMock.scrapeMovies).toHaveBeenCalledWith(
			'tt1234567',
			tmdbInfo,
			expect.objectContaining({ tmdbid: 55 }),
			repoMock,
			false
		);
		expect(movieCleanerMock.cleanMovieScrapes).toHaveBeenCalled();
		expect(tvScraperMock.scrapeTv).not.toHaveBeenCalled();
	});

	it('falls back to converted metadata when tmdb movie info is missing', async () => {
		mdblistClientMock.getInfoByImdbId.mockResolvedValue({
			type: 'movie',
			title: 'Fallback Movie',
			released: '2024-01-01',
		});
		metadataCacheMock.searchTmdbByImdb.mockResolvedValue({
			movie_results: [],
			tv_results: [],
		});
		metadataCacheMock.getTmdbMovieInfo.mockRejectedValue({
			response: { status: 404 },
		});

		await generateScrapeJobs('tt7654321');

		expect(movieScraperMock.scrapeMovies).toHaveBeenCalledWith(
			'tt7654321',
			expect.objectContaining({ title: 'Fallback Movie' }),
			expect.any(Object),
			repoMock,
			false
		);
	});

	it('scrapes TV seasons while honoring season restrictions', async () => {
		mdblistClientMock.getInfoByImdbId.mockResolvedValue({
			type: 'show',
			tmdbid: 77,
			seasons: [{ season_number: 1 }, { season_number: 2 }, { season_number: 3 }],
		});
		metadataCacheMock.searchTmdbByImdb.mockResolvedValue({
			movie_results: [],
			tv_results: [{ id: 77, vote_count: 5 }],
		});
		const tmdbTvInfo = { id: 77 };
		metadataCacheMock.getTmdbTvInfo.mockResolvedValue(tmdbTvInfo);

		await generateScrapeJobs('tt9999999', -1, true);

		expect(tvCleanerMock.cleanTvScrapes).not.toHaveBeenCalled();
		expect(tvScraperMock.scrapeTv).toHaveBeenCalledWith(
			'tt9999999',
			tmdbTvInfo,
			expect.objectContaining({
				seasons: [{ season_number: 3 }],
			}),
			repoMock,
			true
		);
	});

	it('stores empty results when media cannot be classified', async () => {
		mdblistClientMock.getInfoByImdbId.mockResolvedValue({
			type: 'other',
		});
		metadataCacheMock.searchTmdbByImdb.mockResolvedValue({
			movie_results: [],
			tv_results: [],
		});

		await generateScrapeJobs('tt0000000');

		expect(repoMock.saveScrapedResults).toHaveBeenCalledWith('movie:tt0000000', [], true);
		expect(repoMock.saveScrapedResults).toHaveBeenCalledWith('tv:tt0000000:1', [], true);
		expect(repoMock.markAsDone).toHaveBeenCalledWith('tt0000000');
	});
});
