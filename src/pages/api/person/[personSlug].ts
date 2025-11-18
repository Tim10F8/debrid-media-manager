import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

const TRAKT_BASE_URL = 'https://api.trakt.tv';
const { publicRuntimeConfig } = getConfig();

const resolveTraktClientId = () => {
	return process.env.TRAKT_CLIENT_ID || publicRuntimeConfig?.traktClientId;
};

type MovieCredit = {
	character: string;
	movie: {
		title: string;
		year: number;
		ids: {
			trakt: number;
			slug: string;
			imdb: string;
			tmdb: number;
		};
	};
};

type ShowCredit = {
	character: string;
	show: {
		title: string;
		year: number;
		ids: {
			trakt: number;
			slug: string;
			imdb: string;
			tmdb: number;
		};
	};
};

type TraktMovieCreditsResponse = {
	cast: MovieCredit[];
	crew: Record<string, any[]>;
};

type TraktShowCreditsResponse = {
	cast: ShowCredit[];
	crew: Record<string, any[]>;
};

type MediaItem = {
	title: string;
	year: number;
	character?: string;
	job?: string;
	mediaType: 'movie' | 'show';
	creditType: 'cast' | 'crew';
	ids: {
		imdb: string;
	};
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ message: 'Method Not Allowed' });
	}

	const personSlug = Array.isArray(req.query.personSlug)
		? req.query.personSlug[0]
		: req.query.personSlug;

	if (!personSlug) {
		return res.status(400).json({ message: 'Missing personSlug parameter.' });
	}

	const traktClientId = resolveTraktClientId();

	if (!traktClientId) {
		console.error('Trakt client id missing when requesting person credits');
		return res.status(500).json({ message: 'Trakt configuration missing.' });
	}

	console.info('Fetching person credits', { personSlug });

	const headers = {
		'Content-Type': 'application/json',
		'trakt-api-version': '2',
		'trakt-api-key': traktClientId,
	};

	try {
		const [movieResponse, showResponse] = await Promise.all([
			axios.get<TraktMovieCreditsResponse>(`${TRAKT_BASE_URL}/people/${personSlug}/movies`, {
				headers,
			}),
			axios.get<TraktShowCreditsResponse>(`${TRAKT_BASE_URL}/people/${personSlug}/shows`, {
				headers,
			}),
		]);

		const movieCastCredits: MediaItem[] = (movieResponse.data.cast || [])
			.filter((credit) => credit.movie.ids.imdb)
			.map((credit) => ({
				title: credit.movie.title,
				year: credit.movie.year,
				character: credit.character,
				mediaType: 'movie' as const,
				creditType: 'cast' as const,
				ids: {
					imdb: credit.movie.ids.imdb,
				},
			}));

		const movieCrewCredits: MediaItem[] = Object.entries(movieResponse.data.crew || {}).flatMap(
			([job, credits]) =>
				credits
					.filter((credit: any) => credit.movie?.ids?.imdb)
					.map((credit: any) => ({
						title: credit.movie.title,
						year: credit.movie.year,
						job,
						mediaType: 'movie' as const,
						creditType: 'crew' as const,
						ids: {
							imdb: credit.movie.ids.imdb,
						},
					}))
		);

		const showCastCredits: MediaItem[] = (showResponse.data.cast || [])
			.filter((credit) => credit.show.ids.imdb)
			.map((credit) => ({
				title: credit.show.title,
				year: credit.show.year,
				character: credit.character,
				mediaType: 'show' as const,
				creditType: 'cast' as const,
				ids: {
					imdb: credit.show.ids.imdb,
				},
			}));

		const showCrewCredits: MediaItem[] = Object.entries(showResponse.data.crew || {}).flatMap(
			([job, credits]) =>
				credits
					.filter((credit: any) => credit.show?.ids?.imdb)
					.map((credit: any) => ({
						title: credit.show.title,
						year: credit.show.year,
						job,
						mediaType: 'show' as const,
						creditType: 'crew' as const,
						ids: {
							imdb: credit.show.ids.imdb,
						},
					}))
		);

		const movieCredits = [...movieCastCredits, ...movieCrewCredits];
		const showCredits = [...showCastCredits, ...showCrewCredits];
		const allCredits = [...movieCredits, ...showCredits].sort((a, b) => b.year - a.year);

		return res.status(200).json({
			movies: movieCredits,
			shows: showCredits,
			all: allCredits,
		});
	} catch (error: unknown) {
		const status = axios.isAxiosError(error) ? (error.response?.status ?? 500) : 500;
		const message = axios.isAxiosError(error)
			? error.response?.data || error.message
			: error instanceof Error
				? error.message
				: 'Unknown error';

		console.error('Failed to fetch person credits', { personSlug, status, error: message });
		return res.status(status).json({ message: 'Failed to fetch person credits.' });
	}
}
