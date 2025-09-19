import { afterEach, describe, expect, it, vi } from 'vitest';

import * as combined from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import type { WorkingStreamMetrics } from '@/lib/observability/streamServersHealth';
import { getServerSideProps } from '@/pages/is-real-debrid-down-or-just-me';

const operations: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
];

function buildEmptyByOperation(): Record<RealDebridOperation, OperationStats> {
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
			};
			return acc;
		},
		{} as Record<RealDebridOperation, OperationStats>
	);
}

describe('Real-Debrid status page caching', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('marks the SSR response as non-cacheable', async () => {
		const fakeWorkingStream: WorkingStreamMetrics = {
			total: 0,
			working: 0,
			rate: 0,
			lastChecked: null,
			statuses: [],
			lastError: null,
			inProgress: false,
		};
		const fakeStats: ReturnType<typeof combined.getRealDebridObservabilityStats> = {
			totalTracked: 0,
			successCount: 0,
			failureCount: 0,
			considered: 0,
			successRate: 0,
			lastTs: null,
			isDown: false,
			monitoredOperations: [],
			byOperation: buildEmptyByOperation(),
			windowSize: 0,
			workingStream: fakeWorkingStream,
		};
		vi.spyOn(combined, 'getRealDebridObservabilityStats').mockReturnValue(fakeStats);
		const setHeader = vi.fn();
		const result = await getServerSideProps({
			req: {} as any,
			res: { setHeader } as any,
			params: {},
			query: {},
			resolvedUrl: '/is-real-debrid-down-or-just-me',
			locales: undefined,
			locale: undefined,
			defaultLocale: undefined,
		} as any);

		expect(setHeader).toHaveBeenCalledWith(
			'Cache-Control',
			'private, no-store, no-cache, must-revalidate'
		);
		expect(setHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store');
		expect(setHeader).toHaveBeenCalledWith('Vercel-CDN-Cache-Control', 'no-store');
		expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
		expect(setHeader).toHaveBeenCalledWith('Expires', '0');
		expect(result).toEqual({ props: { stats: fakeStats } });
		expect(fakeStats.workingStream.inProgress).toBe(false);
	});
});
