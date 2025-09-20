import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RealDebridObservabilityStats } from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats, RealDebridOperation } from '@/lib/observability/rdOperationalStats';
import type { WorkingStreamMetrics } from '@/lib/observability/streamServersHealth';
import RealDebridStatusPage from '@/pages/is-real-debrid-down-or-just-me';

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

function buildWorkingStream(): WorkingStreamMetrics {
	return {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		statuses: [],
		lastError: null,
		inProgress: false,
	};
}

const baseStats: RealDebridObservabilityStats = {
	totalTracked: 0,
	successCount: 0,
	failureCount: 0,
	considered: 0,
	successRate: 0,
	lastTs: null,
	isDown: false,
	monitoredOperations: operations,
	byOperation: buildEmptyByOperation(),
	windowSize: 10_000,
	workingStream: buildWorkingStream(),
};

type GlobalWithFetch = typeof globalThis & {
	fetch?: typeof fetch;
};

const globalWithFetch = globalThis as GlobalWithFetch;

const originalFetch = globalWithFetch.fetch;

function setMockFetch(mockImpl: ReturnType<typeof vi.fn>) {
	globalWithFetch.fetch = mockImpl as unknown as typeof fetch;
}

describe('RealDebridStatusPage client refresh', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		if (originalFetch) {
			globalWithFetch.fetch = originalFetch;
		} else {
			Reflect.deleteProperty(globalWithFetch, 'fetch');
		}
	});

	it('requests verbose stats during client refresh', async () => {
		const resolvedStats = { ...baseStats };
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(resolvedStats),
		});
		setMockFetch(mockFetch);

		render(<RealDebridStatusPage stats={baseStats} />);

		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

		const requestUrl = mockFetch.mock.calls[0][0];
		expect(typeof requestUrl).toBe('string');
		const parsedUrl = new URL(requestUrl as string, 'https://example.com');
		expect(parsedUrl.searchParams.get('verbose')).toBe('true');
		expect(parsedUrl.searchParams.get('_t')).not.toBeNull();
	});

	it('attaches a mock fetch when none exists', async () => {
		Reflect.deleteProperty(globalWithFetch, 'fetch');
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(baseStats),
		});
		setMockFetch(mockFetch);
		expect(globalWithFetch.fetch).toBe(mockFetch as unknown as typeof fetch);

		render(<RealDebridStatusPage stats={baseStats} />);

		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
	});
	it('logs when the refresh payload is invalid', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ not: 'expected' }),
		});
		setMockFetch(mockFetch);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<RealDebridStatusPage stats={baseStats} />);

		await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

		const payloadLog = consoleError.mock.calls.find(
			([message]) => message === 'Received invalid Real-Debrid stats payload'
		);
		expect(payloadLog).toBeTruthy();
	});
});
