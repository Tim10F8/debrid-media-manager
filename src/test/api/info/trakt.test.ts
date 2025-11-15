import handler from '@/pages/api/info/trakt';
import { repository } from '@/services/repository';
import { getMediaData } from '@/services/trakt';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/repository');
vi.mock('@/services/trakt', () => ({
	getMediaData: vi.fn(),
}));

const mockRepository = vi.mocked(repository);
const mockGetMediaData = vi.mocked(getMediaData);

describe('/api/info/trakt', () => {
	const originalClientId = process.env.TRAKT_CLIENT_ID;

	beforeEach(() => {
		process.env.TRAKT_CLIENT_ID = 'client-id';
		vi.clearAllMocks();
		mockRepository.getSearchResults.mockReset();
		mockRepository.saveSearchResults.mockReset();
		mockRepository.saveSearchResults.mockResolvedValue(undefined);
		mockGetMediaData.mockResolvedValue([
			{
				title: 'Fetched Item',
				ids: { imdb: 'tt9999999' },
			} as any,
		]);
	});

	afterAll(() => {
		process.env.TRAKT_CLIENT_ID = originalClientId;
	});

	it('requires browse parameter', async () => {
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'Browse parameter is required' });
	});

	it('returns categorized movie results with cached and fetched data', async () => {
		mockRepository.getSearchResults.mockImplementation(async (key: string) => {
			if (key === 'trakt:movies/popular') {
				return [
					{
						title: 'Cached Hit',
						ids: { imdb: 'tt1111111' },
					},
				] as any[];
			}
			return [];
		});

		const req = createMockRequest({ query: { browse: 'movies' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.getSearchResults).toHaveBeenCalled();
		expect(mockRepository.saveSearchResults).toHaveBeenCalled();
		expect(mockGetMediaData).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		const payload = (res.json as Mock).mock.calls[0][0] as {
			mediaType: string;
			categories: Array<{ name: string; results: Record<string, any[]> }>;
		};
		expect(payload.mediaType).toBe('movie');
		expect(payload.categories.length).toBeGreaterThan(0);
		const hasResults = payload.categories.some((category) =>
			Object.values(category.results).some((items) => items.length > 0)
		);
		expect(hasResults).toBe(true);
	});

	it('supports show browsing with cached results', async () => {
		mockRepository.getSearchResults.mockImplementation(async (key: string) => {
			if (key === 'trakt:shows/trending') {
				return [
					{
						title: 'Trending Show',
						ids: { imdb: 'tt2222222' },
					},
				] as any[];
			}
			return [];
		});

		const req = createMockRequest({ query: { browse: 'shows' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = (res.json as Mock).mock.calls[0][0] as { mediaType: string };
		expect(payload.mediaType).toBe('show');
	});
});
