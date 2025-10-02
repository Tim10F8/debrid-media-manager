import { createMockRequest } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './dbsize';

// Mock the repository
vi.mock('@/services/repository', () => ({
	repository: {
		getContentSize: vi.fn(),
		getProcessingCount: vi.fn(),
		getRequestedCount: vi.fn(),
	},
}));

import { repository as cache } from '@/services/repository';

describe('/api/dbsize', () => {
	let mockReq: any;
	let mockRes: any;

	beforeEach(() => {
		mockReq = createMockRequest();
		mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			_getStatusCode: () => 200,
			_getData: () => ({}),
			_getHeaders: () => ({}),
			_setStatusCode: vi.fn(),
		} as any;
		vi.clearAllMocks();
	});

	it('should return database size information on success', async () => {
		const mockData = {
			contentSize: 1024,
			processing: 5,
			requested: 10,
		};

		vi.mocked(cache.getContentSize).mockResolvedValue(mockData.contentSize);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(mockData.processing);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(mockData.requested);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith(mockData);
		expect(cache.getContentSize).toHaveBeenCalledTimes(1);
		expect(cache.getProcessingCount).toHaveBeenCalledTimes(1);
		expect(cache.getRequestedCount).toHaveBeenCalledTimes(1);
	});

	it('should handle zero values correctly', async () => {
		const mockData = {
			contentSize: 0,
			processing: 0,
			requested: 0,
		};

		vi.mocked(cache.getContentSize).mockResolvedValue(mockData.contentSize);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(mockData.processing);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(mockData.requested);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith(mockData);
	});

	it('should handle large numbers correctly', async () => {
		const mockData = {
			contentSize: Number.MAX_SAFE_INTEGER,
			processing: 999999,
			requested: 1000000,
		};

		vi.mocked(cache.getContentSize).mockResolvedValue(mockData.contentSize);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(mockData.processing);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(mockData.requested);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith(mockData);
	});

	it('should return 500 error when getContentSize fails', async () => {
		const error = new Error('Database connection failed');
		vi.mocked(cache.getContentSize).mockRejectedValue(error);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(5);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(10);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch database size' });
		expect(consoleSpy).toHaveBeenCalledWith(
			'Error fetching database size:',
			'Database connection failed'
		);

		consoleSpy.mockRestore();
	});

	it('should return 500 error when getProcessingCount fails', async () => {
		const error = new Error('Processing query failed');
		vi.mocked(cache.getContentSize).mockResolvedValue(1024);
		vi.mocked(cache.getProcessingCount).mockRejectedValue(error);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(10);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch database size' });
		expect(consoleSpy).toHaveBeenCalledWith(
			'Error fetching database size:',
			'Processing query failed'
		);

		consoleSpy.mockRestore();
	});

	it('should return 500 error when getRequestedCount fails', async () => {
		const error = new Error('Requested query failed');
		vi.mocked(cache.getContentSize).mockResolvedValue(1024);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(5);
		vi.mocked(cache.getRequestedCount).mockRejectedValue(error);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch database size' });
		expect(consoleSpy).toHaveBeenCalledWith(
			'Error fetching database size:',
			'Requested query failed'
		);

		consoleSpy.mockRestore();
	});

	it('should handle non-Error objects in catch block', async () => {
		const error = 'String error message';
		vi.mocked(cache.getContentSize).mockRejectedValue(error);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(5);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(10);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch database size' });
		expect(consoleSpy).toHaveBeenCalledWith('Error fetching database size:', 'Unknown error');

		consoleSpy.mockRestore();
	});

	it('should handle null error in catch block', async () => {
		vi.mocked(cache.getContentSize).mockRejectedValue(null);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(5);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(10);

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to fetch database size' });
		expect(consoleSpy).toHaveBeenCalledWith('Error fetching database size:', 'Unknown error');

		consoleSpy.mockRestore();
	});

	it('should handle GET requests', async () => {
		mockReq.method = 'GET';
		vi.mocked(cache.getContentSize).mockResolvedValue(1024);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(5);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(10);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({
			contentSize: 1024,
			processing: 5,
			requested: 10,
		});
	});

	it('should handle POST requests', async () => {
		mockReq.method = 'POST';
		vi.mocked(cache.getContentSize).mockResolvedValue(2048);
		vi.mocked(cache.getProcessingCount).mockResolvedValue(3);
		vi.mocked(cache.getRequestedCount).mockResolvedValue(7);

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({
			contentSize: 2048,
			processing: 3,
			requested: 7,
		});
	});
});
