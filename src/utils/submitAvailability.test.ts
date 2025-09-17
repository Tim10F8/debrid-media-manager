import { repository as db } from '@/services/repository';
import { TorrentInfoResponse } from '@/services/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDownloadedTorrent } from './submitAvailability';

vi.mock('@/services/repository', () => ({
	repository: {
		handleDownloadedTorrent: vi.fn(),
	},
}));

describe('submitAvailability', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('handleDownloadedTorrent', () => {
		it('calls repository handleDownloadedTorrent with correct parameters', async () => {
			const torrentInfo: TorrentInfoResponse = {
				id: 'torrent123',
				filename: 'Movie.2024.1080p.mkv',
				original_filename: 'Movie.2024.1080p.mkv',
				hash: 'abc123def456',
				bytes: 1000000000,
				original_bytes: 1000000000,
				host: 'realdebrid.com',
				split: 1,
				progress: 100,
				status: 'downloaded',
				added: '2024-01-01T00:00:00.000Z',
				files: [],
				links: ['https://example.com/file1.mkv'],
				ended: '2024-01-01T01:00:00.000Z',
				speed: 0,
				seeders: 10,
				fake: false,
			};
			const hash = 'abc123def456';
			const imdbId = 'tt1234567';

			await handleDownloadedTorrent(torrentInfo, hash, imdbId);

			expect(db.handleDownloadedTorrent).toHaveBeenCalledOnce();
			expect(db.handleDownloadedTorrent).toHaveBeenCalledWith(torrentInfo, hash, imdbId);
		});

		it('handles different torrent info structures', async () => {
			const minimalTorrentInfo: TorrentInfoResponse = {
				id: 'min123',
				filename: 'minimal.mkv',
				original_filename: 'minimal.mkv',
				hash: 'minhash',
				bytes: 100,
				original_bytes: 100,
				host: 'test.com',
				split: 1,
				progress: 0,
				status: 'waiting',
				added: '2024-01-01',
				files: [],
				links: [],
				ended: '',
				speed: 0,
				seeders: 0,
				fake: false,
			};
			const hash = 'minhash';
			const imdbId = 'tt0000000';

			await handleDownloadedTorrent(minimalTorrentInfo, hash, imdbId);

			expect(db.handleDownloadedTorrent).toHaveBeenCalledWith(
				minimalTorrentInfo,
				hash,
				imdbId
			);
		});

		it('propagates errors from repository', async () => {
			const error = new Error('Database error');
			vi.mocked(db.handleDownloadedTorrent).mockRejectedValueOnce(error);

			const torrentInfo = {} as TorrentInfoResponse;
			const hash = 'errorhash';
			const imdbId = 'tterror';

			await expect(handleDownloadedTorrent(torrentInfo, hash, imdbId)).rejects.toThrow(
				'Database error'
			);
		});

		it('handles empty strings for hash and imdbId', async () => {
			const torrentInfo = {} as TorrentInfoResponse;
			const hash = '';
			const imdbId = '';

			await handleDownloadedTorrent(torrentInfo, hash, imdbId);

			expect(db.handleDownloadedTorrent).toHaveBeenCalledWith(torrentInfo, '', '');
		});

		it('returns void on successful operation', async () => {
			vi.mocked(db.handleDownloadedTorrent).mockResolvedValueOnce(undefined);

			const torrentInfo = {} as TorrentInfoResponse;
			const hash = 'testhash';
			const imdbId = 'tt123';

			const result = await handleDownloadedTorrent(torrentInfo, hash, imdbId);

			expect(result).toBeUndefined();
		});
	});
});
