import handler from '@/pages/api/stremio/[userid]/manifest.json';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { describe, expect, it } from 'vitest';

describe('/api/stremio/[userid]/manifest.json', () => {
	it('responds with the static manifest payload', async () => {
		const req = createMockRequest({ query: { userid: 'any' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'com.debridmediamanager.cast',
				name: 'DMM Cast for Real-Debrid',
				catalogs: expect.arrayContaining([
					expect.objectContaining({ id: 'casted-movies' }),
				]),
			})
		);
		expect(res.setHeader).toHaveBeenCalledWith('access-control-allow-origin', '*');
	});
});
