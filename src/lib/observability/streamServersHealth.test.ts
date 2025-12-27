import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRealDebridObservabilityStats } from './getRealDebridObservabilityStats';
import { __testing } from './streamServersHealth';

// Mock the repository to prevent actual database calls
vi.mock('@/services/repository', () => ({
	repository: {
		upsertStreamHealthResults: vi.fn().mockResolvedValue(undefined),
		getStreamHealthMetrics: vi.fn().mockResolvedValue({
			total: 0,
			working: 0,
			rate: 0,
			lastChecked: null,
			avgLatencyMs: null,
			fastestServer: null,
			failedServers: [],
		}),
		getAllStreamStatuses: vi.fn().mockResolvedValue([]),
		recordStreamHealthSnapshot: vi.fn().mockResolvedValue(undefined),
		recordServerReliability: vi.fn().mockResolvedValue(undefined),
	},
}));

type MockHeaders = Record<string, string>;

function mockResponse(status: number, headers: MockHeaders = {}) {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key.toLowerCase()] = value;
	}
	return {
		status,
		headers: {
			get(name: string) {
				return normalized[name.toLowerCase()] ?? null;
			},
		},
	} as unknown as Response;
}

// 206 Partial Content is the expected response for Range requests
function mockPartialContentResponse(headers: MockHeaders = {}) {
	return mockResponse(206, { 'content-length': '1', ...headers });
}

describe('streamServersHealth', () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		__testing.reset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
		__testing.reset();
	});

	it('generates correct server list (1-120 on both domains with IPv4 variants)', () => {
		const servers = __testing.getServerList();

		// Should have 120 servers on each domain, plus 120 IPv4 variants for .download.real-debrid.com
		// Total: 120 * 2 (both domains) + 120 (-4 variants) = 360
		expect(servers.length).toBe(360);

		// Check first few servers
		expect(servers[0]).toEqual({
			id: '1.download.real-debrid.com',
			host: '1.download.real-debrid.com',
		});
		expect(servers[1]).toEqual({
			id: '1-4.download.real-debrid.com',
			host: '1-4.download.real-debrid.com',
		});
		expect(servers[2]).toEqual({
			id: '1.download.real-debrid.cloud',
			host: '1.download.real-debrid.cloud',
		});

		// Check last server
		const lastServer = servers[servers.length - 1];
		expect(lastServer.host).toContain('120');
	});

	it('reports working stream percentage after a run', async () => {
		// All requests succeed with 206 Partial Content (Range request response)
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();

		// 360 servers * 3 iterations each = 1080 calls
		expect(fetchMock).toHaveBeenCalled();
		expect(metrics.total).toBe(360);
		expect(metrics.working).toBe(360);
		expect(metrics.rate).toBe(1);
		expect(metrics.lastError).toBeNull();
		expect(metrics.statuses).toHaveLength(360);
	});

	it('uses correct test URL format', async () => {
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		const requestedUrls = fetchMock.mock.calls.map(([arg]) =>
			typeof arg === 'string' ? arg : ((arg as { url?: string })?.url ?? String(arg ?? ''))
		);

		// Filter to only speedtest URLs (exclude host existence check URLs)
		const speedtestUrls = requestedUrls.filter((url) => url.includes('/speedtest/'));

		// Speedtest URLs should contain /speedtest/test.rar path (fallback when no token)
		speedtestUrls.slice(0, 10).forEach((url) => {
			expect(url).toContain('/speedtest/test.rar');
		});
	});

	it('measures latency and reports fastest server', async () => {
		let callOrder = 0;
		const fetchMock = vi.fn(async () => {
			callOrder++;
			// Simulate different latencies by varying response time
			await new Promise((resolve) => setTimeout(resolve, callOrder % 5));
			return mockPartialContentResponse();
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();

		expect(metrics.avgLatencyMs).not.toBeNull();
		expect(metrics.avgLatencyMs).toBeGreaterThan(0);
		expect(metrics.fastestServer).not.toBeNull();
		expect(typeof metrics.fastestServer).toBe('string');
	});

	it('connects working stream metrics to getStats', async () => {
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();
		const stats = getRealDebridObservabilityStats();

		expect(stats.workingStream.total).toBe(360);
		expect(stats.workingStream.working).toBe(360);
		expect(stats.workingStream.rate).toBe(1);
		expect(stats.workingStream.lastError).toBeNull();
		expect(stats.workingStream.avgLatencyMs).not.toBeNull();
		expect(stats.workingStream.fastestServer).not.toBeNull();
	});

	it('sorts servers by latency (fastest first)', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			// Make some servers faster than others based on their number
			const serverNum = parseInt(url.match(/\/(\d+)[\.-]/)?.[1] ?? '0');
			await new Promise((resolve) => setTimeout(resolve, serverNum % 10));
			return mockPartialContentResponse();
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();

		// Working servers should be first
		const workingServers = metrics.statuses.filter((s) => s.ok);
		expect(workingServers.length).toBe(metrics.working);

		// Latencies should be in ascending order for working servers
		for (let i = 1; i < workingServers.length; i++) {
			expect(workingServers[i].latencyMs).toBeGreaterThanOrEqual(
				workingServers[i - 1].latencyMs ?? 0
			);
		}
	});

	it('handles timeout errors gracefully', async () => {
		const fetchMock = vi.fn(async () => {
			// Simulate a timeout by aborting
			const error = new Error('The operation was aborted');
			error.name = 'AbortError';
			throw error;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();

		expect(metrics.working).toBe(0);
		expect(metrics.rate).toBe(0);
		// All statuses should have a Timeout error
		expect(metrics.statuses.every((s) => s.error === 'Timeout')).toBe(true);
	});

	it('handles network errors gracefully', async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error('Network error');
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();

		expect(metrics.working).toBe(0);
		expect(metrics.rate).toBe(0);
		expect(metrics.statuses.every((s) => s.error === 'Network error')).toBe(true);
	});
});
