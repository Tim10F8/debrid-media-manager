import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ScrapedService } from './scraped';

const prismaMock = vi.hoisted(() => ({
	scrapedTrue: {
		findUnique: vi.fn(),
		update: vi.fn(),
		create: vi.fn(),
		findMany: vi.fn(),
	},
	scraped: {
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		findMany: vi.fn(),
		update: vi.fn(),
		create: vi.fn(),
		deleteMany: vi.fn(),
	},
	$queryRaw: vi.fn(),
}));

const { flattenAndRemoveDuplicatesMock, sortByFileSizeMock } = vi.hoisted(() => ({
	flattenAndRemoveDuplicatesMock: vi.fn((value: any) => value.flat()),
	sortByFileSizeMock: vi.fn((value: any) => value),
}));

vi.mock('./client', () => ({
	DatabaseClient: class {
		prisma = prismaMock;
	},
}));

vi.mock('../mediasearch', () => ({
	flattenAndRemoveDuplicates: flattenAndRemoveDuplicatesMock,
	sortByFileSize: sortByFileSizeMock,
}));

describe('ScrapedService', () => {
	let service: ScrapedService;

	beforeEach(() => {
		service = new ScrapedService();
		Object.values(prismaMock.scrapedTrue).forEach((fn) => (fn as Mock).mockReset());
		Object.values(prismaMock.scraped).forEach((fn) => (fn as Mock).mockReset());
		(prismaMock.$queryRaw as Mock).mockReset();
		flattenAndRemoveDuplicatesMock.mockClear();
		sortByFileSizeMock.mockClear();
	});

	it('returns scraped true results via raw query', async () => {
		const rows = [{ value: [{ hash: 'hash-1' }] }];
		prismaMock.$queryRaw.mockResolvedValue(rows);

		const results = await service.getScrapedTrueResults('key');
		expect(prismaMock.$queryRaw).toHaveBeenCalled();
		expect(results).toEqual(rows[0].value);
	});

	it('validates inputs in query helpers', async () => {
		await expect(service.getScrapedTrueResults('', 1)).rejects.toThrow('Invalid key');
		await expect(service.getScrapedResults('key', -1)).rejects.toThrow(
			'maxSizeGB must be a positive number.'
		);
	});

	it('merges and sorts scrapedTrue results when updating without replacement', async () => {
		const existing = {
			value: [{ hash: 'one' }],
			updatedAt: new Date('2024-01-01'),
		};
		prismaMock.scrapedTrue.findUnique.mockResolvedValue(existing);
		flattenAndRemoveDuplicatesMock.mockReturnValue([[{ hash: 'one' }, { hash: 'two' }]]);
		sortByFileSizeMock.mockReturnValue([{ hash: 'one' }, { hash: 'two' }]);

		await service.saveScrapedTrueResults('key', [{ hash: 'two' }] as any);

		expect(prismaMock.scrapedTrue.update).toHaveBeenCalled();
		const updateArgs = prismaMock.scrapedTrue.update.mock.calls[0][0];
		expect(updateArgs.data.value).toEqual([{ hash: 'one' }, { hash: 'two' }]);
	});

	it('replaces scrapedTrue values when flag is set', async () => {
		prismaMock.scrapedTrue.findUnique.mockResolvedValue({
			value: [{ hash: 'one' }],
			updatedAt: new Date('2024-01-01'),
		});

		await service.saveScrapedTrueResults('key', [{ hash: 'new' }] as any, true, true);

		expect(prismaMock.scrapedTrue.update).toHaveBeenCalledWith({
			where: { key: 'key' },
			data: expect.objectContaining({ value: [{ hash: 'new' }] }),
		});
	});

	it('creates scrapedTrue rows when none exist', async () => {
		prismaMock.scrapedTrue.findUnique.mockResolvedValue(null);

		await service.saveScrapedTrueResults('key', [{ hash: 'one' }] as any);
		expect(prismaMock.scrapedTrue.create).toHaveBeenCalledWith({
			data: { key: 'key', value: [{ hash: 'one' }] },
		});
	});

	it('persists scraped results using the same flows', async () => {
		prismaMock.scraped.findUnique.mockResolvedValue({
			value: [{ hash: 'one' }],
			updatedAt: new Date('2024-01-01'),
		});
		flattenAndRemoveDuplicatesMock.mockReturnValue([[{ hash: 'one' }]]);
		sortByFileSizeMock.mockReturnValue([{ hash: 'one' }]);

		await service.saveScrapedResults('key', [{ hash: 'one' }] as any, false, true);
		expect(prismaMock.scraped.update).toHaveBeenCalled();
	});

	it('checks key existence and age computations', async () => {
		prismaMock.scraped.findFirst.mockResolvedValueOnce({ key: 'key' });
		expect(await service.keyExists('key')).toBe(true);

		prismaMock.scraped.findFirst
			.mockResolvedValueOnce({ updatedAt: new Date(Date.now() - 10 * 86400000) })
			.mockResolvedValueOnce({ updatedAt: new Date() });

		expect(await service.isOlderThan('tt1', 1)).toBe(true);
		expect(await service.isOlderThan('tt1', 1)).toBe(false);
	});

	it('returns metadata for queued and processing requests', async () => {
		prismaMock.scraped.findFirst.mockResolvedValueOnce({
			key: 'requested:tt1234567',
			updatedAt: new Date('2024-01-01'),
		});
		const oldest = await service.getOldestRequest();
		expect(oldest).toEqual({ key: 'tt1234567', updatedAt: new Date('2024-01-01') });

		prismaMock.scraped.findFirst.mockResolvedValueOnce({
			key: 'processing:tt999',
			updatedAt: new Date('2024-01-01'),
		});
		prismaMock.scraped.update.mockResolvedValue(undefined);
		expect(await service.processingMoreThanAnHour()).toBe('tt999');
		expect(prismaMock.scraped.update).toHaveBeenCalled();
	});

	it('lists scraped media and imdb ids', async () => {
		prismaMock.scraped.findMany.mockResolvedValueOnce([{ key: 'tv:tt1' }, { key: 'tv:tt2' }]);
		expect(await service.getOldestScrapedMedia('tv', 2)).toEqual(['tt1', 'tt2']);

		prismaMock.scraped.findMany.mockResolvedValueOnce([
			{ key: 'movie:tt1' },
			{ key: 'movie:tt1' },
			{ key: 'movie:tt2' },
		]);
		expect(await service.getAllImdbIds('movie')).toEqual(['tt1', 'tt2']);
	});

	it('removes processed requests', async () => {
		await service.markAsDone('tt1');
		expect(prismaMock.scraped.deleteMany).toHaveBeenCalledTimes(2);
	});

	it('merges recently updated scraped content', async () => {
		const now = new Date();
		prismaMock.scraped.findMany.mockResolvedValueOnce([{ key: 'movie:tt1', updatedAt: now }]);
		prismaMock.scrapedTrue.findMany.mockResolvedValueOnce([
			{ key: 'tv:tt2', updatedAt: new Date(now.getTime() - 1000) },
		]);

		const recent = await service.getRecentlyUpdatedContent();
		expect(recent).toEqual(['movie:tt1', 'tv:tt2']);
	});

	it('returns cached counts from raw queries', async () => {
		prismaMock.$queryRaw
			.mockResolvedValueOnce([{ contentSize: BigInt(10) }])
			.mockResolvedValueOnce([{ processing: BigInt(2) }])
			.mockResolvedValueOnce([{ requested: BigInt(3) }]);

		expect(await service.getContentSize()).toBe(10);
		expect(await service.getProcessingCount()).toBe(2);
		expect(await service.getRequestedCount()).toBe(3);
	});
});
