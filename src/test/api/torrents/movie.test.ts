import handler from '@/pages/api/torrents/movie';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockValidateTokenWithHash,
	mockGetScrapedTrueResults,
	mockGetScrapedResults,
	mockGetReportedHashes,
	mockKeyExists,
	mockSaveScrapedResults,
	mockFlatten,
	mockSort,
} = vi.hoisted(() => ({
	mockValidateTokenWithHash: vi.fn(),
	mockGetScrapedTrueResults: vi.fn(),
	mockGetScrapedResults: vi.fn(),
	mockGetReportedHashes: vi.fn(),
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
		getScrapedResults: mockGetScrapedResults,
		getReportedHashes: mockGetReportedHashes,
		keyExists: mockKeyExists,
		saveScrapedResults: mockSaveScrapedResults,
	},
}));

vi.mock('@/services/mediasearch', () => ({
	flattenAndRemoveDuplicates: mockFlatten,
	sortByFileSize: mockSort,
}));

describe('/api/torrents/movie', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateTokenWithHash.mockResolvedValue(true);
		mockGetScrapedTrueResults.mockResolvedValue([{ title: 'Trusted', hash: 'hash-1' }]);
		mockGetScrapedResults.mockResolvedValue([{ title: 'Community', hash: 'hash-2' }]);
		mockGetReportedHashes.mockResolvedValue(['hash-2']);
	});

	const baseQuery = {
		imdbId: 'tt1234567',
		dmmProblemKey: 'key',
		solution: 'solution',
	};

	it('requires authentication parameters', async () => {
		const req = createMockRequest({ query: { imdbId: 'tt123' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(mockValidateTokenWithHash).not.toHaveBeenCalled();
	});

	it('rejects when token validation fails', async () => {
		mockValidateTokenWithHash.mockResolvedValue(false);
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('requires imdbId', async () => {
		const req = createMockRequest({ query: { ...baseQuery, imdbId: undefined } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns filtered search results and removes reported hashes', async () => {
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockGetScrapedTrueResults).toHaveBeenCalled();
		expect(mockGetScrapedResults).toHaveBeenCalled();
		expect(mockGetReportedHashes).toHaveBeenCalledWith('tt1234567');
		expect(mockFlatten).toHaveBeenCalledWith([{ title: 'Trusted', hash: 'hash-1' }]);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ results: [{ title: 'Trusted', hash: 'hash-1' }] });
	});

	it('falls back to unfiltered results when reporting lookup fails', async () => {
		mockGetReportedHashes.mockRejectedValue(new Error('redis down'));
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: [
				{ title: 'Trusted', hash: 'hash-1' },
				{ title: 'Community', hash: 'hash-2' },
			],
		});
	});

	it('skips community results when onlyTrusted is true', async () => {
		const req = createMockRequest({ query: { ...baseQuery, onlyTrusted: 'true' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockGetScrapedResults).not.toHaveBeenCalled();
	});

	it('returns 500 when the repository throws synchronously', async () => {
		mockGetScrapedTrueResults.mockRejectedValue(new Error('db down'));
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ errorMessage: 'An internal error occurred' });
	});
});
