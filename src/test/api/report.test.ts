import handler from '@/pages/api/report';
import { repository } from '@/services/repository';
import { createMockRequest } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/repository');
const mockRepository = vi.mocked(repository);

describe('/api/report', () => {
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

	it('should return 405 for non-POST requests', async () => {
		const methods = ['GET', 'PUT', 'DELETE', 'PATCH'];

		for (const method of methods) {
			vi.clearAllMocks();
			mockReq.method = method;
			await handler(mockReq, mockRes);

			expect(mockRes.status).toHaveBeenCalledWith(405);
			expect(mockRes.json).toHaveBeenCalledWith({ message: 'Method not allowed' });
		}
	});

	it('should return 400 when required fields are missing', async () => {
		mockReq.method = 'POST';
		mockReq.body = { hash: 'abc123' }; // missing other fields
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({ message: 'Missing required fields' });
	});

	it('should return 400 when report type is invalid', async () => {
		mockReq.method = 'POST';
		mockReq.body = {
			hash: 'abc123',
			imdbId: 'tt1234567',
			userId: 'user123',
			type: 'invalid_type',
		};
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({ message: 'Invalid report type' });
	});

	it('should return 200 for valid porn report', async () => {
		mockReq.method = 'POST';
		mockReq.body = {
			hash: 'abc123',
			imdbId: 'tt1234567',
			userId: 'user123',
			type: 'porn',
		};

		mockRepository.reportContent = vi.fn().mockResolvedValue(undefined);

		await handler(mockReq, mockRes);

		expect(mockRepository.reportContent).toHaveBeenCalledWith(
			'abc123',
			'tt1234567',
			'user123',
			'porn'
		);
		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ success: true });
	});

	it('should return 200 for valid wrong_imdb report', async () => {
		mockReq.method = 'POST';
		mockReq.body = {
			hash: 'abc123',
			imdbId: 'tt1234567',
			userId: 'user123',
			type: 'wrong_imdb',
		};

		mockRepository.reportContent = vi.fn().mockResolvedValue(undefined);

		await handler(mockReq, mockRes);

		expect(mockRepository.reportContent).toHaveBeenCalledWith(
			'abc123',
			'tt1234567',
			'user123',
			'wrong_imdb'
		);
		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ success: true });
	});

	it('should return 200 for valid wrong_season report', async () => {
		mockReq.method = 'POST';
		mockReq.body = {
			hash: 'abc123',
			imdbId: 'tt1234567',
			userId: 'user123',
			type: 'wrong_season',
		};

		mockRepository.reportContent = vi.fn().mockResolvedValue(undefined);

		await handler(mockReq, mockRes);

		expect(mockRepository.reportContent).toHaveBeenCalledWith(
			'abc123',
			'tt1234567',
			'user123',
			'wrong_season'
		);
		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({ success: true });
	});

	it('should return 500 when repository throws error', async () => {
		mockReq.method = 'POST';
		mockReq.body = {
			hash: 'abc123',
			imdbId: 'tt1234567',
			userId: 'user123',
			type: 'porn',
		};

		mockRepository.reportContent = vi.fn().mockRejectedValue(new Error('Database error'));

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ message: 'Internal server error' });
	});

	it('should handle valid POST requests with all valid report types', async () => {
		const validTypes = ['porn', 'wrong_imdb', 'wrong_season'];

		for (const type of validTypes) {
			vi.clearAllMocks();
			mockReq.method = 'POST';
			mockReq.body = {
				hash: 'abc123',
				imdbId: 'tt1234567',
				userId: 'user123',
				type,
			};

			mockRepository.reportContent = vi.fn().mockResolvedValue(undefined);

			await handler(mockReq, mockRes);

			expect(mockRepository.reportContent).toHaveBeenCalledWith(
				'abc123',
				'tt1234567',
				'user123',
				type
			);
			expect(mockRes.status).toHaveBeenCalledWith(200);
			expect(mockRes.json).toHaveBeenCalledWith({ success: true });
		}
	});
});
