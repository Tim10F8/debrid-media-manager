import { repository as db } from '@/services/repository';
import { generateAllDebridUserId, validateAllDebridApiKey } from '@/utils/allDebridCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		res.status(405).end(`Method ${req.method} Not Allowed`);
		return;
	}

	const { apiKey, movieMaxSize, episodeMaxSize, otherStreamsLimit } = req.body;

	if (!apiKey || typeof apiKey !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing or invalid "apiKey" in request body',
		});
		return;
	}

	try {
		// Validate the API key
		const validation = await validateAllDebridApiKey(apiKey);
		if (!validation.valid) {
			res.status(401).json({
				status: 'error',
				errorMessage: 'Invalid AllDebrid API key',
			});
			return;
		}

		// Generate user ID
		const userId = await generateAllDebridUserId(apiKey);

		// Update the profile with size limits
		const profile = await db.saveAllDebridCastProfile(
			userId,
			apiKey,
			movieMaxSize,
			episodeMaxSize,
			otherStreamsLimit
		);

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
		console.error('Error updating AllDebrid size limits:', error);
		res.status(500).json({
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
