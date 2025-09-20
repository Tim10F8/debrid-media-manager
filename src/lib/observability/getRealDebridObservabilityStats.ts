import { getStats, type OperationStats, type RealDebridOperation } from './rdOperationalStats';
import { loadRealDebridSnapshot, saveRealDebridSnapshot } from './realDebridSnapshot';
import {
	getCompactWorkingStreamMetrics,
	type CompactWorkingStreamMetrics,
} from './streamServersHealth';

export interface RealDebridObservabilityStats {
	totalTracked: number;
	successCount: number;
	failureCount: number;
	considered: number;
	successRate: number;
	lastTs: number | null;
	isDown: boolean;
	monitoredOperations: RealDebridOperation[];
	byOperation: Record<RealDebridOperation, OperationStats>;
	windowSize: number;
	workingStream: CompactWorkingStreamMetrics;
}

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

let snapshotSchedulerStarted = false;
let lastPersistedSignature: string | null = null;
let snapshotInterval: NodeJS.Timeout | null = null;

function signatureFor(stats: RealDebridObservabilityStats): string {
	// Capture key fields to avoid rewriting identical payloads.
	const operations = stats.monitoredOperations.map((operation) => {
		const opStats = stats.byOperation[operation];
		return [
			operation,
			opStats?.totalTracked ?? 0,
			opStats?.considered ?? 0,
			opStats?.successRate ?? 0,
			opStats?.lastTs ?? null,
		];
	});

	return JSON.stringify({
		totalTracked: stats.totalTracked,
		successCount: stats.successCount,
		failureCount: stats.failureCount,
		considered: stats.considered,
		successRate: stats.successRate,
		lastTs: stats.lastTs,
		isDown: stats.isDown,
		operations,
		workingStream: stats.workingStream,
	});
}

function persistSnapshot(stats: RealDebridObservabilityStats) {
	const signature = signatureFor(stats);
	if (lastPersistedSignature === signature) {
		return;
	}
	saveRealDebridSnapshot(stats);
	lastPersistedSignature = signature;
}

function computeFullStats(): RealDebridObservabilityStats {
	const core = getStats();
	const workingStream = getCompactWorkingStreamMetrics();

	return {
		totalTracked: core.totalTracked,
		successCount: core.successCount,
		failureCount: core.failureCount,
		considered: core.considered,
		successRate: core.successRate,
		lastTs: core.lastTs,
		isDown: core.isDown,
		monitoredOperations: core.monitoredOperations,
		byOperation: core.byOperation,
		windowSize: core.windowSize,
		workingStream,
	};
}

function hasMeaningfulStats(stats: RealDebridObservabilityStats): boolean {
	if (stats.totalTracked > 0 || stats.considered > 0 || stats.lastTs !== null) {
		return true;
	}

	const stream = stats.workingStream;
	return Boolean(
		stream &&
			(stream.lastChecked !== null ||
				stream.failedServers.length > 0 ||
				stream.lastError ||
				stream.inProgress)
	);
}

function ensureSnapshotScheduler() {
	if (snapshotSchedulerStarted) {
		return;
	}
	snapshotSchedulerStarted = true;

	const run = () => {
		try {
			const stats = computeFullStats();
			if (!hasMeaningfulStats(stats)) {
				return;
			}
			persistSnapshot(stats);
		} catch (error) {
			console.error('Failed scheduled Real-Debrid observability snapshot', error);
		}
	};

	run();
	snapshotInterval = setInterval(run, SNAPSHOT_INTERVAL_MS);
	if (typeof snapshotInterval.unref === 'function') {
		snapshotInterval.unref();
	}
}

export function getRealDebridObservabilityStats(): RealDebridObservabilityStats {
	ensureSnapshotScheduler();
	const computed = computeFullStats();
	if (hasMeaningfulStats(computed)) {
		persistSnapshot(computed);
		return computed;
	}

	const persisted = loadRealDebridSnapshot();
	if (persisted) {
		lastPersistedSignature = signatureFor(persisted);
		console.info('Serving Real-Debrid observability stats from persisted snapshot');
		return persisted;
	}

	return computed;
}

export const __testing = {
	resetState() {
		if (snapshotInterval) {
			clearInterval(snapshotInterval);
			snapshotInterval = null;
		}
		snapshotSchedulerStarted = false;
		lastPersistedSignature = null;
	},
};
