import { repository as db } from '@/services/repository';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid } = req.query;

	if (typeof userid !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid" query parameter',
		});
		return;
	}

	try {
		const shows = await db.fetchAllDebridCastedShows(userid);

		const metas = shows.map((imdbId) => ({
			id: imdbId,
			type: 'series',
		}));

		res.status(200).json({
			metas,
			cacheMaxAge: 0,
		});
	} catch (error) {
		console.error(
			'Failed to get AllDebrid casted shows:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to get AllDebrid casted shows' });
	}
}
