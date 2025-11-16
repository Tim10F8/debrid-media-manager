import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CastService } from './cast';

const prismaMock = vi.hoisted(() => ({
	castProfile: {
		upsert: vi.fn(),
		findUnique: vi.fn(),
	},
	cast: {
		findFirst: vi.fn(),
		findMany: vi.fn(),
		upsert: vi.fn(),
		delete: vi.fn(),
	},
	available: {
		findMany: vi.fn(),
	},
}));

vi.mock('./client', () => ({
	DatabaseClient: class {
		prisma = prismaMock;
	},
}));

describe('CastService', () => {
	let service: CastService;

	beforeEach(() => {
		service = new CastService();
		Object.values(prismaMock.castProfile).forEach((fn) => (fn as Mock).mockReset());
		Object.values(prismaMock.cast).forEach((fn) => (fn as Mock).mockReset());
		Object.values(prismaMock.available).forEach((fn) => (fn as Mock).mockReset());
	});

	it('upserts cast profiles', async () => {
		await service.saveCastProfile('user', 'client', 'secret', 'refresh');
		expect(prismaMock.castProfile.upsert).toHaveBeenCalledWith({
			where: { userId: 'user' },
			update: expect.objectContaining({ clientId: 'client', clientSecret: 'secret' }),
			create: expect.objectContaining({ refreshToken: 'refresh' }),
		});
	});

	it('returns the latest cast entry when both url and link exist', async () => {
		prismaMock.cast.findFirst.mockResolvedValueOnce({
			url: 'url',
			link: 'link',
		});
		const latest = await service.getLatestCast('tt', 'user');
		expect(latest).toEqual({ url: 'url', link: 'link' });

		prismaMock.cast.findFirst.mockResolvedValueOnce({ url: null, link: null });
		expect(await service.getLatestCast('tt', 'user')).toBeNull();
	});

	it('returns filtered cast URLs for the owner and others', async () => {
		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ url: 'url', link: 'link', size: BigInt(100) },
			{ url: 'url2', link: null, size: BigInt(0) },
		]);
		const own = await service.getCastURLs('tt', 'user');
		expect(own).toEqual([{ url: 'url', link: 'link', size: 100 }]);

		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ url: 'url', link: 'link', size: BigInt(200) },
			{ url: 'url2', link: null, size: BigInt(100) },
		]);
		const other = await service.getOtherCastURLs('tt', 'user');
		expect(other).toEqual([{ url: 'url', link: 'link', size: 200 }]);
	});

	it('reads cast profiles for a user', async () => {
		prismaMock.castProfile.findUnique.mockResolvedValue({
			clientId: 'id',
			clientSecret: 'secret',
			refreshToken: 'refresh',
		});

		const profile = await service.getCastProfile('user');
		expect(profile).toEqual({
			clientId: 'id',
			clientSecret: 'secret',
			refreshToken: 'refresh',
		});
	});

	it('saves cast entries and converts file sizes to bigint', async () => {
		await service.saveCast('tt', 'user', 'hash', 'url', 'link', 123);
		expect(prismaMock.cast.upsert).toHaveBeenCalledWith({
			where: {
				imdbId_userId_hash: { imdbId: 'tt', userId: 'user', hash: 'hash' },
			},
			update: expect.objectContaining({ size: BigInt(123) }),
			create: expect.objectContaining({ size: BigInt(123) }),
		});
	});

	it('lists movies and shows that were cast by the user', async () => {
		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ imdbId: 'tt1', updatedAt: new Date() },
			{ imdbId: 'tt2', updatedAt: new Date() },
		]);
		expect(await service.fetchCastedMovies('user')).toEqual(['tt1', 'tt2']);

		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ imdbId: 'tt1:1', updatedAt: new Date() },
			{ imdbId: 'tt1:2', updatedAt: new Date() },
		]);
		expect(await service.fetchCastedShows('user')).toEqual(['tt1']);
	});

	it('returns every stored cast link for a user', async () => {
		const now = new Date();
		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ imdbId: 'tt', url: 'url', hash: 'hash', size: BigInt(10), updatedAt: now },
		]);
		expect(await service.fetchAllCastedLinks('user')).toEqual([
			{ imdbId: 'tt', url: 'url', hash: 'hash', size: 10, updatedAt: now },
		]);
	});

	it('deletes casted links and wraps errors', async () => {
		await service.deleteCastedLink('tt', 'user', 'hash');
		expect(prismaMock.cast.delete).toHaveBeenCalledWith({
			where: { imdbId_userId_hash: { imdbId: 'tt', userId: 'user', hash: 'hash' } },
		});

		prismaMock.cast.delete.mockRejectedValue(new Error('db down'));
		await expect(service.deleteCastedLink('tt', 'user', 'hash')).rejects.toThrow(
			'Failed to delete casted link: db down'
		);
	});

	it('returns all cast entries for a user', async () => {
		prismaMock.cast.findMany.mockResolvedValueOnce([
			{ imdbId: 'tt', hash: 'hash', url: 'url', link: 'link', size: BigInt(5) },
		]);
		expect(await service.getAllUserCasts('user')).toEqual([
			{ imdbId: 'tt', hash: 'hash', url: 'url', link: 'link', size: 5 },
		]);
	});

	it('returns user cast streams only', async () => {
		const now = new Date();

		prismaMock.cast.findMany.mockResolvedValueOnce([
			{
				url: 'https://files.dmm.test/cast1.mkv',
				link: 'https://app.real-debrid.com/d/cast1link',
				size: BigInt(2048),
			},
			{
				url: 'https://files.dmm.test/cast2.mkv',
				link: 'https://app.real-debrid.com/d/cast2link',
				size: BigInt(1024),
			},
		]);

		const userStreams = await service.getUserCastStreams('tt123', 'user1', 5);

		expect(userStreams).toHaveLength(2);
		expect(userStreams[0]).toEqual({
			url: 'https://files.dmm.test/cast1.mkv',
			link: 'https://app.real-debrid.com/d/cast1link',
			size: 2048,
			filename: 'cast1.mkv',
		});
	});

	it('prioritizes Available and only queries casts when Available < limit', async () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 1000 * 60 * 60);
		const twoHoursAgo = new Date(now.getTime() - 2000 * 60 * 60);

		prismaMock.available.findMany.mockResolvedValueOnce([
			{
				filename: 'Available Torrent',
				files: [
					{
						link: 'https://app.real-debrid.com/d/availlink',
						path: '/path/to/available.mkv',
						bytes: BigInt(3145728000),
					},
				],
				updatedAt: oneHourAgo,
			},
		]);

		prismaMock.cast.findMany.mockResolvedValueOnce([
			{
				url: 'https://files.dmm.test/othercast.mkv',
				link: 'https://app.real-debrid.com/d/otherlink',
				size: BigInt(2048),
				updatedAt: twoHoursAgo,
			},
		]);

		const otherStreams = await service.getOtherStreams('tt123', 'user1', 5);

		expect(otherStreams).toHaveLength(2);
		expect(otherStreams[0]).toEqual({
			url: 'https://app.real-debrid.com/d/availlink',
			link: 'https://app.real-debrid.com/d/availlink',
			size: 3000,
			filename: 'available.mkv',
		});
		expect(otherStreams[1]).toEqual({
			url: 'https://files.dmm.test/othercast.mkv',
			link: 'https://app.real-debrid.com/d/otherlink',
			size: 2048,
			filename: 'othercast.mkv',
		});
	});

	it('only returns Available streams when Available >= limit', async () => {
		const now = new Date();

		const availableItems = Array.from({ length: 5 }, (_, i) => ({
			filename: `Available Torrent ${i}`,
			files: [
				{
					link: `https://app.real-debrid.com/d/availlink${i}`,
					path: `/movies/available${i}.mkv`,
					bytes: BigInt(3145728000),
				},
			],
			updatedAt: new Date(now.getTime() - i * 1000),
		}));

		prismaMock.available.findMany.mockResolvedValueOnce(availableItems);

		const otherStreams = await service.getOtherStreams('tt123', 'user1', 5);

		expect(otherStreams).toHaveLength(5);
		expect(prismaMock.cast.findMany).not.toHaveBeenCalled();
	});

	it('handles TV show imdbId format in getOtherStreams', async () => {
		const now = new Date();

		prismaMock.available.findMany.mockResolvedValueOnce([
			{
				filename: 'Show Season Pack',
				files: [
					{
						link: 'https://app.real-debrid.com/d/packlink',
						path: '/Show/S01E01.mkv',
						bytes: BigInt(1073741824),
					},
				],
				updatedAt: now,
			},
		]);

		prismaMock.cast.findMany.mockResolvedValueOnce([]);

		const otherStreams = await service.getOtherStreams('tt123:1:1', 'user1', 5);

		expect(prismaMock.available.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					imdbId: 'tt123',
				}),
			})
		);
	});

	it('filters out items without links in getUserCastStreams', async () => {
		const now = new Date();

		prismaMock.cast.findMany.mockResolvedValueOnce([
			{
				url: 'https://files.dmm.test/withlink.mkv',
				link: 'https://app.real-debrid.com/d/validlink',
				size: BigInt(1024),
			},
			{
				url: 'https://files.dmm.test/nolink.mkv',
				link: null,
				size: BigInt(2048),
			},
		]);

		const userStreams = await service.getUserCastStreams('tt123', 'user1', 5);

		expect(userStreams).toHaveLength(1);
		expect(userStreams[0].filename).toBe('withlink.mkv');
	});

	it('filters out available items without files in getOtherStreams', async () => {
		const now = new Date();

		prismaMock.available.findMany.mockResolvedValueOnce([
			{
				filename: 'No Files',
				files: [],
				updatedAt: now,
			},
		]);

		prismaMock.cast.findMany.mockResolvedValueOnce([]);

		const otherStreams = await service.getOtherStreams('tt123', 'user1', 5);

		expect(otherStreams).toHaveLength(0);
	});

	it('respects the limit parameter in getOtherStreams', async () => {
		const now = new Date();

		const castItems = Array.from({ length: 10 }, (_, i) => ({
			url: `https://files.dmm.test/cast${i}.mkv`,
			link: `https://app.real-debrid.com/d/link${i}`,
			size: BigInt(1024),
			updatedAt: new Date(now.getTime() - i * 1000),
		}));

		prismaMock.available.findMany.mockResolvedValueOnce([]);
		prismaMock.cast.findMany.mockResolvedValueOnce(castItems);

		const otherStreams = await service.getOtherStreams('tt123', 'user1', 3);

		expect(otherStreams.length).toBeLessThanOrEqual(3);
	});
});
