import path from 'path';

const GLOBAL_KEY = '__DMM_STREAM_HEALTH__';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const STREAM_URL_PLACEHOLDER = 'XX-Y';
const TEST_SUFFIX_PATTERN = /\/test\.rar\/[^/?#]+/;

type ReadFile = (typeof import('fs'))['readFileSync'];

let cachedReadFile: ReadFile | null | undefined;

interface StreamServer {
	id: string;
	url: string;
}

export interface WorkingStreamServerStatus {
	id: string;
	url: string;
	status: number | null;
	contentLength: number | null;
	ok: boolean;
	checkedAt: number;
	error: string | null;
}

interface WorkingStreamMetricsInternal {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	statuses: WorkingStreamServerStatus[];
	lastError: string | null;
	inProgress: boolean;
}

interface StreamHealthState {
	servers: StreamServer[];
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

function loadReadFile(): ReadFile | null {
	if (typeof cachedReadFile !== 'undefined') {
		return cachedReadFile;
	}
	if (typeof window !== 'undefined') {
		cachedReadFile = null;
		return cachedReadFile;
	}
	const globalAny = globalThis as Record<string, unknown>;
	const moduleId = ['f', 's'].join('');
	const loader = (() => {
		try {
			return Function('return require')() as (id: string) => unknown;
		} catch {
			const alt = globalAny.__non_webpack_require__;
			return typeof alt === 'function' ? (alt as (id: string) => unknown) : null;
		}
	})();
	try {
		const fsModule = loader ? (loader(moduleId) as typeof import('fs')) : null;
		cachedReadFile = fsModule?.readFileSync ?? null;
	} catch {
		cachedReadFile = null;
	}
	return cachedReadFile;
}

export interface WorkingStreamMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	statuses: WorkingStreamServerStatus[];
	lastError: string | null;
	inProgress: boolean;
}

function resolveServersFile(): string {
	const override = process.env.DMM_STREAM_SERVERS_FILE;
	if (override) {
		return path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
	}
	return path.resolve(process.cwd(), 'stream-servers.txt');
}

function parseServers(raw: string): StreamServer[] {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (!lines.length) {
		return [];
	}
	const template = lines[0];
	if (!template.includes(STREAM_URL_PLACEHOLDER)) {
		return [];
	}
	const ids = new Set<string>();
	for (const line of lines.slice(1)) {
		if (!line.startsWith('-')) {
			continue;
		}
		const id = line.replace(/^-\s*/, '');
		if (id) {
			ids.add(id);
		}
	}
	return Array.from(ids).map((id) => ({
		id,
		url: template.replace(STREAM_URL_PLACEHOLDER, id),
	}));
}

function loadServers(): { servers: StreamServer[]; error: string | null } {
	const filePath = resolveServersFile();
	const readFile = loadReadFile();
	if (!readFile) {
		return { servers: [], error: 'Stream server list unavailable' };
	}
	try {
		const raw = readFile(filePath, 'utf8');
		const servers = parseServers(raw);
		if (!servers.length) {
			return { servers: [], error: 'No stream servers extracted from stream-servers.txt' };
		}
		return { servers, error: null };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to read stream server list';
		return { servers: [], error: message };
	}
}

function getStore(): StreamHealthState {
	const g = getGlobalStore();
	if (!g[GLOBAL_KEY]) {
		const { servers, error } = loadServers();
		const metrics: WorkingStreamMetricsInternal = {
			total: servers.length,
			working: 0,
			rate: 0,
			lastChecked: null,
			statuses: [],
			lastError: error,
			inProgress: false,
		};
		g[GLOBAL_KEY] = {
			servers,
			metrics,
			runPromise: null,
		};
		if (servers.length) {
			scheduleJobs(g[GLOBAL_KEY]!);
		}
	}
	return g[GLOBAL_KEY]!;
}

function buildRequestUrl(baseUrl: string): string {
	const randomToken = Math.random().toString().slice(2, 10);
	const replacement = `/test.rar/0.${randomToken}`;
	if (TEST_SUFFIX_PATTERN.test(baseUrl)) {
		return baseUrl.replace(TEST_SUFFIX_PATTERN, replacement);
	}
	const separator = baseUrl.includes('?') ? '&' : '?';
	return `${baseUrl}${separator}nocache=0.${randomToken}`;
}

async function checkServer(server: StreamServer): Promise<WorkingStreamServerStatus> {
	const started = Date.now();
	try {
		const requestUrl = buildRequestUrl(server.url);
		const response = await fetch(requestUrl, { method: 'HEAD' });
		const header = response.headers.get('content-length');
		const contentLength = header ? Number(header) : null;
		const ok =
			response.status === 200 &&
			contentLength !== null &&
			Number.isFinite(contentLength) &&
			contentLength > 0;
		let error: string | null = null;
		if (!ok) {
			if (response.status !== 200) {
				error = `Unexpected status ${response.status}`;
			} else if (!header) {
				error = 'Missing Content-Length';
			} else {
				error = 'Invalid Content-Length';
			}
		}
		return {
			id: server.id,
			url: server.url,
			status: response.status,
			contentLength,
			ok,
			checkedAt: Date.now(),
			error,
		};
	} catch (error) {
		return {
			id: server.id,
			url: server.url,
			status: null,
			contentLength: null,
			ok: false,
			checkedAt: Date.now(),
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

async function inspectServers(servers: StreamServer[]): Promise<WorkingStreamServerStatus[]> {
	const results: WorkingStreamServerStatus[] = new Array(servers.length);
	let index = 0;
	const workers = Array.from(
		{
			length: Math.min(MAX_CONCURRENT_REQUESTS, servers.length) || 1,
		},
		() =>
			(async () => {
				while (index < servers.length) {
					const current = index++;
					results[current] = await checkServer(servers[current]);
				}
			})()
	);
	await Promise.all(workers);
	return results;
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
		state.metrics.total = state.servers.length;
		if (!state.servers.length) {
			state.metrics.lastChecked = Date.now();
			state.metrics.lastError = 'No stream servers configured';
			state.metrics.statuses = [];
			state.metrics.working = 0;
			state.metrics.rate = 0;
			return;
		}
		try {
			const statuses = await inspectServers(state.servers);
			const working = statuses.filter((status) => status.ok).length;
			state.metrics.statuses = statuses;
			state.metrics.working = working;
			state.metrics.rate = working && state.metrics.total ? working / state.metrics.total : 0;
			state.metrics.lastChecked = Date.now();
			state.metrics.lastError = null;
		} catch (error) {
			state.metrics.statuses = [];
			state.metrics.working = 0;
			state.metrics.rate = 0;
			state.metrics.lastChecked = Date.now();
			state.metrics.lastError =
				error instanceof Error ? error.message : 'Failed to evaluate stream servers';
		}
	})().finally(() => {
		state.metrics.inProgress = false;
		state.runPromise = null;
	});
	state.runPromise = promise;
	return promise;
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
	};
}

export const __testing = {
	reset() {
		const g = getGlobalStore();
		const current = g[GLOBAL_KEY];
		if (current?.interval) {
			clearInterval(current.interval);
		}
		g[GLOBAL_KEY] = undefined;
	},
	setReadFileImplementation(readFile: ReadFile | null) {
		cachedReadFile = readFile;
	},
	clearReadFileImplementation() {
		cachedReadFile = undefined;
	},
	async runNow() {
		const state = getStore();
		await executeCheck(state);
		return getWorkingStreamMetrics();
	},
};
