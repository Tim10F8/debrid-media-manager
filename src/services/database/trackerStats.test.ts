import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TrackerStatsService } from './trackerStats';

const prismaMock = vi.hoisted(() => ({
	trackerStats: {
		upsert: vi.fn(),
		findUnique: vi.fn(),
		findMany: vi.fn(),
		delete: vi.fn(),
		deleteMany: vi.fn(),
		count: vi.fn(),
	},
}));

vi.mock('./client', () => ({
	DatabaseClient: class {
		prisma = prismaMock;
	},
}));

describe('TrackerStatsService', () => {
	let service: TrackerStatsService;

	beforeEach(() => {
		service = new TrackerStatsService();
		Object.values(prismaMock.trackerStats).forEach((fn) => (fn as Mock).mockReset());
	});

	it('upserts tracker stats with the provided payload', async () => {
		await service.upsertTrackerStats({
			hash: 'hash',
			seeders: 10,
			leechers: 5,
			downloads: 15,
			successfulTrackers: 3,
			totalTrackers: 5,
		});

		expect(prismaMock.trackerStats.upsert).toHaveBeenCalled();
		const args = prismaMock.trackerStats.upsert.mock.calls[0][0];
		expect(args.where).toEqual({ hash: 'hash' });
		expect(args.update.seeders).toBe(10);
		expect(args.create.totalTrackers).toBe(5);
	});

	it('swallows missing-table errors when upserting stats', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		prismaMock.trackerStats.upsert.mockRejectedValue({ code: 'P2021' });
		await expect(
			service.upsertTrackerStats({
				hash: 'hash',
				seeders: 1,
				leechers: 1,
				downloads: 1,
				successfulTrackers: 1,
				totalTrackers: 1,
			})
		).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
	});

	it('returns stored stats when available', async () => {
		const lastChecked = new Date();
		prismaMock.trackerStats.findUnique.mockResolvedValue({
			hash: 'hash',
			seeders: 2,
			leechers: 3,
			downloads: 4,
			successfulTrackers: 1,
			totalTrackers: 2,
			lastChecked,
		});

		const stats = await service.getTrackerStats('hash');
		expect(stats).toEqual({
			hash: 'hash',
			seeders: 2,
			leechers: 3,
			downloads: 4,
			successfulTrackers: 1,
			totalTrackers: 2,
			lastChecked,
		});
	});

	it('returns null when stats are missing or table is absent', async () => {
		prismaMock.trackerStats.findUnique.mockResolvedValue(null);
		expect(await service.getTrackerStats('missing')).toBeNull();

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		prismaMock.trackerStats.findUnique.mockRejectedValue({ code: 'P2021' });
		expect(await service.getTrackerStats('missing')).toBeNull();
		expect(warnSpy).toHaveBeenCalled();
	});

	it('returns stats for multiple hashes and handles missing tables', async () => {
		prismaMock.trackerStats.findMany.mockResolvedValueOnce([
			{
				hash: 'hash',
				seeders: 1,
				leechers: 2,
				downloads: 3,
				successfulTrackers: 1,
				totalTrackers: 2,
				lastChecked: new Date(),
			},
		]);

		const results = await service.getTrackerStatsByHashes(['hash']);
		expect(results).toHaveLength(1);

		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		prismaMock.trackerStats.findMany.mockRejectedValue({ code: 'P2021' });
		expect(await service.getTrackerStatsByHashes(['hash'])).toEqual([]);
		expect(warnSpy).toHaveBeenCalled();
	});

	it('removes stats for a single hash', async () => {
		await service.removeTrackerStats('hash');
		expect(prismaMock.trackerStats.delete).toHaveBeenCalledWith({ where: { hash: 'hash' } });
	});

	it('returns hashes that have stale stats', async () => {
		prismaMock.trackerStats.findMany.mockResolvedValue([{ hash: 'stale' }]);
		const hashes = await service.getStaleTrackerStats(48);
		expect(hashes).toEqual(['stale']);
	});

	it('cleans up old stats and reports the deleted count', async () => {
		prismaMock.trackerStats.deleteMany.mockResolvedValue({ count: 5 });
		const count = await service.cleanupOldTrackerStats(7);
		expect(count).toBe(5);
	});

	it('reports tracker stats counts and recent entries', async () => {
		prismaMock.trackerStats.count.mockResolvedValue(42);
		expect(await service.getTrackerStatsCount()).toBe(42);

		const now = new Date();
		prismaMock.trackerStats.findMany.mockResolvedValue([
			{
				hash: 'hash',
				seeders: 1,
				leechers: 2,
				downloads: 3,
				successfulTrackers: 1,
				totalTrackers: 2,
				lastChecked: now,
			},
		]);

		const recent = await service.getRecentTrackerStats(1);
		expect(recent).toEqual([
			{
				hash: 'hash',
				seeders: 1,
				leechers: 2,
				downloads: 3,
				successfulTrackers: 1,
				totalTrackers: 2,
				lastChecked: now,
			},
		]);
	});
});
