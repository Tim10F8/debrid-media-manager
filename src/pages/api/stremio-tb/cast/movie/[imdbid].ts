import { repository as db } from '@/services/repository';
import { getBiggestFileTorBoxStreamUrl } from '@/utils/getTorBoxStreamUrl';
import { generateTorBoxUserId } from '@/utils/torboxCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

// MOVIE cast: gets a stream URL from TorBox and saves it to the database
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { imdbid, apiKey, hash } = req.query;
	if (!apiKey || !hash) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing "apiKey" or "hash" query parameter',
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

	try {
		const [streamUrl, fileSize, torrentId, fileId] = await getBiggestFileTorBoxStreamUrl(
			apiKey,
			hash
		);

		if (streamUrl) {
			const message = 'You can now stream the movie in Stremio';

			const userid = await generateTorBoxUserId(apiKey);

			// For TorBox, we store the filename/URL as the display name
			const filename = streamUrl.split('/').pop() ?? 'Unknown';

			await db.saveTorBoxCast(
				imdbid,
				userid,
				hash,
				filename, // url field stores the filename for display
				streamUrl, // link field stores the actual stream URL
				fileSize,
				torrentId,
				fileId
			);

			res.status(200).json({
				status: 'success',
				message,
				filename,
			});
			return;
		} else {
			res.status(500).json({
				status: 'error',
				errorMessage: 'Failed to get stream URL',
			});
		}
	} catch (e) {
		console.error(e);
		res.status(500).json({
			status: 'error',
			errorMessage: `Failed to get stream URL for ${imdbid}: ${e instanceof Error ? e.message : e}`,
		});
		return;
	}
}
