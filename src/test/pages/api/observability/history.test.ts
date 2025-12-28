import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import handler from '@/pages/api/observability/history';

// Mock the repository
vi.mock('@/services/repository', () => ({
	repository: {
		getRdRawHistory: vi.fn().mockResolvedValue([
			{
				timestamp: new Date('2024-01-15T14:30:00Z'),
				operation: 'GET /user',
				status: 200,
				success: true,
			},
		]),
		getRdHourlyHistory: vi.fn().mockResolvedValue([
			{
				hour: new Date('2024-01-15T14:00:00Z'),
				operation: 'GET /user',
				totalCount: 100,
				successCount: 95,
				failureCount: 5,
				successRate: 0.95,
			},
		]),
		getRdDailyHistory: vi.fn().mockResolvedValue([
			{
				date: new Date('2024-01-15T00:00:00Z'),
				operation: 'GET /user',
				totalCount: 2400,
				successCount: 2300,
				failureCount: 100,
				avgSuccessRate: 0.96,
				minSuccessRate: 0.9,
				maxSuccessRate: 1.0,
			},
		]),
		getStreamHourlyHistory: vi.fn().mockResolvedValue([
			{
				hour: new Date('2024-01-15T14:00:00Z'),
				totalServers: 360,
				workingServers: 350,
				workingRate: 0.972,
				avgLatencyMs: 150,
			},
		]),
		getStreamDailyHistory: vi.fn().mockResolvedValue([
			{
				date: new Date('2024-01-15T00:00:00Z'),
				avgWorkingRate: 0.97,
				minWorkingRate: 0.95,
				maxWorkingRate: 0.99,
				avgLatencyMs: 145,
				checksCount: 144,
			},
		]),
		getServerReliability: vi.fn().mockResolvedValue([
			{
				host: '1.download.real-debrid.com',
				checksCount: 144,
				successCount: 142,
				avgLatencyMs: 120,
				reliability: 0.986,
			},
		]),
	},
}));

function createMockRequest(query: Record<string, string> = {}): NextApiRequest {
	return {
		method: 'GET',
		query,
	} as unknown as NextApiRequest;
}

function createMockResponse() {
	const res: Partial<NextApiResponse> = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
		setHeader: vi.fn().mockReturnThis(),
	};
	return res as NextApiResponse;
}

describe('history API endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 405 for non-GET requests', async () => {
		const req = { method: 'POST', query: {} } as unknown as NextApiRequest;
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
	});

	it('returns hourly RD data for 24h range', async () => {
		const req = createMockRequest({ type: 'rd', range: '24h' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'rd',
				granularity: 'hourly',
				range: '24h',
				data: expect.any(Array),
			})
		);
	});

	it('returns daily RD data for 30d range', async () => {
		const req = createMockRequest({ type: 'rd', range: '30d' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'rd',
				granularity: 'daily',
				range: '30d',
				data: expect.any(Array),
			})
		);
	});

	it('returns hourly stream data for 7d range', async () => {
		const req = createMockRequest({ type: 'stream', range: '7d' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'stream',
				granularity: 'hourly',
				range: '7d',
				data: expect.any(Array),
			})
		);
	});

	it('returns daily stream data for 90d range', async () => {
		const req = createMockRequest({ type: 'stream', range: '90d' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'stream',
				granularity: 'daily',
				range: '90d',
				data: expect.any(Array),
			})
		);
	});

	it('returns server reliability data', async () => {
		const req = createMockRequest({
			type: 'servers',
			range: '7d',
			sortBy: 'reliability',
			limit: '20',
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'servers',
				range: '7d',
				sortBy: 'reliability',
				data: expect.any(Array),
			})
		);
	});

	it('respects range for server reliability (24h = 1 day)', async () => {
		const { repository } = await import('@/services/repository');
		const req = createMockRequest({ type: 'servers', range: '24h' });
		const res = createMockResponse();

		await handler(req, res);

		expect(repository.getServerReliability).toHaveBeenCalledWith(1, 'reliability', 50);
	});

	it('returns 400 for invalid type', async () => {
		const req = createMockRequest({ type: 'invalid' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'Invalid type parameter' });
	});

	it('defaults to rd type and 24h range', async () => {
		const req = createMockRequest({});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'rd',
				granularity: 'hourly',
				range: '24h',
			})
		);
	});
});
