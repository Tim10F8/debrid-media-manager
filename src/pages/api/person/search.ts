import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

const TRAKT_BASE_URL = 'https://api.trakt.tv';
const { publicRuntimeConfig } = getConfig();

const resolveTraktClientId = () => {
	return process.env.TRAKT_CLIENT_ID || publicRuntimeConfig?.traktClientId;
};

type PersonSearchResult = {
	type: 'person';
	score: number;
	person: {
		name: string;
		ids: {
			trakt: number;
			slug: string;
			imdb: string;
			tmdb: number;
		};
	};
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ message: 'Method Not Allowed' });
	}

	const query = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;

	if (!query) {
		return res.status(400).json({ message: 'Missing query parameter.' });
	}

	const traktClientId = resolveTraktClientId();

	if (!traktClientId) {
		console.error('Trakt client id missing when requesting person search');
		return res.status(500).json({ message: 'Trakt configuration missing.' });
	}

	console.info('Searching for person', { query });

	try {
		const response = await axios.get<PersonSearchResult[]>(`${TRAKT_BASE_URL}/search/person`, {
			headers: {
				'Content-Type': 'application/json',
				'trakt-api-version': '2',
				'trakt-api-key': traktClientId,
			},
			params: {
				query,
			},
		});

		const results = response.data.map((item) => ({
			name: item.person.name,
			slug: item.person.ids.slug,
			imdb: item.person.ids.imdb,
			tmdb: item.person.ids.tmdb,
			score: item.score,
		}));

		return res.status(200).json({ results });
	} catch (error: unknown) {
		const status = axios.isAxiosError(error) ? (error.response?.status ?? 500) : 500;
		const message = axios.isAxiosError(error)
			? error.response?.data || error.message
			: error instanceof Error
				? error.message
				: 'Unknown error';

		console.error('Failed to search for person', { query, status, error: message });
		return res.status(status).json({ message: 'Failed to search for person.' });
	}
}
