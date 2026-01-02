import {
	generateAllDebridUserId,
	validateApiKey,
	validateMethod,
} from '@/utils/allDebridCastApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	if (!validateMethod(req, res, ['GET'])) return;

	const apiKey = validateApiKey(req, res);
	if (!apiKey) return;

	try {
		const id = await generateAllDebridUserId(apiKey);
		res.status(200).json({ id });
	} catch (error) {
		res.status(500).json({
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Unknown error',
		});
	}
}
