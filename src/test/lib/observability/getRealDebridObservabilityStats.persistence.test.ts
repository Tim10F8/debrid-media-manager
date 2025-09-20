import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	getCompactRealDebridObservabilityStats,
	getRealDebridObservabilityStats,
	__testing as observabilityTesting,
	type RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import * as rdOperationalStats from '@/lib/observability/rdOperationalStats';
import * as snapshotModule from '@/lib/observability/realDebridSnapshot';
import type { WorkingStreamMetrics } from '@/lib/observability/streamServersHealth';
import * as streamServersHealth from '@/lib/observability/streamServersHealth';

const operations: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
];

function buildByOperation(
	overrides: Partial<Record<RealDebridOperation, Partial<OperationStats>>> = {}
): Record<RealDebridOperation, OperationStats> {
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
				...overrides[operation],
			};
			return acc;
		},
		{} as Record<RealDebridOperation, OperationStats>
	);
}

function buildWorkingStream(overrides: Partial<WorkingStreamMetrics> = {}): WorkingStreamMetrics {
	return {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		statuses: [],
		lastError: null,
		inProgress: false,
		...overrides,
	};
}

function createSnapshotPath(): string {
	return path.join(
		os.tmpdir(),
		`rd-observability-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
	);
}

const originalSnapshotEnv = process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH;
let snapshotPath: string;

beforeEach(() => {
	observabilityTesting.resetState();
	snapshotPath = createSnapshotPath();
	process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH = snapshotPath;
});

afterEach(() => {
	vi.restoreAllMocks();
	observabilityTesting.resetState();
	if (snapshotPath && fs.existsSync(snapshotPath)) {
		fs.unlinkSync(snapshotPath);
	}
});

afterAll(() => {
	process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH = originalSnapshotEnv;
});

describe('Real-Debrid observability persistence', () => {
	it('persists snapshots when live stats have data', () => {
		const core = {
			totalTracked: 5,
			successCount: 4,
			failureCount: 1,
			considered: 5,
			successRate: 0.8,
			lastTs: 1700000000000,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation({
				'GET /user': {
					totalTracked: 5,
					successCount: 4,
					failureCount: 1,
					considered: 5,
					successRate: 0.8,
					lastTs: 1700000000000,
				},
			}),
			windowSize: 10000,
		} satisfies ReturnType<typeof rdOperationalStats.getStats>;

		const workingStream = buildWorkingStream({
			total: 2,
			working: 1,
			rate: 0.5,
			lastChecked: 1700000000100,
			statuses: [
				{
					id: '20-1',
					url: 'https://20-1.download.real-debrid.com/test',
					status: 200,
					contentLength: 1024,
					ok: true,
					checkedAt: 1700000000200,
					error: null,
				},
				{
					id: '20-2',
					url: 'https://20-2.download.real-debrid.com/test',
					status: 503,
					contentLength: null,
					ok: false,
					checkedAt: 1700000000200,
					error: 'Upstream failure',
				},
			],
		});

		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(core);
		vi.spyOn(streamServersHealth, 'getWorkingStreamMetrics').mockReturnValue(workingStream);

		const result = getRealDebridObservabilityStats();

		expect(fs.existsSync(snapshotPath)).toBe(true);
		const parsed = JSON.parse(
			fs.readFileSync(snapshotPath, 'utf8')
		) as RealDebridObservabilityStats;
		expect(parsed.totalTracked).toBe(result.totalTracked);
		expect(parsed.workingStream.statuses.length).toBe(2);
		expect(parsed.byOperation['GET /user'].successRate).toBeCloseTo(0.8);
	});

	it('serves persisted snapshot when live stats are empty', () => {
		const persisted: RealDebridObservabilityStats = {
			totalTracked: 12,
			successCount: 11,
			failureCount: 1,
			considered: 12,
			successRate: 11 / 12,
			lastTs: 1700001000000,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation({
				'GET /user': {
					totalTracked: 12,
					successCount: 11,
					failureCount: 1,
					considered: 12,
					successRate: 11 / 12,
					lastTs: 1700001000000,
				},
			}),
			windowSize: 10000,
			workingStream: buildWorkingStream({
				total: 3,
				working: 2,
				rate: 2 / 3,
				lastChecked: 1700001000200,
				statuses: [
					{
						id: '21-1',
						url: 'https://21-1.download.real-debrid.com',
						status: 200,
						contentLength: 2048,
						ok: true,
						checkedAt: 1700001000200,
						error: null,
					},
					{
						id: '21-2',
						url: 'https://21-2.download.real-debrid.com',
						status: 500,
						contentLength: null,
						ok: false,
						checkedAt: 1700001000200,
						error: 'Server error',
					},
				],
			}),
		};

		fs.writeFileSync(snapshotPath, JSON.stringify(persisted));

		const emptyCore = {
			totalTracked: 0,
			successCount: 0,
			failureCount: 0,
			considered: 0,
			successRate: 0,
			lastTs: null,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation(),
			windowSize: 10000,
		} satisfies ReturnType<typeof rdOperationalStats.getStats>;

		const emptyWorkingStream = buildWorkingStream();

		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(emptyCore);
		vi.spyOn(streamServersHealth, 'getWorkingStreamMetrics').mockReturnValue(
			emptyWorkingStream
		);
		const saveSpy = vi.spyOn(snapshotModule, 'saveRealDebridSnapshot');

		const result = getRealDebridObservabilityStats();

		expect(result).toEqual(persisted);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it('uses persisted snapshot for compact stats fallback', () => {
		const persisted: RealDebridObservabilityStats = {
			totalTracked: 8,
			successCount: 6,
			failureCount: 2,
			considered: 8,
			successRate: 0.75,
			lastTs: 1700002000000,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation({
				'GET /user': {
					totalTracked: 8,
					successCount: 6,
					failureCount: 2,
					considered: 8,
					successRate: 0.75,
					lastTs: 1700002000000,
				},
			}),
			windowSize: 10000,
			workingStream: buildWorkingStream({
				total: 4,
				working: 3,
				rate: 0.75,
				lastChecked: 1700002000200,
				statuses: [
					{
						id: '22-1',
						url: 'https://22-1.download.real-debrid.com',
						status: 200,
						contentLength: 1024,
						ok: true,
						checkedAt: 1700002000200,
						error: null,
					},
					{
						id: '22-2',
						url: 'https://22-2.download.real-debrid.com',
						status: 503,
						contentLength: null,
						ok: false,
						checkedAt: 1700002000200,
						error: 'Unavailable',
					},
				],
			}),
		};

		fs.writeFileSync(snapshotPath, JSON.stringify(persisted));

		const emptyCore = {
			totalTracked: 0,
			successCount: 0,
			failureCount: 0,
			considered: 0,
			successRate: 0,
			lastTs: null,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation(),
			windowSize: 10000,
		} satisfies ReturnType<typeof rdOperationalStats.getStats>;

		const emptyWorkingStream = buildWorkingStream();

		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(emptyCore);
		vi.spyOn(streamServersHealth, 'getWorkingStreamMetrics').mockReturnValue(
			emptyWorkingStream
		);
		const saveSpy = vi.spyOn(snapshotModule, 'saveRealDebridSnapshot');

		const compact = getCompactRealDebridObservabilityStats();

		expect(compact.successRate).toBeCloseTo(persisted.successRate);
		expect(compact.byOperation['GET /user'].successRate).toBeCloseTo(0.75);
		expect(compact.workingStream.failedServers).toEqual(['22-2']);
		expect(saveSpy).not.toHaveBeenCalled();
	});
});
