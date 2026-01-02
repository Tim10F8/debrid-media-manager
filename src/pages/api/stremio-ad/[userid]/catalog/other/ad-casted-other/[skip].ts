import { repository as db } from '@/services/repository';
import { getAllDebridDMMLibrary } from '@/utils/allDebridCastCatalogHelper';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, skip } = req.query;

	if (typeof userid !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid" query parameter',
		});
		return;
	}

	const page = typeof skip === 'string' ? parseInt(skip, 10) : 0;

	try {
		const profile = await db.getAllDebridCastProfile(userid);
		if (!profile) {
			res.status(200).json({ metas: [], cacheMaxAge: 0 });
			return;
		}

		const metas = await getAllDebridDMMLibrary(profile.apiKey, page);

		res.status(200).json({
			metas,
			cacheMaxAge: 0,
		});
	} catch (error) {
		console.error(
			'Failed to get AllDebrid library:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to get AllDebrid library' });
	}
}
