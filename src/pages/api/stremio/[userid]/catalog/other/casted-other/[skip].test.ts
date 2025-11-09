import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './[skip]';

const { mockGetDMMLibrary, mockIsLegacyToken } = vi.hoisted(() => ({
	mockGetDMMLibrary: vi.fn(),
	mockIsLegacyToken: vi.fn(),
}));

vi.mock('@/utils/castCatalogHelper', () => ({
	getDMMLibrary: mockGetDMMLibrary,
	PAGE_SIZE: 12,
}));

vi.mock('@/utils/castApiHelpers', () => ({
	isLegacyToken: mockIsLegacyToken,
}));

describe('/api/stremio/[userid]/catalog/other/casted-other/[skip].ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsLegacyToken.mockReturnValue(false);
		mockGetDMMLibrary.mockResolvedValue({
			status: 200,
			data: { metas: [], hasMore: false, cacheMaxAge: 0 },
		});
	});

	it('validates skip parameter', async () => {
		const req = createMockRequest({ query: { userid: 'user', skip: ['bad'] as any } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'Invalid "skip" query parameter' });
	});

	it('serves legacy update notice when token is legacy', async () => {
		mockIsLegacyToken.mockReturnValue(true);
		const req = createMockRequest({ query: { userid: 'abcde', skip: 'skip=12.json' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			metas: [
				expect.objectContaining({
					id: 'dmm:update-required',
					type: 'other',
				}),
			],
		});
	});

	it('calculates the correct page based on skip value', async () => {
		const req = createMockRequest({ query: { userid: 'user123', skip: 'skip=24.json' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockGetDMMLibrary).toHaveBeenCalledWith('user123', 3);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ metas: [], hasMore: false, cacheMaxAge: 0 });
	});

	it('returns upstream errors', async () => {
		mockGetDMMLibrary.mockResolvedValue({ status: 502, error: 'upstream' });
		const req = createMockRequest({ query: { userid: 'user123', skip: 'skip=0.json' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(502);
		expect(res.json).toHaveBeenCalledWith({ error: 'upstream' });
	});
});
