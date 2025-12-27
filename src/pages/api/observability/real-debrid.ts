import type { NextApiRequest, NextApiResponse } from 'next';

import {
	getRealDebridObservabilityStats,
	getRealDebridObservabilityStatsFromDb,
} from '@/lib/observability/getRealDebridObservabilityStats';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
	res.setHeader('CDN-Cache-Control', 'no-store');
	res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');

	// Use DB-backed stats for cross-replica consistency
	// Fall back to in-memory stats if DB read fails
	try {
		const stats = await getRealDebridObservabilityStatsFromDb();
		return res.status(200).json(stats);
	} catch (error) {
		console.error('Failed to get stats from DB, using in-memory:', error);
		return res.status(200).json(getRealDebridObservabilityStats());
	}
}
