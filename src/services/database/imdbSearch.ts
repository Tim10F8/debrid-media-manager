import { Prisma } from '@prisma/client';
import { DatabaseClient } from './client';

export type ImdbSearchResult = {
	imdbId: string;
	type: 'movie' | 'show';
	year: number | null;
	title: string;
	originalTitle: string | null;
	rating: number | null;
	votes: number | null;
	isOriginalMatch: boolean;
};

export class ImdbSearchService extends DatabaseClient {
	/**
	 * Search IMDB titles using fulltext search on title variants
	 * Falls back to LIKE search if fulltext returns no results
	 */
	async searchTitles(
		keyword: string,
		options: {
			limit?: number;
			year?: number;
			mediaType?: 'movie' | 'show';
		} = {}
	): Promise<ImdbSearchResult[]> {
		const { limit = 50, year, mediaType } = options;

		// Clean the keyword for search
		const cleanKeyword = keyword
			.replace(/[^\w\s]/gi, ' ')
			.split(' ')
			.filter((w) => w.length > 0)
			.join(' ')
			.trim();

		if (!cleanKeyword) {
			return [];
		}

		// Build type filter
		const typeFilter = mediaType
			? mediaType === 'movie'
				? "AND b.title_type = 'movie'"
				: "AND b.title_type IN ('tvSeries', 'tvMiniSeries')"
			: "AND b.title_type IN ('movie', 'tvSeries', 'tvMiniSeries')";

		// Build year filter
		const yearFilter = year ? `AND b.start_year = ${year}` : '';

		// Try fulltext search on imdb_title_basics first (faster, smaller table)
		try {
			const results = await this.searchBasicsFulltext(
				cleanKeyword,
				typeFilter,
				yearFilter,
				limit
			);
			if (results.length > 0) {
				return results;
			}
		} catch (error) {
			// Fulltext index might not exist yet
			console.warn('Basics fulltext search failed:', error);
		}

		// Try fulltext search on imdb_title_akas (includes foreign titles)
		try {
			const results = await this.searchWithFulltext(
				cleanKeyword,
				typeFilter,
				yearFilter,
				limit
			);
			if (results.length > 0) {
				return results;
			}
		} catch (error) {
			// Fulltext index might not exist yet
			console.warn('Akas fulltext search failed:', error);
		}

		// Fall back to LIKE search on basics table
		return this.searchWithLike(cleanKeyword, typeFilter, yearFilter, limit);
	}

	private async searchBasicsFulltext(
		keyword: string,
		typeFilter: string,
		yearFilter: string,
		limit: number
	): Promise<ImdbSearchResult[]> {
		// Prepare keyword for fulltext boolean mode - escape special chars
		const fulltextKeyword = keyword
			.split(' ')
			.map((w) => `+${w.replace(/[+\-<>()~*'"@]/g, '')}*`)
			.filter((w) => w.length > 2) // Filter out empty/short terms after cleanup
			.join(' ');

		// Return empty if no valid search terms remain
		if (!fulltextKeyword.trim()) {
			return [];
		}

		const query = Prisma.sql`
			SELECT
				b.tconst as imdbId,
				CASE
					WHEN b.title_type = 'movie' THEN 'movie'
					ELSE 'show'
				END as type,
				b.start_year as year,
				b.primary_title as title,
				b.original_title as originalTitle,
				r.average_rating as rating,
				r.num_votes as votes,
				1 as isOriginalMatch,
				MATCH(b.primary_title) AGAINST(${fulltextKeyword} IN BOOLEAN MODE) as relevance
			FROM imdb_title_basics b
			LEFT JOIN imdb_title_ratings r ON b.tconst = r.tconst
			WHERE MATCH(b.primary_title) AGAINST(${fulltextKeyword} IN BOOLEAN MODE)
				${Prisma.raw(typeFilter)}
				${Prisma.raw(yearFilter)}
				AND b.is_adult = 0
			ORDER BY relevance DESC, COALESCE(r.num_votes, 0) DESC, b.start_year DESC
			LIMIT ${limit}
		`;

		const results = await this.prisma.$queryRaw<any[]>(query);

		return results.map((r) => ({
			imdbId: r.imdbId,
			type: r.type as 'movie' | 'show',
			year: r.year,
			title: r.title || r.originalTitle || '',
			originalTitle: r.originalTitle,
			rating: r.rating ? Number(r.rating) : null,
			votes: r.votes ? Number(r.votes) : null,
			isOriginalMatch: Boolean(r.isOriginalMatch),
		}));
	}

	private async searchWithFulltext(
		keyword: string,
		typeFilter: string,
		yearFilter: string,
		limit: number
	): Promise<ImdbSearchResult[]> {
		// Prepare keyword for fulltext boolean mode - escape special chars
		const fulltextKeyword = keyword
			.split(' ')
			.map((w) => `+${w.replace(/[+\-<>()~*'"@]/g, '')}*`)
			.filter((w) => w.length > 2) // Filter out empty/short terms after cleanup
			.join(' ');

		// Return empty if no valid search terms remain
		if (!fulltextKeyword.trim()) {
			return [];
		}

		// Use Prisma.raw for fulltext keyword since MATCH AGAINST needs literal string
		const query = Prisma.sql`
			SELECT
				b.tconst as imdbId,
				CASE
					WHEN b.title_type = 'movie' THEN 'movie'
					ELSE 'show'
				END as type,
				b.start_year as year,
				b.primary_title as title,
				b.original_title as originalTitle,
				r.average_rating as rating,
				r.num_votes as votes,
				MAX(a.is_original_title) as isOriginalMatch,
				MAX(MATCH(a.title) AGAINST(${fulltextKeyword} IN BOOLEAN MODE)) as relevance
			FROM imdb_title_akas a
			JOIN imdb_title_basics b ON a.title_id = b.tconst
			LEFT JOIN imdb_title_ratings r ON b.tconst = r.tconst
			WHERE MATCH(a.title) AGAINST(${fulltextKeyword} IN BOOLEAN MODE)
				${Prisma.raw(typeFilter)}
				${Prisma.raw(yearFilter)}
				AND b.is_adult = 0
			GROUP BY b.tconst, b.title_type, b.start_year, b.primary_title, b.original_title, r.average_rating, r.num_votes
			ORDER BY relevance DESC, COALESCE(r.num_votes, 0) DESC, b.start_year DESC
			LIMIT ${limit}
		`;

		const results = await this.prisma.$queryRaw<any[]>(query);

		return results.map((r) => ({
			imdbId: r.imdbId,
			type: r.type as 'movie' | 'show',
			year: r.year,
			title: r.title || r.originalTitle || '',
			originalTitle: r.originalTitle,
			rating: r.rating ? Number(r.rating) : null,
			votes: r.votes ? Number(r.votes) : null,
			isOriginalMatch: Boolean(r.isOriginalMatch),
		}));
	}

	private async searchWithLike(
		keyword: string,
		typeFilter: string,
		yearFilter: string,
		limit: number
	): Promise<ImdbSearchResult[]> {
		// Use imdb_title_basics for faster search (smaller table, ~11M rows vs 54M in akas)
		const likePattern = `%${keyword}%`;
		const startsWithPattern = `${keyword}%`;

		const query = Prisma.sql`
			SELECT
				b.tconst as imdbId,
				CASE
					WHEN b.title_type = 'movie' THEN 'movie'
					ELSE 'show'
				END as type,
				b.start_year as year,
				b.primary_title as title,
				b.original_title as originalTitle,
				r.average_rating as rating,
				r.num_votes as votes,
				1 as isOriginalMatch,
				CASE
					WHEN LOWER(b.primary_title) = LOWER(${keyword}) THEN 3
					WHEN LOWER(b.primary_title) LIKE LOWER(${startsWithPattern}) THEN 2
					ELSE 1
				END as matchQuality
			FROM imdb_title_basics b
			LEFT JOIN imdb_title_ratings r ON b.tconst = r.tconst
			WHERE (LOWER(b.primary_title) LIKE LOWER(${likePattern})
				OR LOWER(b.original_title) LIKE LOWER(${likePattern}))
				${Prisma.raw(typeFilter)}
				${Prisma.raw(yearFilter)}
				AND b.is_adult = 0
			ORDER BY matchQuality DESC, COALESCE(r.num_votes, 0) DESC, b.start_year DESC
			LIMIT ${limit}
		`;

		const results = await this.prisma.$queryRaw<any[]>(query);

		return results.map((r) => ({
			imdbId: r.imdbId,
			type: r.type as 'movie' | 'show',
			year: r.year,
			title: r.title || r.originalTitle || '',
			originalTitle: r.originalTitle,
			rating: r.rating ? Number(r.rating) : null,
			votes: r.votes ? Number(r.votes) : null,
			isOriginalMatch: Boolean(r.isOriginalMatch),
		}));
	}

	/**
	 * Get title details by IMDB ID
	 */
	async getTitleById(imdbId: string): Promise<ImdbSearchResult | null> {
		const result = await this.prisma.imdbTitleBasics.findUnique({
			where: { tconst: imdbId },
		});

		if (!result) return null;

		const rating = await this.prisma.imdbTitleRatings.findUnique({
			where: { tconst: imdbId },
		});

		return {
			imdbId: result.tconst,
			type: result.titleType === 'movie' ? 'movie' : 'show',
			year: result.startYear,
			title: result.primaryTitle || result.originalTitle || '',
			originalTitle: result.originalTitle,
			rating: rating?.averageRating ? Number(rating.averageRating) : null,
			votes: rating?.numVotes ?? null,
			isOriginalMatch: true,
		};
	}
}
