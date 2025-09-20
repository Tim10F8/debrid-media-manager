import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Sqlite from 'better-sqlite3';
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

function createTempPath(extension: string): string {
	return path.join(
		os.tmpdir(),
		`rd-observability-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
	);
}

const originalSqliteEnv = process.env.REAL_DEBRID_OBSERVABILITY_SQLITE_PATH;
const originalJsonEnv = process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH;
let sqlitePath: string;
let cleanupTargets: string[];

function readSnapshotFromSqlite(filePath: string): RealDebridObservabilityStats | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	const db = new Sqlite(filePath, { readonly: true, fileMustExist: true });
	try {
		const row = db.prepare('SELECT payload FROM snapshot WHERE id = 1').get() as
			| { payload: string }
			| undefined;
		if (!row || !row.payload) {
			return null;
		}
		return JSON.parse(row.payload) as RealDebridObservabilityStats;
	} finally {
		db.close();
	}
}

function seedSqliteSnapshot(filePath: string, snapshot: RealDebridObservabilityStats) {
	const directory = path.dirname(filePath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
	const db = new Sqlite(filePath);
	try {
		db.exec(
			`CREATE TABLE IF NOT EXISTS snapshot (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				payload TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)`
		);
		db.prepare(
			`INSERT INTO snapshot (id, payload, updated_at)
			 VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
		).run(JSON.stringify(snapshot), Date.now());
	} finally {
		db.close();
	}
}

beforeEach(() => {
	observabilityTesting.resetState();
	sqlitePath = createTempPath('sqlite');
	cleanupTargets = [sqlitePath];
	process.env.REAL_DEBRID_OBSERVABILITY_SQLITE_PATH = sqlitePath;
	delete process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH;
});

afterEach(() => {
	vi.restoreAllMocks();
	observabilityTesting.resetState();
	for (const target of cleanupTargets) {
		try {
			fs.rmSync(target, { force: true });
		} catch (error) {
			console.error('Failed cleaning up snapshot test artifact', target, error);
		}
	}
	cleanupTargets = [];
});

afterAll(() => {
	if (originalSqliteEnv) {
		process.env.REAL_DEBRID_OBSERVABILITY_SQLITE_PATH = originalSqliteEnv;
	} else {
		delete process.env.REAL_DEBRID_OBSERVABILITY_SQLITE_PATH;
	}
	if (originalJsonEnv) {
		process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH = originalJsonEnv;
	} else {
		delete process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH;
	}
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
			failedServers: ['20-2'],
			lastError: 'Upstream failure',
		});

		vi.spyOn(rdOperationalStats, 'getStats').mockReturnValue(core);
		vi.spyOn(streamServersHealth, 'getCompactWorkingStreamMetrics').mockReturnValue(
			workingStream
		);

		const result = getRealDebridObservabilityStats();

		expect(fs.existsSync(sqlitePath)).toBe(true);
		const parsed = readSnapshotFromSqlite(sqlitePath);
		expect(parsed).not.toBeNull();
		expect(parsed?.totalTracked).toBe(result.totalTracked);
		expect(parsed?.workingStream.failedServers).toEqual(['20-2']);
		expect(parsed?.byOperation['GET /user'].successRate).toBeCloseTo(0.8);
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

		seedSqliteSnapshot(sqlitePath, persisted);

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

	it('migrates legacy JSON snapshot into sqlite when configured', () => {
		const jsonPath = createTempPath('json');
		cleanupTargets.push(jsonPath);
		const legacySnapshot: RealDebridObservabilityStats = {
			totalTracked: 12,
			successCount: 11,
			failureCount: 1,
			considered: 12,
			successRate: 11 / 12,
			lastTs: 1700002000000,
			isDown: false,
			monitoredOperations: operations,
			byOperation: buildByOperation({
				'GET /user': {
					totalTracked: 12,
					successCount: 11,
					failureCount: 1,
					considered: 12,
					successRate: 11 / 12,
					lastTs: 1700002000000,
				},
			}),
			windowSize: 10000,
			workingStream: buildWorkingStream({
				total: 1,
				working: 1,
				rate: 1,
				lastChecked: 1700002000100,
			}),
		};

		fs.writeFileSync(jsonPath, JSON.stringify(legacySnapshot));

		observabilityTesting.resetState();
		delete process.env.REAL_DEBRID_OBSERVABILITY_SQLITE_PATH;
		process.env.REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH = jsonPath;

		const expectedSqlitePath = jsonPath.replace(/\.json$/i, '.sqlite');
		cleanupTargets.push(expectedSqlitePath);

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

		const result = getRealDebridObservabilityStats();

		expect(result).toEqual(legacySnapshot);
		expect(fs.existsSync(expectedSqlitePath)).toBe(true);
		const hydrated = readSnapshotFromSqlite(expectedSqlitePath);
		expect(hydrated).toEqual(legacySnapshot);
	});
});
