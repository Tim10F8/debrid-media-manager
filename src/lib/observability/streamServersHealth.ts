// Stream server health check module using zurg-style network testing.
// Tests Real-Debrid download servers 1-120 on both domains with latency measurement.
// Persists results to MySQL for cross-replica consistency.

import { repository } from '@/services/repository';

const GLOBAL_KEY = '__DMM_STREAM_HEALTH__';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 5000;
const ITERATIONS_PER_SERVER = 3;
const MAX_SERVER_NUMBER = 120;
const DOMAINS = ['download.real-debrid.com', 'download.real-debrid.cloud'] as const;
const TEST_PATH = '/speedtest/test.rar';

export interface WorkingStreamServerStatus {
	id: string;
	url: string;
	status: number | null;
	contentLength: number | null;
	ok: boolean;
	checkedAt: number;
	error: string | null;
	latencyMs: number | null;
}

interface WorkingStreamMetricsInternal {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	statuses: WorkingStreamServerStatus[];
	lastError: string | null;
	inProgress: boolean;
	avgLatencyMs: number | null;
	fastestServer: string | null;
}

interface StreamHealthState {
	metrics: WorkingStreamMetricsInternal;
	interval?: NodeJS.Timeout;
	runPromise: Promise<void> | null;
}

type StreamHealthGlobalKey = typeof GLOBAL_KEY;
type StreamHealthGlobal = typeof globalThis & {
	[K in StreamHealthGlobalKey]?: StreamHealthState;
};

function getGlobalStore(): StreamHealthGlobal {
	return globalThis as StreamHealthGlobal;
}

export interface WorkingStreamMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	statuses: WorkingStreamServerStatus[];
	lastError: string | null;
	inProgress: boolean;
	avgLatencyMs: number | null;
	fastestServer: string | null;
}

/**
 * Generates all server hostnames to test (1-120 on both domains).
 * Also includes IPv4 variants (-4) for .download.real-debrid.com servers.
 */
function generateServerHosts(): Array<{ id: string; host: string }> {
	const servers: Array<{ id: string; host: string }> = [];

	for (let i = 1; i <= MAX_SERVER_NUMBER; i++) {
		for (const domain of DOMAINS) {
			const host = `${i}.${domain}`;
			servers.push({ id: host, host });

			// Add IPv4-specific variant for .download.real-debrid.com
			if (domain === 'download.real-debrid.com') {
				const ipv4Host = `${i}-4.${domain}`;
				servers.push({ id: ipv4Host, host: ipv4Host });
			}
		}
	}

	return servers;
}

/**
 * Builds a test URL with a random cache buster like zurg does.
 */
function buildTestUrl(host: string): string {
	const randomFloat = Math.random();
	return `https://${host}${TEST_PATH}/${randomFloat}`;
}

/**
 * Tests a single server's latency by making HEAD requests.
 * Makes multiple iterations and returns the average latency.
 */
async function testServerLatency(server: {
	id: string;
	host: string;
}): Promise<WorkingStreamServerStatus> {
	const checkedAt = Date.now();
	let totalLatencyMs = 0;
	let successfulIterations = 0;
	let lastStatus: number | null = null;
	let lastContentLength: number | null = null;
	let lastError: string | null = null;

	for (let i = 0; i < ITERATIONS_PER_SERVER; i++) {
		const testUrl = buildTestUrl(server.host);
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const startTime = performance.now();
			const response = await fetch(testUrl, {
				method: 'HEAD',
				signal: controller.signal,
			});
			const endTime = performance.now();

			clearTimeout(timeoutId);
			lastStatus = response.status;

			const header = response.headers.get('content-length');
			lastContentLength = header ? Number(header) : null;

			if (response.status === 200) {
				if (lastContentLength !== null && lastContentLength > 0) {
					totalLatencyMs += endTime - startTime;
					successfulIterations++;
				} else {
					lastError = 'Missing or invalid Content-Length';
				}
			} else {
				lastError = `HTTP ${response.status}`;
			}
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					lastError = 'Timeout';
				} else {
					lastError = error.message;
				}
			} else {
				lastError = 'Unknown error';
			}
			// Don't continue iterations if we hit an error
			break;
		}
	}

	const ok = successfulIterations === ITERATIONS_PER_SERVER;
	const avgLatencyMs = ok ? totalLatencyMs / ITERATIONS_PER_SERVER : null;

	return {
		id: server.id,
		url: `https://${server.host}${TEST_PATH}`,
		status: lastStatus,
		contentLength: lastContentLength,
		ok,
		checkedAt,
		error: ok ? null : lastError,
		latencyMs: avgLatencyMs,
	};
}

/**
 * Runs the network test against all Real-Debrid download servers.
 * Tests servers in parallel with a limited concurrency pool.
 */
async function inspectServers(): Promise<WorkingStreamServerStatus[]> {
	const servers = generateServerHosts();
	const results: WorkingStreamServerStatus[] = [];

	// Process hosts in batches with limited concurrency
	let index = 0;

	async function processNext(): Promise<void> {
		while (index < servers.length) {
			const currentIndex = index++;
			const server = servers[currentIndex];
			const result = await testServerLatency(server);
			results.push(result);
		}
	}

	// Start worker pool
	const workers = Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, servers.length) }, () =>
		processNext()
	);

	await Promise.all(workers);

	// Sort by latency (working servers first, then by latency ascending)
	results.sort((a, b) => {
		if (a.ok && !b.ok) return -1;
		if (!a.ok && b.ok) return 1;
		if (a.ok && b.ok) {
			return (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity);
		}
		return 0;
	});

	return results;
}

function getStore(): StreamHealthState {
	const g = getGlobalStore();
	if (!g[GLOBAL_KEY]) {
		const metrics: WorkingStreamMetricsInternal = {
			total: 0,
			working: 0,
			rate: 0,
			lastChecked: null,
			statuses: [],
			lastError: null,
			inProgress: false,
			avgLatencyMs: null,
			fastestServer: null,
		};
		g[GLOBAL_KEY] = {
			metrics,
			runPromise: null,
		};
		scheduleJobs(g[GLOBAL_KEY]!);
	}
	return g[GLOBAL_KEY]!;
}

function scheduleJobs(state: StreamHealthState) {
	const run = () => {
		const promise = executeCheck(state);
		promise.catch(() => {});
		return promise;
	};
	run();
	state.interval = setInterval(run, REFRESH_INTERVAL_MS);
	if (typeof state.interval.unref === 'function') {
		state.interval.unref();
	}
}

function executeCheck(state: StreamHealthState): Promise<void> {
	if (state.runPromise) {
		return state.runPromise;
	}
	const promise = (async () => {
		state.metrics.inProgress = true;
		try {
			const statuses = await inspectServers();
			const workingServers = statuses.filter((status) => status.ok);
			const working = workingServers.length;

			// Calculate average latency of working servers
			let avgLatencyMs: number | null = null;
			if (workingServers.length > 0) {
				const totalLatency = workingServers.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0);
				avgLatencyMs = totalLatency / workingServers.length;
			}

			// Get fastest server
			const fastestServer = workingServers[0]?.id ?? null;

			state.metrics.statuses = statuses;
			state.metrics.total = statuses.length;
			state.metrics.working = working;
			state.metrics.rate = statuses.length > 0 ? working / statuses.length : 0;
			state.metrics.lastChecked = Date.now();
			state.metrics.lastError = null;
			state.metrics.avgLatencyMs = avgLatencyMs;
			state.metrics.fastestServer = fastestServer;

			// Persist to MySQL for cross-replica consistency (fire-and-forget)
			const dbResults = statuses.map((s) => ({
				host: s.id,
				status: s.status,
				latencyMs: s.latencyMs,
				ok: s.ok,
				error: s.error,
				checkedAt: new Date(s.checkedAt),
			}));
			repository.upsertStreamHealthResults(dbResults).catch((error) => {
				console.error('Failed to persist stream health to MySQL:', error);
			});

			// Record to history for 90-day tracking (fire-and-forget)
			const failedServers = statuses.filter((s) => !s.ok).map((s) => s.id);
			const minLatencyMs =
				workingServers.length > 0
					? Math.min(...workingServers.map((s) => s.latencyMs ?? Infinity))
					: null;
			const maxLatencyMs =
				workingServers.length > 0
					? Math.max(...workingServers.map((s) => s.latencyMs ?? 0))
					: null;

			repository
				.recordStreamHealthSnapshot({
					totalServers: statuses.length,
					workingServers: working,
					avgLatencyMs,
					minLatencyMs: minLatencyMs === Infinity ? null : minLatencyMs,
					maxLatencyMs,
					fastestServer,
					failedServers,
				})
				.catch((error) => {
					console.error('Failed to record stream health snapshot:', error);
				});

			// Record per-server reliability (fire-and-forget)
			repository
				.recordServerReliability(
					statuses.map((s) => ({
						host: s.id,
						ok: s.ok,
						latencyMs: s.latencyMs,
					}))
				)
				.catch((error) => {
					console.error('Failed to record server reliability:', error);
				});
		} catch (error) {
			state.metrics.statuses = [];
			state.metrics.total = 0;
			state.metrics.working = 0;
			state.metrics.rate = 0;
			state.metrics.lastChecked = Date.now();
			state.metrics.lastError =
				error instanceof Error ? error.message : 'Failed to evaluate stream servers';
			state.metrics.avgLatencyMs = null;
			state.metrics.fastestServer = null;
		}
	})().finally(() => {
		state.metrics.inProgress = false;
		state.runPromise = null;
	});
	state.runPromise = promise;
	return promise;
}

function clearState() {
	const g = getGlobalStore();
	const current = g[GLOBAL_KEY];
	if (current?.interval) {
		clearInterval(current.interval);
	}
	g[GLOBAL_KEY] = undefined;
}

export function getWorkingStreamMetrics(): WorkingStreamMetrics {
	const state = getStore();
	return {
		total: state.metrics.total,
		working: state.metrics.working,
		rate: state.metrics.rate,
		lastChecked: state.metrics.lastChecked,
		statuses: state.metrics.statuses.map((status) => ({ ...status })),
		lastError: state.metrics.lastError,
		inProgress: state.metrics.inProgress,
		avgLatencyMs: state.metrics.avgLatencyMs,
		fastestServer: state.metrics.fastestServer,
	};
}

export interface CompactWorkingStreamMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	failedServers: string[];
	lastError: string | null;
	inProgress: boolean;
	avgLatencyMs: number | null;
	fastestServer: string | null;
}

export function getCompactWorkingStreamMetrics(): CompactWorkingStreamMetrics {
	const state = getStore();
	const failedServers = state.metrics.statuses
		.filter((status) => !status.ok)
		.map((status) => status.id);

	return {
		total: state.metrics.total,
		working: state.metrics.working,
		rate: state.metrics.rate,
		lastChecked: state.metrics.lastChecked,
		failedServers,
		lastError: state.metrics.lastError,
		inProgress: state.metrics.inProgress,
		avgLatencyMs: state.metrics.avgLatencyMs,
		fastestServer: state.metrics.fastestServer,
	};
}

/**
 * Gets stream health metrics from MySQL database for cross-replica consistency.
 * Use this for the API endpoint to get consolidated stats from all replicas.
 */
export function getStreamMetricsFromDb() {
	return repository.getStreamHealthMetrics();
}

/**
 * Gets all stream statuses from MySQL database.
 */
export function getStreamStatusesFromDb() {
	return repository.getAllStreamStatuses();
}

export const __testing = {
	reset() {
		clearState();
	},
	async runNow() {
		const state = getStore();
		await executeCheck(state);
		return getWorkingStreamMetrics();
	},
	// Expose for testing: generate server list without running tests
	getServerList() {
		return generateServerHosts();
	},
};
