import {
	getMagnetFiles,
	getMagnetStatus,
	MagnetFile,
	unlockLink,
	uploadMagnet,
} from '@/services/allDebrid';
import { repository as db } from '@/services/repository';
import { NextApiRequest, NextApiResponse } from 'next';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;

interface FlatFile {
	path: string;
	size: number;
	link: string;
}

function flattenFiles(files: MagnetFile[], parentPath: string = ''): FlatFile[] {
	const result: FlatFile[] = [];

	for (const file of files) {
		const fullPath = parentPath ? `${parentPath}/${file.n}` : file.n;

		if (file.l) {
			result.push({
				path: fullPath,
				size: file.s || 0,
				link: file.l,
			});
		} else if (file.e) {
			result.push(...flattenFiles(file.e, fullPath));
		}
	}

	return result;
}

async function waitForMagnetReady(apiKey: string, magnetId: number): Promise<boolean> {
	for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
		try {
			const status = await getMagnetStatus(apiKey, magnetId.toString());
			const magnet = status.data.magnets[0];

			if (!magnet) {
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
				continue;
			}

			if (magnet.statusCode === 4) {
				return true;
			}

			if (magnet.statusCode >= 5) {
				throw new Error(`Magnet failed with status: ${magnet.status}`);
			}

			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		} catch (error) {
			console.error('[AllDebrid] Error polling magnet status:', error);
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}
	}

	return false;
}

// Regenerate and play an AllDebrid download link
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

	// Get user's AllDebrid profile with API key
	let profile: { apiKey: string } | null = null;
	try {
		profile = await db.getAllDebridCastProfile(userid);
		if (!profile) {
			throw new Error(`no profile found for user ${userid}`);
		}
	} catch (error) {
		console.error(
			'Failed to get AllDebrid profile:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: `Failed to get AllDebrid profile for user ${userid}` });
		return;
	}

	const apiKey = profile.apiKey;

	try {
		// Upload magnet hash
		const uploadResult = await uploadMagnet(apiKey, [hash]);
		const magnet = uploadResult.magnets[0];

		if (magnet.error) {
			throw new Error(magnet.error.message);
		}

		const magnetId = magnet.id!;

		// Wait for magnet to be ready if not instant
		if (!magnet.ready) {
			const isReady = await waitForMagnetReady(apiKey, magnetId);
			if (!isReady) {
				throw new Error('Magnet did not become ready in time');
			}
		}

		// Get files with download links
		const filesResult = await getMagnetFiles(apiKey, [magnetId]);
		const magnetFiles = filesResult.magnets[0];

		if (magnetFiles.error) {
			throw new Error(magnetFiles.error.message);
		}

		// Flatten and find the biggest file
		const flatFiles = flattenFiles(magnetFiles.files || []);

		if (flatFiles.length === 0) {
			throw new Error('No files found in magnet');
		}

		// Find biggest file
		let biggestFile = flatFiles[0];
		for (let i = 1; i < flatFiles.length; i++) {
			if (flatFiles[i].size > biggestFile.size) {
				biggestFile = flatFiles[i];
			}
		}

		// Unlock the AllDebrid link to get the actual download URL
		const unlocked = await unlockLink(apiKey, biggestFile.link);
		const streamUrl = unlocked.link;

		// Redirect to the download URL
		res.redirect(streamUrl);
	} catch (error: any) {
		console.error(
			'Failed to play AllDebrid link:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to play link' });
	}
}
