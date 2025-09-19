import { promises as fs } from 'fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRealDebridObservabilityStats } from './getRealDebridObservabilityStats';
import { __testing, getWorkingStreamMetrics } from './streamServersHealth';

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
	} as any;
}

describe('streamServersHealth', () => {
	let tempFile: string;
	let originalFetch: typeof fetch;

	beforeEach(async () => {
		originalFetch = globalThis.fetch;
		tempFile = path.join(
			tmpdir(),
			`stream-servers-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
		);
		const contents = [
			'https://XX-Y.download.real-debrid.com/speedtest/test.rar/0.123456',
			'- 20-4',
			'- 21-4',
		].join('\n');
		await fs.writeFile(tempFile, `${contents}\n`, 'utf8');
		process.env.DMM_STREAM_SERVERS_FILE = tempFile;
		__testing.reset();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
		__testing.reset();
		delete process.env.DMM_STREAM_SERVERS_FILE;
		await fs.unlink(tempFile).catch(() => {});
	});

	it('reports working stream percentage after a run', async () => {
		const fetchMock = vi.fn(async (target: unknown) => {
			const url =
				typeof target === 'string'
					? target
					: ((target as { url?: string })?.url ?? String(target ?? ''));
			if (url.includes('20-4')) {
				return mockResponse(200, { 'content-length': '1024' });
			}
			return mockResponse(503, { 'content-length': '1024' });
		});
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const initial = getWorkingStreamMetrics();
		expect(initial.total).toBe(2);
		expect(initial.inProgress).toBe(true);

		const metrics = await __testing.runNow();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const requestedUrls = fetchMock.mock.calls.map(([arg]) =>
			typeof arg === 'string' ? arg : ((arg as { url?: string })?.url ?? String(arg ?? ''))
		);
		requestedUrls.forEach((url) => {
			expect(url).not.toContain('/test.rar/0.123456');
			expect(/\/test\.rar\/0\.[0-9]+/.test(url)).toBe(true);
		});
		expect(metrics.total).toBe(2);
		expect(metrics.working).toBe(1);
		expect(metrics.rate).toBeCloseTo(0.5, 5);
		expect(metrics.lastError).toBeNull();
		expect(metrics.statuses).toHaveLength(2);

		const success = metrics.statuses.find((entry) => entry.id === '20-4');
		const failure = metrics.statuses.find((entry) => entry.id === '21-4');

		expect(success?.ok).toBe(true);
		expect(success?.contentLength).toBe(1024);
		expect(failure?.ok).toBe(false);
		expect(failure?.error).toBe('Unexpected status 503');
	});

	it('connects working stream metrics to getStats', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(mockResponse(200, { 'content-length': '2048' }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();
		const stats = getRealDebridObservabilityStats();

		expect(stats.workingStream.total).toBe(2);
		expect(stats.workingStream.working).toBe(2);
		expect(stats.workingStream.rate).toBe(1);
		expect(stats.workingStream.lastError).toBeNull();
	});

	it('reloads servers from disk after reset', async () => {
		const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { 'content-length': '512' }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await __testing.runNow();
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const updated = [
			'https://XX-Y.download.real-debrid.com/speedtest/test.rar/0.123456',
			'- 21-4',
		].join('\n');
		await fs.writeFile(tempFile, `${updated}\n`, 'utf8');

		fetchMock.mockClear();
		await __testing.runNow();
		expect(fetchMock).toHaveBeenCalledTimes(2);

		__testing.reset();
		fetchMock.mockReset().mockResolvedValue(mockResponse(200, { 'content-length': '512' }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const metrics = await __testing.runNow();
		expect(metrics.total).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
