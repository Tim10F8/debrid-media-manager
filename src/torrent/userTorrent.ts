import { MagnetStatus } from '@/services/allDebrid';
import { TorBoxTorrentInfo, TorrentInfoResponse } from '@/services/types';
import { ParsedFilename } from '@ctrl/video-filename-parser';

export enum UserTorrentStatus {
	'waiting' = 'waiting',
	'downloading' = 'downloading',
	'finished' = 'finished',
	'error' = 'error',
}

export interface UserTorrent {
	id: string;
	filename: string;
	title: string;
	hash: string;
	bytes: number;
	progress: number;
	status: UserTorrentStatus;
	serviceStatus: string;
	added: Date;
	// score: number;
	mediaType: 'movie' | 'tv' | 'other';
	info?: ParsedFilename;
	links: string[];
	selectedFiles: any[];
	seeders: number;
	speed: number;
	rdData?: TorrentInfoResponse;
	adData?: MagnetStatus;
	tbData?: TorBoxTorrentInfo;
}

export interface CachedHash {
	hash: string;
	added: Date;
}
