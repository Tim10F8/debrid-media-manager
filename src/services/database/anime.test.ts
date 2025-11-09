import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AnimeService } from './anime';

const prismaMock = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	anime: {
		findMany: vi.fn(),
	},
}));

vi.mock('./client', () => ({
	DatabaseClient: class {
		prisma = prismaMock;
	},
}));

describe('AnimeService', () => {
	let service: AnimeService;

	beforeEach(() => {
		service = new AnimeService();
		(prismaMock.$queryRaw as Mock).mockReset();
		(prismaMock.anime.findMany as Mock).mockReset();
	});

	it('maps recently updated anime rows to the expected shape', async () => {
		prismaMock.$queryRaw.mockResolvedValue([
			{ anidb_id: 1, mal_id: null, poster_url: 'url-a' },
			{ anidb_id: null, mal_id: 2, poster_url: 'url-b' },
		]);

		const items = await service.getRecentlyUpdatedAnime(2);
		expect(items).toEqual([
			{ id: 'anime:anidb-1', poster_url: 'url-a' },
			{ id: 'anime:mal-2', poster_url: 'url-b' },
		]);
	});

	it('searches anime by title and uses either mal or anidb ids', async () => {
		prismaMock.$queryRaw.mockResolvedValue([
			{ title: 'Naruto', anidb_id: 1, mal_id: null, poster_url: 'poster' },
		]);

		const results = await service.searchAnimeByTitle('naruto');
		expect(results).toEqual([{ id: 'anime:anidb-1', title: 'Naruto', poster_url: 'poster' }]);
	});

	it('loads anime entries by MyAnimeList ids', async () => {
		prismaMock.anime.findMany.mockResolvedValue([
			{ title: 'One Piece', anidb_id: null, mal_id: 1, poster_url: 'poster' },
		]);

		const result = await service.getAnimeByMalIds([1]);
		expect(result).toEqual([{ id: 'anime:mal-1', title: 'One Piece', poster_url: 'poster' }]);
	});

	it('loads anime entries by Kitsu ids', async () => {
		prismaMock.anime.findMany.mockResolvedValue([
			{ title: 'Bleach', anidb_id: 2, mal_id: null, poster_url: 'poster' },
		]);

		const result = await service.getAnimeByKitsuIds([1]);
		expect(result).toEqual([{ id: 'anime:anidb-2', title: 'Bleach', poster_url: 'poster' }]);
	});
});
