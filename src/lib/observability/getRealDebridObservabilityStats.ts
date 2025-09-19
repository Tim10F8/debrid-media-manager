import { getStats } from './rdOperationalStats';
import { getWorkingStreamMetrics } from './streamServersHealth';

export function getRealDebridObservabilityStats() {
	const core = getStats();
	return {
		...core,
		workingStream: getWorkingStreamMetrics(),
	};
}

export type RealDebridObservabilityStats = ReturnType<typeof getRealDebridObservabilityStats>;
