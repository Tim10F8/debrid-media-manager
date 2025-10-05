import { repository } from '@/services/repository';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './mediainfo';

vi.mock('@/services/repository');
const mockRepository = vi.mocked(repository);

describe('/api/torrents/mediainfo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRepository.getLatestTorrentSnapshot = vi.fn();
	});

	it('rejects unsupported methods', async () => {
		const req = createMockRequest({ method: 'POST' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ message: 'Method not allowed' });
	});

	it('returns 400 when hash is missing', async () => {
		const req = createMockRequest({ query: {} });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Missing hash parameter' });
	});

	it('returns 400 when hash format is invalid', async () => {
		const req = createMockRequest({ query: { hash: 'invalid' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid hash format' });
	});

	it('returns 404 when no snapshot exists', async () => {
		mockRepository.getLatestTorrentSnapshot = vi.fn().mockResolvedValue(null);
		const req = createMockRequest({
			query: { hash: 'abcdef1234567890abcdef1234567890abcdef12' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.getLatestTorrentSnapshot).toHaveBeenCalledWith(
			'abcdef1234567890abcdef1234567890abcdef12'
		);
		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({ message: 'Not found' });
	});

	it('returns 404 when snapshot has no media info payload', async () => {
		mockRepository.getLatestTorrentSnapshot = vi.fn().mockResolvedValue({
			payload: { SelectedFiles: {} },
		});
		const req = createMockRequest({
			query: { hash: 'abcdef1234567890abcdef1234567890abcdef12' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({ message: 'Not found' });
	});

	it('returns media info when snapshot payload is available', async () => {
		const payload = {
			SelectedFiles: {
				'0': {
					MediaInfo: {
						streams: [
							{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
						],
						format: { duration: '3600' },
					},
				},
			},
		};
		mockRepository.getLatestTorrentSnapshot = vi.fn().mockResolvedValue({ payload });
		const req = createMockRequest({
			query: { hash: 'abcdef1234567890abcdef1234567890abcdef12' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(payload);
	});

	it('returns 500 when repository throws', async () => {
		mockRepository.getLatestTorrentSnapshot = vi
			.fn()
			.mockRejectedValue(new Error('database error'));
		const req = createMockRequest({
			query: { hash: 'abcdef1234567890abcdef1234567890abcdef12' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
	});

	afterAll(() => {
		vi.resetAllMocks();
	});
});
