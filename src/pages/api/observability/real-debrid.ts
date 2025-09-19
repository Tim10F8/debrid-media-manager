import type { NextApiRequest, NextApiResponse } from 'next';

import { getStats } from '@/lib/observability/rdOperationalStats';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	res.setHeader('Cache-Control', 'no-store');

	return res.status(200).json(getStats());
}
