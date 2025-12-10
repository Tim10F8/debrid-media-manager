import handler from '@/pages/api/stremio/cast/library/[torrentIdPlusHash]';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockGetTorrentInfo,
	mockDbGetIMDBIdByHash,
	mockDbSaveCast,
	mockGenerateUserId,
	mockAxiosHead,
} = vi.hoisted(() => ({
	mockGetTorrentInfo: vi.fn(),
	mockDbGetIMDBIdByHash: vi.fn(),
	mockDbSaveCast: vi.fn(),
	mockGenerateUserId: vi.fn(),
	mockAxiosHead: vi.fn(),
}));

vi.mock('@/services/realDebrid', () => ({
	getTorrentInfo: mockGetTorrentInfo,
}));

vi.mock('@/services/repository', () => ({
	repository: {
		getIMDBIdByHash: mockDbGetIMDBIdByHash,
		saveCast: mockDbSaveCast,
	},
}));

vi.mock('@/utils/castApiHelpers', () => ({
	generateUserId: mockGenerateUserId,
}));

vi.mock('axios', () => ({
	default: {
		head: mockAxiosHead,
	},
}));

const makeTorrentInfo = (overrides: Partial<any> = {}) => ({
	hash: 'hash123',
	files: [
		{ id: 1, path: 'Movie.2024.mkv', bytes: 1048576, selected: true },
		{ id: 2, path: 'EpisodeTitle.mkv', bytes: 2097152, selected: true },
	],
	links: ['https://rd/link-1', 'https://rd/link-2'],
	original_filename: 'Movie.2024',
	original_bytes: 4096,
	...overrides,
});

describe('/api/stremio/cast/library/[torrentIdPlusHash]', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGenerateUserId.mockResolvedValue('user-1');
		mockDbGetIMDBIdByHash.mockResolvedValue('tt1234567');
		mockGetTorrentInfo.mockResolvedValue(makeTorrentInfo());
		global.fetch = vi.fn();
		mockAxiosHead.mockResolvedValue({
			headers: { 'content-length': '1048576' },
			request: { res: { responseUrl: 'https://redirect' } },
		});
	});

	afterAll(() => {
		global.fetch = originalFetch;
	});

	it('validates rdToken', async () => {
		const req = createMockRequest({ query: { torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Missing or invalid RD token',
		});
	});

	it('validates torrentIdPlusHash', async () => {
		const req = createMockRequest({ query: { rdToken: 'token' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Missing or invalid torrentid',
		});
	});

	it('requires selected files to match RD links', async () => {
		mockGetTorrentInfo.mockResolvedValue(
			makeTorrentInfo({
				files: [{ id: 1, path: 'Movie.mkv', bytes: 1, selected: true }],
				links: ['https://rd/link-1', 'https://rd/link-2'],
			})
		);

		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Cannot determine file link',
		});
	});

	it('saves casts when imdb id exists in the database', async () => {
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockGetTorrentInfo).toHaveBeenCalledWith('token', '1', false);
		expect(mockDbSaveCast).toHaveBeenCalledWith(
			'tt1234567',
			'user-1',
			'hash123',
			'Movie.2024.mkv',
			'https://rd/link-1',
			1
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith(
			expect.stringContaining('stremio://detail/movie/tt1234567/tt1234567')
		);
	});

	it('fetches torrentio metadata when imdb id is missing and saves streams', async () => {
		mockDbGetIMDBIdByHash.mockResolvedValue(null);
		const fetchMock = global.fetch as unknown as Mock;
		fetchMock.mockResolvedValue({
			json: vi.fn().mockResolvedValue({
				meta: {
					videos: [
						{
							id: 'tt9999999:1:2',
							title: 'EpisodeTitle.mkv',
							streams: [{ url: 'https://stream/ep1.mkv' }],
						},
					],
				},
			}),
		});

		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(fetchMock).toHaveBeenCalledWith(
			'https://torrentio.strem.fun/realdebrid=token/meta/other/realdebrid%3A1:hash.json'
		);
		expect(mockAxiosHead).toHaveBeenCalledWith('https://stream/ep1.mkv', { maxRedirects: 1 });
		expect(mockDbSaveCast).toHaveBeenCalledWith(
			'tt9999999:1:2',
			'user-1',
			'hash123',
			'https://redirect',
			'https://rd/link-2',
			expect.any(Number)
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.send).toHaveBeenCalledWith(
			expect.stringContaining('stremio://detail/series/tt9999999/tt9999999:1:2')
		);
	});

	it('returns 404 when torrentio has no videos', async () => {
		mockDbGetIMDBIdByHash.mockResolvedValue(null);
		(global.fetch as Mock).mockResolvedValue({
			json: vi.fn().mockResolvedValue({ meta: { videos: [] } }),
		});

		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'No valid streams found in Torrentio response',
		});
	});

	it('returns 500 when generateUserId fails', async () => {
		mockGenerateUserId.mockRejectedValue(new Error('Invalid token'));
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage:
				'Failed to generate user ID from RD token. Please check your RD token is valid.',
			details: 'Invalid token',
		});
	});

	it('returns 500 when database lookup fails', async () => {
		mockDbGetIMDBIdByHash.mockRejectedValue(new Error('Database connection error'));
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Database error: Failed to retrieve IMDB ID from hash',
			details: 'Database connection error',
		});
	});

	it('returns 500 when torrentio fetch fails', async () => {
		mockDbGetIMDBIdByHash.mockResolvedValue(null);
		(global.fetch as Mock).mockRejectedValue(new Error('Network timeout'));
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage:
				'Network error: Failed to fetch metadata from Torrentio. Please try again.',
			details: 'Network timeout',
		});
	});

	it('returns 500 when torrentio response parsing fails', async () => {
		mockDbGetIMDBIdByHash.mockResolvedValue(null);
		(global.fetch as Mock).mockResolvedValue({
			json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
		});
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Invalid response from Torrentio API (failed to parse JSON)',
			details: 'Invalid JSON',
		});
	});

	it('returns 500 when stream URL HEAD request fails', async () => {
		mockDbGetIMDBIdByHash.mockResolvedValue(null);
		(global.fetch as Mock).mockResolvedValue({
			json: vi.fn().mockResolvedValue({
				meta: {
					videos: [
						{
							id: 'tt9999999:1:2',
							title: 'EpisodeTitle.mkv',
							streams: [{ url: 'https://stream/ep1.mkv' }],
						},
					],
				},
			}),
		});
		mockAxiosHead.mockRejectedValue(new Error('Stream URL expired'));
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage:
				'Failed to fetch stream URL metadata. The stream URL may be invalid or expired.',
			streamUrl: 'https://stream/ep1.mkv',
			details: 'Stream URL expired',
		});
	});

	it('returns 500 when database save fails', async () => {
		mockDbSaveCast.mockRejectedValue(new Error('db down'));
		const req = createMockRequest({ query: { rdToken: 'token', torrentIdPlusHash: '1:hash' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Database error: Failed to save cast information',
			details: 'db down',
		});
	});
});
