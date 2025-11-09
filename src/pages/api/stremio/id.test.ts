import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockValidateMethod = vi.fn();
const mockValidateToken = vi.fn();
const mockGenerateUserId = vi.fn();

vi.mock('@/utils/castApiHelpers', () => ({
	validateMethod: mockValidateMethod,
	validateToken: mockValidateToken,
	generateUserId: mockGenerateUserId,
}));

describe('/api/stremio/id', () => {
	const loadHandler = async () => {
		const mod = await import('./id');
		return mod.default;
	};

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockValidateMethod.mockReturnValue(true);
		mockValidateToken.mockReturnValue('token');
	});

	it('exits early when the HTTP method is not allowed', async () => {
		const handler = await loadHandler();
		const req = createMockRequest({ method: 'POST' });
		const res = createMockResponse();
		mockValidateMethod.mockReturnValue(false);

		await handler(req, res);

		expect(mockValidateMethod).toHaveBeenCalled();
		expect(mockValidateToken).not.toHaveBeenCalled();
	});

	it('returns early when token validation fails', async () => {
		const handler = await loadHandler();
		const req = createMockRequest();
		const res = createMockResponse();
		mockValidateToken.mockReturnValue(null);

		await handler(req, res);

		expect(mockValidateToken).toHaveBeenCalled();
		expect(mockGenerateUserId).not.toHaveBeenCalled();
	});

	it('returns generated user id on success', async () => {
		const handler = await loadHandler();
		const req = createMockRequest();
		const res = createMockResponse();
		mockGenerateUserId.mockResolvedValue('user-abc');

		await handler(req, res);

		expect(mockGenerateUserId).toHaveBeenCalledWith('token');
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ id: 'user-abc' });
	});

	it('returns 500 when user id generation fails', async () => {
		const handler = await loadHandler();
		const req = createMockRequest();
		const res = createMockResponse();
		mockGenerateUserId.mockRejectedValue(new Error('boom'));

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'boom',
		});
	});
});
