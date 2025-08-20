import { repository as db } from '@/services/repository';
import { isLegacyToken } from '@/utils/castApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const { userid } = req.query;
	if (typeof userid !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid" query parameter',
		});
		return;
	}

	if (req.method === 'OPTIONS') {
		res.setHeader('access-control-allow-origin', '*');
		return res.status(200).end();
	}

	// Check for legacy 5-character token
	if (isLegacyToken(userid)) {
		res.setHeader('access-control-allow-origin', '*');
		res.status(200).json({
			metas: [
				{
					id: 'dmm-update-required',
					type: 'movie',
					name: '⚠️ DMM Cast Update Required',
					description:
						'Please reinstall the addon from https://debridmediamanager.com/stremio',
					poster: 'https://static.debridmediamanager.com/dmmcast.png',
				},
			],
			cacheMaxAge: 0,
		});
		return;
	}

	const castedMovies = await db.fetchCastedMovies(userid as string);
	const movies = [];
	for (const movie of castedMovies) {
		movies.push({
			id: movie,
			type: 'movie',
			poster: `https://images.metahub.space/poster/small/${movie}/img`,
		});
	}
	res.setHeader('access-control-allow-origin', '*');
	res.status(200).json({
		metas: movies,
		cacheMaxAge: 0,
	});
}
