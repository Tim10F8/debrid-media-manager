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

const FAKE_SERVERS_TXT = `generated|1771782250
20-4.download.real-debrid.com|185.126.33.1
20-6.download.real-debrid.com|2a10:13c0:da7a:1::1
akl1-4.download.real-debrid.com|79.127.173.209
akl1-6.download.real-debrid.com|2a02:6ea0:901::10
chi1-4.download.real-debrid.com|212.102.58.113
chi1-6.download.real-debrid.com|2a02:6ea0:c644::113
chi2-4.download.real-debrid.com|212.102.58.114
chi2-6.download.real-debrid.com|2a02:6ea0:c644::114
chi3-4.download.real-debrid.com|212.102.58.120
lax1-4.download.real-debrid.com|143.244.49.161
lax1-6.download.real-debrid.com|2a02:6ea0:c867::161
lax2-4.download.real-debrid.com|143.244.49.162
tyo1-4.download.real-debrid.com|143.244.40.65
tyo1-6.download.real-debrid.com|2a02:6ea0:d34b::65`;
// After filtering: skip IPv6 (-6), skip numeric (20-4), pick lowest per location
// Result: akl1-4, chi1-4, lax1-4, tyo1-4 = 4 servers

function mockResponse(status: number, headers: MockHeaders = {}, body?: object | string) {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key.toLowerCase()] = value;
	}
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get(name: string) {
				return normalized[name.toLowerCase()] ?? null;
			},
		},
		json: typeof body === 'object' ? () => Promise.resolve(body) : undefined,
		text: typeof body === 'string' ? () => Promise.resolve(body) : undefined,
	} as unknown as Response;
}

function mockUnrestrictResponse(location: string) {
	return mockResponse(
		200,
		{},
		{
			download: `https://${location}.download.real-debrid.com/d/TESTID/test.mkv`,
		}
	);
}

function mockPartialContentResponse(headers: MockHeaders = {}) {
	return mockResponse(206, { 'content-length': '1', ...headers });
}

function mockServerListResponse() {
	return mockResponse(200, {}, FAKE_SERVERS_TXT);
}

function createFetchMock(options?: { downloadFails?: boolean; unrestrictFails?: boolean }) {
	return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
		// Server list fetch
		if (url.includes('supabase.co')) {
			return mockServerListResponse();
		}
		// Unrestrict API call
		if (url.includes('/unrestrict/link')) {
			if (options?.unrestrictFails) {
				return mockResponse(403, {});
			}
			return mockUnrestrictResponse('test');
		}
		// Download Range request
		if (options?.downloadFails) {
			throw new Error('Connection refused');
		}
		return mockPartialContentResponse();
	});
}

describe('streamServersHealth', () => {
	let originalFetch: typeof fetch;
	const originalEnv = process.env.REALDEBRID_KEY;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		process.env.REALDEBRID_KEY = 'test-token';
		__testing.reset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env.REALDEBRID_KEY = originalEnv;
		vi.clearAllMocks();
		__testing.reset();
	});

	it('fetches and parses server list, filtering to IPv4 location servers and picking lowest per location', async () => {
		globalThis.fetch = createFetchMock() as unknown as typeof fetch;

		const servers = await __testing.fetchServers();
		const hosts = servers.map((s) => s.host);

		// Should pick lowest instance per location, IPv4 only, no numeric servers
		expect(servers.length).toBe(4);
		expect(hosts).toContain('akl1-4.download.real-debrid.com');
		expect(hosts).toContain('chi1-4.download.real-debrid.com');
		expect(hosts).toContain('lax1-4.download.real-debrid.com');
		expect(hosts).toContain('tyo1-4.download.real-debrid.com');

		// Should NOT include numeric servers, IPv6, or higher instances
		expect(hosts).not.toContain('20-4.download.real-debrid.com');
		expect(hosts).not.toContain('chi2-4.download.real-debrid.com');
		expect(hosts).not.toContain('chi3-4.download.real-debrid.com');
		expect(hosts).not.toContain('lax2-4.download.real-debrid.com');
	});

	it('persists results to database after a run', async () => {
		const { repository } = await import('@/services/repository');
		globalThis.fetch = createFetchMock() as unknown as typeof fetch;

		await __testing.runNow();

		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		expect(repository.recordStreamHealthSnapshot).toHaveBeenCalled();
		expect(repository.recordServerReliability).toHaveBeenCalled();
		expect(repository.recordStreamCheckResult).toHaveBeenCalled();
	}, 30000);

	it('calls unrestrict API with server IP and then tests download URL', async () => {
		const fetchMock = createFetchMock();
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// 1 server list fetch + 4 unrestrict calls + 4 Range request calls = 9 total
		expect(fetchMock).toHaveBeenCalledTimes(9);

		// Verify unrestrict calls include ip parameter
		const unrestrictCalls = fetchMock.mock.calls.filter((call) =>
			(call[0] as string).includes('/unrestrict/link')
		);
		expect(unrestrictCalls.length).toBe(4);
		for (const [, init] of unrestrictCalls) {
			const body = init?.body as string;
			expect(body).toContain('ip=');
		}
	}, 30000);

	it('handles unrestrict failure gracefully', async () => {
		const { repository } = await import('@/services/repository');
		const fetchMock = createFetchMock({ unrestrictFails: true });
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		// Should still record results (all failed)
		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		// 1 server list + 4 unrestrict calls (no download calls since unrestrict failed)
		expect(fetchMock).toHaveBeenCalledTimes(5);
	}, 30000);

	it('handles download failure gracefully', async () => {
		const { repository } = await import('@/services/repository');
		const fetchMock = createFetchMock({ downloadFails: true });
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		expect(repository.upsertStreamHealthResults).toHaveBeenCalled();
		// All servers should be recorded as failed
		const calls = (repository.recordStreamHealthSnapshot as ReturnType<typeof vi.fn>).mock
			.calls;
		expect(calls[0][0].workingServers).toBe(0);
	}, 30000);

	it('skips health check when REALDEBRID_KEY is not set', async () => {
		delete process.env.REALDEBRID_KEY;

		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
