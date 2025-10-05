import axios from 'axios';
import { languageEmojis } from './languages';
import { MediaInfoResponse } from './types';

export const formatSize = (bytes: number): { size: number; unit: string } => {
	const isGB = bytes >= 1024 ** 3;
	return {
		size: bytes / (isGB ? 1024 ** 3 : 1024 ** 2),
		unit: isGB ? 'GB' : 'MB',
	};
};

export const getEpisodeInfo = (
	path: string,
	mediaType: 'movie' | 'tv' = 'tv'
): { isTvEpisode: boolean } => {
	let epRegex = /S(\d+)\s?E(\d+)/i;
	let isTvEpisode = Boolean(path.match(epRegex));

	if (mediaType === 'tv' && !isTvEpisode) {
		epRegex = /[^\d](\d{1,2})x(\d{1,2})[^\d]/i;
		isTvEpisode = Boolean(path.match(epRegex));
	}

	return { isTvEpisode };
};

export const generatePasswordHash = async (hash: string): Promise<string> => {
	const salt = 'debridmediamanager.com';
	const msgBuffer = new TextEncoder().encode(hash + salt);
	const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const formatDuration = (seconds: string) => {
	const duration = parseFloat(seconds);
	const hours = Math.floor(duration / 3600);
	const minutes = Math.floor((duration % 3600) / 60);
	return `${hours}h ${minutes}m`;
};

const snapshotEndpoint = '/api/torrents/mediainfo';

const hasMediaInfoPayload = (mediaInfo: MediaInfoResponse | null | undefined) => {
	if (!mediaInfo || !mediaInfo.SelectedFiles) return false;
	for (const file of Object.values(mediaInfo.SelectedFiles)) {
		if (file?.MediaInfo?.streams?.length) {
			return true;
		}
	}
	return false;
};

const loggableError = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const fetchMediaInfo = async (hash: string): Promise<MediaInfoResponse | null> => {
	if (!hash) return null;

	try {
		const response = await axios.get<MediaInfoResponse>(snapshotEndpoint, { params: { hash } });
		if (hasMediaInfoPayload(response.data)) {
			return response.data;
		}
		console.info('Torrent snapshot media info missing stream details', { hash });
	} catch (error) {
		console.info('Failed to load torrent media info from snapshot', {
			hash,
			error: loggableError(error),
		});
	}

	try {
		const password = await generatePasswordHash(hash);
		const response = await axios.get<MediaInfoResponse>(
			'https://debridmediamanager.com/mediainfo',
			{ params: { hash, password } }
		);
		if (hasMediaInfoPayload(response.data)) {
			return response.data;
		}
		console.info('Media info fallback response missing stream details', { hash });
	} catch (error) {
		console.error('Failed to load media info from fallback endpoint', {
			hash,
			error: loggableError(error),
		});
	}

	return null;
};

export const getStreamInfo = (mediaInfo: MediaInfoResponse | null) => {
	if (!mediaInfo) return [];
	const fileInfo = Object.values(mediaInfo.SelectedFiles)[0];
	if (!fileInfo.MediaInfo) return [];

	const { streams, format, chapters } = fileInfo.MediaInfo;
	const videoStream = streams.find((s) => s.codec_type === 'video');
	const audioStreams = streams.filter((s) => s.codec_type === 'audio');
	const subtitleStreams = streams.filter((s) => s.codec_type === 'subtitle');

	const rows: { label: string; value: string }[] = [];

	if (videoStream) {
		let videoInfo = `${videoStream.codec_name.toUpperCase()} • ${videoStream.width}x${videoStream.height}`;
		// Check for Dolby Vision profile
		if (videoStream.side_data_list) {
			const dvStream = videoStream.side_data_list.find((sd: any) => sd.dv_profile > 0);
			if (dvStream) {
				videoInfo += ` • Dolby Vision profile ${dvStream.dv_profile}`;
			}
		}
		rows.push({
			label: 'Video',
			value: videoInfo,
		});
	}

	if (audioStreams.length > 0) {
		rows.push({
			label: 'Audio',
			value:
				`${audioStreams.length} tracks: ` +
				audioStreams
					.map(
						(stream) =>
							`${stream.tags?.language ? `${languageEmojis[stream.tags.language] || stream.tags.language} ${stream.tags.language}` : '🌐'} (${stream.codec_name.toUpperCase()})`
					)
					.join(', '),
		});
	}

	if (subtitleStreams.length > 0) {
		rows.push({
			label: 'Subs',
			value:
				`${subtitleStreams.length} tracks: ` +
				subtitleStreams
					.map(
						(stream) =>
							`${stream.tags?.language ? `${languageEmojis[stream.tags.language] || stream.tags.language} ${stream.tags.language}` : '🌐'}`
					)
					.join(', '),
		});
	}

	if (format.duration) {
		rows.push({
			label: 'Duration',
			value: formatDuration(format.duration),
		});
	}

	if (chapters && chapters.length > 0) {
		rows.push({
			label: 'Chapters',
			value: `${chapters.length} chapters included`,
		});
	}

	return rows;
};
