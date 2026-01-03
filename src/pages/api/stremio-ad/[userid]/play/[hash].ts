import { getMagnetFiles, MagnetFile, unlockLink } from '@/services/allDebrid';
import { repository as db } from '@/services/repository';
import {
	getBiggestFileAllDebridStreamUrl,
	getFileByNameAllDebridStreamUrl,
} from '@/utils/getAllDebridStreamUrl';
import { NextApiRequest, NextApiResponse } from 'next';

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

// Play an AllDebrid file from an existing magnet
// Supports two formats:
// 1. magnetId:fileIndex (e.g., "123456:0") - direct lookup
// 2. hash (e.g., "fbadffe5476df0674dbec75e81426895e40b6427") - legacy format
//    - With ?file=filename: matches specific file by name (for TV episodes)
//    - Without ?file: uses biggest file (for movies)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, hash, file } = req.query;
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
		let streamUrl: string;

		// Check if it's magnetId:fileIndex format or a torrent hash
		if (hash.includes(':')) {
			// Format: magnetId:fileIndex
			const parts = hash.split(':');
			if (parts.length !== 2) {
				res.status(400).json({
					status: 'error',
					errorMessage: 'Invalid format. Expected magnetId:fileIndex',
				});
				return;
			}

			const magnetId = parseInt(parts[0], 10);
			const fileIndex = parseInt(parts[1], 10);

			if (isNaN(magnetId) || isNaN(fileIndex)) {
				res.status(400).json({
					status: 'error',
					errorMessage: 'Invalid magnetId or fileIndex',
				});
				return;
			}

			// Get files with download links from the existing magnet
			const filesResult = await getMagnetFiles(apiKey, [magnetId]);
			const magnetFiles = filesResult.magnets?.[0];

			if (!magnetFiles) {
				throw new Error('Magnet not found');
			}

			if (magnetFiles.error) {
				throw new Error(magnetFiles.error.message);
			}

			// Flatten files and filter for video files (same as catalog helper)
			const flatFiles = flattenFiles(magnetFiles.files || []);
			const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
			const videoFiles = flatFiles.filter((f) => {
				const filename = f.path.split('/').pop()?.toLowerCase() || '';
				return videoExtensions.some((ext) => filename.endsWith(ext));
			});

			// Sort videos by title (same order as catalog helper)
			videoFiles.sort((a, b) => {
				const aName = a.path.split('/').pop() || '';
				const bName = b.path.split('/').pop() || '';
				return aName.localeCompare(bName);
			});

			if (fileIndex < 0 || fileIndex >= videoFiles.length) {
				throw new Error(`File index ${fileIndex} out of range (0-${videoFiles.length - 1})`);
			}

			const selectedFile = videoFiles[fileIndex];

			// Unlock the AllDebrid link to get the actual download URL
			const unlocked = await unlockLink(apiKey, selectedFile.link);
			streamUrl = unlocked.link;
		} else {
			// Legacy format: torrent hash
			const filename = typeof file === 'string' ? file : undefined;

			if (filename) {
				// Match by filename (for TV episodes from season packs)
				const [url] = await getFileByNameAllDebridStreamUrl(apiKey, hash, filename);
				if (!url) {
					throw new Error(`Failed to find file "${filename}" in magnet`);
				}
				streamUrl = url;
			} else {
				// No filename provided - use biggest file (for movies)
				const [url] = await getBiggestFileAllDebridStreamUrl(apiKey, hash);
				if (!url) {
					throw new Error('Failed to get stream URL for magnet');
				}
				streamUrl = url;
			}
		}

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
