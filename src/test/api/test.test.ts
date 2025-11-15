import handler from '@/pages/api/test';
import { createMockRequest } from '@/test/utils/api';
import { hasNoBannedTerms, matchesTitle } from '@/utils/checks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/checks');
const mockMatchesTitle = vi.mocked(matchesTitle);
const mockHasNoBannedTerms = vi.mocked(hasNoBannedTerms);

describe('/api/test', () => {
	let mockReq: any;
	let mockRes: any;

	beforeEach(() => {
		mockReq = createMockRequest();
		mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
			_getStatusCode: () => 200,
			_getData: () => ({}),
			_getHeaders: () => ({}),
			_setStatusCode: vi.fn(),
		} as any;
		vi.clearAllMocks();
	});

	it('should return 200 status for GET requests', async () => {
		mockReq.method = 'GET';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should return 200 status for POST requests', async () => {
		mockReq.method = 'POST';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle requests with query parameters', async () => {
		mockReq.query = { debug: 'true' };
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle requests with body', async () => {
		mockReq.body = { test: 'data' };
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should run title matching tests', async () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		// The handler calls matchesTitle and hasNoBannedTerms twice with different arguments
		expect(mockMatchesTitle).toHaveBeenCalledWith(
			"Doraemon: Nobita's Dinosaur",
			['2006'],
			'[New-raws] Kizuna no Allele - 01~12 [1080p] [ENG]'
		);
		expect(mockHasNoBannedTerms).toHaveBeenCalledWith(
			"Doraemon: Nobita's Dinosaur",
			'[New-raws] Kizuna no Allele - 01~12 [1080p] [ENG]'
		);
		expect(mockMatchesTitle).toHaveBeenCalledWith(
			'Non Non Biyori: Vacation',
			['2018'],
			'Non Non Biyori The Movie Vacation 2018 1080p Blu-ray Remux AVC LPCM 5.1 - MH93.mkv'
		);
		expect(mockHasNoBannedTerms).toHaveBeenCalledWith(
			'Non Non Biyori: Vacation',
			'Non Non Biyori The Movie Vacation 2018 1080p Blu-ray Remux AVC LPCM 5.1 - MH93.mkv'
		);

		expect(consoleSpy).toHaveBeenCalledTimes(4);
		consoleSpy.mockRestore();
	});

	it('should handle different HTTP methods', async () => {
		const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

		for (const method of methods) {
			vi.clearAllMocks();
			mockReq.method = method;
			await handler(mockReq, mockRes);

			expect(mockRes.status).toHaveBeenCalledWith(200);
			expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
		}
	});

	it('should always return the same response regardless of input', async () => {
		const testCases = [
			{ method: 'GET', query: null, body: null },
			{ method: 'POST', query: { test: 'value' }, body: null },
			{ method: 'PUT', query: null, body: { data: 'test' } },
			{ method: 'DELETE', query: { debug: 'true' }, body: { test: 'data' } },
		];

		for (const testCase of testCases) {
			vi.clearAllMocks();
			mockReq.method = testCase.method;
			if (testCase.query) mockReq.query = testCase.query;
			if (testCase.body) mockReq.body = testCase.body;

			await handler(mockReq, mockRes);

			expect(mockRes.status).toHaveBeenCalledWith(200);
			expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
		}
	});
});
