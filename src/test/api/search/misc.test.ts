import handler from '@/pages/api/search/misc';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { describe, expect, it } from 'vitest';

describe('/api/search/misc', () => {
	it('returns an empty response body for default request', async () => {
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({});
	});

	it('supports alternate HTTP methods without throwing', async () => {
		const req = createMockRequest({ method: 'POST', body: { keyword: 'test' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({});
	});
});
