import type { NextApiRequest, NextApiResponse } from 'next';

import { repository } from '@/services/repository';

export type HistoryRange = '24h' | '7d' | '30d' | '90d';
export type HistoryType = 'rd' | 'stream' | 'servers';

interface HistoryQuery {
	type?: HistoryType;
	range?: HistoryRange;
	operation?: string;
	sortBy?: 'reliability' | 'latency';
	limit?: string;
}

function parseRange(range: HistoryRange): { hoursBack?: number; daysBack: number } {
	switch (range) {
		case '24h':
			return { hoursBack: 24, daysBack: 1 };
		case '7d':
			return { hoursBack: 168, daysBack: 7 };
		case '30d':
			return { daysBack: 30 };
		case '90d':
			return { daysBack: 90 };
		default:
			return { hoursBack: 24, daysBack: 1 };
	}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	// No caching to ensure consistency with the main status page
	res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
	res.setHeader('Pragma', 'no-cache');

	const query = req.query as HistoryQuery;
	const type = query.type ?? 'rd';
	const range = (query.range ?? '24h') as HistoryRange;
	const { hoursBack, daysBack } = parseRange(range);

	try {
		switch (type) {
			case 'rd': {
				// For 24h and 7d, use hourly data
				if (hoursBack && hoursBack <= 168) {
					const hourlyData = await repository.getRdHourlyHistory(
						hoursBack,
						query.operation
					);
					return res.status(200).json({
						type: 'rd',
						granularity: 'hourly',
						range,
						data: hourlyData,
					});
				} else {
					const dailyData = await repository.getRdDailyHistory(
						daysBack ?? 30,
						query.operation
					);
					return res.status(200).json({
						type: 'rd',
						granularity: 'daily',
						range,
						data: dailyData,
					});
				}
			}

			case 'stream': {
				// For short ranges, use hourly data; for longer ranges, use daily
				if (hoursBack && hoursBack <= 168) {
					const hourlyData = await repository.getStreamHourlyHistory(hoursBack);
					return res.status(200).json({
						type: 'stream',
						granularity: 'hourly',
						range,
						data: hourlyData,
					});
				} else {
					const dailyData = await repository.getStreamDailyHistory(daysBack ?? 30);
					return res.status(200).json({
						type: 'stream',
						granularity: 'daily',
						range,
						data: dailyData,
					});
				}
			}

			case 'servers': {
				const sortBy = query.sortBy ?? 'reliability';
				const limit = query.limit ? parseInt(query.limit, 10) : 50;
				const serverData = await repository.getServerReliability(daysBack, sortBy, limit);
				return res.status(200).json({
					type: 'servers',
					range,
					sortBy,
					data: serverData,
				});
			}

			default:
				return res.status(400).json({ error: 'Invalid type parameter' });
		}
	} catch (error) {
		console.error('Failed to fetch history data:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
}
