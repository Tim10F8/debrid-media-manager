import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBiggestFileStreamUrl, getStreamUrl } from './getStreamUrl';

// Mock dependencies
vi.mock('@/services/realDebrid', () => ({
	addHashAsMagnet: vi.fn(),
	deleteTorrent: vi.fn(),
	getTorrentInfo: vi.fn(),
	unrestrictLink: vi.fn(),
}));

vi.mock('./addMagnet', () => ({
	handleSelectFilesInRd: vi.fn(),
}));

vi.mock('parse-torrent-title', () => ({
	default: {
		parse: vi.fn(),
	},
}));

import {
	addHashAsMagnet,
	deleteTorrent,
	getTorrentInfo,
	unrestrictLink,
} from '@/services/realDebrid';
import type { TorrentInfoResponse, UnrestrictResponse } from '@/services/types';
import ptt from 'parse-torrent-title';
import { handleSelectFilesInRd } from './addMagnet';

const createTorrentInfo = (overrides: Partial<TorrentInfoResponse>): TorrentInfoResponse => ({
	id: 'torrent-id',
	filename: 'test.torrent',
	original_filename: 'test.torrent',
	hash: 'hash',
	bytes: 0,
	original_bytes: 0,
	host: 'host',
	split: 0,
	progress: 100,
	status: 'finished',
	added: new Date(0).toISOString(),
	files: [],
	links: [],
	ended: new Date(0).toISOString(),
	speed: 0,
	seeders: 0,
	fake: false,
	...overrides,
});

const createUnrestrictResponse = (overrides: Partial<UnrestrictResponse>): UnrestrictResponse => ({
	id: 'unrestrict-id',
	filename: 'file.mp4',
	mimeType: 'video/mp4',
	filesize: 0,
	link: 'https://download.example.com/file.mp4',
	host: 'download.example.com',
	chunks: 1,
	crc: 0,
	download: 'https://stream.example.com/file.mp4',
	streamable: 1,
	...overrides,
});

describe('getStreamUrl', () => {
	const mockRdKey = 'test-rd-key';
	const mockHash = 'abc123';
	const mockFileId = 1;
	const mockIpAddress = '192.168.1.1';
	const mockTorrentId = 'rd123';

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(console.error).mockImplementation(() => {});
	});

	it('should get stream URL successfully for movie', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [
					{ id: 1, path: 'movie-1.mp4', selected: 1, bytes: 1024000000 },
					{ id: 2, path: 'movie-2.mp4', selected: 0, bytes: 500000000 },
				],
				links: ['link1', 'link2'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/movie.mp4',
				link: 'https://download.example.com/movie.mp4',
				filename: 'movie.mp4',
				filesize: 1024000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie');

		expect(result).toEqual([
			'https://stream.example.com/movie.mp4',
			'https://download.example.com/movie.mp4',
			-1,
			-1,
			977, // 1024000000 / 1024 / 1024 rounded
		]);
		expect(addHashAsMagnet).toHaveBeenCalledWith(mockRdKey, mockHash, false);
		expect(handleSelectFilesInRd).toHaveBeenCalledWith(mockRdKey, `rd:${mockTorrentId}`, false);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should get stream URL successfully for TV show with season/episode info', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [
					{
						id: 1,
						path: 'path/to/Show.S01E02.1080p.mp4',
						selected: 1,
						bytes: 500000000,
					},
				],
				links: ['link1'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/episode.mp4',
				link: 'https://download.example.com/episode.mp4',
				filename: 'path/to/Show.S01E02.1080p.mp4',
				filesize: 500000000,
			})
		);
		vi.mocked(ptt.parse).mockReturnValue({
			title: 'Show',
			season: 1,
			episode: 2,
		});
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'tv');

		expect(result).toEqual([
			'https://stream.example.com/episode.mp4',
			'https://download.example.com/episode.mp4',
			1,
			2,
			477, // 500000000 / 1024 / 1024 rounded
		]);
		expect(ptt.parse).toHaveBeenCalledWith('Show.S01E02.1080p.mp4');
	});

	it('should handle fallback to first link when file ID not found', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [
					{ id: 1, path: 'movie-main.mp4', selected: 1, bytes: 1000000000 },
					{ id: 2, path: 'movie-alt.mp4', selected: 1, bytes: 500000000 },
				],
				links: ['link1', 'link2'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/movie.mp4',
				link: 'https://download.example.com/movie.mp4',
				filename: 'movie.mp4',
				filesize: 1000000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		// Request file ID 5 (doesn't exist), should fall back to first link
		const result = await getStreamUrl(mockRdKey, mockHash, 5, mockIpAddress, 'movie');

		expect(result).toEqual([
			'https://stream.example.com/movie.mp4',
			'https://download.example.com/movie.mp4',
			-1,
			-1,
			954, // 1000000000 / 1024 / 1024 rounded
		]);
	});

	it('should handle non-streamable links', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 1000000000 }],
				links: ['link1'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://download.example.com/movie.mp4',
				link: 'https://download.example.com/movie.mp4',
				streamable: 0,
				filename: 'movie.mp4',
				filesize: 1000000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		await expect(
			getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie')
		).rejects.toThrow('not streamable');
	});

	it('should handle errors during torrent info retrieval', async () => {
		const error = new Error('Torrent not found');
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockRejectedValue(error);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		await expect(
			getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie')
		).rejects.toThrow('Torrent not found');
		expect(console.error).toHaveBeenCalledWith('error after adding hash', error);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should handle errors during magnet addition', async () => {
		const error = new Error('Invalid hash');
		vi.mocked(addHashAsMagnet).mockRejectedValue(error);

		await expect(
			getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie')
		).rejects.toThrow('Invalid hash');
	});

	it('should handle errors during file selection', async () => {
		const error = new Error('File selection failed');
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockRejectedValue(error);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		await expect(
			getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie')
		).rejects.toThrow('File selection failed');
		expect(console.error).toHaveBeenCalledWith('error after adding hash', error);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should handle errors during link unrestriction', async () => {
		const error = new Error('Unrestriction failed');
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 1000000000 }],
				links: ['link1'],
			})
		);
		vi.mocked(unrestrictLink).mockRejectedValue(error);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		await expect(
			getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'movie')
		).rejects.toThrow('Unrestriction failed');
		expect(console.error).toHaveBeenCalledWith('error after adding hash', error);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should handle empty filename for TV shows', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 500000000 }],
				links: ['link1'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/episode.mp4',
				link: 'https://download.example.com/episode.mp4',
				filename: '', // Empty filename
				filesize: 500000000,
			})
		);
		vi.mocked(ptt.parse).mockReturnValue({ title: '' });
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getStreamUrl(mockRdKey, mockHash, mockFileId, mockIpAddress, 'tv');

		expect(result).toEqual([
			'https://stream.example.com/episode.mp4',
			'https://download.example.com/episode.mp4',
			-1,
			-1,
			477,
		]);
		expect(ptt.parse).toHaveBeenCalledWith('');
	});
});

describe('getBiggestFileStreamUrl', () => {
	const mockRdKey = 'test-rd-key';
	const mockHash = 'abc123';
	const mockIpAddress = '192.168.1.1';
	const mockTorrentId = 'rd123';

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(console.error).mockImplementation(() => {});
	});

	it('should get biggest file stream URL successfully', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [
					{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 500000000 },
					{ id: 2, path: 'file-2.mkv', selected: 1, bytes: 2000000000 }, // Biggest
					{ id: 3, path: 'file-3.mkv', selected: 0, bytes: 1000000000 },
				],
				links: ['link1', 'link2', 'link3'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/biggest.mp4',
				link: 'https://download.example.com/biggest.mp4',
				filename: 'biggest.mp4',
				filesize: 2000000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getBiggestFileStreamUrl(mockRdKey, mockHash, mockIpAddress);

		expect(result).toEqual([
			'https://stream.example.com/biggest.mp4',
			'https://download.example.com/biggest.mp4',
			1907, // 2000000000 / 1024 / 1024 rounded
		]);
		expect(addHashAsMagnet).toHaveBeenCalledWith(mockRdKey, mockHash, false);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should handle single file torrents', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 1000000000 }],
				links: ['link1'],
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/single.mp4',
				link: 'https://download.example.com/single.mp4',
				filename: 'single.mp4',
				filesize: 1000000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getBiggestFileStreamUrl(mockRdKey, mockHash, mockIpAddress);

		expect(result).toEqual([
			'https://stream.example.com/single.mp4',
			'https://download.example.com/single.mp4',
			954,
		]);
	});

	it('should handle errors during biggest file retrieval', async () => {
		const error = new Error('Failed to get torrent info');
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockRejectedValue(error);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		await expect(getBiggestFileStreamUrl(mockRdKey, mockHash, mockIpAddress)).rejects.toThrow(
			'Failed to get torrent info'
		);
		expect(console.error).toHaveBeenCalledWith('error after adding hash', error);
		expect(deleteTorrent).toHaveBeenCalledWith(mockRdKey, mockTorrentId, false);
	});

	it('should handle fallback to first link when biggest file index is invalid', async () => {
		vi.mocked(addHashAsMagnet).mockResolvedValue(mockTorrentId);
		vi.mocked(handleSelectFilesInRd).mockResolvedValue(undefined);
		vi.mocked(getTorrentInfo).mockResolvedValue(
			createTorrentInfo({
				id: mockTorrentId,
				files: [
					{ id: 1, path: 'file-1.mkv', selected: 1, bytes: 2000000000 },
					{ id: 2, path: 'file-2.mkv', selected: 1, bytes: 1000000000 },
				],
				links: ['link1'], // Only one link, but biggest file is at index 0
			})
		);
		vi.mocked(unrestrictLink).mockResolvedValue(
			createUnrestrictResponse({
				download: 'https://stream.example.com/fallback.mp4',
				link: 'https://download.example.com/fallback.mp4',
				filename: 'fallback.mp4',
				filesize: 2000000000,
			})
		);
		vi.mocked(deleteTorrent).mockResolvedValue(undefined);

		const result = await getBiggestFileStreamUrl(mockRdKey, mockHash, mockIpAddress);

		expect(result).toEqual([
			'https://stream.example.com/fallback.mp4',
			'https://download.example.com/fallback.mp4',
			1907,
		]);
	});
});
