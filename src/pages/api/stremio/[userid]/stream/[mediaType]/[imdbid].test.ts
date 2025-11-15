import { getToken } from '@/services/realDebrid';
import { repository } from '@/services/repository';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { isLegacyToken } from '@/utils/castApiHelpers';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './[imdbid]';

vi.mock('@/services/repository');
vi.mock('@/services/realDebrid', () => ({
	getToken: vi.fn(),
}));
vi.mock('@/utils/castApiHelpers', () => ({
	isLegacyToken: vi.fn(),
}));

const mockRepository = vi.mocked(repository);
const mockGetToken = vi.mocked(getToken);
const mockIsLegacyToken = vi.mocked(isLegacyToken);

describe('/api/stremio/[userid]/stream/[mediaType]/[imdbid]', () => {
	const originalOrigin = process.env.DMM_ORIGIN;

	beforeEach(() => {
		process.env.DMM_ORIGIN = 'https://dmm.test';
		vi.clearAllMocks();
		mockRepository.getCastProfile = vi.fn();
		mockRepository.getCastURLs = vi.fn();
		mockRepository.getOtherCastURLs = vi.fn();
		mockIsLegacyToken.mockReturnValue(false);
	});

	afterAll(() => {
		process.env.DMM_ORIGIN = originalOrigin;
	});

	it('validates query parameters', async () => {
		const req = createMockRequest({ query: { userid: 'user', mediaType: 'movie' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Invalid "userid", "imdbid" or "mediaType" query parameter',
		});
	});

	it('sets CORS headers on all responses', async () => {
		const testCases = [
			{
				name: 'invalid params',
				query: { userid: 'user', mediaType: 'movie' },
			},
			{
				name: 'OPTIONS',
				method: 'OPTIONS',
				query: { userid: 'user', mediaType: 'movie', imdbid: 'tt123' },
			},
			{
				name: 'legacy token',
				setup: () => mockIsLegacyToken.mockReturnValue(true),
				query: { userid: 'short', mediaType: 'movie', imdbid: 'tt123' },
			},
			{
				name: 'missing profile',
				setup: () => mockRepository.getCastProfile.mockResolvedValue(null),
				query: { userid: 'user', mediaType: 'movie', imdbid: 'tt123' },
			},
			{
				name: 'token error',
				setup: () => {
					mockRepository.getCastProfile.mockResolvedValue({
						clientId: 'id',
						clientSecret: 'secret',
						refreshToken: 'refresh',
					});
					mockGetToken.mockRejectedValue(new Error('rd down'));
				},
				query: { userid: 'user', mediaType: 'movie', imdbid: 'tt123' },
			},
		];

		for (const testCase of testCases) {
			vi.clearAllMocks();
			mockIsLegacyToken.mockReturnValue(false);
			mockRepository.getCastProfile = vi.fn();
			mockRepository.getCastURLs = vi.fn();
			mockRepository.getOtherCastURLs = vi.fn();

			testCase.setup?.();

			const req = createMockRequest({
				query: testCase.query,
				method: testCase.method || 'GET',
			});
			const res = createMockResponse();

			await handler(req, res);

			expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin', '*');
		}
	});

	it('supports OPTIONS preflight', async () => {
		const req = createMockRequest({
			method: 'OPTIONS',
			query: { userid: 'user', mediaType: 'movie', imdbid: 'tt123' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('prompts update when legacy tokens are used', async () => {
		mockIsLegacyToken.mockReturnValue(true);
		const req = createMockRequest({
			query: { userid: 'short', mediaType: 'movie', imdbid: 'tt123' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				streams: expect.arrayContaining([
					expect.objectContaining({
						name: '⚠️ Update Required',
					}),
				]),
			})
		);
	});

	it('returns 500 when no cast profile exists', async () => {
		mockRepository.getCastProfile = vi.fn().mockResolvedValue(null);
		const req = createMockRequest({
			query: { userid: 'user123', mediaType: 'movie', imdbid: 'tt123' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Failed to get Real-Debrid profile for user user123',
		});
	});

	it('returns 500 when token acquisition fails', async () => {
		mockRepository.getCastProfile = vi.fn().mockResolvedValue({
			clientId: 'id',
			clientSecret: 'secret',
			refreshToken: 'refresh',
		});
		mockGetToken.mockRejectedValue(new Error('rd down'));

		const req = createMockRequest({
			query: { userid: 'user123', mediaType: 'movie', imdbid: 'tt123' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Failed to get Real-Debrid token for user user123',
		});
	});

	it('serves cast streams for shows', async () => {
		mockRepository.getCastProfile = vi.fn().mockResolvedValue({
			clientId: 'id',
			clientSecret: 'secret',
			refreshToken: 'refresh',
		});
		mockGetToken.mockResolvedValue({ access_token: 'token' } as any);
		mockRepository.getCastURLs = vi.fn().mockResolvedValue([
			{
				url: 'https://files.dmm.test/My%20Show%20S01E01.mkv',
				size: 2048,
				link: 'https://app.real-debrid.com/d/abcdefghijklmnopqrstuvwxyz',
			},
		]);
		mockRepository.getOtherCastURLs = vi.fn().mockResolvedValue([
			{
				url: 'https://files.dmm.test/Other.mkv',
				size: 512,
				link: 'https://app.real-debrid.com/d/abcdefghijklmnopqrstuvwxyz123',
			},
		]);

		const req = createMockRequest({
			query: {
				userid: 'user123',
				mediaType: 'show',
				imdbid: 'tt7654321:2:3.json',
			},
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		const payload = (res.json as Mock).mock.calls[0][0] as {
			streams: Array<{ name: string; url?: string; externalUrl?: string }>;
		};
		expect(payload.streams).toHaveLength(4);
		expect(payload.streams.some((stream) => stream.name.includes('DMM 🧙‍♂️ Yours'))).toBe(true);
	});

	it('returns 500 when cast URLs retrieval fails', async () => {
		mockRepository.getCastProfile = vi.fn().mockResolvedValue({
			clientId: 'id',
			clientSecret: 'secret',
			refreshToken: 'refresh',
		});
		mockGetToken.mockResolvedValue({ access_token: 'token' } as any);
		mockRepository.getCastURLs = vi.fn().mockRejectedValue(new Error('db'));

		const req = createMockRequest({
			query: {
				userid: 'user123',
				mediaType: 'movie',
				imdbid: 'tt7654321',
			},
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get casted URLs' });
	});
});
