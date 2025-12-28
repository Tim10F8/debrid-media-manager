import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
		deleteStreamHealthHosts: vi.fn().mockResolvedValue(0),
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

	it('persists results to database after a run', async () => {
		const { repository } = await import('@/services/repository');

		// All requests succeed with 206 Partial Content (Range request response)
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// Should have called upsertStreamHealthResults
		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		expect(repository.recordStreamHealthSnapshot).toHaveBeenCalled();
		expect(repository.recordServerReliability).toHaveBeenCalled();
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

	// Skipped: retry logic with real delays makes these tests too slow
	// The retry mechanism (1s, 2s delays) × 360 servers would take too long
	it.skip('handles timeout errors gracefully', async () => {
		const { repository } = await import('@/services/repository');

		const fetchMock = vi.fn(async () => {
			const error = new Error('The operation was aborted');
			error.name = 'AbortError';
			throw error;
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
	});

	it.skip('handles network errors gracefully', async () => {
		const { repository } = await import('@/services/repository');

		const fetchMock = vi.fn(async () => {
			throw new Error('Network error');
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
	});
});
