// Stream server health check module using zurg-style network testing.
// Tests Real-Debrid download servers 1-120 on both domains with latency measurement.
// All data is stored in MySQL - no in-memory caching.
// Uses actual unrestricted RD links for testing (like zurg does).

import { unrestrictLink } from '@/services/realDebrid';
import { repository } from '@/services/repository';

const GLOBAL_KEY = '__DMM_STREAM_HEALTH_SCHEDULER__';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 5000;
const ITERATIONS_PER_SERVER = 3;
const MAX_SERVER_NUMBER = 120;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000]; // 1s, then 2s between retries
const DOMAINS = ['download.real-debrid.com', 'download.real-debrid.cloud'] as const;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Hardcoded Real-Debrid links used for network testing (same as zurg)
// One of these is unrestricted to get a real download URL for testing
const NETWORK_TEST_LINKS = [
	'https://real-debrid.com/d/4LCJSAEO65WUG',
	'https://real-debrid.com/d/YC6KPSGW566IY',
	'https://real-debrid.com/d/B6MJ4JMWKZLHA',
	'https://real-debrid.com/d/UOQW5PEF24XWK',
];

// Fallback URL if unrestrict fails (e.g., no token available)
const FALLBACK_TEST_URL = 'https://1.download.real-debrid.com/speedtest/test.rar';

// Cached unrestricted download URL (only cache needed for unrestrict)
let cachedTestUrl: string | null = null;
let cachedTestUrlExpiry: number = 0;
const TEST_URL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

interface SchedulerState {
	interval?: NodeJS.Timeout;
	runPromise: Promise<void> | null;
	inProgress: boolean;
}

type SchedulerGlobalKey = typeof GLOBAL_KEY;
type SchedulerGlobal = typeof globalThis & {
	[K in SchedulerGlobalKey]?: SchedulerState;
};

function getGlobalStore(): SchedulerGlobal {
	return globalThis as SchedulerGlobal;
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
 * Attempts to unrestrict one of the network test links using the RD API.
 * Returns the full download URL if successful, null otherwise.
 */
async function unrestrictNetworkTestLink(token: string): Promise<string | null> {
	// Shuffle links randomly
	const links = [...NETWORK_TEST_LINKS].sort(() => Math.random() - 0.5);

	for (const testLink of links) {
		try {
			// Extract download code (truncate to 13 chars like zurg does)
			const code = testLink.replace('https://real-debrid.com/d/', '').slice(0, 13);
			const link = `https://real-debrid.com/d/${code}`;

			// Generate random 5-digit password
			const password = String(Math.floor(Math.random() * 90000) + 10000);
			const response = await unrestrictLink(token, link, '', true, password);
			if (response?.download) {
				console.log(`[StreamHealth] Unrestricted test link: ${response.download}`);
				return response.download;
			}
		} catch {
			// Try next link
			continue;
		}
	}

	return null;
}

/**
 * Gets the test URL to use for server testing.
 * Uses cached unrestricted URL if available, otherwise falls back to speedtest.
 */
async function getTestUrl(token?: string): Promise<string> {
	// Check if we have a valid cached URL
	if (cachedTestUrl && Date.now() < cachedTestUrlExpiry) {
		return cachedTestUrl;
	}

	// Try to unrestrict a new test link if we have a token
	if (token) {
		const newUrl = await unrestrictNetworkTestLink(token);
		if (newUrl) {
			cachedTestUrl = newUrl;
			cachedTestUrlExpiry = Date.now() + TEST_URL_CACHE_TTL_MS;
			return newUrl;
		}
	}

	// Fall back to speedtest URL
	return FALLBACK_TEST_URL;
}

/**
 * Builds a test URL for a given host by replacing the hostname in the base URL.
 * This preserves the full path and query parameters from the unrestricted link.
 */
function buildTestUrl(host: string, baseTestUrl: string): string {
	const url = new URL(baseTestUrl);
	url.hostname = host;
	return url.toString();
}

function getBaseComHostForCloud(host: string): string | null {
	const match = /^(\d+)\.download\.real-debrid\.cloud$/u.exec(host);
	if (!match) {
		return null;
	}
	return `${match[1]}.download.real-debrid.com`;
}

const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_NONAME', 'ENODATA']);

function getDnsErrorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object') {
		return null;
	}
	const candidate = error as { code?: string; cause?: unknown };
	if (typeof candidate.code === 'string') {
		return candidate.code;
	}
	if (candidate.cause && typeof (candidate.cause as { code?: string }).code === 'string') {
		return (candidate.cause as { code?: string }).code ?? null;
	}
	return null;
}

/**
 * Checks if a hostname resolves in DNS.
 * Returns true if the hostname exists, false if it doesn't.
 * This is used to filter out servers that don't exist at all.
 */
async function hostExists(hostname: string): Promise<boolean> {
	try {
		// Use a simple fetch with a very short timeout to check if DNS resolves
		// We abort immediately after the connection is established (or fails)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 2000);

		const testUrl = `https://${hostname}/`;
		await fetch(testUrl, {
			method: 'HEAD',
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		return true; // If we get here, DNS resolved (even if HTTP failed)
	} catch (error) {
		const dnsCode = getDnsErrorCode(error);
		if (dnsCode && DNS_ERROR_CODES.has(dnsCode)) {
			return false;
		}

		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			// DNS resolution failures - host doesn't exist
			if (
				message.includes('enotfound') ||
				message.includes('eai_noname') ||
				message.includes('getaddrinfo') ||
				message.includes('unknown host') ||
				message.includes('name or service not known')
			) {
				return false;
			}
		}
		// Any other error (timeout, connection refused, etc.) means DNS resolved
		// but the server is just not responding - it still "exists"
		return true;
	}
}

/**
 * Tests a single server's latency by making GET requests with Range header.
 * Makes multiple iterations and returns the average latency.
 * Returns null if the server doesn't exist (DNS resolution failure).
 *
 * Three possible outcomes:
 * 1. null - Server doesn't exist (DNS doesn't resolve) → excluded from results
 * 2. ok: false - Server exists but is failing (timeout, HTTP error, etc.) → counted as failing
 * 3. ok: true - Server exists and is working → counted as working
 *
 * Note: DNS existence check is only done for .download.real-debrid.com domains.
 * The .download.real-debrid.cloud domains are behind Cloudflare which always resolves
 * DNS but returns HTTP errors for non-existent hosts - those are counted as failures.
 */
async function testServerLatency(
	server: { id: string; host: string },
	baseTestUrl: string,
	hostExistenceCache: Map<string, Promise<boolean>>,
	randomByte: number
): Promise<WorkingStreamServerStatus | null> {
	// If the base .com host doesn't resolve, skip the .cloud proxy host too.
	const baseComHost = getBaseComHostForCloud(server.host);
	if (baseComHost) {
		const exists = await hostExistsCached(baseComHost, hostExistenceCache);
		if (!exists) {
			return null;
		}
	}

	// Only check DNS existence for .com domains
	// .cloud domains are behind Cloudflare which always resolves DNS
	if (server.host.endsWith('.download.real-debrid.com')) {
		const exists = await hostExistsCached(server.host, hostExistenceCache);
		if (!exists) {
			return null; // Server doesn't exist - exclude from results entirely
		}
	}

	const checkedAt = Date.now();
	let totalLatencyMs = 0;
	let successfulIterations = 0;
	let lastStatus: number | null = null;
	let lastContentLength: number | null = null;
	let lastError: string | null = null;

	for (let i = 0; i < ITERATIONS_PER_SERVER; i++) {
		const testUrl = buildTestUrl(server.host, baseTestUrl);
		let iterationSuccess = false;

		// Retry loop for each iteration
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			// Wait before retry (not on first attempt)
			if (attempt > 0) {
				const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 1000;
				await sleep(delayMs);
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

			try {
				const startTime = performance.now();
				const response = await fetch(testUrl, {
					method: 'GET',
					headers: {
						Range: `bytes=${randomByte}-${randomByte}`,
					},
					signal: controller.signal,
				});
				const endTime = performance.now();

				clearTimeout(timeoutId);
				lastStatus = response.status;

				const header = response.headers.get('content-length');
				lastContentLength = header ? Number(header) : null;

				// 206 Partial Content is the expected response for Range requests
				if (response.status === 206) {
					totalLatencyMs += endTime - startTime;
					successfulIterations++;
					iterationSuccess = true;
					break; // Success, no need to retry
				} else {
					lastError =
						response.status === 200
							? 'HTTP 200 (Range ignored)'
							: `HTTP ${response.status}`;
					// Non-206 response, retry
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
				// Error occurred, retry
			}
		}

		// If all retries failed for this iteration, stop testing this server
		if (!iterationSuccess) {
			break;
		}
	}

	const ok = successfulIterations === ITERATIONS_PER_SERVER;
	const avgLatencyMs = ok ? totalLatencyMs / ITERATIONS_PER_SERVER : null;

	return {
		id: server.id,
		url: buildTestUrl(server.host, baseTestUrl),
		status: lastStatus,
		contentLength: lastContentLength,
		ok,
		checkedAt,
		error: ok ? null : lastError,
		latencyMs: avgLatencyMs,
	};
}

function hostExistsCached(
	hostname: string,
	cache: Map<string, Promise<boolean>>
): Promise<boolean> {
	const cached = cache.get(hostname);
	if (cached) {
		return cached;
	}

	const promise = hostExists(hostname);
	cache.set(hostname, promise);
	return promise;
}

/**
 * Runs the network test against all Real-Debrid download servers.
 * Tests servers in parallel with a limited concurrency pool.
 * Servers that don't exist (DNS failure) are excluded from results.
 *
 * @param rdToken - Optional RD token to unrestrict test links (for more realistic testing)
 */
async function inspectServers(rdToken?: string): Promise<WorkingStreamServerStatus[]> {
	// Get the test URL (unrestricted if token available, fallback to speedtest)
	const baseTestUrl = await getTestUrl(rdToken);
	console.log(`[StreamHealth] Using test URL: ${baseTestUrl}`);

	// Generate a single random byte offset to use for all servers (1-1023)
	const randomByte = Math.floor(Math.random() * 1023) + 1;

	const servers = generateServerHosts();
	const results: WorkingStreamServerStatus[] = [];
	const hostExistenceCache = new Map<string, Promise<boolean>>();

	// Process hosts in batches with limited concurrency
	let index = 0;

	async function processNext(): Promise<void> {
		while (index < servers.length) {
			const currentIndex = index++;
			const server = servers[currentIndex];
			const result = await testServerLatency(
				server,
				baseTestUrl,
				hostExistenceCache,
				randomByte
			);
			// Only include servers that exist (non-null result)
			if (result !== null) {
				results.push(result);
			}
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

function getScheduler(): SchedulerState {
	const g = getGlobalStore();
	if (!g[GLOBAL_KEY]) {
		g[GLOBAL_KEY] = {
			runPromise: null,
			inProgress: false,
		};
		scheduleJobs(g[GLOBAL_KEY]!);
	}
	return g[GLOBAL_KEY]!;
}

function scheduleJobs(state: SchedulerState) {
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

async function executeCheck(state: SchedulerState): Promise<void> {
	if (state.runPromise) {
		return state.runPromise;
	}
	const promise = (async () => {
		state.inProgress = true;
		try {
			// Get RD token from environment if available for more realistic testing
			const rdToken = process.env.RD_ACCESS_TOKEN || undefined;
			const statuses = await inspectServers(rdToken);
			const allHosts = generateServerHosts().map((server) => server.id);
			const includedHosts = new Set(statuses.map((status) => status.id));
			const excludedHosts = allHosts.filter((host) => !includedHosts.has(host));
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

			// Persist to MySQL
			if (excludedHosts.length > 0) {
				await repository.deleteStreamHealthHosts(excludedHosts);
			}
			const dbResults = statuses.map((s) => ({
				host: s.id,
				status: s.status,
				latencyMs: s.latencyMs,
				ok: s.ok,
				error: s.error,
				checkedAt: new Date(s.checkedAt),
			}));
			await repository.upsertStreamHealthResults(dbResults);

			// Record to history for 90-day tracking
			const failedServers = statuses.filter((s) => !s.ok).map((s) => s.id);
			const minLatencyMs =
				workingServers.length > 0
					? Math.min(...workingServers.map((s) => s.latencyMs ?? Infinity))
					: null;
			const maxLatencyMs =
				workingServers.length > 0
					? Math.max(...workingServers.map((s) => s.latencyMs ?? 0))
					: null;

			await repository.recordStreamHealthSnapshot({
				totalServers: statuses.length,
				workingServers: working,
				avgLatencyMs,
				minLatencyMs: minLatencyMs === Infinity ? null : minLatencyMs,
				maxLatencyMs,
				fastestServer,
				failedServers,
			});

			// Record per-server reliability
			await repository.recordServerReliability(
				statuses.map((s) => ({
					host: s.id,
					ok: s.ok,
					latencyMs: s.latencyMs,
				}))
			);

			console.log(
				`[StreamHealth] Check complete: ${working}/${statuses.length} servers working`
			);
		} catch (error) {
			console.error('[StreamHealth] Check failed:', error);
		}
	})().finally(() => {
		state.inProgress = false;
		state.runPromise = null;
	});
	state.runPromise = promise;
	return promise;
}

function clearScheduler() {
	const g = getGlobalStore();
	const current = g[GLOBAL_KEY];
	if (current?.interval) {
		clearInterval(current.interval);
	}
	g[GLOBAL_KEY] = undefined;
}

/**
 * Ensures the stream health check scheduler is running.
 * Call this on app startup or when the API is first accessed.
 */
export function ensureStreamHealthScheduler(): void {
	getScheduler();
}

/**
 * Checks if a health check is currently in progress.
 */
export function isHealthCheckInProgress(): boolean {
	const g = getGlobalStore();
	return g[GLOBAL_KEY]?.inProgress ?? false;
}

/**
 * Gets stream health metrics from MySQL database.
 * Also ensures the health check scheduler is running.
 */
export async function getStreamMetricsFromDb() {
	ensureStreamHealthScheduler();
	return repository.getStreamHealthMetrics();
}

/**
 * Gets all stream statuses from MySQL database.
 */
export function getStreamStatusesFromDb() {
	return repository.getAllStreamStatuses();
}

/**
 * Runs the stream health check immediately (on-demand).
 * Returns the updated metrics after the check completes.
 */
export async function runHealthCheckNow() {
	const state = getScheduler();
	await executeCheck(state);
	return repository.getStreamHealthMetrics();
}

export const __testing = {
	reset() {
		clearScheduler();
		cachedTestUrl = null;
		cachedTestUrlExpiry = 0;
	},
	async runNow() {
		return runHealthCheckNow();
	},
	getServerList() {
		return generateServerHosts();
	},
};
