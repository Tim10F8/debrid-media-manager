import type { NextApiRequest, NextApiResponse } from 'next';

import {
	getCompactRealDebridObservabilityStats,
	getRealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';

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

	const verbose = req.query.verbose === 'true';

	if (verbose) {
		return res.status(200).json(getRealDebridObservabilityStats());
	}

	return res.status(200).json(getCompactRealDebridObservabilityStats());
}
