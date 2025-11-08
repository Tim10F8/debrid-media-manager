import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchLatestADTorrents,
	fetchLatestRDTorrents,
	fetchLatestTBTorrents,
} from './libraryFetching';

vi.mock('@/utils/fetchTorrentsWithCache', () => ({
	fetchRealDebridWithCache: vi.fn(),
	clearTorrentCache: vi.fn(),
}));

vi.mock('@/utils/fetchTorrents', () => ({
	fetchAllDebrid: vi.fn(),
	fetchTorBox: vi.fn(),
}));

import { fetchAllDebrid, fetchTorBox } from '@/utils/fetchTorrents';
import { clearTorrentCache, fetchRealDebridWithCache } from '@/utils/fetchTorrentsWithCache';

type MutableState<T> = {
	get: () => T;
	set: (value: T) => void;
};

const createTorrent = (id: string, status: UserTorrentStatus): UserTorrent => ({
	id,
	filename: `${id}.mkv`,
	title: id,
	hash: `${id}-hash`,
	bytes: 1,
	progress: status === UserTorrentStatus.finished ? 100 : 50,
	status,
	serviceStatus: 'ok',
	added: new Date(),
	mediaType: 'movie' as const,
	links: [],
	selectedFiles: [],
	seeders: 0,
	speed: 0,
});

const createState = <T>(
	initial: T
): { setter: (updater: (value: T) => T) => void } & MutableState<T> => {
	let state = initial;
	return {
		get: () => state,
		set: (value: T) => {
			state = value;
		},
		setter: (updater: (value: T) => T) => {
			state = updater(state);
		},
	};
};

const createSetState = <T>(initial: T) => {
	let state = initial;
	return {
		get: () => state,
		set: (value: T) => {
			state = value;
		},
		setter: (updater: ((value: T) => T) | T) => {
			if (typeof updater === 'function') {
				state = (updater as (value: T) => T)(state);
			} else {
				state = updater;
			}
		},
	};
};

const createTorrentDb = (initial: UserTorrent[]) => {
	let store = [...initial];
	return {
		all: vi.fn(async () => [...store]),
		addAll: vi.fn(async (torrents: UserTorrent[]) => {
			torrents.forEach((torrent) => {
				const idx = store.findIndex((t) => t.id === torrent.id);
				if (idx >= 0) {
					store[idx] = torrent;
				} else {
					store.push(torrent);
				}
			});
		}),
		deleteById: vi.fn(async (id: string) => {
			store = store.filter((t) => t.id !== id);
		}),
		deleteMany: vi.fn(async (ids: string[]) => {
			store = store.filter((t) => !ids.includes(t.id));
		}),
		hashes: vi.fn(async () => new Set(store.map((t) => t.hash))),
	};
};

const mockFetchRD = vi.mocked(fetchRealDebridWithCache);
const mockClearCache = vi.mocked(clearTorrentCache);
const mockFetchAllDebrid = vi.mocked(fetchAllDebrid);
const mockFetchTorBox = vi.mocked(fetchTorBox);

describe('fetchLatestRDTorrents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchRD.mockReset();
		mockClearCache.mockReset();
	});

	it('marks sync complete immediately when RD key is missing', async () => {
		const oldTorrent = createTorrent('rd:old', UserTorrentStatus.finished);
		const db = createTorrentDb([oldTorrent]);
		const listState = createState<UserTorrent[]>([oldTorrent]);
		const selectionState = createSetState<Set<string>>(new Set(['rd:old']));
		const setLoading = vi.fn();
		const setRdSyncing = vi.fn();

		await fetchLatestRDTorrents(
			null,
			db as any,
			listState.setter,
			setLoading,
			setRdSyncing,
			selectionState.setter
		);

		expect(setLoading).toHaveBeenCalledWith(false);
		expect(setRdSyncing).toHaveBeenCalledWith(false);
		expect(mockFetchRD).not.toHaveBeenCalled();
		// newIds empty while oldIds exist triggers early return before deletion block
		expect(db.deleteById).not.toHaveBeenCalled();
	});

	it('refreshes torrents, clears cache when forced, and prunes stale entries', async () => {
		const stale = createTorrent('rd:stale', UserTorrentStatus.finished);
		const updating = createTorrent('rd:update', UserTorrentStatus.waiting);
		const db = createTorrentDb([stale, updating]);
		const listState = createState<UserTorrent[]>([stale, updating]);
		const selectionState = createSetState<Set<string>>(new Set(['rd:stale']));
		const setLoading = vi.fn();
		const setRdSyncing = vi.fn();

		const updatedTorrent = { ...updating, status: UserTorrentStatus.downloading };
		const newTorrent = createTorrent('rd:new', UserTorrentStatus.finished);

		mockFetchRD.mockResolvedValue({
			torrents: [updatedTorrent, newTorrent],
			cacheHit: false,
			totalCount: 2,
		});

		await fetchLatestRDTorrents(
			'rd-token',
			db as any,
			listState.setter,
			setLoading,
			setRdSyncing,
			selectionState.setter,
			undefined,
			true
		);

		expect(mockClearCache).toHaveBeenCalled();
		expect(mockFetchRD).toHaveBeenCalledWith('rd-token', false, undefined);
		expect(db.addAll).toHaveBeenCalledWith([newTorrent]);
		expect(db.addAll).toHaveBeenCalledWith([updatedTorrent]);
		expect(db.deleteById).toHaveBeenCalledWith('rd:stale');
		expect(selectionState.get().has('rd:stale')).toBe(false);
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(setRdSyncing).toHaveBeenCalledWith(false);
		expect(listState.get()).toEqual(expect.arrayContaining([newTorrent, updatedTorrent]));
	});

	it('short-circuits deletion when running a limited sync', async () => {
		const stale = createTorrent('rd:stale', UserTorrentStatus.finished);
		const db = createTorrentDb([stale]);
		const listState = createState<UserTorrent[]>([stale]);
		const selectionState = createSetState<Set<string>>(new Set(['rd:stale']));
		mockFetchRD.mockResolvedValue({
			torrents: [createTorrent('rd:new', UserTorrentStatus.finished)],
			cacheHit: true,
			totalCount: 1,
		});

		await fetchLatestRDTorrents(
			'rd-token',
			db as any,
			listState.setter,
			vi.fn(),
			vi.fn(),
			selectionState.setter,
			5
		);

		expect(db.deleteById).not.toHaveBeenCalled();
	});
});

describe('fetchLatestADTorrents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchAllDebrid.mockReset();
	});

	it('skips fetching when API key is missing', async () => {
		const db = createTorrentDb([]);
		const listState = createState<UserTorrent[]>([]);
		const selectionState = createSetState<Set<string>>(new Set());

		await fetchLatestADTorrents(
			null,
			db as any,
			listState.setter,
			vi.fn(),
			vi.fn(),
			selectionState.setter
		);

		expect(mockFetchAllDebrid).not.toHaveBeenCalled();
	});

	it('stores new torrents, updates in-progress ones, and deletes stale AD entries', async () => {
		const stale = createTorrent('ad:stale', UserTorrentStatus.finished);
		const updating = createTorrent('ad:update', UserTorrentStatus.waiting);
		const db = createTorrentDb([stale, updating]);
		const listState = createState<UserTorrent[]>([stale, updating]);
		const selectionState = createSetState<Set<string>>(new Set(['ad:stale']));

		mockFetchAllDebrid.mockImplementation(async (_key, cb) => {
			await cb([
				{ ...updating, status: UserTorrentStatus.downloading },
				createTorrent('ad:new', UserTorrentStatus.finished),
			]);
		});

		await fetchLatestADTorrents(
			'ad-token',
			db as any,
			listState.setter,
			vi.fn(),
			vi.fn(),
			selectionState.setter
		);

		expect(db.addAll).toHaveBeenCalled();
		expect(db.deleteById).toHaveBeenCalledWith('ad:stale');
	});
});

describe('fetchLatestTBTorrents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockFetchTorBox.mockReset();
	});

	it('does nothing without a TorBox token', async () => {
		const db = createTorrentDb([]);
		const listState = createState<UserTorrent[]>([]);
		const selectionState = createSetState<Set<string>>(new Set());

		await fetchLatestTBTorrents(
			null,
			db as any,
			listState.setter,
			vi.fn(),
			vi.fn(),
			selectionState.setter
		);

		expect(mockFetchTorBox).not.toHaveBeenCalled();
	});

	it('processes TorBox torrents and prunes stale ones', async () => {
		const stale = createTorrent('tb:stale', UserTorrentStatus.finished);
		const db = createTorrentDb([stale]);
		const listState = createState<UserTorrent[]>([stale]);
		const selectionState = createSetState<Set<string>>(new Set(['tb:stale']));
		mockFetchTorBox.mockImplementation(async (_key, cb) => {
			await cb([createTorrent('tb:new', UserTorrentStatus.finished)]);
		});

		await fetchLatestTBTorrents(
			'tb-token',
			db as any,
			listState.setter,
			vi.fn(),
			vi.fn(),
			selectionState.setter
		);

		expect(db.deleteById).toHaveBeenCalledWith('tb:stale');
	});
});
