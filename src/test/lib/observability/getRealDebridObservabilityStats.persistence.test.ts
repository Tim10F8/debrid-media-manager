import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	getRealDebridObservabilityStats,
	__testing as observabilityTesting,
	type RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import * as rdOperationalStats from '@/lib/observability/rdOperationalStats';
import * as snapshotModule from '@/lib/observability/realDebridSnapshot';
import type { CompactWorkingStreamMetrics } from '@/lib/observability/streamServersHealth';
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

function buildWorkingStream(
	overrides: Partial<CompactWorkingStreamMetrics> = {}
): CompactWorkingStreamMetrics {
	return {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		failedServers: [],
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
		const renameSpy = vi.spyOn(fs, 'renameSync');
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
			failedServers: ['20-2'],
			lastError: 'Upstream failure',
		});

		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(core);
		vi.spyOn(streamServersHealth, 'getCompactWorkingStreamMetrics').mockReturnValue(
			workingStream
		);

		const result = getRealDebridObservabilityStats();

		expect(fs.existsSync(snapshotPath)).toBe(true);
		const parsed = JSON.parse(
			fs.readFileSync(snapshotPath, 'utf8')
		) as RealDebridObservabilityStats;
		expect(parsed.totalTracked).toBe(result.totalTracked);
		expect(parsed.workingStream.failedServers).toEqual(['20-2']);
		expect(parsed.byOperation['GET /user'].successRate).toBeCloseTo(0.8);
		expect(renameSpy).toHaveBeenCalledWith(expect.stringContaining('.tmp'), snapshotPath);
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
				failedServers: ['21-2'],
				lastError: 'Server error',
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
		vi.spyOn(streamServersHealth, 'getCompactWorkingStreamMetrics').mockReturnValue(
			emptyWorkingStream
		);
		const saveSpy = vi.spyOn(snapshotModule, 'saveRealDebridSnapshot');

		const result = getRealDebridObservabilityStats();

		expect(result).toEqual(persisted);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it('cleans up temporary snapshot files and surfaces errors when persistence fails', () => {
		const core = {
			totalTracked: 3,
			successCount: 3,
			failureCount: 0,
			considered: 3,
			successRate: 1,
			lastTs: 1700000000200,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation({
				'GET /user': {
					totalTracked: 3,
					successCount: 3,
					failureCount: 0,
					considered: 3,
					successRate: 1,
					lastTs: 1700000000200,
				},
			}),
			windowSize: 10000,
		} satisfies ReturnType<typeof rdOperationalStats.getStats>;

		const workingStream = buildWorkingStream({
			total: 1,
			working: 1,
			rate: 1,
			lastChecked: 1700000000300,
		});

		const renameError = new Error('rename failed');
		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(core);
		vi.spyOn(streamServersHealth, 'getCompactWorkingStreamMetrics').mockReturnValue(
			workingStream
		);
		vi.spyOn(fs, 'renameSync').mockImplementation(() => {
			throw renameError;
		});
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		getRealDebridObservabilityStats();

		const directoryEntries = fs.readdirSync(path.dirname(snapshotPath));
		const snapshotBase = path.basename(snapshotPath);
		const tempEntries = directoryEntries.filter(
			(entry) => entry.startsWith(snapshotBase) && entry.endsWith('.tmp')
		);
		expect(tempEntries).toHaveLength(0);
		expect(fs.existsSync(snapshotPath)).toBe(false);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Failed to persist Real-Debrid observability snapshot'),
			renameError
		);
	});
});
