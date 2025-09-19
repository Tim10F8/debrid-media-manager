// Shared in-memory stats for Real-Debrid operations.
// Uses globalThis to ensure a single instance across Next.js route bundles.

export type RealDebridOperation =
	| 'POST /unrestrict/link'
	| 'GET /user'
	| 'GET /torrents'
	| 'GET /torrents/info/{id}'
	| 'PUT /torrents/addTorrent'
	| 'POST /torrents/addMagnet'
	| 'POST /torrents/selectFiles/{id}'
	| 'DELETE /torrents/delete/{id}';

export interface RdOperationalEvent {
	ts: number; // epoch ms
	status: number; // HTTP status
	operation: RealDebridOperation; // logical operation bucket
}

export interface OperationStats {
	operation: RealDebridOperation;
	totalTracked: number;
	successCount: number;
	failureCount: number;
	considered: number;
	successRate: number;
	lastTs: number | null;
}

const OPERATION_DEFINITIONS: Array<{
	operation: RealDebridOperation;
	method: string;
	test: (pathname: string) => boolean;
}> = [
	{
		operation: 'POST /unrestrict/link',
		method: 'POST',
		test: (pathname) => pathname.endsWith('/unrestrict/link'),
	},
	{
		operation: 'GET /user',
		method: 'GET',
		test: (pathname) => pathname.endsWith('/user'),
	},
	{
		operation: 'GET /torrents',
		method: 'GET',
		test: (pathname) => pathname.endsWith('/torrents'),
	},
	{
		operation: 'GET /torrents/info/{id}',
		method: 'GET',
		test: (pathname) => /\/torrents\/info(\/|$)/.test(pathname),
	},
	{
		operation: 'PUT /torrents/addTorrent',
		method: 'PUT',
		test: (pathname) => pathname.endsWith('/torrents/addTorrent'),
	},
	{
		operation: 'POST /torrents/addMagnet',
		method: 'POST',
		test: (pathname) => pathname.endsWith('/torrents/addMagnet'),
	},
	{
		operation: 'POST /torrents/selectFiles/{id}',
		method: 'POST',
		test: (pathname) => /\/torrents\/selectFiles(\/|$)/.test(pathname),
	},
	{
		operation: 'DELETE /torrents/delete/{id}',
		method: 'DELETE',
		test: (pathname) => /\/torrents\/delete(\/|$)/.test(pathname),
	},
];

const GLOBAL_KEY = '__DMM_RD_EVENTS_V2__';
const MAX_EVENTS = 10_000; // keep the last 10k matching events

function getStore(): RdOperationalEvent[] {
	const g = globalThis as any;
	if (!g[GLOBAL_KEY]) {
		g[GLOBAL_KEY] = [] as RdOperationalEvent[];
	}
	return g[GLOBAL_KEY] as RdOperationalEvent[];
}

export function resolveRealDebridOperation(
	method: string | undefined,
	pathname: string
): RealDebridOperation | null {
	if (!method) {
		return null;
	}

	const normalizedMethod = method.toUpperCase();
	const matcher = OPERATION_DEFINITIONS.find(
		(def) => def.method === normalizedMethod && def.test(pathname)
	);

	return matcher ? matcher.operation : null;
}

export function recordRdUnrestrictEvent(event: RdOperationalEvent) {
	const store = getStore();
	store.push(event);
	// Trim to last MAX_EVENTS
	if (store.length > MAX_EVENTS) {
		store.splice(0, store.length - MAX_EVENTS);
	}
}

export function getLastEvents(): RdOperationalEvent[] {
	const store = getStore();
	// Return a copy to avoid external mutation
	return store.slice();
}

function buildEmptyOperationStats(operation: RealDebridOperation): OperationStats {
	return {
		operation,
		totalTracked: 0,
		successCount: 0,
		failureCount: 0,
		considered: 0,
		successRate: 0,
		lastTs: null,
	};
}

export function getStats() {
	const events = getLastEvents();
	const byOperation: Record<RealDebridOperation, OperationStats> = OPERATION_DEFINITIONS.reduce(
		(acc, { operation }) => {
			acc[operation] = buildEmptyOperationStats(operation);
			return acc;
		},
		{} as Record<RealDebridOperation, OperationStats>
	);

	let totalSuccess = 0;
	let totalFailure = 0;
	let lastTs: number | null = null;

	for (const event of events) {
		const opStats = byOperation[event.operation];
		if (!opStats) {
			continue;
		}

		opStats.totalTracked += 1;
		const isSuccess = event.status >= 200 && event.status < 300;
		const isFailure = event.status >= 500 && event.status < 600;
		if (isSuccess) {
			opStats.successCount += 1;
			totalSuccess += 1;
		}
		if (isFailure) {
			opStats.failureCount += 1;
			totalFailure += 1;
		}
		opStats.considered = opStats.successCount + opStats.failureCount;
		opStats.successRate =
			opStats.considered > 0 ? opStats.successCount / opStats.considered : 0;
		opStats.lastTs = event.ts;

		lastTs = event.ts;
	}

	const considered = totalSuccess + totalFailure;
	const successRate = considered > 0 ? totalSuccess / considered : 0;
	const isDown = considered > 0 ? successRate < 0.5 : false;

	return {
		totalTracked: events.length,
		successCount: totalSuccess,
		failureCount: totalFailure,
		considered,
		successRate,
		lastTs,
		isDown,
		monitoredOperations: OPERATION_DEFINITIONS.map(({ operation }) => operation),
		byOperation,
		windowSize: MAX_EVENTS,
	};
}
