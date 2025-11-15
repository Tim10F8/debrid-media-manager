import { isLegacyToken } from '@/utils/castApiHelpers';
import { getDMMLibrary, PAGE_SIZE } from '@/utils/castCatalogHelper';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	try {
		const { userid, skip } = req.query;
		if (typeof skip !== 'string') {
			return res.status(400).json({ error: 'Invalid "skip" query parameter' });
		}

		const skipNum = skip.replaceAll(/^skip=/g, '').replaceAll(/\.json$/g, '');
		const page = Math.floor(Number(skipNum) / PAGE_SIZE) + 1;

		// Check for legacy 5-character token
		if (isLegacyToken(userid as string)) {
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

		const result = await getDMMLibrary(userid as string, page);

		if ('error' in result) {
			return res.status(result.status).json({ error: result.error });
		}

		res.status(result.status).json(result.data);
	} catch (error) {
		console.error('Error in casted-other/[skip] handler:', error);
		return res.status(500).json({
			error: 'Internal server error',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
