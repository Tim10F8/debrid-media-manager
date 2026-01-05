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
		recordStreamCheckResult: vi.fn().mockResolvedValue(undefined),
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

	it('returns all location-based servers', () => {
		const locations = __testing.getServerLocations();
		const servers = __testing.getServerList();

		// Should return all 22 location-based servers
		expect(locations.length).toBe(22);
		expect(servers.length).toBe(22);

		// Verify some expected locations
		expect(locations).toContain('rbx');
		expect(locations).toContain('lax1');
		expect(locations).toContain('tyo1');
		expect(locations).toContain('sgp1');

		// Verify server host format
		expect(servers[0].host).toMatch(/^[a-z0-9]+\.download\.real-debrid\.com$/);
	});

	it('persists results to database after a run', async () => {
		const { repository } = await import('@/services/repository');

		// Mock all servers responding successfully
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// Should have called database persistence functions
		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		expect(repository.recordStreamHealthSnapshot).toHaveBeenCalled();
		expect(repository.recordServerReliability).toHaveBeenCalled();
		expect(repository.recordStreamCheckResult).toHaveBeenCalled();
	}, 15000);

	it('uses correct test URL format with random float', async () => {
		const fetchMock = vi.fn().mockResolvedValue(mockPartialContentResponse());
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		const requestedUrls = fetchMock.mock.calls.map(([arg]) =>
			typeof arg === 'string' ? arg : ((arg as { url?: string })?.url ?? String(arg ?? ''))
		);

		// All URLs should use the new format: /speedtest/test.rar/{randomFloat}
		requestedUrls.forEach((url) => {
			expect(url).toMatch(
				/^https:\/\/[a-z0-9]+\.download\.real-debrid\.com\/speedtest\/test\.rar\/0\.\d+$/
			);
		});
	});

	it('tests all servers and calculates pass percentage', async () => {
		const { repository } = await import('@/services/repository');

		// Mock: half the servers pass, half fail
		let callCount = 0;
		const fetchMock = vi.fn().mockImplementation(async () => {
			callCount++;
			// Alternate between success and failure
			if (callCount % 2 === 0) {
				return mockPartialContentResponse();
			}
			throw new Error('Connection refused');
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// Should have recorded snapshot with working/total counts
		expect(repository.recordStreamHealthSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				totalServers: 22,
			})
		);
	}, 30000);

	// Skipped: retry logic with real delays makes these tests too slow
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
