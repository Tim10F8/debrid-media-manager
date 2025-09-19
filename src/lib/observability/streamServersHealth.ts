import { STREAM_SERVER_IDS, STREAM_SERVER_TEMPLATE } from './streamServersList';

const GLOBAL_KEY = '__DMM_STREAM_HEALTH__';
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 8;
const STREAM_URL_PLACEHOLDER = 'XX-Y';
const TEST_SUFFIX_PATTERN = /\/test\.rar\/[^/?#]+/;
const SERVER_PARSE_ERROR = 'No stream servers extracted from stream-servers.txt';

interface StreamServer {
	id: string;
	url: string;
}

interface StreamServerSource {
	template: string;
	ids: readonly string[];
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

export interface WorkingStreamMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	statuses: WorkingStreamServerStatus[];
	lastError: string | null;
	inProgress: boolean;
}

const DEFAULT_SOURCE: StreamServerSource = {
	template: STREAM_SERVER_TEMPLATE,
	ids: STREAM_SERVER_IDS,
};

let sourceOverride: StreamServerSource | null = null;

function getActiveSource(): StreamServerSource | null {
	const source = sourceOverride ?? DEFAULT_SOURCE;
	if (!source.template.includes(STREAM_URL_PLACEHOLDER)) {
		return null;
	}
	return source;
}

function buildServersFromSource(source: StreamServerSource): StreamServer[] {
	const ids = Array.from(
		new Set(source.ids.map((id) => id.trim()).filter((id): id is string => Boolean(id)))
	);
	return ids.map((id) => ({
		id,
		url: source.template.replace(STREAM_URL_PLACEHOLDER, id),
	}));
}

function loadServers(): { servers: StreamServer[]; error: string | null } {
	const source = getActiveSource();
	if (!source) {
		return { servers: [], error: SERVER_PARSE_ERROR };
	}
	const servers = buildServersFromSource(source);
	if (!servers.length) {
		return { servers: [], error: SERVER_PARSE_ERROR };
	}
	return { servers, error: null };
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
	const fraction = Math.random().toString().split('.')[1] ?? '';
	const digits = fraction.slice(0, 8) || Date.now().toString().slice(-8);
	const randomToken = `0.${digits}`;
	const replacement = `/test.rar/${randomToken}`;
	if (TEST_SUFFIX_PATTERN.test(baseUrl)) {
		return baseUrl.replace(TEST_SUFFIX_PATTERN, replacement);
	}
	const separator = baseUrl.includes('?') ? '&' : '?';
	return `${baseUrl}${separator}nocache=${randomToken}`;
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
	};
}

export const __testing = {
	reset() {
		clearState();
	},
	setServerSourceForTesting(ids: readonly string[], template = STREAM_SERVER_TEMPLATE) {
		sourceOverride = { template, ids: [...ids] };
		clearState();
	},
	clearServerSourceOverride() {
		sourceOverride = null;
		clearState();
	},
	async runNow() {
		const state = getStore();
		await executeCheck(state);
		return getWorkingStreamMetrics();
	},
};
