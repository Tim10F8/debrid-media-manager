import { getMagnetFiles, getMagnetStatus, MagnetFile, uploadMagnet } from '@/services/allDebrid';
import ptt from 'parse-torrent-title';

const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 5000;

interface FlatFile {
	path: string;
	size: number;
	link: string;
}

/**
 * Flatten nested file structure to find all files with links
 * AllDebrid returns files in a nested tree format with folders
 */
function flattenFiles(files: MagnetFile[], parentPath: string = ''): FlatFile[] {
	const result: FlatFile[] = [];

	for (const file of files) {
		const fullPath = parentPath ? `${parentPath}/${file.n}` : file.n;

		if (file.l) {
			// It's a file with a download link
			result.push({
				path: fullPath,
				size: file.s || 0,
				link: file.l,
			});
		} else if (file.e) {
			// It's a folder, recurse into entries
			result.push(...flattenFiles(file.e, fullPath));
		}
	}

	return result;
}

/**
 * Wait for magnet to be ready (statusCode 4)
 */
async function waitForMagnetReady(apiKey: string, magnetId: number): Promise<boolean> {
	for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
		try {
			const status = await getMagnetStatus(apiKey, magnetId.toString());
			const magnet = status.data.magnets[0];

			if (!magnet) {
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
				continue;
			}

			// Status codes: 0-3 = processing, 4 = ready, 5-15 = error
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

/**
 * Get stream URL for a specific file by index
 * Used for TV shows where we need to cast specific episodes
 */
export const getAllDebridStreamUrl = async (
	apiKey: string,
	hash: string,
	fileIndex: number,
	mediaType: string
): Promise<[string, number, number, number, number, number]> => {
	let streamUrl = '';
	let seasonNumber = -1;
	let episodeNumber = -1;
	let fileSize = 0;
	let magnetId = 0;

	try {
		// 1. Upload magnet hash
		const uploadResult = await uploadMagnet(apiKey, [hash]);
		const magnet = uploadResult.magnets[0];

		if (magnet.error) {
			throw new Error(magnet.error.message);
		}

		magnetId = magnet.id!;

		// 2. Wait for magnet to be ready if not instant
		if (!magnet.ready) {
			const isReady = await waitForMagnetReady(apiKey, magnetId);
			if (!isReady) {
				throw new Error('Magnet did not become ready in time');
			}
		}

		// 3. Get files with download links
		const filesResult = await getMagnetFiles(apiKey, [magnetId]);
		const magnetFiles = filesResult.magnets[0];

		if (magnetFiles.error) {
			throw new Error(magnetFiles.error.message);
		}

		// 4. Flatten and find the requested file
		const flatFiles = flattenFiles(magnetFiles.files || []);

		if (flatFiles.length === 0) {
			throw new Error('No files found in magnet');
		}

		const targetFile = flatFiles[fileIndex];

		if (!targetFile) {
			throw new Error(`File at index ${fileIndex} not found in magnet`);
		}

		streamUrl = targetFile.link;
		fileSize = Math.round(targetFile.size / 1024 / 1024);

		// 5. Parse season/episode from filename if TV
		if (mediaType === 'tv' || mediaType === 'series') {
			const filename = targetFile.path.split('/').pop() || '';
			const info = ptt.parse(filename);
			seasonNumber = info.season || -1;
			episodeNumber = info.episode || -1;
		}

		// Note: AllDebrid links work even after magnet deletion
		// We keep the magnet for now to allow re-fetching links if needed
	} catch (error) {
		throw error;
	}

	return [streamUrl, seasonNumber, episodeNumber, fileSize, magnetId, fileIndex];
};

/**
 * Get stream URL for a file matching the given filename
 * Used for legacy casts where we need to match by filename
 */
export const getFileByNameAllDebridStreamUrl = async (
	apiKey: string,
	hash: string,
	targetFilename: string
): Promise<[string, number, number, number, string]> => {
	let streamUrl = '';
	let fileSize = 0;
	let magnetId = 0;
	let fileIndex = 0;
	let filename = '';

	try {
		// 1. Upload magnet hash
		const uploadResult = await uploadMagnet(apiKey, [hash]);
		const magnet = uploadResult.magnets[0];

		if (magnet.error) {
			throw new Error(magnet.error.message);
		}

		magnetId = magnet.id!;

		// 2. Wait for magnet to be ready if not instant
		if (!magnet.ready) {
			const isReady = await waitForMagnetReady(apiKey, magnetId);
			if (!isReady) {
				throw new Error('Magnet did not become ready in time');
			}
		}

		// 3. Get files with download links
		const filesResult = await getMagnetFiles(apiKey, [magnetId]);
		const magnetFiles = filesResult.magnets[0];

		if (magnetFiles.error) {
			throw new Error(magnetFiles.error.message);
		}

		// 4. Flatten files
		const flatFiles = flattenFiles(magnetFiles.files || []);

		if (flatFiles.length === 0) {
			throw new Error('No files found in magnet');
		}

		// 5. Find file matching the target filename
		let matchedIndex = flatFiles.findIndex((f) => {
			const shortName = f.path.split('/').pop() || f.path;
			return shortName === targetFilename || f.path === targetFilename;
		});

		// If no exact match, try case-insensitive
		if (matchedIndex === -1) {
			const lowerTarget = targetFilename.toLowerCase();
			matchedIndex = flatFiles.findIndex((f) => {
				const shortName = f.path.split('/').pop() || f.path;
				return shortName.toLowerCase() === lowerTarget || f.path.toLowerCase() === lowerTarget;
			});
		}

		if (matchedIndex === -1) {
			throw new Error(`File "${targetFilename}" not found in magnet`);
		}

		const matchedFile = flatFiles[matchedIndex];
		streamUrl = matchedFile.link;
		fileSize = Math.round(matchedFile.size / 1024 / 1024);
		fileIndex = matchedIndex;
		filename = matchedFile.path.split('/').pop() || 'Unknown';
	} catch (error) {
		throw error;
	}

	return [streamUrl, fileSize, magnetId, fileIndex, filename];
};

/**
 * Get stream URL for the biggest file in the magnet
 * Used for movies where we want the main video file
 */
export const getBiggestFileAllDebridStreamUrl = async (
	apiKey: string,
	hash: string
): Promise<[string, number, number, number, string]> => {
	let streamUrl = '';
	let fileSize = 0;
	let magnetId = 0;
	let fileIndex = 0;
	let filename = '';

	try {
		// 1. Upload magnet hash
		const uploadResult = await uploadMagnet(apiKey, [hash]);
		const magnet = uploadResult.magnets[0];

		if (magnet.error) {
			throw new Error(magnet.error.message);
		}

		magnetId = magnet.id!;

		// 2. Wait for magnet to be ready if not instant
		if (!magnet.ready) {
			const isReady = await waitForMagnetReady(apiKey, magnetId);
			if (!isReady) {
				throw new Error('Magnet did not become ready in time');
			}
		}

		// 3. Get files with download links
		const filesResult = await getMagnetFiles(apiKey, [magnetId]);
		const magnetFiles = filesResult.magnets[0];

		if (magnetFiles.error) {
			throw new Error(magnetFiles.error.message);
		}

		// 4. Flatten and find the biggest file
		const flatFiles = flattenFiles(magnetFiles.files || []);

		if (flatFiles.length === 0) {
			throw new Error('No files found in magnet');
		}

		// Find biggest file
		let biggestFile = flatFiles[0];
		let biggestIndex = 0;
		for (let i = 1; i < flatFiles.length; i++) {
			if (flatFiles[i].size > biggestFile.size) {
				biggestFile = flatFiles[i];
				biggestIndex = i;
			}
		}

		streamUrl = biggestFile.link;
		fileSize = Math.round(biggestFile.size / 1024 / 1024);
		fileIndex = biggestIndex;
		filename = biggestFile.path.split('/').pop() || 'Unknown';
	} catch (error) {
		throw error;
	}

	return [streamUrl, fileSize, magnetId, fileIndex, filename];
};

/**
 * Get stream URL for a specific file without any cleanup
 * This is useful when casting multiple files from the same torrent
 */
export const getAllDebridStreamUrlKeepMagnet = async (
	apiKey: string,
	hash: string,
	fileIndex: number,
	mediaType: string
): Promise<[string, number, number, number, number, number, string]> => {
	let streamUrl = '';
	let seasonNumber = -1;
	let episodeNumber = -1;
	let fileSize = 0;
	let magnetId = 0;
	let filename = '';

	try {
		// 1. Upload magnet hash
		const uploadResult = await uploadMagnet(apiKey, [hash]);
		const magnet = uploadResult.magnets[0];

		if (magnet.error) {
			throw new Error(magnet.error.message);
		}

		magnetId = magnet.id!;

		// 2. Wait for magnet to be ready if not instant
		if (!magnet.ready) {
			const isReady = await waitForMagnetReady(apiKey, magnetId);
			if (!isReady) {
				throw new Error('Magnet did not become ready in time');
			}
		}

		// 3. Get files with download links
		const filesResult = await getMagnetFiles(apiKey, [magnetId]);
		const magnetFiles = filesResult.magnets[0];

		if (magnetFiles.error) {
			throw new Error(magnetFiles.error.message);
		}

		// 4. Flatten and find the requested file
		const flatFiles = flattenFiles(magnetFiles.files || []);

		if (flatFiles.length === 0) {
			throw new Error('No files found in magnet');
		}

		const targetFile = flatFiles[fileIndex];

		if (!targetFile) {
			throw new Error(`File at index ${fileIndex} not found in magnet`);
		}

		streamUrl = targetFile.link;
		fileSize = Math.round(targetFile.size / 1024 / 1024);
		filename = targetFile.path.split('/').pop() || '';

		// 5. Parse season/episode from filename if TV
		if (mediaType === 'tv' || mediaType === 'series') {
			const info = ptt.parse(filename);
			seasonNumber = info.season || -1;
			episodeNumber = info.episode || -1;
		}
	} catch (error) {
		throw error;
	}

	return [streamUrl, seasonNumber, episodeNumber, fileSize, magnetId, fileIndex, filename];
};

/**
 * Get all video files from a magnet with their stream URLs
 * Used for TV show season packs
 */
export const getAllDebridVideoFiles = async (
	apiKey: string,
	hash: string
): Promise<
	Array<{
		index: number;
		path: string;
		filename: string;
		size: number;
		link: string;
		season?: number;
		episode?: number;
	}>
> => {
	// 1. Upload magnet hash
	const uploadResult = await uploadMagnet(apiKey, [hash]);
	const magnet = uploadResult.magnets[0];

	if (magnet.error) {
		throw new Error(magnet.error.message);
	}

	const magnetId = magnet.id!;

	// 2. Wait for magnet to be ready if not instant
	if (!magnet.ready) {
		const isReady = await waitForMagnetReady(apiKey, magnetId);
		if (!isReady) {
			throw new Error('Magnet did not become ready in time');
		}
	}

	// 3. Get files with download links
	const filesResult = await getMagnetFiles(apiKey, [magnetId]);
	const magnetFiles = filesResult.magnets[0];

	if (magnetFiles.error) {
		throw new Error(magnetFiles.error.message);
	}

	// 4. Flatten files
	const flatFiles = flattenFiles(magnetFiles.files || []);

	// 5. Filter for video files and parse episode info
	const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
	const videoFiles = flatFiles
		.map((file, index) => {
			const filename = file.path.split('/').pop() || '';
			const isVideo = videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));

			if (!isVideo) return null;

			const info = ptt.parse(filename);

			return {
				index,
				path: file.path,
				filename,
				size: Math.round(file.size / 1024 / 1024),
				link: file.link,
				season: info.season,
				episode: info.episode,
			};
		})
		.filter((f): f is NonNullable<typeof f> => f !== null);

	return videoFiles;
};
