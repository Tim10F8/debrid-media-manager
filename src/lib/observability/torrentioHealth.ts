// Torrentio health check module.
// Tests 3 specific Torrentio resolve URLs with HEAD requests expecting HTTP 302
// and a location header containing "real-debrid".
// Health checks are triggered by cron job alongside the stream health check.

import { repository } from '@/services/repository';
import ProxyManager from '@/utils/proxyManager';
import axios from 'axios';

const REQUEST_TIMEOUT_MS = 10000;

// Track if a check is currently running (to prevent concurrent runs)
let checkInProgress = false;

export interface TorrentioUrlCheckResult {
	url: string;
	ok: boolean;
	status: number | null;
	hasLocation: boolean;
	locationValid: boolean;
	latencyMs: number | null;
	error: string | null;
}

export interface TorrentioCheckResultData {
	ok: boolean;
	latencyMs: number | null;
	error: string | null;
	urls: TorrentioUrlCheckResult[];
	checkedAt: Date;
}

/**
 * Builds the Torrentio test URLs with the RD key.
 */
function getTorrentioTestUrls(rdKey: string): string[] {
	return [
		`https://torrentio.strem.fun/resolve/realdebrid/${rdKey}/163d2082453d037f3bec8bb77ddce782797a7fc3/null/0/Interstellar.2014.IMAX.2160p.10bit.HDR.BluRay.6CH.x265.HEVC-PSA.mkv`,
		`https://torrentio.strem.fun/resolve/realdebrid/${rdKey}/4dafd19cb07dd72000c254f8377d881bbb168836/null/0/The%20Lord%20of%20the%20Rings%20-%20The%20Fellowship%20of%20the%20Ring%20(2001)%20Extended%20(2160p%20BluRay%20x265%2010bit%20HDR%20Tigole).mkv`,
		`https://torrentio.strem.fun/resolve/realdebrid/${rdKey}/8a48b47dc85313b110ad164255817c3d6f93cf73/null/1/01.%20Harry%20Potter%20and%20the%20Sorcerer's%20Stone%20(2001)%202160p%2010Bit%20UHD%20BDRIP%20x265%20AC3.mkv`,
	];
}

/**
 * Tests a single Torrentio URL with a HEAD request.
 * Expects HTTP 302 with a location header containing "real-debrid".
 * Uses Tor proxy to avoid Cloudflare blocks on datacenter IPs.
 */
async function testTorrentioUrl(url: string): Promise<TorrentioUrlCheckResult> {
	try {
		const proxyManager = new ProxyManager();
		const agent = proxyManager.getTorProxy();

		const startTime = performance.now();
		const response = await axios.head(url, {
			httpAgent: agent,
			httpsAgent: agent,
			timeout: REQUEST_TIMEOUT_MS,
			maxRedirects: 0, // Don't follow redirects, we want to check the 302
			validateStatus: () => true, // Accept any status code
		});
		const endTime = performance.now();

		const status = response.status;
		const location = response.headers['location'] as string | undefined;
		const hasLocation = location !== undefined && location.length > 0;
		const locationValid = hasLocation && location.toLowerCase().includes('real-debrid');

		// Success: HTTP 302 with location containing "real-debrid"
		const ok = status === 302 && locationValid;

		return {
			url,
			ok,
			status,
			hasLocation,
			locationValid,
			latencyMs: endTime - startTime,
			error: ok
				? null
				: status !== 302
					? `Expected HTTP 302, got ${status}`
					: !hasLocation
						? 'Missing location header'
						: 'Location header does not contain real-debrid',
		};
	} catch (error) {
		let errorMessage = 'Unknown error';
		if (error instanceof Error) {
			errorMessage = error.message;
		}

		return {
			url,
			ok: false,
			status: null,
			hasLocation: false,
			locationValid: false,
			latencyMs: null,
			error: errorMessage,
		};
	}
}

/**
 * Runs the Torrentio health check.
 * Tests all 3 URLs and returns true only if all pass.
 */
async function runTorrentioCheck(rdKey: string): Promise<{
	ok: boolean;
	latencyMs: number | null;
	error: string | null;
	urls: TorrentioUrlCheckResult[];
}> {
	const urls = getTorrentioTestUrls(rdKey);
	const results = await Promise.all(urls.map(testTorrentioUrl));

	const allOk = results.every((r) => r.ok);
	const resultsWithLatency = results.filter((r) => r.latencyMs !== null);

	// Calculate average latency of all checks that got a response
	let avgLatencyMs: number | null = null;
	if (resultsWithLatency.length > 0) {
		const totalLatency = resultsWithLatency.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0);
		avgLatencyMs = totalLatency / resultsWithLatency.length;
	}

	// Build error message if any failed
	let error: string | null = null;
	if (!allOk) {
		const failedUrls = results.filter((r) => !r.ok);
		error = failedUrls.map((r) => r.error).join('; ');
	}

	return {
		ok: allOk,
		latencyMs: avgLatencyMs,
		error,
		urls: results,
	};
}

/**
 * Executes a Torrentio health check. Called by cron job.
 */
async function executeCheck(): Promise<void> {
	if (checkInProgress) {
		console.log('[TorrentioHealth] Check already in progress, skipping');
		return;
	}

	const rdKey = process.env.REALDEBRID_KEY;
	if (!rdKey) {
		console.warn('[TorrentioHealth] REALDEBRID_KEY not set, skipping check');
		return;
	}

	checkInProgress = true;
	try {
		const result = await runTorrentioCheck(rdKey);

		// Record individual check result
		await repository.recordTorrentioCheckResult({
			ok: result.ok,
			latencyMs: result.latencyMs,
			error: result.error,
			urls: result.urls,
		});

		// Record to hourly aggregates for historical charts
		await repository.recordTorrentioHealthSnapshot({
			ok: result.ok,
			latencyMs: result.latencyMs,
		});

		console.log(
			`[TorrentioHealth] Check complete: ${result.ok ? 'PASS' : 'FAIL'}${
				result.latencyMs ? ` (${Math.round(result.latencyMs)}ms avg)` : ''
			}`
		);
	} catch (error) {
		console.error('[TorrentioHealth] Check failed:', error);
	} finally {
		checkInProgress = false;
	}
}

/**
 * Checks if a health check is currently in progress.
 */
export function isTorrentioHealthCheckInProgress(): boolean {
	return checkInProgress;
}

/**
 * Runs the Torrentio health check immediately (on-demand).
 * Called by cron job endpoint.
 */
export async function runTorrentioHealthCheckNow(): Promise<void> {
	await executeCheck();
}

/**
 * Gets recent Torrentio check results from the database.
 */
export async function getRecentTorrentioChecks(limit = 5): Promise<TorrentioCheckResultData[]> {
	return repository.getRecentTorrentioChecks(limit);
}

export const __testing = {
	reset() {
		checkInProgress = false;
	},
	async runNow() {
		return runTorrentioHealthCheckNow();
	},
	getTorrentioTestUrls,
	testTorrentioUrl,
};
