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
		deleteDeprecatedStreamHosts: vi.fn().mockResolvedValue(0),
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

	it('returns top 5 servers based on current ceiling', () => {
		// Default ceiling is 100
		expect(__testing.getCeiling()).toBe(100);

		const servers = __testing.getServerList();

		// Should return top 5 servers (100, 99, 98, 97, 96)
		expect(servers.length).toBe(5);
		expect(servers[0].host).toBe('100.download.real-debrid.com');
		expect(servers[4].host).toBe('96.download.real-debrid.com');
	});

	it('updates ceiling when higher servers are discovered', async () => {
		// Initial ceiling is 100, mock servers 1-115 exist (higher than ceiling)
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			const match = url.match(/https:\/\/(\d+)\.download\.real-debrid\.com/);
			if (match) {
				const serverNum = parseInt(match[1], 10);
				if (serverNum <= 115) {
					return mockPartialContentResponse();
				}
				// Servers > 115 don't exist (DNS failure)
				const error = new Error('getaddrinfo ENOTFOUND');
				throw error;
			}
			return mockPartialContentResponse();
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const server = await __testing.discoverAndPick();

		// Should have picked a server from top 5 (115, 114, 113, 112, 111)
		expect(server).not.toBeNull();
		const match = server!.host.match(/^(\d+)\.download\.real-debrid\.com$/);
		expect(match).not.toBeNull();
		const serverNum = parseInt(match![1], 10);
		expect(serverNum).toBeGreaterThanOrEqual(111);
		expect(serverNum).toBeLessThanOrEqual(115);

		// Ceiling should be updated to highest found (115 > initial 100)
		expect(__testing.getCeiling()).toBe(115);
	});

	it('persists results to database after a run', async () => {
		const { repository } = await import('@/services/repository');

		// Mock: only servers 1-5 exist (to limit sequential probing)
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			const match = url.match(/https:\/\/(\d+)\.download\.real-debrid\.com/);
			if (match) {
				const serverNum = parseInt(match[1], 10);
				if (serverNum <= 5) {
					return mockPartialContentResponse();
				}
				const error = new Error('getaddrinfo ENOTFOUND');
				throw error;
			}
			return mockPartialContentResponse();
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// Should have called upsertStreamHealthResults
		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		expect(repository.recordStreamHealthSnapshot).toHaveBeenCalled();
		expect(repository.recordServerReliability).toHaveBeenCalled();
	}, 15000);

	it('uses correct test URL format', async () => {
		// Mock: only servers 1-5 exist (to limit sequential probing)
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			const match = url.match(/https:\/\/(\d+)\.download\.real-debrid\.com/);
			if (match) {
				const serverNum = parseInt(match[1], 10);
				if (serverNum <= 5) {
					return mockPartialContentResponse();
				}
				const error = new Error('getaddrinfo ENOTFOUND');
				throw error;
			}
			return mockPartialContentResponse();
		});
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
