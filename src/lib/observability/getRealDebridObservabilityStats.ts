import { repository } from '@/services/repository';

import { getStats, type OperationStats, type RealDebridOperation } from './rdOperationalStats';
import {
	getCompactWorkingStreamMetrics,
	getStreamMetricsFromDb,
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

/**
 * Gets Real-Debrid observability stats from in-memory state.
 * This is useful for local/quick reads but may not reflect all replicas.
 */
export function getRealDebridObservabilityStats(): RealDebridObservabilityStats {
	return computeFullStats();
}

/**
 * Gets Real-Debrid observability stats from MySQL database.
 * This provides cross-replica consistency and should be used for API endpoints.
 */
export async function getRealDebridObservabilityStatsFromDb(): Promise<RealDebridObservabilityStats> {
	const [rdStats, streamMetrics] = await Promise.all([
		repository.getRdObservabilityStats(),
		getStreamMetricsFromDb(),
	]);

	return {
		totalTracked: rdStats.totalTracked,
		successCount: rdStats.successCount,
		failureCount: rdStats.failureCount,
		considered: rdStats.considered,
		successRate: rdStats.successRate,
		lastTs: rdStats.lastTs,
		isDown: rdStats.isDown,
		monitoredOperations: rdStats.monitoredOperations,
		byOperation: rdStats.byOperation,
		windowSize: rdStats.windowSize,
		workingStream: {
			total: streamMetrics.total,
			working: streamMetrics.working,
			rate: streamMetrics.rate,
			lastChecked: streamMetrics.lastChecked,
			failedServers: streamMetrics.failedServers,
			lastError: null,
			inProgress: false,
			avgLatencyMs: streamMetrics.avgLatencyMs,
			fastestServer: streamMetrics.fastestServer,
		},
	};
}

export const __testing = {
	resetState() {
		// No-op: MySQL state is managed by the database
	},
};
