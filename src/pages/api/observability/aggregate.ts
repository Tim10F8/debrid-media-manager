import type { NextApiRequest, NextApiResponse } from 'next';

import { repository } from '@/services/repository';

interface AggregateQuery {
	action?: 'hourly' | 'daily' | 'cleanup' | 'all';
	secret?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', 'POST');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	// Optional: Add secret key protection for production
	const query = req.query as AggregateQuery;
	const expectedSecret = process.env.AGGREGATION_SECRET;
	if (expectedSecret && query.secret !== expectedSecret) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	const action = query.action ?? 'hourly';

	try {
		const results: Record<string, unknown> = {};

		if (action === 'hourly' || action === 'all') {
			const rdHourlyAggregated = await repository.aggregateRdHourly();
			results.rdHourlyAggregated = rdHourlyAggregated;
		}

		if (action === 'daily' || action === 'all') {
			const dailyResult = await repository.runDailyRollup();
			results.dailyRollup = dailyResult;
		}

		if (action === 'cleanup' || action === 'all') {
			const cleanupResult = await repository.cleanupOldHistoryData();
			results.cleanup = cleanupResult;

			// Also cleanup old RD events
			const rdEventsCleanup = await repository.cleanupOldRdEvents();
			results.rdEventsCleanup = rdEventsCleanup;
		}

		return res.status(200).json({
			success: true,
			action,
			timestamp: new Date().toISOString(),
			results,
		});
	} catch (error) {
		console.error('Aggregation failed:', error);
		return res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
