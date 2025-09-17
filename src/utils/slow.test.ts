import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFailed, isInProgress, isSlowOrNoLinks } from './slow';

describe('slow', () => {
	let originalDateNow: () => number;

	beforeEach(() => {
		originalDateNow = Date.now;
	});

	afterEach(() => {
		Date.now = originalDateNow;
	});

	describe('isSlowOrNoLinks', () => {
		it('returns true for old downloading torrents with no seeders', () => {
			const now = new Date('2024-01-01T12:00:00');
			Date.now = vi.fn(() => now.getTime());

			const torrent = {
				id: '1',
				filename: 'test.mkv',
				title: 'test',
				hash: 'abc123',
				bytes: 1000000,
				progress: 50,
				status: UserTorrentStatus.downloading,
				serviceStatus: 'downloading',
				added: new Date('2024-01-01T11:30:00'),
				mediaType: 'other' as const,
				links: [],
				selectedFiles: [],
				seeders: 0,
				speed: 0,
			};

			expect(isSlowOrNoLinks(torrent)).toBe(true);
		});

		it('returns false for recent downloading torrents with no seeders', () => {
			const now = new Date('2024-01-01T12:00:00');
			Date.now = vi.fn(() => now.getTime());

			const torrent = {
				id: '1',
				filename: 'test.mkv',
				title: 'test',
				hash: 'abc123',
				bytes: 1000000,
				progress: 50,
				status: UserTorrentStatus.downloading,
				serviceStatus: 'downloading',
				added: new Date('2024-01-01T11:41:00'), // 19 minutes ago, less than 20 minutes
				mediaType: 'other' as const,
				links: [],
				selectedFiles: [],
				seeders: 0,
				speed: 0,
			};

			expect(isSlowOrNoLinks(torrent)).toBe(false);
		});

		it('returns false for old downloading torrents with seeders', () => {
			const now = new Date('2024-01-01T12:00:00');
			Date.now = vi.fn(() => now.getTime());

			const torrent = {
				id: '1',
				filename: 'test.mkv',
				title: 'test',
				hash: 'abc123',
				bytes: 1000000,
				progress: 50,
				status: UserTorrentStatus.downloading,
				serviceStatus: 'downloading',
				added: new Date('2024-01-01T11:30:00'),
				mediaType: 'other' as const,
				links: [],
				selectedFiles: [],
				seeders: 5,
				speed: 0,
			};

			expect(isSlowOrNoLinks(torrent)).toBe(false);
		});

		it('returns false for old completed torrents with no seeders', () => {
			const now = new Date('2024-01-01T12:00:00');
			Date.now = vi.fn(() => now.getTime());

			const torrent = {
				id: '1',
				filename: 'test.mkv',
				title: 'test',
				hash: 'abc123',
				bytes: 1000000,
				progress: 100,
				status: UserTorrentStatus.finished,
				serviceStatus: 'finished',
				added: new Date('2024-01-01T11:30:00'),
				mediaType: 'other' as const,
				links: [],
				selectedFiles: [],
				seeders: 0,
				speed: 0,
			};

			expect(isSlowOrNoLinks(torrent)).toBe(false);
		});

		it('returns true for exactly 20 minute old downloading torrents with no seeders', () => {
			const now = new Date('2024-01-01T12:20:00');
			Date.now = vi.fn(() => now.getTime());

			const torrent = {
				id: '1',
				filename: 'test.mkv',
				title: 'test',
				hash: 'abc123',
				bytes: 1000000,
				progress: 50,
				status: UserTorrentStatus.downloading,
				serviceStatus: 'downloading',
				added: new Date('2024-01-01T12:00:00'),
				mediaType: 'other' as const,
				links: [],
				selectedFiles: [],
				seeders: 0,
				speed: 0,
			};

			expect(isSlowOrNoLinks(torrent)).toBe(true);
		});
	});

	describe('isInProgress', () => {
		it('returns true for downloading status', () => {
			const torrent = {
				status: UserTorrentStatus.downloading,
			} as UserTorrent;

			expect(isInProgress(torrent)).toBe(true);
		});

		it('returns true for waiting status', () => {
			const torrent = {
				status: UserTorrentStatus.waiting,
			} as UserTorrent;

			expect(isInProgress(torrent)).toBe(true);
		});

		it('returns false for finished status', () => {
			const torrent = {
				status: UserTorrentStatus.finished,
			} as UserTorrent;

			expect(isInProgress(torrent)).toBe(false);
		});

		it('returns false for error status', () => {
			const torrent = {
				status: UserTorrentStatus.error,
			} as UserTorrent;

			expect(isInProgress(torrent)).toBe(false);
		});
	});

	describe('isFailed', () => {
		it('returns true for error status', () => {
			const torrent = {
				status: UserTorrentStatus.error,
			} as UserTorrent;

			expect(isFailed(torrent)).toBe(true);
		});

		it('returns false for downloading status', () => {
			const torrent = {
				status: UserTorrentStatus.downloading,
			} as UserTorrent;

			expect(isFailed(torrent)).toBe(false);
		});

		it('returns false for finished status', () => {
			const torrent = {
				status: UserTorrentStatus.finished,
			} as UserTorrent;

			expect(isFailed(torrent)).toBe(false);
		});

		it('returns false for waiting status', () => {
			const torrent = {
				status: UserTorrentStatus.waiting,
			} as UserTorrent;

			expect(isFailed(torrent)).toBe(false);
		});
	});
});
