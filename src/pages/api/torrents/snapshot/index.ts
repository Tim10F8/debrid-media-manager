import { repository } from '@/services/repository';
import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
	api: {
		bodyParser: {
			sizeLimit: '10mb',
		},
	},
};

function getSharedSecret() {
	return process.env.ZURGTORRENT_SYNC_SECRET;
}

function extractHash(payload: any): string | null {
	if (!payload) return null;
	if (typeof payload.Hash === 'string') return payload.Hash;
	if (typeof payload.hash === 'string') return payload.hash;
	return null;
}

function deriveSnapshotId(hash: string, added: unknown): { id: string; date: Date } {
	let datePart = '';
	if (typeof added === 'string' && added.length >= 10) {
		datePart = added.slice(0, 10);
	}
	if (!datePart) {
		datePart = new Date().toISOString().slice(0, 10);
	}
	let addedDate = new Date(datePart);
	if (Number.isNaN(addedDate.getTime()) && typeof added === 'string') {
		addedDate = new Date(added);
	}
	if (Number.isNaN(addedDate.getTime())) {
		addedDate = new Date();
	}
	return {
		id: `${hash}:${datePart}`,
		date: addedDate,
	};
}

function isValidHash(hash: string): boolean {
	return /^[a-fA-F0-9]{40}$/.test(hash);
}

function generatePassword(hash: string, salt: string): string {
	return crypto
		.createHash('sha1')
		.update(hash + salt)
		.digest('hex');
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
	const sharedSecret = getSharedSecret();
	if (!sharedSecret) {
		console.error('Missing ZURGTORRENT_SYNC_SECRET environment variable');
		return res.status(500).json({ message: 'Server misconfiguration' });
	}

	const authHeader = req.headers['x-zurg-token'];
	const token = Array.isArray(authHeader) ? authHeader[0] : authHeader;
	if (token !== sharedSecret) {
		console.warn('Rejected torrent snapshot ingestion due to invalid sync secret');
		return res.status(401).json({ message: 'Unauthorized' });
	}

	const payload = req.body;
	const hash = extractHash(payload);

	if (!hash) {
		console.warn('Torrent snapshot payload missing hash field');
		return res.status(400).json({ message: 'Missing torrent hash' });
	}

	try {
		const { id, date } = deriveSnapshotId(hash, payload?.Added ?? payload?.added);
		await repository.upsertTorrentSnapshot({
			id,
			hash,
			addedDate: date,
			payload,
		});
		return res.status(201).json({ success: true, id });
	} catch (error) {
		console.error('Failed to persist torrent snapshot', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
	const sharedSecret = getSharedSecret();
	if (!sharedSecret) {
		console.error('Missing ZURGTORRENT_SYNC_SECRET environment variable');
		return res.status(500).json({ message: 'Server misconfiguration' });
	}

	const hashParam = req.query.hash;
	const password = req.query.password;

	if (typeof hashParam !== 'string' || typeof password !== 'string') {
		return res.status(400).json({ message: 'Missing required parameters' });
	}

	if (!isValidHash(hashParam)) {
		return res.status(400).json({ message: 'Invalid hash format' });
	}

	const expected = generatePassword(hashParam, sharedSecret);
	if (password !== expected) {
		console.warn('Rejected torrent snapshot request due to invalid password');
		return res.status(401).json({ message: 'Unauthorized' });
	}

	try {
		const snapshot = await repository.getLatestTorrentSnapshot(hashParam);

		if (!snapshot) {
			return res.status(404).json({ message: 'Not found' });
		}

		return res.status(200).json(snapshot.payload);
	} catch (error) {
		console.error('Failed to load torrent snapshot', error);
		return res.status(500).json({ message: 'Internal server error' });
	}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method === 'POST') {
		return handlePost(req, res);
	}
	if (req.method === 'GET') {
		return handleGet(req, res);
	}
	return res.status(405).json({ message: 'Method not allowed' });
}
