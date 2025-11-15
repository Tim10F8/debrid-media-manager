import handler from '@/pages/api/stremio/links';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockValidateMethod,
	mockValidateToken,
	mockGenerateUserId,
	mockFetchAllCastedLinks,
	mockHandleApiError,
} = vi.hoisted(() => ({
	mockValidateMethod: vi.fn(),
	mockValidateToken: vi.fn(),
	mockGenerateUserId: vi.fn(),
	mockFetchAllCastedLinks: vi.fn(),
	mockHandleApiError: vi.fn(),
}));

vi.mock('@/utils/castApiHelpers', () => ({
	validateMethod: mockValidateMethod,
	validateToken: mockValidateToken,
	generateUserId: mockGenerateUserId,
	handleApiError: mockHandleApiError,
}));

vi.mock('@/services/repository', () => ({
	repository: {
		fetchAllCastedLinks: mockFetchAllCastedLinks,
	},
}));

describe('/api/stremio/links', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateMethod.mockReturnValue(true);
		mockValidateToken.mockReturnValue('token');
		mockGenerateUserId.mockResolvedValue('user-1');
	});

	it('rejects invalid methods', async () => {
		mockValidateMethod.mockReturnValue(false);
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(mockValidateToken).not.toHaveBeenCalled();
	});

	it('returns fetched casted links', async () => {
		mockFetchAllCastedLinks.mockResolvedValue([{ imdb: 'tt1' }]);
		const req = createMockRequest({ method: 'GET' });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockFetchAllCastedLinks).toHaveBeenCalledWith('user-1');
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith([{ imdb: 'tt1' }]);
	});

	it('handles repository failures gracefully', async () => {
		mockFetchAllCastedLinks.mockRejectedValue(new Error('db'));
		const req = createMockRequest({ method: 'GET' });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockHandleApiError).toHaveBeenCalledWith(
			expect.any(Error),
			res,
			expect.stringContaining('Failed to fetch links')
		);
	});
});
