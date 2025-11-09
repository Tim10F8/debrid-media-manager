import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './anime';

const {
	mockValidateTokenWithHash,
	mockGetScrapedTrueResults,
	mockKeyExists,
	mockSaveScrapedResults,
	mockFlatten,
	mockSort,
} = vi.hoisted(() => ({
	mockValidateTokenWithHash: vi.fn(),
	mockGetScrapedTrueResults: vi.fn(),
	mockKeyExists: vi.fn(),
	mockSaveScrapedResults: vi.fn(),
	mockFlatten: vi.fn((items: any[]) => items),
	mockSort: vi.fn((items: any[]) => items),
}));

vi.mock('@/utils/token', () => ({
	validateTokenWithHash: mockValidateTokenWithHash,
}));

vi.mock('@/services/repository', () => ({
	repository: {
		getScrapedTrueResults: mockGetScrapedTrueResults,
		keyExists: mockKeyExists,
		saveScrapedResults: mockSaveScrapedResults,
	},
}));

vi.mock('@/services/mediasearch', () => ({
	flattenAndRemoveDuplicates: mockFlatten,
	sortByFileSize: mockSort,
}));

describe('/api/torrents/anime', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateTokenWithHash.mockResolvedValue(true);
		mockGetScrapedTrueResults.mockResolvedValue([
			{ filename: 'Anime.EP01', size_bytes: 1234, hash: 'hash-1' },
		]);
	});

	const baseQuery = {
		animeId: 'anidb:1',
		dmmProblemKey: 'key',
		solution: 'solution',
	};

	it('validates authentication', async () => {
		const req = createMockRequest({ query: { animeId: 'anidb:1' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('requires animeId', async () => {
		const req = createMockRequest({ query: { ...baseQuery, animeId: undefined } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns flattened anime results', async () => {
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockFlatten).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: expect.arrayContaining([
				expect.objectContaining({ title: 'Anime.EP01', fileSize: 1234 }),
			]),
		});
	});

	it('marks requested state when repository throws', async () => {
		mockGetScrapedTrueResults.mockRejectedValue(new Error('db'));
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ errorMessage: 'An internal error occurred' });
	});
});
