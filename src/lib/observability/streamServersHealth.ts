// Stream server health check module.
// Tests a fixed list of Real-Debrid location-based servers to measure availability.
// Pass percentage = working servers / total servers.
// All data is stored in MySQL.
// Health checks are triggered by cron job, not in-memory scheduler.

import { repository } from '@/services/repository';

const REQUEST_TIMEOUT_MS = 5000;
const ITERATIONS_PER_SERVER = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000]; // 1s, then 2s between retries
const DOMAIN = 'download.real-debrid.com';

// Fixed list of location-based servers to test
const SERVER_LOCATIONS = [
	'rbx',
	'akl1',
	'bgt1',
	'chi1',
	'dal1',
	'den1',
	'fjr1',
	'hkg1',
	'jnb1',
	'kul1',
	'lax1',
	'mia1',
	'mum1',
	'nyk1',
	'qro1',
	'sao1',
	'scl1',
	'sea1',
	'sgp1',
	'syd1',
	'tlv1',
	'tyo1',
] as const;

// Track if a check is currently running (to prevent concurrent runs)
let checkInProgress = false;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Generates all server hosts from the fixed location list.
 */
function generateServerHosts(): Array<{ id: string; host: string }> {
	return SERVER_LOCATIONS.map((location) => {
		const host = `${location}.${DOMAIN}`;
		return { id: host, host };
	});
}

/**
 * Builds a test URL for a given host using the speedtest path with random float.
 */
function buildTestUrl(host: string, randomFloat: number): string {
	return `https://${host}/speedtest/test.rar/${randomFloat}`;
}

/**
 * Tests a single server's latency by making GET requests with Range header.
 * Makes multiple iterations and returns the average latency.
 *
 * Two possible outcomes:
 * 1. ok: false - Server is failing (timeout, HTTP error, DNS failure, etc.) → counted as failing
 * 2. ok: true - Server is working → counted as working
 */
async function testServerLatency(
	server: { id: string; host: string },
	randomFloat: number,
	randomByte: number
): Promise<WorkingStreamServerStatus> {
	const checkedAt = Date.now();
	let totalLatencyMs = 0;
	let successfulIterations = 0;
	let lastStatus: number | null = null;
	let lastContentLength: number | null = null;
	let lastError: string | null = null;

	for (let i = 0; i < ITERATIONS_PER_SERVER; i++) {
		const testUrl = buildTestUrl(server.host, randomFloat);
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
		url: buildTestUrl(server.host, randomFloat),
		status: lastStatus,
		contentLength: lastContentLength,
		ok,
		checkedAt,
		error: ok ? null : lastError,
		latencyMs: avgLatencyMs,
	};
}

/**
 * Tests all servers from the fixed location list.
 * Returns results for all servers to calculate pass percentage.
 */
async function inspectServers(): Promise<WorkingStreamServerStatus[]> {
	const servers = generateServerHosts();
	console.log(`[StreamHealth] Testing ${servers.length} servers`);

	// Generate random values for this test run
	const randomFloat = Math.random();
	const randomByte = Math.floor(Math.random() * 1023) + 1;

	// Test all servers in parallel
	const results = await Promise.all(
		servers.map((server) => testServerLatency(server, randomFloat, randomByte))
	);

	return results;
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
		const statuses = await inspectServers();
		const workingServers = statuses.filter((status) => status.ok);
		const working = workingServers.length;

		// Calculate average latency of working servers
		let avgLatencyMs: number | null = null;
		if (workingServers.length > 0) {
			const totalLatency = workingServers.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0);
			avgLatencyMs = totalLatency / workingServers.length;
		}

		// Get fastest server (sort by latency first)
		const sortedByLatency = [...workingServers].sort(
			(a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity)
		);
		const fastestServer = sortedByLatency[0]?.id ?? null;

		// Clean up deprecated host entries (servers no longer in our test list)
		const validHosts = statuses.map((s) => s.id);
		await repository.deleteDeprecatedStreamHosts(validHosts);
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

		// Record individual check result for recent checks display
		const firstStatus = statuses[0];
		if (firstStatus) {
			await repository.recordStreamCheckResult({
				ok: firstStatus.ok,
				latencyMs: firstStatus.latencyMs,
				server: firstStatus.id,
				error: firstStatus.error,
			});
		}

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
		checkInProgress = false;
	},
	async runNow() {
		return runHealthCheckNow();
	},
	getServerList() {
		return generateServerHosts();
	},
	getServerLocations() {
		return SERVER_LOCATIONS;
	},
};
