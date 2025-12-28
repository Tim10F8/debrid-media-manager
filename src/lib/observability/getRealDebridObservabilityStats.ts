import { repository } from '@/services/repository';

import { type OperationStats, type RealDebridOperation } from './rdOperationalStats';
import { getStreamMetricsFromDb, isHealthCheckInProgress } from './streamServersHealth';

export interface RecentCheckResult {
	ok: boolean;
	latencyMs: number | null;
	server: string | null;
	checkedAt: number;
}

export interface CompactWorkingStreamMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	failedServers: string[];
	lastError: string | null;
	inProgress: boolean;
	avgLatencyMs: number | null;
	fastestServer: string | null;
	recentChecks: RecentCheckResult[];
}

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

/**
 * Gets Real-Debrid observability stats from MySQL database.
 * This provides cross-replica consistency and should be used for API endpoints.
 */
export async function getRealDebridObservabilityStatsFromDb(): Promise<RealDebridObservabilityStats> {
	const [rdStats, streamMetrics, recentChecks] = await Promise.all([
		repository.getRdObservabilityStats(),
		getStreamMetricsFromDb(),
		repository.getRecentStreamChecks(5),
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
			inProgress: isHealthCheckInProgress(),
			avgLatencyMs: streamMetrics.avgLatencyMs,
			fastestServer: streamMetrics.fastestServer,
			recentChecks: recentChecks.map((check) => ({
				ok: check.ok,
				latencyMs: check.latencyMs,
				server: check.server,
				checkedAt: check.checkedAt.getTime(),
			})),
		},
	};
}

// Alias for backward compatibility
export const getRealDebridObservabilityStats = getRealDebridObservabilityStatsFromDb;

export const __testing = {
	resetState() {
		// No-op: MySQL state is managed by the database
	},
};
