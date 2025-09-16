import { TorrentInfoResponse } from '@/services/types';
import { isValidHash } from './extractHashes';

export async function submitAvailability(
	dmmProblemKey: string,
	solution: string,
	torrentInfo: TorrentInfoResponse,
	imdbId: string
) {
	// filter out any torrents that are not downloaded for now
	if (torrentInfo.status !== 'downloaded') {
		return;
	}

	try {
		const response = await fetch('/api/availability', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				...torrentInfo,
				imdbId,
				dmmProblemKey,
				solution,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to submit availability');
		}

		return await response.json();
	} catch (error) {
		console.error('Error submitting availability:', error);
		throw error;
	}
}

export async function checkAvailability(
	dmmProblemKey: string,
	solution: string,
	imdbId: string,
	hashes: string[]
) {
	try {
		// Filter out invalid hashes proactively to avoid API 400s
		const validHashes = (hashes || []).filter(isValidHash);
		if (validHashes.length === 0) {
			return { available: [] } as any;
		}
		const response = await fetch('/api/availability/check', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				imdbId,
				hashes: validHashes,
				dmmProblemKey,
				solution,
			}),
		});

		if (!response.ok) {
			let error: any = {};
			try {
				error = await response.json();
			} catch {}
			const detail = error.hash ? ` (invalid: ${error.hash})` : '';
			throw new Error(
				error.error || error.errorMessage || `Failed to check availability${detail}`
			);
		}

		return await response.json();
	} catch (error) {
		console.error('Error checking availability:', error);
		throw error;
	}
}

export async function checkAvailabilityByHashes(
	dmmProblemKey: string,
	solution: string,
	hashes: string[]
) {
	try {
		// Filter out invalid hashes proactively to avoid API 400s
		const validHashes = (hashes || []).filter(isValidHash);
		if (validHashes.length === 0) {
			return { available: [] } as any;
		}
		const response = await fetch('/api/availability/check2', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				hashes: validHashes,
				dmmProblemKey,
				solution,
			}),
		});

		if (!response.ok) {
			let error: any = {};
			try {
				error = await response.json();
			} catch {}
			const detail = error.hash ? ` (invalid: ${error.hash})` : '';
			throw new Error(
				error.error ||
					error.errorMessage ||
					`Failed to check availability by hashes${detail}`
			);
		}

		return await response.json();
	} catch (error) {
		console.error('Error checking availability by hashes:', error);
		throw error;
	}
}

export async function removeAvailability(
	dmmProblemKey: string,
	solution: string,
	hash: string,
	reason: string
) {
	try {
		const response = await fetch('/api/availability/remove', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				hash,
				reason,
				dmmProblemKey,
				solution,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to remove availability');
		}

		return await response.json();
	} catch (error) {
		console.error('Error removing availability:', error);
		throw error;
	}
}
