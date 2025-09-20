import { useLibraryCache } from '@/contexts/LibraryCacheContext';
import { SearchResult } from '@/services/mediasearch';
import { TorrentInfoResponse } from '@/services/types';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import {
	handleAddAsMagnetInAd,
	handleAddAsMagnetInRd,
	handleAddAsMagnetInTb,
} from '@/utils/addMagnet';
import { removeAvailability, submitAvailability } from '@/utils/availability';
import {
	handleDeleteAdTorrent,
	handleDeleteRdTorrent,
	handleDeleteTbTorrent,
} from '@/utils/deleteTorrent';
import { convertToUserTorrent, fetchAllDebrid } from '@/utils/fetchTorrents';
import { generateTokenAndHash } from '@/utils/token';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

const torrentDB = new UserTorrentDB();

export function useTorrentManagement(
	rdKey: string | null,
	adKey: string | null,
	torboxKey: string | null,
	imdbId: string,
	searchResults: SearchResult[],
	setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>
) {
	const [hashAndProgress, setHashAndProgress] = useState<Record<string, number>>({});
	const { addTorrent: addToCache, removeTorrent: removeFromCache } = useLibraryCache();

	const fetchHashAndProgress = useCallback(async (hash?: string) => {
		const torrents = await torrentDB.all();
		const records: Record<string, number> = {};
		for (const t of torrents) {
			if (hash && t.hash !== hash) continue;
			records[`${t.id.substring(0, 3)}${t.hash}`] = t.progress;
		}
		setHashAndProgress((prev) => ({ ...prev, ...records }));
	}, []);

	const addRd = useCallback(
		async (hash: string, isCheckingAvailability = false): Promise<any> => {
			if (!rdKey) return;

			// Read searchResults at call time via closure - no need for dependency
			const torrentResult = searchResults.find((r) => r.hash === hash);
			const wasMarkedAvailable = torrentResult?.rdAvailable || false;
			let torrentInfo: TorrentInfoResponse | null = null;

			await handleAddAsMagnetInRd(rdKey, hash, async (info: TorrentInfoResponse) => {
				torrentInfo = info;
				const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();

				// Only handle false positives for actual usage, not availability checks
				if (!isCheckingAvailability && wasMarkedAvailable) {
					// Check for false positive conditions
					const isFalsePositive =
						info.status !== 'downloaded' ||
						info.progress !== 100 ||
						info.files?.filter((f) => f.selected === 1).length === 0;

					if (isFalsePositive) {
						// Remove false positive from availability database
						await removeAvailability(
							tokenWithTimestamp,
							tokenHash,
							hash,
							`Status: ${info.status}, Progress: ${info.progress}%, Selected files: ${
								info.files?.filter((f) => f.selected === 1).length || 0
							}`
						);

						// Update UI
						setSearchResults((prev) =>
							prev.map((r) => (r.hash === hash ? { ...r, rdAvailable: false } : r))
						);

						toast.error('Torrent misflagged as RD available.');
					}
				}

				// Only submit availability for truly available torrents
				if (info.status === 'downloaded' && info.progress === 100) {
					await submitAvailability(tokenWithTimestamp, tokenHash, info, imdbId);
				}

				const userTorrent = convertToUserTorrent(info);
				await torrentDB.add(userTorrent);
				addToCache(userTorrent); // Update global cache

				// Immediately update hashAndProgress state for this torrent
				setHashAndProgress((prev) => ({
					...prev,
					[`${userTorrent.id.substring(0, 3)}${userTorrent.hash}`]: userTorrent.progress,
				}));

				await fetchHashAndProgress(hash);
			});

			return isCheckingAvailability ? torrentInfo : undefined;
		},
		[rdKey, setSearchResults, imdbId, fetchHashAndProgress, addToCache, searchResults]
	);

	const addAd = useCallback(
		async (hash: string) => {
			if (!adKey) return;

			console.log('[TorrentManagement] addAd start', { hash });
			await handleAddAsMagnetInAd(adKey, hash);
			console.log('[TorrentManagement] addAd queued refresh via fetchAllDebrid', { hash });
			await fetchAllDebrid(adKey, async (torrents: UserTorrent[]) => {
				console.log('[TorrentManagement] addAd fetchAllDebrid callback', {
					hash,
					count: torrents.length,
				});
				await torrentDB.addAll(torrents);
				// Update global cache with new torrents
				torrents.forEach((torrent) => {
					addToCache(torrent);
					// Immediately update hashAndProgress state for this torrent
					if (torrent.hash === hash) {
						setHashAndProgress((prev) => ({
							...prev,
							[`${torrent.id.substring(0, 3)}${torrent.hash}`]: torrent.progress,
						}));
					}
				});
			});
			await fetchHashAndProgress();
			console.log('[TorrentManagement] addAd end', { hash });
		},
		[adKey, fetchHashAndProgress, addToCache]
	);

	const addTb = useCallback(
		async (hash: string) => {
			if (!torboxKey) return;

			// Read searchResults at call time via closure
			const torrentResult = searchResults.find((r) => r.hash === hash);
			const wasMarkedAvailable = torrentResult?.tbAvailable || false;

			await handleAddAsMagnetInTb(torboxKey, hash, async (userTorrent: UserTorrent) => {
				await torrentDB.add(userTorrent);
				addToCache(userTorrent); // Update global cache

				// Immediately update hashAndProgress state for this torrent
				setHashAndProgress((prev) => ({
					...prev,
					[`${userTorrent.id.substring(0, 3)}${userTorrent.hash}`]:
						wasMarkedAvailable || userTorrent.status === UserTorrentStatus.finished
							? 100
							: userTorrent.progress,
				}));

				await fetchHashAndProgress();
			});
		},
		[torboxKey, fetchHashAndProgress, addToCache, searchResults]
	);

	const deleteRd = useCallback(
		async (hash: string) => {
			if (!rdKey) return;

			const torrents = await torrentDB.getAllByHash(hash);
			for (const t of torrents) {
				if (!t.id.startsWith('rd:')) continue;
				await handleDeleteRdTorrent(rdKey, t.id);
				await torrentDB.deleteByHash('rd', hash);
				removeFromCache(t.id); // Update global cache
				setHashAndProgress((prev) => {
					const newHashAndProgress = { ...prev };
					delete newHashAndProgress[`rd:${hash}`];
					return newHashAndProgress;
				});
			}
		},
		[rdKey, removeFromCache]
	);

	const deleteAd = useCallback(
		async (hash: string) => {
			if (!adKey) return;

			const torrents = await torrentDB.getAllByHash(hash);
			for (const t of torrents) {
				if (!t.id.startsWith('ad:')) continue;
				await handleDeleteAdTorrent(adKey, t.id);
				await torrentDB.deleteByHash('ad', hash);
				removeFromCache(t.id); // Update global cache
				setHashAndProgress((prev) => {
					const newHashAndProgress = { ...prev };
					delete newHashAndProgress[`ad:${hash}`];
					return newHashAndProgress;
				});
			}
		},
		[adKey, removeFromCache]
	);

	const deleteTb = useCallback(
		async (hash: string) => {
			if (!torboxKey) return;

			const torrents = await torrentDB.getAllByHash(hash);
			for (const t of torrents) {
				if (!t.id.startsWith('tb:')) continue;
				await handleDeleteTbTorrent(torboxKey, t.id);
				await torrentDB.deleteByHash('tb', hash);
				removeFromCache(t.id); // Update global cache
				setHashAndProgress((prev) => {
					const newHashAndProgress = { ...prev };
					delete newHashAndProgress[`tb:${hash}`];
					return newHashAndProgress;
				});
			}
		},
		[torboxKey, removeFromCache]
	);

	return {
		hashAndProgress,
		fetchHashAndProgress,
		addRd,
		addAd,
		addTb,
		deleteRd,
		deleteAd,
		deleteTb,
	};
}
