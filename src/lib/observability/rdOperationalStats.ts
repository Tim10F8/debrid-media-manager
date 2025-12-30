// Thin wrapper around the repository for recording RD API operations.
// Provides fire-and-forget functions for use in realDebrid.ts and anticors.ts.

import { repository } from '@/services/repository';

export type {
	RdOperationStats,
	RdOverallStats,
	RealDebridOperation,
} from '@/services/database/rdOperational';

export { resolveRealDebridOperation } from '@/services/database/rdOperational';

/**
 * Records a Real-Debrid API operation event.
 * This is a fire-and-forget operation - errors are logged but not thrown.
 * Only runs on server-side (not in browser).
 */
export function recordRdOperationEvent(
	operation: Parameters<typeof repository.recordRdOperation>[0],
	status: number
): void {
	// Only record on server-side
	if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
		return;
	}

	// Fire-and-forget
	repository.recordRdOperation(operation, status).catch((error) => {
		console.error('Failed to record RD operation:', error);
	});
}

/**
 * Gets RD API stats for the last N hours.
 */
export function getRdStats(hoursBack?: number) {
	return repository.getRdStats(hoursBack);
}

/**
 * Gets hourly history for charts.
 */
export function getRdHourlyHistory(hoursBack?: number) {
	return repository.getRdHourlyHistory(hoursBack);
}
