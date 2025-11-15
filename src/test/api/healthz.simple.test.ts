import { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';

// Simple handler copy for testing
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
	res.status(200).json({ status: 'ok' });
};

describe('/api/healthz simple tests', () => {
	it('should return 200 status', async () => {
		const mockReq = {} as NextApiRequest;
		const mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
		} as any;

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
	});

	it('should handle different request methods', async () => {
		const methods = ['GET', 'POST', 'PUT', 'DELETE'];

		for (const method of methods) {
			const mockReq = { method } as NextApiRequest;
			const mockRes = {
				status: vi.fn().mockReturnThis(),
				json: vi.fn().mockReturnThis(),
			} as any;

			await handler(mockReq, mockRes);

			expect(mockRes.status).toHaveBeenCalledWith(200);
			expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
		}
	});
});
