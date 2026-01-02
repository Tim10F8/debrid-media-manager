import { getTorBoxDMMTorrent } from '@/utils/torboxCastCatalogHelper';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, id } = req.query;
	if (typeof userid !== 'string' || typeof id !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid" or "id" query parameter',
		});
		return;
	}

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	// Parse id: dmm-tb:123.json -> 123
	const idStr = id.replace('.json', '');
	const parts = idStr.split(':');
	if (parts.length < 2 || parts[0] !== 'dmm-tb') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid id format. Expected dmm-tb:{torrentId}',
		});
		return;
	}

	const torrentId = parts[1];

	const result = await getTorBoxDMMTorrent(userid as string, torrentId);

	if ('error' in result) {
		return res.status(result.status).json({ error: result.error });
	}

	res.status(result.status).json(result.data);
}
