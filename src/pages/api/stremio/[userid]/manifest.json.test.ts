import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { describe, expect, it } from 'vitest';
import handler from './manifest.json';

describe('/api/stremio/[userid]/manifest.json', () => {
	it('responds with the static manifest payload', async () => {
		const req = createMockRequest({ query: { userid: 'any' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'com.debridmediamanager.cast',
				name: 'DMM Cast',
				catalogs: expect.arrayContaining([
					expect.objectContaining({ id: 'casted-movies' }),
				]),
			})
		);
		expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin', '*');
	});
});
