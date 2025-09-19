import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as stats from '@/lib/observability/rdOperationalStats';
import type { AxiosError } from 'axios';
import { __testing, addHashAsMagnet, getCurrentUser, getTorrentInfo } from './realDebrid';

describe('RealDebrid observability metrics', () => {
	let recordSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.useFakeTimers();
		recordSpy = vi.spyOn(stats, 'recordRdUnrestrictEvent').mockImplementation(() => {});
	});

	afterEach(async () => {
		await vi.runAllTimersAsync();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('records a successful GET /user request', async () => {
		vi.spyOn(__testing.realDebridAxios, 'get').mockResolvedValueOnce({
			status: 200,
			data: { id: 1 },
			headers: {},
		} as any);

		await expect(getCurrentUser('token-success')).resolves.toEqual({ id: 1 });

		expect(recordSpy).toHaveBeenCalledTimes(1);
		expect(recordSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'GET /user',
				status: 200,
			})
		);
	});

	it('records a failed GET /user request using the response status', async () => {
		const axiosError = {
			isAxiosError: true,
			message: 'boom',
			config: {},
			toJSON: () => ({}),
			response: { status: 503 },
			name: 'AxiosError',
		} as AxiosError;

		vi.spyOn(__testing.realDebridAxios, 'get').mockRejectedValueOnce(axiosError);

		await expect(getCurrentUser('token-failure')).rejects.toBe(axiosError);

		expect(recordSpy).toHaveBeenCalledTimes(1);
		expect(recordSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'GET /user',
				status: 503,
			})
		);
	});

	it('records torrent info lookups and magnet failures', async () => {
		vi.spyOn(__testing.realDebridAxios, 'get').mockResolvedValueOnce({
			status: 200,
			data: { id: 'abc' },
			headers: {},
		} as any);

		await expect(getTorrentInfo('token', '123')).resolves.toEqual({ id: 'abc' });

		const magnetError = {
			isAxiosError: true,
			message: 'fail',
			config: {},
			toJSON: () => ({}),
			response: { status: 500 },
			name: 'AxiosError',
		} as AxiosError;

		vi.spyOn(__testing.realDebridAxios, 'post').mockRejectedValueOnce(magnetError);

		const hash = '0123456789abcdef0123456789abcdef01234567';

		await expect(addHashAsMagnet('token', hash)).rejects.toBe(magnetError);

		expect(recordSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'GET /torrents/info/{id}',
				status: 200,
			})
		);
		expect(recordSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'POST /torrents/addMagnet',
				status: 500,
			})
		);
	});
});
