import { getToken } from '@/services/realDebrid';
import { repository as db } from '@/services/repository';
import { generateUserId } from '@/utils/castApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const { clientId, clientSecret, refreshToken, movieMaxSize, episodeMaxSize } = req.body;

		if (!clientId || !clientSecret) {
			return res.status(400).json({ error: 'Missing required fields' });
		}

		if (movieMaxSize === undefined && episodeMaxSize === undefined) {
			return res.status(400).json({ error: 'At least one size limit must be provided' });
		}

		let response: { access_token: string } | null = null;
		try {
			response = await getToken(clientId, clientSecret, refreshToken, true);
			if (!response) {
				throw new Error(`no token found`);
			}
		} catch (error) {
			console.error(error);
			res.status(500).json({ error: `Failed to get Real-Debrid token: ${error}` });
			return;
		}

		const userid = await generateUserId(response.access_token);

		const profile = await db.saveCastProfile(
			userid,
			clientId,
			clientSecret,
			refreshToken || null,
			movieMaxSize !== undefined ? Number(movieMaxSize) : undefined,
			episodeMaxSize !== undefined ? Number(episodeMaxSize) : undefined
		);

		return res.status(200).json(profile);
	} catch (error) {
		console.error('Error updating size limits:', error);
		return res.status(500).json({ error: `Internal Server Error: ${error}` });
	}
}
