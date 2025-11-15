import handler from '@/pages/api/hashlists';
import { createMockRequest } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the UUID module
vi.mock('uuid', () => ({
	v4: () => 'test-uuid-123',
}));

// Mock Octokit
vi.mock('@octokit/rest', () => ({
	Octokit: vi.fn().mockImplementation(() => ({
		rest: {
			git: {
				getRef: vi.fn().mockResolvedValue({
					data: {
						object: { sha: 'test-commit-sha' },
					},
				}),
				createBlob: vi.fn().mockResolvedValue({
					data: { sha: 'test-blob-sha' },
				}),
				createTree: vi.fn().mockResolvedValue({
					data: { sha: 'test-tree-sha' },
				}),
				createCommit: vi.fn().mockResolvedValue({
					data: { sha: 'test-new-commit-sha' },
				}),
				updateRef: vi.fn().mockResolvedValue({}),
			},
		},
	})),
}));

describe('/api/hashlists', () => {
	let mockReq: any;
	let mockRes: any;

	beforeEach(() => {
		mockReq = createMockRequest();
		mockRes = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
			_getStatusCode: () => 200,
			_getData: () => ({}),
			_getHeaders: () => ({}),
			_setStatusCode: vi.fn(),
		} as any;

		// Set required environment variable
		process.env.GH_PAT = 'test-token';

		vi.clearAllMocks();
	});

	it('should return 405 for non-POST requests', async () => {
		mockReq.method = 'GET';
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(405);
		expect(mockRes.json).toHaveBeenCalledWith({ message: 'Method not allowed' });
	});

	it('should return 400 when URL is missing', async () => {
		mockReq.method = 'POST';
		mockReq.body = {};
		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockRes.json).toHaveBeenCalledWith({ message: 'URL is required' });
	});

	it('should create short URL successfully', async () => {
		mockReq.method = 'POST';
		mockReq.body = { url: 'https://example.com' };

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(200);
		expect(mockRes.json).toHaveBeenCalledWith({
			shortUrl: 'https://hashlists.debridmediamanager.com/test-uuid-123.html',
		});
	});

	it('should handle API errors gracefully', async () => {
		const { Octokit } = await import('@octokit/rest');
		vi.mocked(Octokit).mockImplementation(
			() =>
				({
					rest: {
						git: {
							getRef: vi.fn().mockRejectedValue(new Error('GitHub API error')),
							createBlob: vi.fn(),
							createTree: vi.fn(),
							createCommit: vi.fn(),
							updateRef: vi.fn(),
						},
					},
				}) as any
		);

		mockReq.method = 'POST';
		mockReq.body = { url: 'https://example.com' };

		await handler(mockReq, mockRes);

		expect(mockRes.status).toHaveBeenCalledWith(500);
		expect(mockRes.send).toHaveBeenCalledWith('Error adding file to GitHub repository');
	});
});
