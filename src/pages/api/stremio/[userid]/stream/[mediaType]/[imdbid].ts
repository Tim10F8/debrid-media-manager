import { repository as db } from '@/services/repository';
import { isLegacyToken } from '@/utils/castApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

// lists all available streams for a movie or show
// note, addon prefix is /api/stremio/${userid}
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('access-control-allow-origin', '*');

	const { userid, mediaType, imdbid } = req.query;

	if (typeof userid !== 'string' || typeof imdbid !== 'string' || typeof mediaType !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'Invalid "userid", "imdbid" or "mediaType" query parameter',
		});
		return;
	}

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	// Check for legacy 5-character token
	if (isLegacyToken(userid)) {
		res.status(200).json({
			streams: [
				{
					name: '⚠️ Update Required',
					title: 'DMM Cast security update required\n\n1. Visit https://debridmediamanager.com/stremio\n2. Reinstall the addon\n3. Your casted content will be preserved',
					externalUrl: 'https://debridmediamanager.com/stremio',
				},
			],
			cacheMaxAge: 0,
		});
		return;
	}

	let profile;
	try {
		profile = await db.getCastProfile(userid);
		if (!profile) {
			throw new Error(`no profile found for user ${userid}`);
		}
	} catch (error) {
		console.error(
			'Failed to get Real-Debrid profile:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: `Failed to get Real-Debrid profile for user ${userid}` });
		return;
	}

	const imdbidStr = (imdbid as string).replace(/\.json$/, '');
	const typeSlug = mediaType === 'movie' ? 'movie' : 'show';
	let externalUrl = `${process.env.DMM_ORIGIN}/${typeSlug}/${imdbidStr}`;
	if (typeSlug === 'show') {
		// imdbidStr = imdbid:season:episode
		// externalUrl should be /show/imdbid/season
		const [imdbid2, season] = imdbidStr.split(':');
		externalUrl = `${process.env.DMM_ORIGIN}/${typeSlug}/${imdbid2}/${season}`;
	}
	const streams = [
		{
			name: '​1:Cast✨',
			title: 'Cast a file inside a torrent',
			externalUrl,
			behaviorHints: {
				bingeGroup: `dmm:${imdbidStr}:cast`,
			},
		},
	];

	try {
		const maxSize = typeSlug === 'movie' ? profile.movieMaxSize : profile.episodeMaxSize;

		// get urls from db
		const [userCastItems, otherItems] = await Promise.all([
			db.getUserCastStreams(imdbidStr, userid, 5),
			db.getOtherStreams(imdbidStr, userid, 5, maxSize > 0 ? maxSize : undefined),
		]);

		for (const item of userCastItems) {
			let title = item.filename ?? 'Unknown Title';
			let sizeStr = '';
			if (item.size > 1024) {
				sizeStr = `${(item.size / 1024).toFixed(2)} GB`;
			} else {
				sizeStr = `${item.size.toFixed(2)} MB`;
			}
			title = decodeURIComponent(title);
			if (title.length > 30) {
				const mid = title.length / 2;
				title = title.substring(0, mid) + '-\n' + title.substring(mid);
			}
			title = title + '\n' + `📦 ${sizeStr}`;

			streams.push({
				name: 'DMM 🧙‍♂️ Yours',
				title,
				url: item.link
					? `${process.env.DMM_ORIGIN}/api/stremio/${userid}/play/${item.link.substring(26)}`
					: item.url,
				behaviorHints: {
					bingeGroup: `dmm:${imdbidStr}:yours`,
				},
			} as any);
		}

		const icons = ['🦄', '🐈', '🦊', '🐺', '🦁', '🐯', '🐻'];
		for (let i = 0; i < otherItems.length; i++) {
			const item = otherItems[i];
			let title = item.filename ?? 'Unknown Title';
			let sizeStr = '';
			if (item.size > 1024) {
				sizeStr = `${(item.size / 1024).toFixed(2)} GB`;
			} else {
				sizeStr = `${item.size.toFixed(2)} MB`;
			}
			title = decodeURIComponent(title);
			if (title.length > 30) {
				const mid = title.length / 2;
				title = title.substring(0, mid) + '-\n' + title.substring(mid);
			}
			title = title + '\n' + `📦 ${sizeStr}`;

			const icon = icons[i % icons.length];
			streams.push({
				name: `DMM ${icon} Other`,
				title,
				url: item.link
					? `${process.env.DMM_ORIGIN}/api/stremio/${userid}/play/${item.link.substring(26)}`
					: item.url,
				behaviorHints: {
					bingeGroup: `dmm:${imdbidStr}:other:${i + 1}`,
				},
			} as any);
		}

		res.status(200).json({
			streams,
			cacheMaxAge: 0,
		});
	} catch (error) {
		console.error(
			'Failed to get casted URLs:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		res.status(500).json({ error: 'Failed to get casted URLs' });
		return;
	}
}
