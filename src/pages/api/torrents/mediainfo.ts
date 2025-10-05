import type { MediaInfoResponse } from '@/components/showInfo/types';
import { repository } from '@/services/repository';
import type { NextApiRequest, NextApiResponse } from 'next';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function hasMediaInfo(selectedFiles: unknown): selectedFiles is MediaInfoResponse['SelectedFiles'] {
	if (!isRecord(selectedFiles)) return false;
	for (const entry of Object.values(selectedFiles)) {
		if (!isRecord(entry)) continue;
		const media =
			(entry as Record<string, unknown>).MediaInfo ??
			(entry as Record<string, unknown>).mediaInfo;
		if (isRecord(media)) {
			return true;
		}
	}
	return false;
}

function coerceMediaInfo(payload: unknown): MediaInfoResponse | null {
	if (!isRecord(payload)) return null;

	const selectedFiles =
		(payload as Record<string, unknown>).SelectedFiles ??
		(payload as Record<string, unknown>).selectedFiles;
	if (hasMediaInfo(selectedFiles)) {
		return { SelectedFiles: selectedFiles };
	}

	const mediaInfo =
		(payload as Record<string, unknown>).MediaInfo ??
		(payload as Record<string, unknown>).mediaInfo;
	if (isRecord(mediaInfo)) {
		return {
			SelectedFiles: {
				default: {
					MediaInfo: mediaInfo as MediaInfoResponse['SelectedFiles'][string]['MediaInfo'],
				},
			},
		};
	}

	return null;
}

function isValidHash(value: string): boolean {
	return /^[a-fA-F0-9]{40}$/.test(value);
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
	const hash = typeof req.query.hash === 'string' ? req.query.hash : '';

	if (!hash) {
		return res.status(400).json({ message: 'Missing hash parameter' });
	}

	if (!isValidHash(hash)) {
		console.warn('Rejected torrent media info request due to invalid hash', { hash });
		return res.status(400).json({ message: 'Invalid hash format' });
	}

	try {
		const snapshot = await repository.getLatestTorrentSnapshot(hash);
		if (!snapshot) {
			console.info('No torrent snapshot available for media info', { hash });
			return res.status(404).json({ message: 'Not found' });
		}

		const mediaInfo = coerceMediaInfo(snapshot.payload);
		if (!mediaInfo) {
			console.info('Torrent snapshot missing media info payload', { hash });
			return res.status(404).json({ message: 'Not found' });
		}

		return res.status(200).json(mediaInfo);
	} catch (error) {
		console.error('Failed to load torrent media info from snapshot', {
			hash,
			error: error instanceof Error ? error.message : String(error),
		});
		return res.status(500).json({ message: 'Internal server error' });
	}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ message: 'Method not allowed' });
	}

	return handleGet(req, res);
}
