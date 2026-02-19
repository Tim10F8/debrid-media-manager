import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';

const TRAKT_API_URL = 'https://api.trakt.tv';
const TRAKT_CLIENT_ID = '8a7455d06804b07fa25e27454706c6f2107b6fe5ed2ad805eff3b456a17e79f0';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	const { query, types } = req.query;

	if (!query || typeof query !== 'string') {
		return res.status(400).json({ error: 'Missing query parameter' });
	}

	const typeParam = typeof types === 'string' ? types : 'movie,show';

	try {
		const response = await axios.get(
			`${TRAKT_API_URL}/search/${typeParam}?query=${encodeURIComponent(query)}`,
			{
				headers: {
					'Content-Type': 'application/json',
					'trakt-api-version': '2',
					'trakt-api-key': TRAKT_CLIENT_ID,
				},
			}
		);

		res.status(200).json(response.data);
	} catch (error: any) {
		console.error('Error proxying Trakt search:', error.message);
		res.status(error.response?.status || 500).json({ error: 'Failed to fetch search results' });
	}
}
