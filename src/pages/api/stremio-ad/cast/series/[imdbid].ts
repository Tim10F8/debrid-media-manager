import { repository as db } from '@/services/repository';
import { generateAllDebridUserId } from '@/utils/allDebridCastApiHelpers';
import { getAllDebridStreamUrlKeepMagnet } from '@/utils/getAllDebridStreamUrl';
import { NextApiRequest, NextApiResponse } from 'next';

// SERIES cast: gets stream URLs for multiple episodes from AllDebrid and saves them to the database
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { imdbid, apiKey, hash, fileIndices } = req.query;
	if (!apiKey || !hash || !fileIndices) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing "apiKey", "hash", or "fileIndices" query parameter',
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

	const fileIndexArray = Array.isArray(fileIndices) ? fileIndices : [fileIndices];

	try {
		const userid = await generateAllDebridUserId(apiKey);
		const errorEpisodes: string[] = [];

		for (const fileIndexStr of fileIndexArray) {
			const fileIndex = parseInt(fileIndexStr, 10);
			if (isNaN(fileIndex)) {
				errorEpisodes.push(`Invalid fileIndex: ${fileIndexStr}`);
				continue;
			}

			try {
				const [streamUrl, seasonNumber, episodeNumber, fileSize, magnetId, , filename] =
					await getAllDebridStreamUrlKeepMagnet(apiKey, hash, fileIndex, 'series');

				if (streamUrl) {
					// Build imdbId with season:episode suffix
					let episodeImdbId = imdbid;
					if (seasonNumber >= 0 && episodeNumber >= 0) {
						episodeImdbId = `${imdbid}:${seasonNumber}:${episodeNumber}`;
					}

					await db.saveAllDebridCast(
						episodeImdbId,
						userid,
						hash,
						filename, // url field stores the filename for display
						streamUrl, // link field stores the actual stream URL
						fileSize,
						magnetId,
						fileIndex
					);
				} else {
					errorEpisodes.push(`File ${fileIndex}`);
				}
			} catch (e) {
				console.error(`Error casting file ${fileIndex}:`, e);
				errorEpisodes.push(`File ${fileIndex}`);
			}
		}

		res.status(200).json({
			status: errorEpisodes.length === 0 ? 'success' : 'partial',
			errorEpisodes,
		});
	} catch (e) {
		console.error(e);
		const message = e instanceof Error ? e.message : String(e);
		res.status(500).json({
			status: 'error',
			errorMessage: message,
		});
	}
}
