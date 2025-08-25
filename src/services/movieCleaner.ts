import {
	filterByMovieConditions,
	getAllPossibleTitles,
	grabMovieMetadata,
	meetsTitleConditions,
} from '@/utils/checks';
import { getMdblistClient } from './mdblistClient';
import { flattenAndRemoveDuplicates, ScrapeSearchResult, sortByFileSize } from './mediasearch';
import { Repository } from './repository';

type MovieScrapeJob = {
	titles: string[];
	year: string;
	airDate: string;
	scrapes: ScrapeSearchResult[];
};

const mdblistClient = getMdblistClient();
const tmdbKey = process.env.TMDB_KEY;
const getTmdbSearch = (imdbId: string) =>
	`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`;
const getTmdbMovieInfo = (tmdbId: string) =>
	`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}`;

function convertMdbToTmdb(apiResponse: any) {
	return {
		title: apiResponse.title,
		name: apiResponse.title,
		release_date: apiResponse.released,
		// original_title: apiResponse.original_title, // This field does not exist in the provided API response
	};
}

function cleanScrapes(
	targetTitle: string,
	year: string,
	scrapes: ScrapeSearchResult[]
): ScrapeSearchResult[] {
	return scrapes.filter((scrape) => meetsTitleConditions(targetTitle, [year], scrape.title));
}

const cleanBasedOnScrapeJob = (job: MovieScrapeJob): ScrapeSearchResult[][] => {
	return job.titles.map((title) => cleanScrapes(title, job.year, job.scrapes));
};

export async function cleanMovieScrapes(
	imdbId: string,
	tmdbData: any,
	mdbData: any,
	db: Repository
) {
	let scrapes: ScrapeSearchResult[] | undefined = await db.getScrapedResults(`movie:${imdbId}`);
	if (!scrapes) {
		return;
	}
	const scrapesCount = scrapes.length;
	if (!scrapes.length) {
		console.log(`⚠️ No results for ${mdbData?.title} !`);
		return;
	}

	console.log(`🎥 Cleaning ${scrapes.length} results for ${mdbData?.title} ...`);

	const {
		cleanTitle,
		originalTitle,
		titleWithSymbols,
		alternativeTitle,
		cleanedTitle,
		year,
		airDate,
	} = grabMovieMetadata(imdbId, tmdbData, mdbData);

	let filteredScrapes = filterByMovieConditions(scrapes);
	if (!filteredScrapes.length) {
		// await db.saveScrapedResults(`movie:${imdbId}`, scrapes, false, true);
		// await db.markAsDone(imdbId);
		console.log(`⚠️ Preliminary procedure removed all results left for ${cleanTitle}`);
		return;
	}

	const titles = getAllPossibleTitles([
		cleanTitle,
		originalTitle,
		cleanedTitle,
		titleWithSymbols,
		alternativeTitle,
	]);
	const searchResults = cleanBasedOnScrapeJob({
		titles,
		year,
		airDate,
		scrapes: filteredScrapes,
	});
	let processedResults = flattenAndRemoveDuplicates(searchResults);
	processedResults = sortByFileSize(processedResults);

	if (processedResults.length < scrapesCount) {
		// await db.saveScrapedResults(`movie:${imdbId}`, processedResults, true, true);
		// await db.markAsDone(imdbId);
		console.log(
			`🌟 Removed ${scrapesCount - processedResults.length}, left ${
				processedResults.length
			} results for ${cleanTitle}`
		);
		// show removed items from scrapes
		const removedItems = scrapes.filter((scrape) => !processedResults.includes(scrape));
		if (removedItems.length) {
			console.log('Removed items:', removedItems);
		}
		return;
	}

	console.log(`🎥 Retained ${processedResults.length} results for ${cleanTitle}`);
}
