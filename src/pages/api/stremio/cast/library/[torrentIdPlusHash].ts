import { getTorrentInfo } from '@/services/realDebrid';
import { repository as db } from '@/services/repository';
import { generateUserId } from '@/utils/castApiHelpers';
import { padWithZero } from '@/utils/checks';
import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';
import ptt from 'parse-torrent-title';

interface Stream {
	url: string;
}

interface Video {
	id: string;
	title: string;
	streams: Stream[];
}

interface TorrentioResponse {
	meta: {
		videos: Video[];
		infoHash: string;
	};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { torrentIdPlusHash, rdToken } = req.query;

	if (!rdToken || typeof rdToken !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing or invalid RD token',
		});
		return;
	}

	if (!torrentIdPlusHash || typeof torrentIdPlusHash !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Missing or invalid torrentid',
		});
		return;
	}

	const [torrentId, hash] = torrentIdPlusHash.split(':');

	// get torrent info
	const tInfo = await getTorrentInfo(rdToken, torrentId, false);
	const selectedFiles = tInfo.files.filter((f) => f.selected);
	// check if length of selected files is equal to length of links
	if (selectedFiles.length !== tInfo.links.length) {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Cannot determine file link',
		});
		return;
	}

	let imdbid = '',
		season = '',
		episode = '';

	// Step 1: Generate user ID from RD token
	let userid: string;
	try {
		userid = await generateUserId(rdToken);
	} catch (error) {
		console.error('Failed to generate user ID:', error);
		res.status(500).json({
			status: 'error',
			errorMessage:
				'Failed to generate user ID from RD token. Please check your RD token is valid.',
			details: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	// Step 2: Try to get IMDB ID from hash in database
	try {
		imdbid = (await db.getIMDBIdByHash(hash)) || '';
	} catch (error) {
		console.error('Failed to retrieve IMDB ID from database:', error);
		res.status(500).json({
			status: 'error',
			errorMessage: 'Database error: Failed to retrieve IMDB ID from hash',
			details: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	// Step 3: Process based on whether we have IMDB ID or not
	if (imdbid) {
		// Path A: IMDB ID exists in database, process selected files
		for (let i = 0; i < selectedFiles.length; i++) {
			const selectedFile = selectedFiles[i];

			// Parse filename to extract season/episode info
			let info;
			try {
				info = ptt.parse(selectedFile.path.split('/').pop() || '');
			} catch (error) {
				console.error(`Failed to parse filename "${selectedFile.path}":`, error);
				res.status(500).json({
					status: 'error',
					errorMessage: `Failed to parse filename: ${selectedFile.path}`,
					details: error instanceof Error ? error.message : String(error),
				});
				return;
			}

			// Save cast information to database
			try {
				const stremioKey = `${imdbid}${info.season && info.episode ? `:${info.season}:${info.episode}` : ''}`;
				await db.saveCast(
					stremioKey,
					userid,
					tInfo.hash,
					selectedFile.path,
					tInfo.links[i],
					Math.ceil(selectedFile.bytes / 1024 / 1024)
				);
			} catch (error) {
				console.error('Failed to save cast information to database:', error);
				res.status(500).json({
					status: 'error',
					errorMessage: 'Database error: Failed to save cast information',
					details: error instanceof Error ? error.message : String(error),
				});
				return;
			}
		}
	} else {
		// Path B: IMDB ID not found, fetch from Torrentio
		let response: Response;
		try {
			response = await fetch(
				`https://torrentio.strem.fun/realdebrid=${rdToken}/meta/other/realdebrid%3A${torrentIdPlusHash}.json`
			);
		} catch (error) {
			console.error('Failed to fetch from Torrentio API:', error);
			res.status(500).json({
				status: 'error',
				errorMessage:
					'Network error: Failed to fetch metadata from Torrentio. Please try again.',
				details: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		// Parse JSON response from Torrentio
		let data: TorrentioResponse;
		try {
			data = await response.json();
		} catch (error) {
			console.error('Failed to parse Torrentio response:', error);
			res.status(500).json({
				status: 'error',
				errorMessage: 'Invalid response from Torrentio API (failed to parse JSON)',
				details: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		// Validate response structure
		if (!data.meta || !data.meta.videos || !data.meta.videos.length) {
			res.status(404).json({
				status: 'error',
				errorMessage: 'No valid streams found in Torrentio response',
			});
			return;
		}

		const castableStreams: Video[] = data.meta.videos.filter((video: Video) =>
			video.id.startsWith('tt')
		);
		if (castableStreams.length === 0) {
			res.status(400).json({
				status: 'error',
				errorMessage: 'Cannot determine IMDB ID of the video from Torrentio response',
			});
			return;
		}

		// Process first stream (we'll redirect to the first episode)
		const firstVideo = castableStreams[0];
		const [firstVideoImdb, firstVideoSeason, firstVideoEpisode] = firstVideo.id.split(':');

		imdbid = firstVideoImdb;
		season = firstVideoSeason;
		episode = firstVideoEpisode;

		// Save all streams to database
		for (const video of castableStreams) {
			const [vImdbid, vSeason, vEpisode] = video.id.split(':');
			const vStreamUrl = video.streams[0].url;
			const stremioKey = `${vImdbid}${vSeason && vEpisode ? `:${vSeason}:${vEpisode}` : ''}`;

			// Fetch stream URL metadata (HEAD request to get redirect and file size)
			let headResp;
			try {
				headResp = await axios.head(vStreamUrl, { maxRedirects: 1 });
			} catch (error) {
				console.error(`Failed to fetch stream URL metadata for ${vStreamUrl}:`, error);
				res.status(500).json({
					status: 'error',
					errorMessage: `Failed to fetch stream URL metadata. The stream URL may be invalid or expired.`,
					streamUrl: vStreamUrl,
					details: error instanceof Error ? error.message : String(error),
				});
				return;
			}

			const vRedirectUrl = headResp.request.res.responseUrl || vStreamUrl;
			const selectedFile = selectedFiles.find((f) => f.path === video.title);
			const fileIndex = selectedFile ? selectedFiles.indexOf(selectedFile) : -1;
			const rdLink = fileIndex !== -1 ? tInfo.links[fileIndex] : '';
			const fileSize =
				(headResp.headers['content-length']
					? parseInt(headResp.headers['content-length'])
					: 0) /
				1024 /
				1024;

			// Save cast information to database
			try {
				await db.saveCast(
					stremioKey,
					userid,
					tInfo.hash,
					vRedirectUrl,
					rdLink,
					Math.ceil(fileSize / 1024 / 1024)
				);
			} catch (error) {
				console.error('Failed to save cast information to database:', error);
				res.status(500).json({
					status: 'error',
					errorMessage: 'Database error: Failed to save cast information',
					details: error instanceof Error ? error.message : String(error),
				});
				return;
			}
		}
	}

	// Prepare redirect URL and message
	let redirectUrl = `stremio://detail/movie/${imdbid}/${imdbid}`;
	let message = `You can now stream the movie ${imdbid} in Stremio`;

	if (season && episode) {
		redirectUrl = `stremio://detail/series/${imdbid}/${imdbid}:${season}:${episode}`;
		message = `You can now stream ${imdbid} S${padWithZero(parseInt(season, 10))}E${padWithZero(parseInt(episode, 10))} in Stremio`;
	}

	// Send HTML response with redirect
	res.setHeader('Content-Type', 'text/html');
	res.status(200).send(`
            <!doctype html>
            <html>
                <head>
                    <meta http-equiv="refresh" content="1;url=${redirectUrl}" />
                </head>
                <body>
                    ${message}
                </body>
            </html>
        `);
}
