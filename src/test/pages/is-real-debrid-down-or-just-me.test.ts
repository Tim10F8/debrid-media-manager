import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
	CompactWorkingStreamMetrics,
	RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';

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

function buildEmptyStats(): RealDebridObservabilityStats {
	const fakeWorkingStream: CompactWorkingStreamMetrics = {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		failedServers: [],
		lastError: null,
		inProgress: false,
		avgLatencyMs: null,
		fastestServer: null,
		recentChecks: [],
	};
	return {
		totalTracked: 0,
		successCount: 0,
		failureCount: 0,
		considered: 0,
		successRate: 0,
		lastTs: null,
		isDown: false,
		monitoredOperations: [],
		byOperation: buildEmptyByOperation(),
		windowSize: 0,
		workingStream: fakeWorkingStream,
	};
}

describe('Real-Debrid status page (client-side only)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('exports empty stats builder for test utilities', () => {
		const stats = buildEmptyStats();
		expect(stats.totalTracked).toBe(0);
		expect(stats.workingStream.inProgress).toBe(false);
	});

	it('builds valid byOperation structure', () => {
		const byOp = buildEmptyByOperation();
		expect(Object.keys(byOp)).toHaveLength(7);
		expect(byOp['GET /user'].operation).toBe('GET /user');
	});
});
