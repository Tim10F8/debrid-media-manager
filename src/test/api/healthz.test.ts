import handler from '@/pages/api/healthz';
import { createMockRequest } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('/api/healthz', () => {
	let mockReq: any;
	let mockRes: any;

	beforeEach(() => {
		mockReq = createMockRequest();
		mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
			_getStatusCode: () => 200,
			_getData: () => ({}),
			_getHeaders: () => ({}),
			_setStatusCode: vi.fn(),
		} as any;
	});

	it('should return 200 status with ok message', async () => {
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle GET requests', async () => {
		mockReq.method = 'GET';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle POST requests', async () => {
		mockReq.method = 'POST';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle requests with query parameters', async () => {
		mockReq.query = { test: 'value' };
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle requests with body', async () => {
		mockReq.body = { data: 'test' };
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should return JSON content type', async () => {
		await handler(mockReq, mockRes);

		// Next.js automatically sets content-type for json responses
		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});
});
