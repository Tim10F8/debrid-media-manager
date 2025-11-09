import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheManager, getGlobalCache } from './CacheManager';

type StoredRecord = {
	key: string;
	entry: any;
	timestamp: number;
	expiresAt?: number;
};

function installFakeIndexedDB() {
	const store = new Map<string, StoredRecord>();

	const createRequest = <T>() => {
		const request = {
			result: undefined as T | undefined,
			error: null,
			onsuccess: null as ((event: Event) => void) | null,
			onerror: null as ((event: Event) => void) | null,
		} as IDBRequest<T>;
		return request;
	};

	const objectStore = {
		get(key: string) {
			const request = createRequest<StoredRecord>();
			queueMicrotask(() => {
				(request as any).result = store.get(key);
				request.onsuccess?.({ target: request } as unknown as Event);
			});
			return request;
		},
		put(value: StoredRecord) {
			const request = createRequest<void>();
			queueMicrotask(() => {
				store.set(value.key, value);
				request.onsuccess?.({ target: request } as unknown as Event);
			});
			return request;
		},
		delete(key: string) {
			const request = createRequest<void>();
			queueMicrotask(() => {
				store.delete(key);
				request.onsuccess?.({ target: request } as unknown as Event);
			});
			return request;
		},
		clear() {
			const request = createRequest<void>();
			queueMicrotask(() => {
				store.clear();
				request.onsuccess?.({ target: request } as unknown as Event);
			});
			return request;
		},
		createIndex() {
			return null;
		},
	};

	const db = {
		objectStoreNames: {
			contains: () => true,
			length: 1,
			item: () => 'cache',
			[Symbol.iterator]: function* () {
				yield 'cache';
			},
		},
		transaction() {
			return {
				objectStore() {
					return objectStore;
				},
			};
		},
		createObjectStore() {
			return {
				createIndex() {
					return null;
				},
			};
		},
		close() {
			return;
		},
	} as unknown as IDBDatabase;

	(globalThis as any).indexedDB = {
		open: () => {
			const request = {
				result: db,
				error: null,
				onsuccess: null,
				onerror: null,
				onupgradeneeded: null,
			} as IDBOpenDBRequest;
			queueMicrotask(() => {
				request.onupgradeneeded?.({ target: request } as unknown as IDBVersionChangeEvent);
				request.onsuccess?.({ target: request } as unknown as Event);
			});
			return request;
		},
	};
}

describe('CacheManager', () => {
	beforeEach(() => {
		installFakeIndexedDB();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('persists entries to memory and IndexedDB with TTL', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

		const cache = new CacheManager({
			namespace: 'test-cache',
			memoryTTL: 50,
			persistTTL: 500,
			maxMemoryItems: 10,
		});

		await cache.set('alpha', { value: 1 }, 'etag-alpha', 100);
		vi.advanceTimersByTime(60); // expire memory entry but not persistent entry

		const fromCache = await cache.get('alpha');
		expect(fromCache).toEqual({ value: 1 });

		const forced = await cache.get('alpha', async () => ({ value: 2 }), { forceRefresh: true });
		expect(forced).toEqual({ value: 2 });
	});

	it('supports batch fetching for missing keys', async () => {
		const cache = new CacheManager({ namespace: 'batch-cache' });
		await cache.set('existing', { id: 1 });

		const fetchFn = vi.fn(async () => new Map([['missing', { id: 2 }]]));
		const results = await cache.getBatch(['existing', 'missing'], fetchFn);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(results.get('existing')).toEqual({ id: 1 });
		expect(results.get('missing')).toEqual({ id: 2 });
	});

	it('clears specific keys from both memory and persistence', async () => {
		const cache = new CacheManager({ namespace: 'clear-cache' });
		await cache.set('temp', { name: 'temp' });
		await cache.clear(['temp']);

		const result = await cache.get('temp');
		expect(result).toBeNull();
	});

	it('provides stats and supports closing the cache', async () => {
		const cache = new CacheManager({ namespace: 'stats-cache' });
		await cache.set('k1', { v: 1 });
		await cache.set('k2', { v: 2 });

		const stats = cache.getStats();
		expect(stats.memorySize).toBeGreaterThanOrEqual(1);
		expect(stats.memoryKeys).toContain('k1');

		cache.close();
		expect(cache.getStats().memorySize).toBe(0);
	});

	it('getGlobalCache returns a singleton instance', () => {
		const first = getGlobalCache();
		const second = getGlobalCache();
		expect(first).toBeInstanceOf(CacheManager);
		expect(second).toBe(first);
	});
});
