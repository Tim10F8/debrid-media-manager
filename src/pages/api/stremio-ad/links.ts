import { repository as db } from '@/services/repository';
import { generateAllDebridUserId, validateAllDebridApiKey } from '@/utils/allDebridCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET']);
		res.status(405).end(`Method ${req.method} Not Allowed`);
		return;
	}

	const { apiKey } = req.query;

	if (!apiKey || typeof apiKey !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing or invalid "apiKey" query parameter',
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

		// Fetch all casted links
		const links = await db.fetchAllAllDebridCastedLinks(userId);

		res.status(200).json({
			status: 'success',
			links,
		});
	} catch (error) {
		console.error('Error fetching AllDebrid casted links:', error);
		res.status(500).json({
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
