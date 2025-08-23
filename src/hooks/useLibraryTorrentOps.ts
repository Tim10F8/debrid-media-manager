import UserTorrentDB from '@/torrent/db';
import { UserTorrent } from '@/torrent/userTorrent';
import { handleReinsertTorrentinRd, handleRestartTorrent } from '@/utils/addMagnet';
import { AsyncFunction } from '@/utils/batch';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import { useCallback } from 'react';

interface LibraryTorrentOpsProps {
	rdKey: string | null;
	adKey: string | null;
	torrentDB: UserTorrentDB;
	setUserTorrentsList: React.Dispatch<React.SetStateAction<UserTorrent[]>>;
	setSelectedTorrents: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const useLibraryTorrentOps = ({
	rdKey,
	adKey,
	torrentDB,
	setUserTorrentsList,
	setSelectedTorrents,
}: LibraryTorrentOpsProps) => {
	const wrapDeleteFn = useCallback(
		(torrent: UserTorrent): AsyncFunction<void> => {
			return async () => {
				const oldId = torrent.id;
				if (rdKey && torrent.id.startsWith('rd:')) {
					await handleDeleteRdTorrent(rdKey, torrent.id);
				}
				if (adKey && torrent.id.startsWith('ad:')) {
					await handleDeleteAdTorrent(adKey, torrent.id);
				}
				setUserTorrentsList((prev) => prev.filter((t) => t.id !== oldId));
				await torrentDB.deleteById(oldId);
				setSelectedTorrents((prev) => {
					const newSet = new Set(prev);
					newSet.delete(oldId);
					return newSet;
				});
			};
		},
		[rdKey, adKey, torrentDB, setUserTorrentsList, setSelectedTorrents]
	);

	const wrapReinsertFn = useCallback(
		(torrent: UserTorrent): AsyncFunction<void> => {
			return async () => {
				const oldId = torrent.id;
				if (rdKey && torrent.id.startsWith('rd:')) {
					await handleReinsertTorrentinRd(rdKey, torrent, true);
					setUserTorrentsList((prev) => prev.filter((t) => t.id !== oldId));
					await torrentDB.deleteById(oldId);
					setSelectedTorrents((prev) => {
						const newSet = new Set(prev);
						newSet.delete(oldId);
						return newSet;
					});
				}
				if (adKey && torrent.id.startsWith('ad:')) {
					await handleRestartTorrent(adKey, torrent.id);
				}
			};
		},
		[rdKey, adKey, torrentDB, setUserTorrentsList, setSelectedTorrents]
	);

	return {
		wrapDeleteFn,
		wrapReinsertFn,
	};
};
