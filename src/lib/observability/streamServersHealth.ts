// Stream server health check module using zurg-style network testing.
// Dynamically discovers Real-Debrid download servers via DNS and tests 1 random
// server from the top 5. Updates the known ceiling when higher servers are found.
// All data is stored in MySQL.
// Health checks are triggered by cron job, not in-memory scheduler.

import { unrestrictLink } from '@/services/realDebrid';
import { repository } from '@/services/repository';

const REQUEST_TIMEOUT_MS = 5000;
const ITERATIONS_PER_SERVER = 3;
const INITIAL_SERVER_CEILING = 100;
const DNS_PROBE_AHEAD = 20; // Check 20 servers ahead of current ceiling
const TOP_SERVERS_TO_PICK_FROM = 5;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000]; // 1s, then 2s between retries
const DOMAIN = 'download.real-debrid.com';

// Track the known highest server number (dynamically updated)
let knownServerCeiling = INITIAL_SERVER_CEILING;

// Track if a check is currently running (to prevent concurrent runs)
let checkInProgress = false;

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

/**
 * Probes DNS to discover existing servers and picks 1 random from the top 5.
 * Updates the known ceiling if higher servers are discovered.
 */
async function discoverAndPickServer(): Promise<{ id: string; host: string } | null> {
	// Probe dynamically: extend ceiling by DNS_PROBE_AHEAD each time we find a server
	const existingServers: number[] = [];
	let current = 1;
	let ceiling = DNS_PROBE_AHEAD; // Start with initial probe range

	while (current <= ceiling) {
		const host = `${current}.${DOMAIN}`;
		const exists = await hostExists(host);

		if (exists) {
			existingServers.push(current);
			ceiling = current + DNS_PROBE_AHEAD; // Extend ceiling
		}

		current++;
	}

	if (existingServers.length === 0) {
		console.warn('[StreamHealth] No servers found via DNS check');
		return null;
	}

	// Sort descending to get highest first
	existingServers.sort((a, b) => b - a);

	// Update module-level ceiling if we found higher servers
	const highestFound = existingServers[0];
	if (highestFound > knownServerCeiling) {
		console.log(
			`[StreamHealth] Discovered higher server: ${highestFound} (was ${knownServerCeiling})`
		);
		knownServerCeiling = highestFound;
	}

	// Pick 1 random server from the top 5 existing servers
	const topServers = existingServers.slice(0, TOP_SERVERS_TO_PICK_FROM);
	const pickedNum = topServers[Math.floor(Math.random() * topServers.length)];
	const host = `${pickedNum}.${DOMAIN}`;

	console.log(
		`[StreamHealth] Picked server ${pickedNum} from top ${topServers.length} (ceiling: ${knownServerCeiling})`
	);

	return { id: host, host };
}

/**
 * Legacy function for test compatibility - returns current ceiling info.
 */
function generateServerHosts(): Array<{ id: string; host: string }> {
	// For testing: return a placeholder based on current ceiling
	const topServers: Array<{ id: string; host: string }> = [];
	for (let i = 0; i < TOP_SERVERS_TO_PICK_FROM; i++) {
		const num = knownServerCeiling - i;
		if (num >= 1) {
			const host = `${num}.${DOMAIN}`;
			topServers.push({ id: host, host });
		}
	}
	return topServers;
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
 */
async function testServerLatency(
	server: { id: string; host: string },
	baseTestUrl: string,
	hostExistenceCache: Map<string, Promise<boolean>>,
	randomByte: number
): Promise<WorkingStreamServerStatus | null> {
	// Check if DNS resolves - if not, exclude from results
	const exists = await hostExistsCached(server.host, hostExistenceCache);
	if (!exists) {
		return null;
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
 * Discovers servers via DNS and tests a single randomly picked server.
 * Updates the known ceiling if higher servers are discovered.
 *
 * @param rdToken - Optional RD token to unrestrict test links (for more realistic testing)
 */
async function inspectServers(rdToken?: string): Promise<WorkingStreamServerStatus[]> {
	// Discover existing servers and pick one to test
	const server = await discoverAndPickServer();
	if (!server) {
		return [];
	}

	// Get the test URL (unrestricted if token available, fallback to speedtest)
	const baseTestUrl = await getTestUrl(rdToken);
	console.log(`[StreamHealth] Using test URL: ${baseTestUrl}`);

	// Generate a single random byte offset (1-1023)
	const randomByte = Math.floor(Math.random() * 1023) + 1;

	// Test the single picked server (DNS already verified in discoverAndPickServer)
	const hostExistenceCache = new Map<string, Promise<boolean>>();
	// Pre-populate cache since we already know it exists
	hostExistenceCache.set(server.host, Promise.resolve(true));

	const result = await testServerLatency(server, baseTestUrl, hostExistenceCache, randomByte);

	return result ? [result] : [];
}

/**
 * Executes a health check. Called by cron job.
 */
async function executeCheck(): Promise<void> {
	if (checkInProgress) {
		console.log('[StreamHealth] Check already in progress, skipping');
		return;
	}

	checkInProgress = true;
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
		// Clean up deprecated host entries (.cloud and -4 variants no longer tested)
		await repository.deleteDeprecatedStreamHosts();
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

		console.log(`[StreamHealth] Check complete: ${working}/${statuses.length} servers working`);
	} catch (error) {
		console.error('[StreamHealth] Check failed:', error);
	} finally {
		checkInProgress = false;
	}
}

/**
 * Checks if a health check is currently in progress.
 */
export function isHealthCheckInProgress(): boolean {
	return checkInProgress;
}

/**
 * Gets stream health metrics from MySQL database.
 */
export async function getStreamMetricsFromDb() {
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
 * Called by cron job endpoint.
 * Returns the updated metrics after the check completes.
 */
export async function runHealthCheckNow() {
	await executeCheck();
	return repository.getStreamHealthMetrics();
}

export const __testing = {
	reset() {
		cachedTestUrl = null;
		cachedTestUrlExpiry = 0;
		knownServerCeiling = INITIAL_SERVER_CEILING;
		checkInProgress = false;
	},
	async runNow() {
		return runHealthCheckNow();
	},
	getServerList() {
		return generateServerHosts();
	},
	getCeiling() {
		return knownServerCeiling;
	},
	setCeiling(value: number) {
		knownServerCeiling = value;
	},
	async discoverAndPick() {
		return discoverAndPickServer();
	},
};
