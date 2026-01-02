import { repository as db } from '@/services/repository';
import { deleteTorrent } from '@/services/torbox';
import { getTorBoxStreamUrlKeepTorrent } from '@/utils/getTorBoxStreamUrl';
import { generateTorBoxUserId } from '@/utils/torboxCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

// SERIES cast: gets stream URLs for multiple episodes from TorBox and saves them to the database
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { imdbid, apiKey, hash, fileIds } = req.query;
	if (!apiKey || !hash || !fileIds) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing "apiKey", "hash", or "fileIds" query parameter',
		});
		return;
	}
	if (typeof imdbid !== 'string' || typeof apiKey !== 'string' || typeof hash !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "apiKey" or "hash" query parameter',
		});
		return;
	}

	const fileIdArray = Array.isArray(fileIds) ? fileIds : [fileIds];

	try {
		const userid = await generateTorBoxUserId(apiKey);
		const errorEpisodes: string[] = [];
		let lastTorrentId: number | null = null;

		for (const fileIdStr of fileIdArray) {
			const fileId = parseInt(fileIdStr, 10);
			if (isNaN(fileId)) {
				errorEpisodes.push(`Invalid fileId: ${fileIdStr}`);
				continue;
			}

			try {
				const [streamUrl, seasonNumber, episodeNumber, fileSize, torrentId, , filename] =
					await getTorBoxStreamUrlKeepTorrent(apiKey, hash, fileId, 'series');

				lastTorrentId = torrentId;

				if (streamUrl) {
					// Build imdbId with season:episode suffix
					let episodeImdbId = imdbid;
					if (seasonNumber > 0 && episodeNumber > 0) {
						episodeImdbId = `${imdbid}:${seasonNumber}:${episodeNumber}`;
					}

					await db.saveTorBoxCast(
						episodeImdbId,
						userid,
						hash,
						filename, // url field stores the filename for display
						streamUrl, // link field stores the actual stream URL
						fileSize,
						torrentId,
						fileId
					);
				} else {
					errorEpisodes.push(`File ${fileId}`);
				}
			} catch (e) {
				console.error(`Error casting file ${fileId}:`, e);
				errorEpisodes.push(`File ${fileId}`);
			}
		}

		// Clean up: delete the torrent after processing all files
		if (lastTorrentId) {
			try {
				await deleteTorrent(apiKey, lastTorrentId);
			} catch (e) {
				console.error('Error deleting torrent:', e);
			}
		}

		res.status(200).json({
			status: errorEpisodes.length === 0 ? 'success' : 'partial',
			errorEpisodes,
		});
	} catch (e) {
		console.error(e);
		res.status(500).json({
			status: 'error',
			errorMessage: `Failed to cast series for ${imdbid}: ${e instanceof Error ? e.message : e}`,
		});
	}
}
