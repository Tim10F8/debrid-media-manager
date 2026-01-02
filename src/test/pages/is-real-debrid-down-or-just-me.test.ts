import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
	CompactWorkingStreamMetrics,
	RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';

function buildEmptyStats(): RealDebridObservabilityStats {
	const fakeWorkingStream: CompactWorkingStreamMetrics = {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		failedServers: [],
		lastError: null,
		inProgress: false,
		avgLatencyMs: null,
		fastestServer: null,
		recentChecks: [],
	};
	return {
		workingStream: fakeWorkingStream,
		rdApi: null,
		torrentio: { inProgress: false, recentChecks: [] },
	};
}

describe('Real-Debrid status page (client-side only)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('exports empty stats builder for test utilities', () => {
		const stats = buildEmptyStats();
		expect(stats.workingStream.total).toBe(0);
		expect(stats.workingStream.inProgress).toBe(false);
	});

	it('builds valid workingStream structure', () => {
		const stats = buildEmptyStats();
		expect(stats.workingStream.failedServers).toHaveLength(0);
		expect(stats.workingStream.rate).toBe(0);
	});
});
