import { unrestrictLink } from '@/services/realDebrid';
import { NextApiRequest, NextApiResponse } from 'next';

export interface UnrestrictRequest {
	link: string;
	hash: string;
	fileId: number;
	accessToken: string;
}

export interface UnrestrictTrackResponse {
	streamUrl: string;
	filename: string;
	filesize: number;
	mimeType: string;
}

const MIME_TYPES: Record<string, string> = {
	'.flac': 'audio/flac',
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.aac': 'audio/aac',
	'.ogg': 'audio/ogg',
	'.opus': 'audio/opus',
	'.wav': 'audio/wav',
	'.wma': 'audio/x-ms-wma',
};

function getMimeType(filename: string): string {
	const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
	return MIME_TYPES[ext] ?? 'audio/mpeg';
}

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse<UnrestrictTrackResponse | { error: string; errorCode?: number }>
) {
	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	const { link, accessToken } = req.body as UnrestrictRequest;

	if (!accessToken) {
		return res.status(401).json({ error: 'Missing access token' });
	}

	if (!link) {
		return res.status(400).json({ error: 'Missing link parameter' });
	}

	const ipAddress =
		(req.headers['cf-connecting-ip'] as string) ??
		(req.headers['x-forwarded-for'] as string)?.split(',')[0] ??
		req.socket.remoteAddress ??
		'';

	try {
		const unrestricted = await unrestrictLink(accessToken, link, ipAddress);

		return res.status(200).json({
			streamUrl: unrestricted.download,
			filename: unrestricted.filename,
			filesize: unrestricted.filesize,
			mimeType: getMimeType(unrestricted.filename),
		});
	} catch (error: unknown) {
		const axiosError = (error as any)?.response?.data;
		const errorCode = axiosError?.error_code;
		const errorMessage =
			axiosError?.error || (error as Error)?.message || 'Failed to unrestrict link';

		console.error('[Music Unrestrict] Error:', {
			link: link?.substring(0, 50),
			errorCode,
			errorMessage,
			status: (error as any)?.response?.status,
		});

		return res.status(500).json({
			error: errorMessage,
			errorCode,
		});
	}
}
