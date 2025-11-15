import handler from '@/pages/api/torrents/stats';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockScrapeTorrent, mockUpsertTrackerStats } = vi.hoisted(() => ({
	mockScrapeTorrent: vi.fn(),
	mockUpsertTrackerStats: vi.fn(),
}));

vi.mock('@/utils/torrentScraper', () => ({
	torrentScraper: {
		scrapeTorrent: mockScrapeTorrent,
	},
}));

vi.mock('@/services/database/trackerStats', () => ({
	TrackerStatsService: vi.fn().mockImplementation(() => ({
		upsertTrackerStats: mockUpsertTrackerStats,
	})),
}));

describe('/api/torrents/stats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockScrapeTorrent.mockResolvedValue({
			seeders: 10,
			leechers: 5,
			downloads: 20,
			successfulTrackers: 2,
			totalTrackers: 4,
		});
	});

	it('enforces GET requests', async () => {
		const req = createMockRequest({ method: 'POST' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
	});

	it('validates hash parameter presence and format', async () => {
		const req = createMockRequest({ method: 'GET', query: {} });
		const res = createMockResponse();

		await handler(req, res);
		expect(res.status).toHaveBeenCalledWith(400);

		const req2 = createMockRequest({ method: 'GET', query: { hash: '12345' } });
		const res2 = createMockResponse();
		await handler(req2, res2);
		expect(res2.status).toHaveBeenCalledWith(400);
	});

	it('scrapes stats and stores them, returning formatted response', async () => {
		const req = createMockRequest({
			method: 'GET',
			query: { hash: 'a'.repeat(40) },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockScrapeTorrent).toHaveBeenCalledWith('a'.repeat(40));
		expect(mockUpsertTrackerStats).toHaveBeenCalledWith(
			expect.objectContaining({ hash: 'a'.repeat(40) })
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			hash: 'a'.repeat(40),
			seeders: 10,
			leechers: 5,
			downloads: 20,
			trackers: { successful: 2, total: 4 },
		});
	});

	it('still responds when database persistence fails', async () => {
		mockUpsertTrackerStats.mockRejectedValue(new Error('db'));
		const req = createMockRequest({
			method: 'GET',
			query: { hash: 'b'.repeat(40) },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('returns 500 when scraping fails', async () => {
		mockScrapeTorrent.mockRejectedValue(new Error('network'));
		const req = createMockRequest({
			method: 'GET',
			query: { hash: 'c'.repeat(40) },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Failed to get torrent stats',
			message: 'network',
		});
	});
});
