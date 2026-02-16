import type { NextApiRequest, NextApiResponse } from 'next';

import { repository } from '@/services/repository';

export type HistoryRange = '24h' | '7d' | '30d' | '90d';
export type HistoryType = 'stream' | 'servers' | 'rd' | 'torrentio';

interface HistoryQuery {
	type?: HistoryType;
	range?: HistoryRange;
	sortBy?: 'reliability' | 'latency';
	limit?: string;
}

function parseRange(range: HistoryRange): { hoursBack: number; daysBack: number } {
	switch (range) {
		case '24h':
			return { hoursBack: 24, daysBack: 1 };
		case '7d':
			return { hoursBack: 168, daysBack: 7 };
		case '30d':
			return { hoursBack: 720, daysBack: 30 };
		case '90d':
			return { hoursBack: 2160, daysBack: 90 };
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
	const type = query.type ?? 'stream';
	const range = (query.range ?? '24h') as HistoryRange;
	const { hoursBack, daysBack } = parseRange(range);

	try {
		switch (type) {
			case 'stream': {
				const data = await repository.getStreamHourlyHistory(hoursBack);
				return res.status(200).json({
					type: 'stream',
					granularity: 'hourly',
					range,
					data,
				});
			}

			case 'servers': {
				const sortBy = query.sortBy ?? 'reliability';
				const limit = query.limit ? parseInt(query.limit, 10) : 50;
				const data = await repository.getServerReliability(daysBack, sortBy, limit);
				return res.status(200).json({
					type: 'servers',
					range,
					sortBy,
					data,
				});
			}

			case 'rd': {
				const data = await repository.getRdHourlyHistory(hoursBack);
				return res.status(200).json({
					type: 'rd',
					granularity: 'hourly',
					range,
					data,
				});
			}

			case 'torrentio': {
				const data = await repository.getTorrentioHourlyHistory(hoursBack);
				return res.status(200).json({
					type: 'torrentio',
					granularity: 'hourly',
					range,
					data,
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
