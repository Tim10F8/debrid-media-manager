import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const { code, redirect } = req.query;
	if (!code || typeof code !== 'string') {
		res.status(400).json({ errorMessage: "Missing 'code' query parameter" });
		return;
	}

	const requestBody = {
		code,
		client_id: process.env.TRAKT_CLIENT_ID,
		client_secret: process.env.TRAKT_CLIENT_SECRET,
		redirect_uri: redirect ?? '',
		grant_type: 'authorization_code',
	};

	try {
		const response = await fetch('https://api.trakt.tv/oauth/token', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const text = await response.text();
		try {
			const data = JSON.parse(text);
			res.status(response.ok ? 200 : response.status).json(data);
		} catch {
			console.error(
				'Trakt token exchange returned non-JSON:',
				response.status,
				text.slice(0, 500)
			);
			res.status(502).json({
				error: 'token_exchange_failed',
				error_description: 'Trakt returned non-JSON response',
			});
		}
	} catch (error) {
		console.error('Trakt token exchange fetch failed:', error);
		res.status(500).json({ error: 'token_exchange_failed', error_description: String(error) });
	}
}
