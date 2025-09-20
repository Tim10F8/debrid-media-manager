import type { NextApiRequest, NextApiResponse } from 'next';

import { getRealDebridObservabilityStats } from '@/lib/observability/getRealDebridObservabilityStats';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
	res.setHeader('CDN-Cache-Control', 'no-store');
	res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');

	return res.status(200).json(getRealDebridObservabilityStats());
}
