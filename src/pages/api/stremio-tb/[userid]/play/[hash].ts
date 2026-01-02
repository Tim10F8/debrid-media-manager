import { repository as db } from '@/services/repository';
import {
	checkCachedStatus,
	createTorrent,
	deleteTorrent,
	getTorrentList,
	requestDownloadLink,
} from '@/services/torbox';
import { TorBoxTorrentInfo } from '@/services/types';
import { NextApiRequest, NextApiResponse } from 'next';

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;

async function waitForTorrentReady(
	apiKey: string,
	torrentId: number
): Promise<TorBoxTorrentInfo | null> {
	for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
		const result = await getTorrentList(apiKey, { id: torrentId });
		if (!result.success || !result.data) {
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			continue;
		}

		const torrent = Array.isArray(result.data) ? result.data[0] : result.data;
		if (!torrent) {
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			continue;
		}

		if (
			torrent.download_finished ||
			torrent.download_state === 'completed' ||
			torrent.download_state === 'cached'
		) {
			return torrent;
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	return null;
}

// Regenerate and play a TorBox download link
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, hash } = req.query;
	if (typeof userid !== 'string' || typeof hash !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid" or "hash" query parameter',
		});
		return;
	}

	// Get user's TorBox profile with API key
	let profile: { apiKey: string } | null = null;
	try {
		profile = await db.getTorBoxCastProfile(userid);
		if (!profile) {
			throw new Error(`no profile found for user ${userid}`);
		}
	} catch (error) {
		console.error(
			'Failed to get TorBox profile:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: `Failed to get TorBox profile for user ${userid}` });
		return;
	}

	// Find the cast record to get the fileId
	let castRecord: { fileId: number | null } | null = null;
	try {
		const allCasts = await db.getAllTorBoxUserCasts(userid);
		const matchingCast = allCasts.find((c) => c.hash === hash);
		if (matchingCast) {
			// Need to query for fileId which isn't in getAllUserCasts
			// For now, we'll find the biggest file in the torrent
			castRecord = { fileId: null };
		}
	} catch (error) {
		console.error('Failed to find cast record:', error);
	}

	const apiKey = profile.apiKey;

	try {
		// Check if the torrent is cached
		const cachedStatus = await checkCachedStatus({ hash, list_files: true }, apiKey);
		if (!cachedStatus.success || !cachedStatus.data) {
			throw new Error('Failed to check cached status');
		}

		const cachedData = cachedStatus.data as Record<string, any>;
		if (!cachedData[hash]) {
			throw new Error('Torrent not cached on TorBox');
		}

		// Add the torrent
		const createResult = await createTorrent(apiKey, {
			magnet: `magnet:?xt=urn:btih:${hash}`,
		});

		if (
			!createResult.success ||
			!createResult.data ||
			createResult.data.torrent_id === undefined
		) {
			throw new Error('Failed to add torrent to TorBox');
		}

		const torrentId = createResult.data.torrent_id;

		try {
			// Wait for torrent to be ready
			const torrent = await waitForTorrentReady(apiKey, torrentId);
			if (!torrent) {
				throw new Error('Torrent did not become ready in time');
			}

			// Find the biggest file (or use stored fileId if available)
			if (!torrent.files || torrent.files.length === 0) {
				throw new Error('No files in torrent');
			}

			const biggestFile = torrent.files.reduce((prev, current) => {
				return (prev.size || 0) > (current.size || 0) ? prev : current;
			});

			const fileId = biggestFile.id;

			// Get download link
			const downloadResult = await requestDownloadLink(apiKey, {
				torrent_id: torrentId,
				file_id: fileId,
			});

			if (!downloadResult.success || !downloadResult.data) {
				throw new Error('Failed to get download link');
			}

			const streamUrl = downloadResult.data;

			// Clean up - delete the torrent after getting the link
			await deleteTorrent(apiKey, torrentId);

			// Redirect to the download URL
			res.redirect(streamUrl);
		} catch (e) {
			// Clean up on error
			await deleteTorrent(apiKey, torrentId);
			throw e;
		}
	} catch (error: any) {
		console.error(
			'Failed to play TorBox link:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to play link' });
	}
}
