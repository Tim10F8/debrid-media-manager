import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
	CompactWorkingStreamMetrics,
	RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import * as combined from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import handler from '@/pages/api/observability/real-debrid';

const operations: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
	'POST /unrestrict/link',
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

describe('Real-Debrid observability API caching', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('emits cache-busting headers on success', async () => {
		const fakeWorkingStream: CompactWorkingStreamMetrics = {
			total: 1,
			working: 1,
			rate: 1,
			lastChecked: Date.now(),
			failedServers: [],
			lastError: null,
			inProgress: false,
			avgLatencyMs: 50,
			fastestServer: '1.download.real-debrid.com',
			recentChecks: [],
		};
		const fakeStats: RealDebridObservabilityStats = {
			totalTracked: 1,
			successCount: 1,
			failureCount: 0,
			considered: 1,
			successRate: 1,
			lastTs: Date.now(),
			isDown: false,
			monitoredOperations: [],
			byOperation: buildEmptyByOperation(),
			windowSize: 10,
			workingStream: fakeWorkingStream,
		};
		vi.spyOn(combined, 'getRealDebridObservabilityStatsFromDb').mockResolvedValue(fakeStats);

		const headerStore: Record<string, string> = {};
		const res = {
			setHeader: vi.fn((name: string, value: string) => {
				headerStore[name] = value;
			}),
			status: vi.fn(),
			json: vi.fn(),
		} as any;
		res.status.mockReturnValue(res);
		res.json.mockReturnValue(res);

		await handler({ method: 'GET', query: { verbose: 'true' } } as any, res);

		expect(headerStore['Cache-Control']).toBe('private, no-store, no-cache, must-revalidate');
		expect(headerStore['CDN-Cache-Control']).toBe('no-store');
		expect(headerStore['Vercel-CDN-Cache-Control']).toBe('no-store');
		expect(headerStore['Pragma']).toBe('no-cache');
		expect(headerStore['Expires']).toBe('0');
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(fakeStats);
		expect(fakeStats.workingStream.inProgress).toBe(false);
	});

	it('returns observability stats for default requests', async () => {
		const fakeWorkingStream: CompactWorkingStreamMetrics = {
			total: 6,
			working: 4,
			rate: 4 / 6,
			lastChecked: Date.now(),
			failedServers: ['21-4', '22-4'],
			lastError: null,
			inProgress: false,
			avgLatencyMs: 75,
			fastestServer: '1.download.real-debrid.com',
			recentChecks: [],
		};
		const fakeStats: RealDebridObservabilityStats = {
			totalTracked: 12,
			successCount: 10,
			failureCount: 2,
			considered: 12,
			successRate: 10 / 12,
			lastTs: Date.now(),
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildEmptyByOperation(),
			windowSize: 10,
			workingStream: fakeWorkingStream,
		};
		const statsSpy = vi
			.spyOn(combined, 'getRealDebridObservabilityStatsFromDb')
			.mockResolvedValue(fakeStats);

		const res = {
			setHeader: vi.fn(),
			status: vi.fn(),
			json: vi.fn(),
		} as any;
		res.status.mockReturnValue(res);
		res.json.mockReturnValue(res);

		await handler({ method: 'GET', query: {} } as any, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(fakeStats);
		expect(statsSpy).toHaveBeenCalledTimes(1);
	});
});
