import { repository as db } from '@/services/repository';
import { requestDownloadLink } from '@/services/torbox';
import { NextApiRequest, NextApiResponse } from 'next';

// Play a TorBox file from an existing torrent
// Format: torrentId:fileId (e.g., "123456:789")
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

	// Parse torrentId:fileId format
	const parts = hash.split(':');
	if (parts.length !== 2) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid format. Expected torrentId:fileId',
		});
		return;
	}

	const torrentId = parseInt(parts[0], 10);
	const fileId = parseInt(parts[1], 10);

	if (isNaN(torrentId) || isNaN(fileId)) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid torrentId or fileId',
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

	const apiKey = profile.apiKey;

	try {
		// Get download link for the specific file
		const downloadResult = await requestDownloadLink(apiKey, {
			torrent_id: torrentId,
			file_id: fileId,
		});

		if (!downloadResult.success || !downloadResult.data) {
			throw new Error('Failed to get download link');
		}

		const streamUrl = downloadResult.data;

		// Redirect to the download URL
		res.redirect(streamUrl);
	} catch (error: any) {
		console.error(
			'Failed to play TorBox link:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to play link' });
	}
}
