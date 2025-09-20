import { getStats } from './rdOperationalStats';
import { getCompactWorkingStreamMetrics, getWorkingStreamMetrics } from './streamServersHealth';

export function getRealDebridObservabilityStats() {
	const core = getStats();
	return {
		...core,
		workingStream: getWorkingStreamMetrics(),
	};
}

export function getCompactRealDebridObservabilityStats() {
	const core = getStats();
	const streamMetrics = getCompactWorkingStreamMetrics();

	const compactByOperation = Object.entries(core.byOperation).reduce(
		(acc, [key, value]) => {
			acc[key] = {
				successRate: value.successRate,
				lastTs: value.lastTs,
			};
			return acc;
		},
		{} as Record<string, { successRate: number; lastTs: number | null }>
	);

	return {
		successRate: core.successRate,
		lastTs: core.lastTs,
		isDown: core.isDown,
		byOperation: compactByOperation,
		workingStream: streamMetrics,
	};
}

export type RealDebridObservabilityStats = ReturnType<typeof getRealDebridObservabilityStats>;
export type CompactRealDebridObservabilityStats = ReturnType<
	typeof getCompactRealDebridObservabilityStats
>;
