import { isLegacyToken } from '@/utils/castApiHelpers';
import { getDMMLibrary } from '@/utils/castCatalogHelper';
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

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	// Check for legacy 5-character token
	if (isLegacyToken(userid)) {
		return res.status(200).json({
			metas: [
				{
					id: 'dmm:update-required',
					type: 'other',
					name: '⚠️ DMM Cast Update Required',
					description:
						'Please reinstall the addon from https://debridmediamanager.com/stremio\n\nYour casted content will be preserved.',
					poster: 'https://static.debridmediamanager.com/dmmcast.png',
				},
			],
		});
	}

	const result = await getDMMLibrary(userid as string, 1);

	if ('error' in result) {
		return res.status(result.status).json({ error: result.error });
	}

	res.status(result.status).json(result.data);
}
