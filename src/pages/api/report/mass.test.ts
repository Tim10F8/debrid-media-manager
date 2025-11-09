import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './mass';

const { mockReportContent } = vi.hoisted(() => ({
	mockReportContent: vi.fn(),
}));

vi.mock('@/services/repository', () => ({
	repository: {
		reportContent: mockReportContent,
	},
}));

describe('/api/report/mass', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects non-POST requests', async () => {
		const req = createMockRequest({ method: 'GET' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
	});

	it('validates payload shape', async () => {
		const req = createMockRequest({
			method: 'POST',
			body: { reports: [], userId: 'user', type: 'porn' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or empty reports array' });
	});

	it('requires valid report type and entries', async () => {
		const req = createMockRequest({
			method: 'POST',
			body: { reports: [{ hash: 'h1' }], userId: 'user', type: 'unknown' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);

		const req2 = createMockRequest({
			method: 'POST',
			body: { reports: [{ hash: 'h1' }], userId: 'user', type: 'porn' },
		});
		const res2 = createMockResponse();

		await handler(req2, res2);

		expect(res2.status).toHaveBeenCalledWith(400);
		expect(res2.json).toHaveBeenCalledWith({
			message: 'Some reports are missing hash or imdbId',
		});
	});

	it('reports torrents in bulk and summarizes failures', async () => {
		mockReportContent.mockResolvedValue(undefined);
		mockReportContent.mockRejectedValueOnce(new Error('db'));

		const req = createMockRequest({
			method: 'POST',
			body: {
				reports: [
					{ hash: 'h1', imdbId: 'tt1' },
					{ hash: 'h2', imdbId: 'tt2' },
				],
				userId: 'user',
				type: 'porn',
			},
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockReportContent).toHaveBeenCalledTimes(2);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			success: true,
			reported: 1,
			failed: 1,
			errors: [{ hash: 'h1', error: 'db' }],
		});
	});

	it('handles unexpected failures gracefully', async () => {
		const error = new Error('boom');
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'POST',
			body: { reports: [{ hash: 'h1', imdbId: 'tt1' }], userId: 'user', type: 'porn' },
		});
		const res = createMockResponse();
		mockReportContent.mockImplementation(() => {
			throw error;
		});

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			success: true,
			reported: 0,
			failed: 1,
			errors: [{ hash: 'h1', error: 'boom' }],
		});
	});
});
