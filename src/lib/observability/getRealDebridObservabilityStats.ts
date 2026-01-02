import { RdOverallStats } from '@/services/database/rdOperational';
import { repository } from '@/services/repository';

import { getStreamMetricsFromDb, isHealthCheckInProgress } from './streamServersHealth';
import { isTorrentioHealthCheckInProgress } from './torrentioHealth';

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

export interface TorrentioUrlCheckResult {
	url: string;
	ok: boolean;
	status: number | null;
	hasLocation: boolean;
	locationValid: boolean;
	latencyMs: number | null;
	error: string | null;
}

export interface TorrentioCheckResult {
	ok: boolean;
	latencyMs: number | null;
	error: string | null;
	urls: TorrentioUrlCheckResult[];
	checkedAt: number;
}

export interface TorrentioHealthMetrics {
	inProgress: boolean;
	recentChecks: TorrentioCheckResult[];
}

export interface RealDebridObservabilityStats {
	workingStream: CompactWorkingStreamMetrics;
	rdApi: RdOverallStats | null;
	torrentio: TorrentioHealthMetrics | null;
}

/**
 * Gets Real-Debrid stream health stats from MySQL database.
 */
export async function getRealDebridObservabilityStatsFromDb(): Promise<RealDebridObservabilityStats> {
	const [streamMetrics, recentChecks, rdStats, torrentioChecks] = await Promise.all([
		getStreamMetricsFromDb(),
		repository.getRecentStreamChecks(5),
		repository.getRdStats(1),
		repository.getRecentTorrentioChecks(5),
	]);

	return {
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
		rdApi: rdStats,
		torrentio: {
			inProgress: isTorrentioHealthCheckInProgress(),
			recentChecks: torrentioChecks.map((check) => ({
				ok: check.ok,
				latencyMs: check.latencyMs,
				error: check.error,
				urls: check.urls,
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
