import UserTorrentDB from '@/torrent/db';
import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import { fetchAllDebrid, fetchTorBox } from '@/utils/fetchTorrents';
import { clearTorrentCache, fetchRealDebridWithCache } from '@/utils/fetchTorrentsWithCache';
import { Dispatch, SetStateAction } from 'react';

export async function fetchLatestRDTorrents(
	rdKey: string | null,
	torrentDB: UserTorrentDB,
	setUserTorrentsList: (fn: (prev: UserTorrent[]) => UserTorrent[]) => void,
	setLoading: (loading: boolean) => void,
	setRdSyncing: (syncing: boolean) => void,
	setSelectedTorrents: Dispatch<SetStateAction<Set<string>>>,
	customLimit?: number,
	forceRefresh?: boolean
) {
	const startTime = Date.now();
	console.log(
		`[${new Date().toISOString()}] fetchLatestRDTorrents start (forceRefresh=${!!forceRefresh}, customLimit=${customLimit ?? 'none'})`
	);

	const dbReadStart = Date.now();
	const oldTorrents = await torrentDB.all();
	console.log(
		`[${new Date().toISOString()}]   DB read: ${Date.now() - dbReadStart}ms (${oldTorrents.length} items)`
	);

	const filterStart = Date.now();
	const oldIds = new Set(
		oldTorrents.map((torrent) => torrent.id).filter((id) => id.startsWith('rd:'))
	);
	const inProgressIds = new Set(
		oldTorrents
			.filter(
				(t) =>
					t.status === UserTorrentStatus.waiting ||
					t.status === UserTorrentStatus.downloading
			)
			.map((t) => t.id)
			.filter((id) => id.startsWith('rd:'))
	);
	console.log(`[${new Date().toISOString()}]   Filter setup: ${Date.now() - filterStart}ms`);
	const newIds = new Set();

	if (!rdKey) {
		setLoading(false);
		setRdSyncing(false);
	} else {
		try {
			// Clear cache if force refresh requested
			if (forceRefresh) {
				clearTorrentCache();
				console.log(
					`[${new Date().toISOString()}] RealDebrid: Cleared cache for force refresh`
				);
			}

			// Use caching strategy for fetching
			const useCache = !customLimit && !forceRefresh; // Don't use cache for small syncs or force refresh
			const fetchStart = Date.now();
			const { torrents, cacheHit } = await fetchRealDebridWithCache(
				rdKey,
				useCache,
				customLimit
			);
			console.log(
				`[${new Date().toISOString()}]   Fetch from RD: ${Date.now() - fetchStart}ms (${torrents.length} items, cacheHit=${cacheHit})`
			);

			if (cacheHit) {
				console.log(
					`[${new Date().toISOString()}] RealDebrid: Used cached data for faster loading`
				);
			}

			// add all new torrents to the database
			const processStart = Date.now();
			torrents.forEach((torrent) => newIds.add(torrent.id));
			const newTorrents = torrents.filter((torrent) => !oldIds.has(torrent.id));
			console.log(
				`[${new Date().toISOString()}]   New torrents filtering: ${Date.now() - processStart}ms (${newTorrents.length} new)`
			);

			const uiUpdateStart = Date.now();
			setUserTorrentsList((prev) => {
				const newTorrentIds = new Set(newTorrents.map((t) => t.id));
				const filteredPrev = prev.filter((t) => !newTorrentIds.has(t.id));
				return [...newTorrents, ...filteredPrev];
			});
			console.log(
				`[${new Date().toISOString()}]   UI update 1: ${Date.now() - uiUpdateStart}ms`
			);

			const dbWriteStart = Date.now();
			await torrentDB.addAll(newTorrents);
			console.log(
				`[${new Date().toISOString()}]   DB write new: ${Date.now() - dbWriteStart}ms`
			);

			// refresh the torrents that are in progress
			const inProgressStart = Date.now();
			const inProgressTorrents = torrents.filter(
				(torrent) =>
					torrent.status === UserTorrentStatus.waiting ||
					torrent.status === UserTorrentStatus.downloading ||
					inProgressIds.has(torrent.id)
			);
			console.log(
				`[${new Date().toISOString()}]   In-progress filter: ${Date.now() - inProgressStart}ms (${inProgressTorrents.length} items)`
			);

			const uiUpdateStart2 = Date.now();
			setUserTorrentsList((prev) => {
				const newList = [...prev];
				for (const t of inProgressTorrents) {
					const idx = prev.findIndex((i) => i.id === t.id);
					if (idx >= 0) {
						newList[idx] = t;
					}
				}
				return newList;
			});
			console.log(
				`[${new Date().toISOString()}]   UI update 2: ${Date.now() - uiUpdateStart2}ms`
			);

			const dbWriteStart2 = Date.now();
			await torrentDB.addAll(inProgressTorrents);
			console.log(
				`[${new Date().toISOString()}]   DB write in-progress: ${Date.now() - dbWriteStart2}ms`
			);

			setLoading(false);
		} catch (error) {
			console.error(`[${new Date().toISOString()}] Error fetching RD torrents:`, error);
			setLoading(false);
			// Don't delete torrents if fetch failed
			setRdSyncing(false);
			return;
		}
		setRdSyncing(false);

		// this is just a small sync
		if (customLimit) return;

		// Toast notification removed for better UX
	}

	// Only delete if we successfully fetched data
	if (newIds.size === 0 && oldIds.size > 0) {
		console.log(
			`[${new Date().toISOString()}] Skipping deletion - no new torrents fetched (likely an error)`
		);
		return;
	}

	const deleteStart = Date.now();
	const toDelete = Array.from(oldIds).filter((id) => !newIds.has(id));
	if (toDelete.length > 0) {
		// Update UI state first
		toDelete.forEach((id) => {
			setUserTorrentsList((prev) => prev.filter((torrent) => torrent.id !== id));
			setSelectedTorrents((prev) => {
				prev.delete(id);
				return new Set(prev);
			});
		});
		// Then batch delete from database
		if (toDelete.length === 1) {
			await torrentDB.deleteById(toDelete[0]);
		} else {
			await torrentDB.deleteMany(toDelete);
		}
		console.log(
			`[${new Date().toISOString()}]   Delete old torrents: ${Date.now() - deleteStart}ms (${toDelete.length} deleted)`
		);
	}
	console.log(
		`[${new Date().toISOString()}] fetchLatestRDTorrents end - Total: ${Date.now() - startTime}ms`
	);
}

export async function fetchLatestADTorrents(
	adKey: string | null,
	torrentDB: UserTorrentDB,
	setUserTorrentsList: (fn: (prev: UserTorrent[]) => UserTorrent[]) => void,
	setLoading: (loading: boolean) => void,
	setAdSyncing: (syncing: boolean) => void,
	setSelectedTorrents: Dispatch<SetStateAction<Set<string>>>,
	customLimit?: number,
	forceRefresh?: boolean
) {
	const oldTorrents = await torrentDB.all();
	const oldIds = new Set(
		oldTorrents.map((torrent) => torrent.id).filter((id) => id.startsWith('ad:'))
	);
	const inProgressIds = new Set(
		oldTorrents
			.filter(
				(t) =>
					t.status === UserTorrentStatus.waiting ||
					t.status === UserTorrentStatus.downloading
			)
			.map((t) => t.id)
			.filter((id) => id.startsWith('ad:'))
	);
	const newIds = new Set();

	if (!adKey) {
		setLoading(false);
		setAdSyncing(false);
	} else {
		// Note: forceRefresh doesn't affect AllDebrid since it doesn't use caching yet
		// but we keep the parameter for consistency and future implementation
		await fetchAllDebrid(
			adKey,
			async (torrents: UserTorrent[]) => {
				// add all new torrents to the database
				torrents.forEach((torrent) => newIds.add(torrent.id));
				const newTorrents = torrents.filter((torrent) => !oldIds.has(torrent.id));
				setUserTorrentsList((prev) => {
					const newTorrentIds = new Set(newTorrents.map((t) => t.id));
					const filteredPrev = prev.filter((t) => !newTorrentIds.has(t.id));
					return [...newTorrents, ...filteredPrev];
				});
				await torrentDB.addAll(newTorrents);

				// refresh the torrents that are in progress
				const inProgressTorrents = torrents.filter(
					(torrent) =>
						torrent.status === UserTorrentStatus.waiting ||
						torrent.status === UserTorrentStatus.downloading ||
						inProgressIds.has(torrent.id)
				);
				setUserTorrentsList((prev) => {
					return prev.map((t) => {
						const found = inProgressTorrents.find((i) => i.id === t.id);
						if (found) {
							return found;
						}
						return t;
					});
				});
				await torrentDB.addAll(inProgressTorrents);

				setLoading(false);
			},
			customLimit
		);
		setAdSyncing(false);

		// this is just a small sync
		if (customLimit) return;

		// Toast notification removed for better UX
	}

	const toDelete = Array.from(oldIds).filter((id) => !newIds.has(id));
	if (toDelete.length > 0) {
		// Update UI state first
		toDelete.forEach((id) => {
			setUserTorrentsList((prev) => prev.filter((torrent) => torrent.id !== id));
			setSelectedTorrents((prev) => {
				prev.delete(id);
				return new Set(prev);
			});
		});
		// Then batch delete from database
		if (toDelete.length === 1) {
			await torrentDB.deleteById(toDelete[0]);
		} else {
			await torrentDB.deleteMany(toDelete);
		}
	}
}

export async function fetchLatestTBTorrents(
	tbKey: string | null,
	torrentDB: UserTorrentDB,
	setUserTorrentsList: (fn: (prev: UserTorrent[]) => UserTorrent[]) => void,
	setLoading: (loading: boolean) => void,
	setTbSyncing: (syncing: boolean) => void,
	setSelectedTorrents: Dispatch<SetStateAction<Set<string>>>,
	customLimit?: number,
	forceRefresh?: boolean
) {
	const oldTorrents = await torrentDB.all();
	const oldIds = new Set(
		oldTorrents.map((torrent) => torrent.id).filter((id) => id.startsWith('tb:'))
	);
	const inProgressIds = new Set(
		oldTorrents
			.filter(
				(t) =>
					t.status === UserTorrentStatus.waiting ||
					t.status === UserTorrentStatus.downloading
			)
			.map((t) => t.id)
			.filter((id) => id.startsWith('tb:'))
	);
	const newIds = new Set();

	if (!tbKey) {
		setLoading(false);
		setTbSyncing(false);
	} else {
		// Note: forceRefresh doesn't affect TorBox since it doesn't use caching yet
		// but we keep the parameter for consistency and future implementation
		await fetchTorBox(
			tbKey,
			async (torrents: UserTorrent[]) => {
				// add all new torrents to the database
				torrents.forEach((torrent) => newIds.add(torrent.id));
				const newTorrents = torrents.filter((torrent) => !oldIds.has(torrent.id));
				setUserTorrentsList((prev) => {
					const newTorrentIds = new Set(newTorrents.map((t) => t.id));
					const filteredPrev = prev.filter((t) => !newTorrentIds.has(t.id));
					return [...newTorrents, ...filteredPrev];
				});
				await torrentDB.addAll(newTorrents);

				// refresh the torrents that are in progress
				const inProgressTorrents = torrents.filter(
					(torrent) =>
						torrent.status === UserTorrentStatus.waiting ||
						torrent.status === UserTorrentStatus.downloading ||
						inProgressIds.has(torrent.id)
				);
				setUserTorrentsList((prev) => {
					return prev.map((t) => {
						const found = inProgressTorrents.find((i) => i.id === t.id);
						if (found) {
							return found;
						}
						return t;
					});
				});
				await torrentDB.addAll(inProgressTorrents);

				setLoading(false);
			},
			customLimit
		);
		setTbSyncing(false);

		// this is just a small sync
		if (customLimit) return;

		// Toast notification removed for better UX
	}

	const toDelete = Array.from(oldIds).filter((id) => !newIds.has(id));
	if (toDelete.length > 0) {
		// Update UI state first
		toDelete.forEach((id) => {
			setUserTorrentsList((prev) => prev.filter((torrent) => torrent.id !== id));
			setSelectedTorrents((prev) => {
				prev.delete(id);
				return new Set(prev);
			});
		});
		// Then batch delete from database
		if (toDelete.length === 1) {
			await torrentDB.deleteById(toDelete[0]);
		} else {
			await torrentDB.deleteMany(toDelete);
		}
	}
}
