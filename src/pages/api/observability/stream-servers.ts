import type { NextApiRequest, NextApiResponse } from 'next';

import { getStreamStatusesFromDb } from '@/lib/observability/streamServersHealth';

export interface StreamServerStatusResponse {
	host: string;
	status: number | null;
	latencyMs: number | null;
	ok: boolean;
	error: string | null;
	checkedAt: string;
}

export interface StreamServersResponse {
	total: number;
	working: number;
	failed: number;
	workingServers: StreamServerStatusResponse[];
	failedServers: StreamServerStatusResponse[];
	lastChecked: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET');
		return res.status(405).json({ error: 'Method not allowed' });
	}

	// Allow short caching
	res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');

	try {
		const statuses = await getStreamStatusesFromDb();

		const workingServers: StreamServerStatusResponse[] = [];
		const failedServers: StreamServerStatusResponse[] = [];

		for (const status of statuses) {
			const formatted: StreamServerStatusResponse = {
				host: status.host,
				status: status.status,
				latencyMs: status.latencyMs,
				ok: status.ok,
				error: status.error,
				checkedAt: status.checkedAt.toISOString(),
			};

			if (status.ok) {
				workingServers.push(formatted);
			} else {
				failedServers.push(formatted);
			}
		}

		// Sort working servers by latency (fastest first)
		workingServers.sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));

		// Sort failed servers alphabetically by host
		failedServers.sort((a, b) => a.host.localeCompare(b.host));

		const lastChecked =
			statuses.length > 0
				? new Date(Math.max(...statuses.map((s) => s.checkedAt.getTime()))).toISOString()
				: null;

		const response: StreamServersResponse = {
			total: statuses.length,
			working: workingServers.length,
			failed: failedServers.length,
			workingServers,
			failedServers,
			lastChecked,
		};

		return res.status(200).json(response);
	} catch (error) {
		console.error('Failed to fetch stream server statuses:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
}
