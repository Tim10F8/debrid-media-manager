// Torrentio health check module.
// Fetches popular movies from MDBList, then for each:
// 1. Fetches the stream manifest from Torrentio
// 2. Picks a random torrent and tests the resolve endpoint
// Health checks are triggered by cron job alongside the stream health check.

import { repository } from '@/services/repository';

const REQUEST_TIMEOUT_MS = 10000;
const MDBLIST_URL = 'https://mdblist.com/lists/linaspurinis/imdb-moviemeter-top-100/json/';
const NUM_TEST_MOVIES = 3;

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

export interface TorrentioTestUrl {
	url: string;
	expectedStatus: number;
}

interface TorrentioStream {
	infoHash: string;
	fileIdx: number;
	behaviorHints?: {
		filename?: string;
	};
	title?: string;
}

interface TorrentioManifestResponse {
	streams?: TorrentioStream[];
}

interface MdbListMovie {
	id: number;
	rank: number;
	title: string;
	imdb_id: string;
	mediatype: string;
	release_year: number;
}

// Fallback movies if MDBList API fails
const FALLBACK_MOVIES: TestMovie[] = [
	{ imdbId: 'tt0816692', name: 'Interstellar' },
	{ imdbId: 'tt0241527', name: 'Harry Potter' },
	{ imdbId: 'tt0120737', name: 'Lord of the Rings' },
];

interface TestMovie {
	imdbId: string;
	name: string;
}

/**
 * Fetches popular movies from MDBList and picks random ones for testing.
 * Falls back to hardcoded movies if the API fails.
 */
async function getTestMovies(): Promise<TestMovie[]> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(MDBLIST_URL, {
			method: 'GET',
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			console.warn('[TorrentioHealth] MDBList API returned non-OK status, using fallback');
			return FALLBACK_MOVIES;
		}

		const movies = (await response.json()) as MdbListMovie[];
		if (!Array.isArray(movies) || movies.length === 0) {
			console.warn('[TorrentioHealth] MDBList returned empty list, using fallback');
			return FALLBACK_MOVIES;
		}

		// Filter to only movies with valid IMDB IDs
		const validMovies = movies.filter(
			(m) => m.mediatype === 'movie' && m.imdb_id && m.imdb_id.startsWith('tt')
		);

		if (validMovies.length < NUM_TEST_MOVIES) {
			console.warn('[TorrentioHealth] Not enough valid movies from MDBList, using fallback');
			return FALLBACK_MOVIES;
		}

		// Pick random movies from the list
		const shuffled = validMovies.sort(() => Math.random() - 0.5);
		const selected = shuffled.slice(0, NUM_TEST_MOVIES);

		console.log(
			`[TorrentioHealth] Testing with movies: ${selected.map((m) => m.title).join(', ')}`
		);

		return selected.map((m) => ({
			imdbId: m.imdb_id,
			name: m.title,
		}));
	} catch (error) {
		clearTimeout(timeoutId);
		console.warn('[TorrentioHealth] Failed to fetch from MDBList, using fallback:', error);
		return FALLBACK_MOVIES;
	}
}

/**
 * Fetches the stream manifest for a movie and returns a random stream.
 * Uses the unauthenticated endpoint to avoid rate limiting on authenticated requests.
 * The authenticated resolve endpoint is tested separately.
 */
async function fetchRandomStreamFromManifest(
	_rdKey: string,
	imdbId: string
): Promise<{ stream: TorrentioStream } | null> {
	// Use unauthenticated endpoint to fetch streams (avoids rate limiting)
	// The authenticated endpoint is only needed for resolve, not for listing streams
	const url = `https://torrentio.strem.fun/stream/movie/${imdbId}.json`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: 'GET',
			signal: controller.signal,
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as TorrentioManifestResponse;
		if (!data.streams || data.streams.length === 0) {
			return null;
		}

		// Pick a random stream from the available ones
		const randomIndex = Math.floor(Math.random() * data.streams.length);
		return { stream: data.streams[randomIndex] };
	} catch {
		clearTimeout(timeoutId);
		return null;
	}
}

/**
 * Builds the resolve URL from a stream.
 */
function buildResolveUrl(rdKey: string, stream: TorrentioStream): string {
	const filename = stream.behaviorHints?.filename || stream.title || `file_${stream.fileIdx}`;
	const encodedFilename = encodeURIComponent(filename);
	return `https://torrentio.strem.fun/resolve/realdebrid/${rdKey}/${stream.infoHash}/null/${stream.fileIdx}/${encodedFilename}`;
}

/**
 * Tests a single Torrentio URL with a HEAD request.
 * Success conditions:
 * - Expected status matches (200 for stream manifests, 302 for resolve URLs)
 * - For 302: location header must contain "real-debrid"
 * - Any 4xx response (service is up, just blocking our IP - not a failure)
 * Failure conditions:
 * - 5xx server errors
 * - Network/timeout errors
 */
async function testTorrentioUrl(testUrl: TorrentioTestUrl): Promise<TorrentioUrlCheckResult> {
	const { url, expectedStatus } = testUrl;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const startTime = performance.now();
		const response = await fetch(url, {
			method: 'HEAD',
			signal: controller.signal,
			redirect: 'manual', // Don't follow redirects, we want to check the 302
		});
		const endTime = performance.now();
		clearTimeout(timeoutId);

		const status = response.status;
		const location = response.headers.get('location');
		const hasLocation = location !== null && location.length > 0;
		const locationValid = hasLocation && location.toLowerCase().includes('real-debrid');

		// Success cases:
		// 1. HTTP 200 for stream manifest URLs
		// 2. HTTP 302 with valid real-debrid location for resolve URLs
		// 3. Any 4xx response means Torrentio is responding (just blocking us)
		const isExpectedResponse =
			expectedStatus === 200 ? status === 200 : status === 302 && locationValid;
		const is4xxResponse = status >= 400 && status < 500;
		const ok = isExpectedResponse || is4xxResponse;

		return {
			url,
			ok,
			status,
			hasLocation,
			locationValid,
			latencyMs: endTime - startTime,
			error: ok
				? null
				: status >= 500
					? `Server error: ${status}`
					: `Unexpected response: ${status}`,
		};
	} catch (error) {
		clearTimeout(timeoutId);

		let errorMessage = 'Unknown error';
		if (error instanceof Error) {
			errorMessage = error.name === 'AbortError' ? 'Timeout' : error.message;
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
 * For each test movie:
 * 1. Fetches the stream manifest (tests manifest endpoint)
 * 2. Picks a random torrent from the results
 * 3. Tests the resolve URL for that torrent (tests resolve endpoint)
 * Returns true only if all checks pass.
 */
async function runTorrentioCheck(rdKey: string): Promise<{
	ok: boolean;
	latencyMs: number | null;
	error: string | null;
	urls: TorrentioUrlCheckResult[];
}> {
	const allResults: TorrentioUrlCheckResult[] = [];

	// Fetch test movies from MDBList (or use fallback)
	const testMovies = await getTestMovies();

	// Process each movie: fetch manifest (unauthenticated), then test resolve (authenticated)
	for (const movie of testMovies) {
		const manifestUrl = `https://torrentio.strem.fun/stream/movie/${movie.imdbId}.json`;
		const startTime = performance.now();
		const manifestResult = await fetchRandomStreamFromManifest(rdKey, movie.imdbId);
		const manifestLatency = performance.now() - startTime;

		if (!manifestResult) {
			// Manifest fetch failed
			allResults.push({
				url: manifestUrl,
				ok: false,
				status: null,
				hasLocation: false,
				locationValid: false,
				latencyMs: manifestLatency,
				error: `Failed to fetch manifest for ${movie.name}`,
			});
			continue;
		}

		// Manifest succeeded
		allResults.push({
			url: manifestUrl,
			ok: true,
			status: 200,
			hasLocation: false,
			locationValid: false,
			latencyMs: manifestLatency,
			error: null,
		});

		// Now test the resolve URL for the randomly picked torrent
		const resolveUrl = buildResolveUrl(rdKey, manifestResult.stream);
		const resolveResult = await testTorrentioUrl({ url: resolveUrl, expectedStatus: 302 });
		allResults.push(resolveResult);
	}

	const allOk = allResults.every((r) => r.ok);
	const resultsWithLatency = allResults.filter((r) => r.latencyMs !== null);

	// Calculate average latency of all checks that got a response
	let avgLatencyMs: number | null = null;
	if (resultsWithLatency.length > 0) {
		const totalLatency = resultsWithLatency.reduce((sum, r) => sum + (r.latencyMs ?? 0), 0);
		avgLatencyMs = totalLatency / resultsWithLatency.length;
	}

	// Build error message if any failed
	let error: string | null = null;
	if (!allOk) {
		const failedUrls = allResults.filter((r) => !r.ok);
		error = failedUrls.map((r) => r.error).join('; ');
	}

	return {
		ok: allOk,
		latencyMs: avgLatencyMs,
		error,
		urls: allResults,
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
	FALLBACK_MOVIES,
	MDBLIST_URL,
	getTestMovies,
	fetchRandomStreamFromManifest,
	buildResolveUrl,
	testTorrentioUrl,
};
