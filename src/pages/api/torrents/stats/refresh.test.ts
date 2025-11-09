import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './refresh';

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

describe('/api/torrents/stats/refresh', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockScrapeTorrent.mockResolvedValue({
			seeders: 1,
			leechers: 2,
			downloads: 3,
			successfulTrackers: 1,
			totalTrackers: 2,
		});
	});

	it('enforces POST', async () => {
		const req = createMockRequest({ method: 'GET' });
		const res = createMockResponse();
		await handler(req, res);
		expect(res.status).toHaveBeenCalledWith(405);
	});

	it('validates hashes payload', async () => {
		const req = createMockRequest({ method: 'POST', body: {} });
		const res = createMockResponse();
		await handler(req, res);
		expect(res.status).toHaveBeenCalledWith(400);

		const req2 = createMockRequest({ method: 'POST', body: { hashes: [] } });
		const res2 = createMockResponse();
		await handler(req2, res2);
		expect(res2.status).toHaveBeenCalledWith(400);

		const req3 = createMockRequest({
			method: 'POST',
			body: { hashes: new Array(11).fill('a'.repeat(40)) },
		});
		const res3 = createMockResponse();
		await handler(req3, res3);
		expect(res3.status).toHaveBeenCalledWith(400);
	});

	it('validates hash formats', async () => {
		const req = createMockRequest({ method: 'POST', body: { hashes: ['bad'] } });
		const res = createMockResponse();
		await handler(req, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('refreshes stats for each hash and records failures', async () => {
		mockScrapeTorrent
			.mockResolvedValueOnce({
				seeders: 5,
				leechers: 1,
				downloads: 9,
				successfulTrackers: 2,
				totalTrackers: 2,
			})
			.mockRejectedValueOnce(new Error('scrape'));

		const hashes = ['a'.repeat(40), 'b'.repeat(40)];
		const req = createMockRequest({ method: 'POST', body: { hashes } });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockScrapeTorrent).toHaveBeenCalledTimes(2);
		expect(mockUpsertTrackerStats).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		const payload = (res.json as any).mock.calls[0][0] as Array<Record<string, any>>;
		expect(payload).toHaveLength(2);
		expect(payload[0]).toMatchObject({ hash: hashes[0], seeders: 5 });
		expect(payload[1]).toMatchObject({
			hash: hashes[1],
			error: 'Failed to scrape tracker stats',
		});
	});

	it('returns 500 on unexpected errors', async () => {
		const req = createMockRequest({ method: 'POST', body: null as any });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'Failed to refresh tracker stats' })
		);
	});
});
