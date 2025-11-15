import handler from '@/pages/api/torrents/index';
import { repository } from '@/services/repository';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { NextApiRequest } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/repository');
const mockRepository = vi.mocked(repository);

describe('/api/torrents (ingest)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('rejects unsupported methods', async () => {
		const req = createMockRequest({ method: 'GET' });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ message: 'Method not allowed' });
	});

	it('returns 400 when JSON body cannot be parsed', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'POST',
			body: 'not a json string',
		}) as NextApiRequest;
		const res = createMockResponse();

		await handler(req, res);

		expect(errorSpy).toHaveBeenCalledWith('Failed to parse JSON body', expect.any(Error));
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid JSON body' });
	});

	it('returns 400 when payload fails validation', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const req = createMockRequest({
			method: 'POST',
			body: { Name: 'Missing required fields' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(errorSpy).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid torrent payload' });
	});

	it('persists sanitized torrent snapshot on success', async () => {
		mockRepository.upsertTorrentSnapshot = vi.fn().mockResolvedValue(undefined);

		const payload = {
			Name: 'Example Torrent',
			OriginalName: 'Example Torrent',
			Hash: 'abcdef1234567890abcdef1234567890abcdef12',
			SelectedFiles: {
				'1': {
					State: 'ok_file',
					id: 1,
					path: '/path/to/file.mkv',
					bytes: 1024,
					selected: 1,
					Link: 'https://example.com/file',
					Ended: '2024-03-05T12:34:56Z',
					MediaInfo: {
						streams: [
							{
								index: 0,
								codec_name: 'h264',
								bit_rate: '1000',
								tags: null,
								codec_type: 'video',
								avg_frame_rate: '24000/1001',
								profile: 'High',
								pix_fmt: 'yuv420p',
								level: 41,
								color_range: 'tv',
								width: 1920,
								height: 1080,
							},
							{
								index: 1,
								codec_name: 'aac',
								bit_rate: '320',
								tags: { language: 'eng' },
								codec_type: 'audio',
								channels: 2,
								channel_layout: 'stereo',
								sample_fmt: 'fltp',
								sample_rate: '48000',
							},
						],
						format: {
							filename: 'file.mkv',
							nb_streams: 2,
							nb_programs: 0,
							format_name: 'matroska',
							start_time: '0',
							duration: '7200.00',
							size: '123456789',
							bit_rate: '1200',
							probe_score: 100,
							tags: null,
						},
					},
				},
			},
			Unfixable: '',
			State: 'ok_torrent',
			Version: '0.10.0',
			Added: '2024-03-05T12:34:56Z',
			DownloadedIDs: [1, 2, 3],
			Rename: 'ignored',
			UnassignedLinks: ['https://ignored.example'],
		};

		const req = createMockRequest({ method: 'POST', body: payload });
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.upsertTorrentSnapshot).toHaveBeenCalledTimes(1);
		const callArgs = mockRepository.upsertTorrentSnapshot.mock.calls[0][0];
		expect(callArgs.id).toBe('abcdef1234567890abcdef1234567890abcdef12:2024-03-05');
		expect(callArgs.hash).toBe('abcdef1234567890abcdef1234567890abcdef12');
		expect(callArgs.addedDate.toISOString()).toBe('2024-03-05T00:00:00.000Z');
		expect(callArgs.payload).not.toHaveProperty('DownloadedIDs');
		expect(callArgs.payload).not.toHaveProperty('Rename');
		expect(callArgs.payload).not.toHaveProperty('UnassignedLinks');
		expect(callArgs.payload).not.toHaveProperty('Unfixable');
		expect(callArgs.payload).toHaveProperty('Added', '2024-03-05T12:34:56Z');
		expect(res.status).toHaveBeenCalledWith(201);
		expect(res.json).toHaveBeenCalledWith({
			success: true,
			id: 'abcdef1234567890abcdef1234567890abcdef12:2024-03-05',
		});
	});

	it('returns 500 when persistence fails', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockRepository.upsertTorrentSnapshot = vi.fn().mockRejectedValue(new Error('db down'));

		const payload = {
			Name: 'Example Torrent',
			OriginalName: 'Example Torrent',
			Hash: 'abcdef1234567890abcdef1234567890abcdef12',
			SelectedFiles: {
				'1': {
					State: 'ok_file',
					id: 1,
					path: '/path/to/file.mkv',
					bytes: 1024,
					selected: 1,
					Link: 'https://example.com/file',
					Ended: '2024-03-05T12:34:56Z',
					MediaInfo: {
						streams: [
							{
								index: 0,
								codec_name: 'h264',
								bit_rate: '1000',
								tags: null,
								codec_type: 'video',
								avg_frame_rate: '24000/1001',
								profile: 'High',
								pix_fmt: 'yuv420p',
								level: 41,
								color_range: 'tv',
								width: 1920,
								height: 1080,
							},
						],
						format: {
							filename: 'file.mkv',
							nb_streams: 1,
							nb_programs: 0,
							format_name: 'matroska',
							start_time: '0',
							duration: '7200.00',
							size: '123456789',
							bit_rate: '1200',
							probe_score: 100,
							tags: null,
						},
					},
				},
			},
			Unfixable: '',
			State: 'ok_torrent',
			Version: '0.10.0',
			Added: '2024-03-05T12:34:56Z',
		};

		const req = createMockRequest({ method: 'POST', body: payload });
		const res = createMockResponse();

		await handler(req, res);

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to persist torrent snapshot',
			expect.any(Error)
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
	});
});
