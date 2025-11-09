import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './casted-shows.json';

const { mockFetchCastedShows, mockIsLegacyToken } = vi.hoisted(() => ({
	mockFetchCastedShows: vi.fn(),
	mockIsLegacyToken: vi.fn(),
}));

vi.mock('@/services/repository', () => ({
	repository: {
		fetchCastedShows: mockFetchCastedShows,
	},
}));

vi.mock('@/utils/castApiHelpers', () => ({
	isLegacyToken: mockIsLegacyToken,
}));

describe('/api/stremio/[userid]/catalog/series/casted-shows.json', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsLegacyToken.mockReturnValue(false);
	});

	it('validates userid parameter', async () => {
		const req = createMockRequest({ query: { userid: ['abc'] as any } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Invalid "userid" query parameter',
		});
	});

	it('returns legacy upgrade instructions when token is legacy', async () => {
		mockIsLegacyToken.mockReturnValue(true);
		const req = createMockRequest({ query: { userid: 'abcde' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			metas: [
				expect.objectContaining({
					id: 'dmm-update-required',
					type: 'series',
				}),
			],
			cacheMaxAge: 0,
		});
	});

	it('returns casted shows list for non-legacy tokens', async () => {
		mockFetchCastedShows.mockResolvedValue(['tt901', 'tt902']);
		const req = createMockRequest({ query: { userid: 'user' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			metas: [
				{
					id: 'tt901',
					type: 'series',
					poster: 'https://images.metahub.space/poster/small/tt901/img',
				},
				{
					id: 'tt902',
					type: 'series',
					poster: 'https://images.metahub.space/poster/small/tt902/img',
				},
			],
			cacheMaxAge: 0,
		});
	});
});
