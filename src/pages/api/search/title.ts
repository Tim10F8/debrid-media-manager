import { repository as db } from '@/services/repository';
import { distance } from 'fastest-levenshtein';
import _ from 'lodash';
import { NextApiHandler } from 'next';

export type SearchResult = {
	id: string;
	type: 'movie' | 'show';
	year: number;
	title: string;
	imdbid: string;

	score: number;
	score_average: number;
	searchTitle: string;
};

function parseQuery(searchQuery: string): [string, number?, string?] {
	if (searchQuery.trim().indexOf(' ') === -1) {
		return [searchQuery.trim(), undefined, undefined];
	}

	// Regex to find a year at the end of the search query
	const yearRegex = / (19\d{2}|20\d{2}|2100)$/;

	// Extract the year from the end of the search query
	const match = searchQuery.match(yearRegex);

	// If there's a year match and it's within the valid range, parse it
	let year: number | undefined;
	const currentYearPlusOne = new Date().getFullYear() + 1;
	if (match && match[0]) {
		const parsedYear = parseInt(match[0].trim(), 10);
		if (parsedYear >= 1900 && parsedYear <= currentYearPlusOne) {
			year = parsedYear;
			searchQuery = searchQuery.replace(yearRegex, '').trim();
		}
	}

	let mediaType: string | undefined;
	const mediaTypes = ['movie', 'show', 'series'];
	for (let word of mediaTypes) {
		if (searchQuery.includes(word)) {
			mediaType = word === 'series' ? 'show' : word;
			searchQuery = searchQuery.replace(word, '').trim();
			break;
		}
	}

	const title = searchQuery
		.split(' ')
		.filter((e) => e)
		.join(' ')
		.trim()
		.toLowerCase();

	return [title, year, mediaType];
}

function countSearchTerms(title: string, searchTerms: string[]): number {
	return searchTerms.reduce(
		(count, term) => (title.toLowerCase().includes(term) ? count + 1 : count),
		0
	);
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const articleRegex = /^(the|a|an)\s+/i;

function removeLeadingArticles(str: string) {
	return str.replace(articleRegex, '');
}

function processSearchTitle(title: string, retainArticle: boolean) {
	// Shōgun -> shogun
	const deburred = _.deburr(title);
	const lowercase = deburred.toLowerCase();
	const searchTitle = retainArticle ? lowercase : removeLeadingArticles(lowercase);
	return _.words(searchTitle).join(' ');
}

const handler: NextApiHandler = async (req, res) => {
	const { keyword } = req.query;

	if (!keyword || !(typeof keyword === 'string')) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing "keyword" query parameter',
		});
		return;
	}

	try {
		const cleanKeyword = keyword
			.toString()
			.replace(/[\W]+/gi, ' ')
			.split(' ')
			.filter((e) => e)
			.join(' ')
			.trim()
			.toLowerCase();

		const [title, year, mediaType] = parseQuery(cleanKeyword);
		const searchQuery = title.toLowerCase();

		// Search local IMDB database (fetch more to allow for filtering/ranking)
		const imdbResults = await db.searchImdbTitles(searchQuery, {
			limit: 120,
			year,
			mediaType: mediaType as 'movie' | 'show' | undefined,
		});

		// Map IMDB results to SearchResult format with extended properties
		type ExtendedResult = SearchResult & { distance?: number; matchCount?: number };
		let results: ExtendedResult[] = imdbResults.map((r) => ({
			id: r.imdbId,
			type: r.type,
			year: r.year ?? 0,
			title: r.title,
			imdbid: r.imdbId,
			score: r.votes ? Math.min(100, Math.round(r.votes / 10000)) : 1,
			score_average: r.rating ?? 1,
			searchTitle: processSearchTitle(r.title, false),
		}));

		// Calculate distance and match count for sorting
		let queryTerms = searchQuery.split(/\W/).filter((w) => w);
		if (queryTerms.length === 0) queryTerms = [searchQuery];

		results = results.map((result) => {
			const lowercaseTitle = result.title.toLowerCase();
			const distanceValue = distance(lowercaseTitle, searchQuery);
			if (articleRegex.test(lowercaseTitle)) {
				const distanceValue2 = distance(result.searchTitle, searchQuery);
				if (distanceValue2 < distanceValue) {
					return {
						...result,
						distance: distanceValue2,
						matchCount: countSearchTerms(result.searchTitle, queryTerms),
					};
				}
			}
			return {
				...result,
				distance: distanceValue,
				matchCount: countSearchTerms(result.searchTitle, queryTerms),
			};
		});

		// Filter out results with less than 1/3 of the search terms
		results = results.filter(
			(result) => (result.matchCount ?? 0) >= Math.ceil(queryTerms.length / 3)
		);

		// Categorize matches (escape regex special characters to prevent injection)
		const escapedQuery = escapeRegex(searchQuery);
		let regex1 = new RegExp('^' + escapedQuery + '$', 'i');
		let exactMatches = results.filter((result) => regex1.test(result.searchTitle));
		results = results.filter((result) => !regex1.test(result.searchTitle));

		let regex2 = new RegExp('^' + escapedQuery, 'i');
		let startMatches = results.filter((result) => regex2.test(result.searchTitle));
		results = results.filter((result) => !regex2.test(result.searchTitle));

		let regex3 = new RegExp(escapedQuery, 'i');
		let nearMatches = results.filter((result) => regex3.test(result.searchTitle));
		results = results.filter((result) => !regex3.test(result.searchTitle));

		// Sort each category
		exactMatches.sort(
			(a, b) =>
				(b.score_average * b.score) / 4 + b.year - (a.score_average * a.score) / 4 + a.year
		);
		startMatches.sort(
			(a, b) =>
				(b.score_average * b.score) / 4 + b.year - (a.score_average * a.score) / 4 + a.year
		);
		nearMatches.sort((a, b) => {
			if (a.distance === b.distance) {
				return (
					(b.score_average * b.score) / 4 +
					b.year -
					(a.score_average * a.score) / 4 +
					a.year
				);
			}
			return (a.distance ?? 0) - (b.distance ?? 0);
		});
		results.sort((a, b) => {
			if (a.matchCount === b.matchCount) {
				return (a.distance ?? 0) - (b.distance ?? 0);
			}
			return (b.matchCount ?? 0) - (a.matchCount ?? 0);
		});

		const finalResults: SearchResult[] = [
			...exactMatches,
			...startMatches,
			...nearMatches,
			...results,
		]
			.filter((r) => r.type === 'movie' || r.type === 'show')
			.slice(0, 80); // Limit to 80 results

		res.status(200).json({ results: finalResults });
	} catch (error: any) {
		console.error(
			'Encountered a search issue:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ status: 'error', errorMessage: 'An internal error occurred' });
	}
};

export default handler;
