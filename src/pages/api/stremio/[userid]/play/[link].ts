import { unrestrictLink } from '@/services/realDebrid';
import { NextApiRequest, NextApiResponse } from 'next';

// Unrestrict and play a link
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, link, token } = req.query;
	if (typeof userid !== 'string' || typeof link !== 'string' || typeof token !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid", "link" or "token" query parameter',
		});
		return;
	}

	try {
		const ipAddress = (req.headers['cf-connecting-ip'] as string) ?? req.socket.remoteAddress;
		const unrestrict = await unrestrictLink(
			token,
			`https://real-debrid.com/d/${link.substring(0, 13)}`,
			ipAddress,
			false
		);
		if (!unrestrict) {
			return res.status(500).json({ error: 'Failed to unrestrict link' });
		}

		res.redirect(unrestrict.download);
	} catch (error: any) {
		console.error(
			'Failed to play link:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to play link' });
	}
}
