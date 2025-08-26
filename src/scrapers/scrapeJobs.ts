import { getMdblistClient } from '@/services/mdblistClient';
import { getMetadataCache } from '@/services/metadataCache';
import { cleanMovieScrapes } from '@/services/movieCleaner';
import { repository as db } from '@/services/repository';
import { cleanTvScrapes } from '@/services/tvCleaner';
import { scrapeMovies } from './movieScraper';
import { scrapeTv } from './tvScraper';

const mdblistClient = getMdblistClient();

function convertMdbToTmdb(apiResponse: any) {
	return {
		title: apiResponse.title,
		name: apiResponse.title,
		release_date: apiResponse.released,
		// original_title: apiResponse.original_title, // This field does not exist in the provided API response
	};
}

export type ScrapeResponse = {
	status: string;
	errorMessage?: string;
};

export async function generateScrapeJobs(
	imdbId: string,
	seasonRestriction: number = 0,
	replaceOldScrape: boolean = false
) {
	// console.log(`[scrapeJobs] Generating scrape jobs for ${imdbId}`);
	const metadataCache = getMetadataCache();
	let tmdbSearch, mdbInfo;
	try {
		tmdbSearch = await metadataCache.searchTmdbByImdb(imdbId);
		mdbInfo = await mdblistClient.getInfoByImdbId(imdbId);
	} catch (error: any) {
		console.error(error);
		return;
	}

	const isMovie =
		mdbInfo.type === 'movie' ||
		(tmdbSearch.movie_results?.length > 0 && tmdbSearch.movie_results[0].vote_count > 0);
	const isTv =
		mdbInfo.type === 'show' ||
		(tmdbSearch.tv_results?.length > 0 && tmdbSearch.tv_results[0].vote_count > 0);

	if (isMovie) {
		try {
			const tmdbId = mdbInfo.tmdbid ?? tmdbSearch.movie_results[0]?.id;
			const tmdbInfo = await metadataCache.getTmdbMovieInfo(String(tmdbId));
			await scrapeMovies(imdbId, tmdbInfo, mdbInfo, db, replaceOldScrape);
			await cleanMovieScrapes(imdbId, tmdbInfo, mdbInfo, db);
			return;
		} catch (error: any) {
			if (error.response?.status === 404 || error.message.includes("reading 'id'")) {
				try {
					const convertedMdb = convertMdbToTmdb(mdbInfo);
					await scrapeMovies(imdbId, convertedMdb, mdbInfo, db, replaceOldScrape);
					await cleanMovieScrapes(imdbId, convertedMdb, mdbInfo, db);
					return;
				} catch (error: any) {
					console.error(error);
				}
			} else {
				console.error(error);
				return;
			}
		}
	}

	if (isTv) {
		if ('seasons' in mdbInfo) {
			if (seasonRestriction > 0) {
				mdbInfo.seasons = mdbInfo.seasons.filter(
					(s: any) => s.season_number === seasonRestriction
				);
			}
			// if seasonRestriction is -1 then scrape the latest season only
			if (seasonRestriction === -1) {
				// find the biggest number in the seasons array using reduce
				const latestSeason = mdbInfo.seasons.reduce((prev: any, current: any) => {
					return prev.season_number > current.season_number ? prev : current;
				});
				mdbInfo.seasons = [latestSeason];
			}
		}
		try {
			const tmdbId = mdbInfo.tmdbid ?? tmdbSearch.tv_results[0]?.id;
			const tmdbInfo = await metadataCache.getTmdbTvInfo(String(tmdbId));
			if (!replaceOldScrape) await cleanTvScrapes(imdbId, tmdbInfo, mdbInfo, db);
			await scrapeTv(imdbId, tmdbInfo, mdbInfo, db, replaceOldScrape);
			return;
		} catch (error: any) {
			if (error.response?.status === 404 || error.message.includes("reading 'id'")) {
				try {
					const convertedMdb = convertMdbToTmdb(mdbInfo);
					await scrapeTv(imdbId, convertedMdb, mdbInfo, db, replaceOldScrape);
					return;
				} catch (error: any) {
					console.error(error);
				}
			} else {
				console.error(error);
				return;
			}
		}
	}

	await db.saveScrapedResults(`movie:${imdbId}`, [], true);
	await db.saveScrapedResults(`tv:${imdbId}:1`, [], true);
	await db.markAsDone(imdbId);
	return;
}
