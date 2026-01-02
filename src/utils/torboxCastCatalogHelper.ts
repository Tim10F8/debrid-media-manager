import { repository as db } from '@/services/repository';
import { getTorrentList } from '@/services/torbox';
import { TorBoxTorrentInfo } from '@/services/types';

export const PAGE_SIZE = 12;

export async function getTorBoxDMMLibrary(userid: string, page: number) {
	let profile: {
		apiKey: string;
	} | null = null;
	try {
		profile = await db.getTorBoxCastProfile(userid);
		if (!profile) {
			throw new Error(`no profile found for user ${userid}`);
		}
	} catch (error) {
		return { error: 'Go to DMM and connect your TorBox account', status: 401 };
	}

	const offset = (page - 1) * PAGE_SIZE;
	const results = await getTorrentList(profile.apiKey, {
		offset,
		limit: PAGE_SIZE,
	});

	if (!results.success || !results.data) {
		return { error: 'Failed to get user torrents list', status: 500 };
	}

	const torrents = Array.isArray(results.data) ? results.data : [results.data];

	// For TorBox we don't get a total count easily, so we check if we got a full page
	const hasMore = torrents.length === PAGE_SIZE;

	return {
		data: {
			metas: torrents.map((torrent: TorBoxTorrentInfo) => ({
				id: `dmm-tb:${torrent.id}`,
				name: torrent.name,
				type: 'other',
			})),
			hasMore,
			cacheMaxAge: 0,
		},
		status: 200,
	};
}

export async function getTorBoxDMMTorrent(userid: string, torrentID: string) {
	let profile: {
		apiKey: string;
	} | null = null;
	try {
		profile = await db.getTorBoxCastProfile(userid);
		if (!profile) {
			throw new Error(`no profile found for user ${userid}`);
		}
	} catch (error) {
		return { error: 'Go to DMM and connect your TorBox account', status: 401 };
	}

	const torrentIdNum = parseInt(torrentID, 10);
	if (isNaN(torrentIdNum)) {
		return { error: 'Invalid torrent ID', status: 400 };
	}

	const result = await getTorrentList(profile.apiKey, { id: torrentIdNum });
	if (!result.success || !result.data) {
		return { error: 'Failed to get torrent info', status: 500 };
	}

	const torrent = Array.isArray(result.data) ? result.data[0] : result.data;
	if (!torrent) {
		return { error: 'Torrent not found', status: 404 };
	}

	// Build video list with internal play URLs (links are generated on-demand when played)
	const videos = (torrent.files || []).map((file) => ({
		id: `dmm-tb:${torrentID}:${file.id}`,
		title: `${file.short_name || file.name} - ${((file.size || 0) / 1024 / 1024 / 1024).toFixed(2)} GB`,
		streams: [
			{
				url: `${process.env.DMM_ORIGIN}/api/stremio-tb/${userid}/play/${torrentID}:${file.id}`,
				behaviorHints: {
					bingeGroup: `dmm-tb:${torrentID}`,
				},
			},
		],
	}));

	// Sort videos by title
	videos.sort((a, b) => a.title.localeCompare(b.title));

	const totalSize = (torrent.files || []).reduce((sum, f) => sum + (f.size || 0), 0);

	return {
		data: {
			meta: {
				id: `dmm-tb:${torrentID}`,
				type: 'other',
				name: `DMM TB: ${torrent.name} - ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`,
				videos,
			},
			cacheMaxAge: 0,
		},
		status: 200,
	};
}
