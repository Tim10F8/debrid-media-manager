import { repository as db } from '@/services/repository';
import { TorrentInfoResponse } from '@/services/types';

export async function handleDownloadedTorrent(
	torrentInfo: TorrentInfoResponse,
	hash: string,
	imdbId: string
): Promise<void> {
	await db.handleDownloadedTorrent(torrentInfo, hash, imdbId);
}
