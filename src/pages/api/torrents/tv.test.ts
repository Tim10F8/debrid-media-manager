import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './tv';

const {
	mockValidateTokenWithHash,
	mockGetScrapedTrueResults,
	mockGetScrapedResults,
	mockGetReportedHashes,
	mockFlatten,
	mockSort,
} = vi.hoisted(() => ({
	mockValidateTokenWithHash: vi.fn(),
	mockGetScrapedTrueResults: vi.fn(),
	mockGetScrapedResults: vi.fn(),
	mockGetReportedHashes: vi.fn(),
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
	},
}));

vi.mock('@/services/mediasearch', () => ({
	flattenAndRemoveDuplicates: mockFlatten,
	sortByFileSize: mockSort,
}));

describe('/api/torrents/tv', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateTokenWithHash.mockResolvedValue(true);
		mockGetScrapedTrueResults.mockResolvedValue([{ title: 'Season Pack', hash: 'hash-1' }]);
		mockGetScrapedResults.mockResolvedValue([{ title: 'Reported', hash: 'hash-2' }]);
		mockGetReportedHashes.mockResolvedValue(['hash-2']);
	});

	const baseQuery = {
		imdbId: 'tt7654321',
		seasonNum: '2',
		dmmProblemKey: 'key',
		solution: 'solution',
	};

	it('validates authentication parameters', async () => {
		const req = createMockRequest({ query: { imdbId: 'tt', seasonNum: '1' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('rejects invalid tokens', async () => {
		mockValidateTokenWithHash.mockResolvedValue(false);
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('requires imdbId and season number', async () => {
		const req = createMockRequest({ query: { ...baseQuery, imdbId: undefined } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);

		const req2 = createMockRequest({ query: { ...baseQuery, seasonNum: undefined } });
		const res2 = createMockResponse();

		await handler(req2, res2);

		expect(res2.status).toHaveBeenCalledWith(400);
	});

	it('returns filtered tv torrents', async () => {
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockGetScrapedTrueResults).toHaveBeenCalledWith('tv:tt7654321:2', 0, 0);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: [{ title: 'Season Pack', hash: 'hash-1' }],
		});
	});

	it('handles filtering errors by falling back to unfiltered results', async () => {
		mockGetReportedHashes.mockRejectedValue(new Error('redis'));
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: [
				{ title: 'Season Pack', hash: 'hash-1' },
				{ title: 'Reported', hash: 'hash-2' },
			],
		});
	});

	it('returns 500 for unexpected repository errors', async () => {
		mockGetScrapedTrueResults.mockRejectedValue(new Error('db'));
		const req = createMockRequest({ query: baseQuery });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ errorMessage: 'An internal error occurred' });
	});
});
