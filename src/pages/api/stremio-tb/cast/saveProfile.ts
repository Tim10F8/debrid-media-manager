import { repository as db } from '@/services/repository';
import { generateTorBoxUserId, validateTorBoxApiKey } from '@/utils/torboxCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		res.status(405).end(`Method ${req.method} Not Allowed`);
		return;
	}

	const { apiKey } = req.body;

	if (!apiKey || typeof apiKey !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing or invalid "apiKey" in request body',
		});
		return;
	}

	try {
		// Validate the API key
		const validation = await validateTorBoxApiKey(apiKey);
		if (!validation.valid) {
			res.status(401).json({
				status: 'error',
				errorMessage: 'Invalid TorBox API key',
			});
			return;
		}

		// Generate user ID
		const userId = await generateTorBoxUserId(apiKey);

		// Save the profile
		const profile = await db.saveTorBoxCastProfile(userId, apiKey);

		res.status(200).json({
			status: 'success',
			profile: {
				userId: profile.userId,
				movieMaxSize: profile.movieMaxSize,
				episodeMaxSize: profile.episodeMaxSize,
				otherStreamsLimit: profile.otherStreamsLimit,
			},
		});
	} catch (error) {
		console.error('Error saving TorBox cast profile:', error);
		res.status(500).json({
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
