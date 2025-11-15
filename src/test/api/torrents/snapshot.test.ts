import handler from '@/pages/api/torrents/snapshot';
import { repository } from '@/services/repository';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import crypto from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/repository');
const mockRepository = vi.mocked(repository);

describe('/api/torrents/snapshot', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env = { ...originalEnv };
		process.env.ZURGTORRENT_SYNC_SECRET = 'sync-secret';
		mockRepository.upsertTorrentSnapshot = vi.fn();
		mockRepository.getLatestTorrentSnapshot = vi.fn();
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	it('rejects unsupported methods', async () => {
		const req = createMockRequest({ method: 'PUT' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ message: 'Method not allowed' });
	});

	it('returns 500 when sync secret is missing', async () => {
		delete process.env.ZURGTORRENT_SYNC_SECRET;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const req = createMockRequest({
			method: 'POST',
			headers: { 'x-zurg-token': 'sync-secret' },
			body: { hash: 'abc' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(errorSpy).toHaveBeenCalledWith(
			'Missing ZURGTORRENT_SYNC_SECRET environment variable'
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'Server misconfiguration' });

		errorSpy.mockRestore();
	});

	it('returns 401 when sync secret does not match', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'POST',
			headers: { 'x-zurg-token': 'bad-secret' },
			body: { hash: 'abc' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(warnSpy).toHaveBeenCalledWith(
			'Rejected torrent snapshot ingestion due to invalid sync secret'
		);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });

		warnSpy.mockRestore();
	});

	it('returns 400 when payload hash is missing', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'POST',
			headers: { 'x-zurg-token': 'sync-secret' },
			body: { name: 'no hash here' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(warnSpy).toHaveBeenCalledWith('Torrent snapshot payload missing hash field');
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Missing torrent hash' });

		warnSpy.mockRestore();
	});

	it('persists snapshot when payload is valid', async () => {
		mockRepository.upsertTorrentSnapshot = vi.fn().mockResolvedValue(undefined);

		const req = createMockRequest({
			method: 'POST',
			headers: { 'x-zurg-token': 'sync-secret' },
			body: {
				Hash: 'abcdef1234567890abcdef1234567890abcdef12',
				Added: '2024-01-01T12:00:00Z',
			},
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.upsertTorrentSnapshot).toHaveBeenCalledTimes(1);
		const callArgs = mockRepository.upsertTorrentSnapshot.mock.calls[0][0];
		expect(callArgs).toMatchObject({
			id: 'abcdef1234567890abcdef1234567890abcdef12:2024-01-01',
			hash: 'abcdef1234567890abcdef1234567890abcdef12',
			payload: {
				Hash: 'abcdef1234567890abcdef1234567890abcdef12',
				Added: '2024-01-01T12:00:00Z',
			},
		});
		expect(callArgs.addedDate.toISOString()).toBe('2024-01-01T00:00:00.000Z');
		expect(res.status).toHaveBeenCalledWith(201);
		expect(res.json).toHaveBeenCalledWith({ success: true, id: callArgs.id });
	});

	it('returns 500 when sync secret is missing for reads', async () => {
		delete process.env.ZURGTORRENT_SYNC_SECRET;
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const req = createMockRequest({
			method: 'GET',
			query: { hash: 'abcdef1234567890abcdef1234567890abcdef12', password: 'test' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(errorSpy).toHaveBeenCalledWith(
			'Missing ZURGTORRENT_SYNC_SECRET environment variable'
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'Server misconfiguration' });

		errorSpy.mockRestore();
	});

	it('returns 400 when hash query parameter is invalid', async () => {
		const req = createMockRequest({
			method: 'GET',
			query: { hash: 'invalid', password: 'test' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid hash format' });
	});

	it('returns 401 when password does not match derived hash', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'GET',
			query: {
				hash: 'abcdef1234567890abcdef1234567890abcdef12',
				password: 'wrong',
			},
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(warnSpy).toHaveBeenCalledWith(
			'Rejected torrent snapshot request due to invalid password'
		);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });

		warnSpy.mockRestore();
	});

	it('returns 404 when snapshot is not found', async () => {
		mockRepository.getLatestTorrentSnapshot = vi.fn().mockResolvedValue(null);
		const hash = 'abcdef1234567890abcdef1234567890abcdef12';
		const password = crypto
			.createHash('sha1')
			.update(hash + 'sync-secret')
			.digest('hex');

		const req = createMockRequest({
			method: 'GET',
			query: { hash, password },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.getLatestTorrentSnapshot).toHaveBeenCalledWith(hash);
		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith({ message: 'Not found' });
	});

	it('returns snapshot payload when credentials are valid', async () => {
		const payload = { files: ['file1.mkv'] };
		mockRepository.getLatestTorrentSnapshot = vi.fn().mockResolvedValue({ payload });
		const hash = 'abcdef1234567890abcdef1234567890abcdef12';
		const password = crypto
			.createHash('sha1')
			.update(hash + 'sync-secret')
			.digest('hex');

		const req = createMockRequest({
			method: 'GET',
			query: { hash, password },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.getLatestTorrentSnapshot).toHaveBeenCalledWith(hash);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(payload);
	});
});
