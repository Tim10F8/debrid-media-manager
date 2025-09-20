import { afterEach, describe, expect, it, vi } from 'vitest';

import * as combined from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import type {
	CompactWorkingStreamMetrics,
	WorkingStreamMetrics,
} from '@/lib/observability/streamServersHealth';
import handler from '@/pages/api/observability/real-debrid';

const operations: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
];

function buildEmptyByOperation(): Record<RealDebridOperation, OperationStats> {
	return operations.reduce<Record<RealDebridOperation, OperationStats>>(
		(acc, operation) => {
			acc[operation] = {
				operation,
				totalTracked: 0,
				successCount: 0,
				failureCount: 0,
				considered: 0,
				successRate: 0,
				lastTs: null,
			};
			return acc;
		},
		{} as Record<RealDebridOperation, OperationStats>
	);
}

describe('Real-Debrid observability API compact mode', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns compact response by default', async () => {
		const fakeCompactWorkingStream: CompactWorkingStreamMetrics = {
			total: 102,
			working: 51,
			rate: 0.5,
			lastChecked: Date.now(),
			failedServers: ['20-6', '21-6', '22-6'],
			lastError: null,
			inProgress: false,
		};

		const fakeCompactStats: ReturnType<typeof combined.getCompactRealDebridObservabilityStats> =
			{
				successRate: 0.92,
				lastTs: Date.now(),
				isDown: false,
				byOperation: {
					'GET /user': { successRate: 1, lastTs: Date.now() },
					'GET /torrents': { successRate: 1, lastTs: Date.now() },
					'GET /torrents/info/{id}': { successRate: 1, lastTs: Date.now() },
					'POST /torrents/addMagnet': { successRate: 0.66, lastTs: Date.now() },
					'POST /torrents/selectFiles/{id}': { successRate: 0.98, lastTs: Date.now() },
					'DELETE /torrents/delete/{id}': { successRate: 1, lastTs: Date.now() },
				},
				workingStream: fakeCompactWorkingStream,
			};

		vi.spyOn(combined, 'getCompactRealDebridObservabilityStats').mockReturnValue(
			fakeCompactStats
		);

		const res = {
			setHeader: vi.fn(),
			status: vi.fn(),
			json: vi.fn(),
		} as any;
		res.status.mockReturnValue(res);
		res.json.mockReturnValue(res);

		await handler({ method: 'GET', query: {} } as any, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(fakeCompactStats);
		expect(combined.getCompactRealDebridObservabilityStats).toHaveBeenCalled();
	});

	it('returns verbose response when verbose=true', async () => {
		const fakeWorkingStream: WorkingStreamMetrics = {
			total: 102,
			working: 51,
			rate: 0.5,
			lastChecked: Date.now(),
			statuses: [
				{
					id: '20-4',
					url: 'https://20-4.download.real-debrid.com/speedtest/test.rar/0.123456',
					status: 200,
					contentLength: 10737418240,
					ok: true,
					checkedAt: Date.now(),
					error: null,
				},
			],
			lastError: null,
			inProgress: false,
		};

		const fakeStats: ReturnType<typeof combined.getRealDebridObservabilityStats> = {
			totalTracked: 1352,
			successCount: 920,
			failureCount: 80,
			considered: 1000,
			successRate: 0.92,
			lastTs: Date.now(),
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildEmptyByOperation(),
			windowSize: 10000,
			workingStream: fakeWorkingStream,
		};

		vi.spyOn(combined, 'getRealDebridObservabilityStats').mockReturnValue(fakeStats);

		const res = {
			setHeader: vi.fn(),
			status: vi.fn(),
			json: vi.fn(),
		} as any;
		res.status.mockReturnValue(res);
		res.json.mockReturnValue(res);

		await handler({ method: 'GET', query: { verbose: 'true' } } as any, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(fakeStats);
		expect(combined.getRealDebridObservabilityStats).toHaveBeenCalled();
	});

	it('compact response has significantly smaller size than verbose', () => {
		const verboseResponse = {
			totalTracked: 1352,
			successCount: 920,
			failureCount: 80,
			considered: 1000,
			successRate: 0.92,
			lastTs: Date.now(),
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildEmptyByOperation(),
			windowSize: 10000,
			workingStream: {
				total: 102,
				working: 51,
				rate: 0.5,
				lastChecked: Date.now(),
				statuses: Array(102).fill({
					id: 'server-id',
					url: 'https://server.download.real-debrid.com/speedtest/test.rar/0.123456',
					status: 200,
					contentLength: 10737418240,
					ok: true,
					checkedAt: Date.now(),
					error: null,
				}),
				lastError: null,
				inProgress: false,
			},
		};

		const compactResponse = {
			successRate: 0.92,
			lastTs: Date.now(),
			isDown: false,
			byOperation: {
				'GET /user': { successRate: 1, lastTs: Date.now() },
				'GET /torrents': { successRate: 1, lastTs: Date.now() },
				'GET /torrents/info/{id}': { successRate: 1, lastTs: Date.now() },
				'POST /torrents/addMagnet': { successRate: 0.66, lastTs: Date.now() },
				'POST /torrents/selectFiles/{id}': { successRate: 0.98, lastTs: Date.now() },
				'DELETE /torrents/delete/{id}': { successRate: 1, lastTs: Date.now() },
			},
			workingStream: {
				total: 102,
				working: 51,
				rate: 0.5,
				lastChecked: Date.now(),
				failedServers: Array(51).fill('server-id'),
				lastError: null,
				inProgress: false,
			},
		};

		const verboseSize = JSON.stringify(verboseResponse).length;
		const compactSize = JSON.stringify(compactResponse).length;

		expect(compactSize).toBeLessThan(verboseSize * 0.3);
	});

	it('handles 405 for non-GET methods', async () => {
		const res = {
			setHeader: vi.fn(),
			status: vi.fn(),
			json: vi.fn(),
		} as any;
		res.status.mockReturnValue(res);
		res.json.mockReturnValue(res);

		await handler({ method: 'POST' } as any, res);

		expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
	});
});
