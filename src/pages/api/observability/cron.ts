import type { NextApiRequest, NextApiResponse } from 'next';

import { runHealthCheckNow } from '@/lib/observability/streamServersHealth';
import { runTorrentioHealthCheckNow } from '@/lib/observability/torrentioHealth';

interface CronResponse {
	success: boolean;
	timestamp: string;
	streamHealth?: {
		working: number;
		total: number;
		rate: number;
		avgLatencyMs: number | null;
	};
	torrentioHealth?: {
		checked: boolean;
	};
	error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CronResponse>) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', 'POST');
		return res.status(405).json({
			success: false,
			timestamp: new Date().toISOString(),
			error: 'Method not allowed',
		});
	}

	// Optional secret key protection
	const expectedSecret = process.env.CRON_SECRET;
	const providedSecret = req.query.secret ?? req.headers['x-cron-secret'];
	if (expectedSecret && providedSecret !== expectedSecret) {
		return res.status(401).json({
			success: false,
			timestamp: new Date().toISOString(),
			error: 'Unauthorized',
		});
	}

	try {
		// Run stream health check and Torrentio health check in parallel
		const [streamMetrics] = await Promise.all([
			runHealthCheckNow(),
			runTorrentioHealthCheckNow(),
		]);

		return res.status(200).json({
			success: true,
			timestamp: new Date().toISOString(),
			streamHealth: streamMetrics
				? {
						working: streamMetrics.working,
						total: streamMetrics.total,
						rate: streamMetrics.rate,
						avgLatencyMs: streamMetrics.avgLatencyMs,
					}
				: undefined,
			torrentioHealth: {
				checked: true,
			},
		});
	} catch (error) {
		console.error('[Cron] Job failed:', error);
		return res.status(500).json({
			success: false,
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
