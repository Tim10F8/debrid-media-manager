import { describe, expect, it } from 'vitest';
import { createMockRequest, createMockResponse } from './api';

describe('API test utils', () => {
	it('creates request with defaults and merged overrides', () => {
		const request = createMockRequest({
			method: 'POST',
			cookies: { token: 'abc' },
			headers: { 'x-test': '1' },
		});

		expect(request.method).toBe('POST');
		expect(request.cookies).toEqual({ token: 'abc' });
		expect(request.headers).toMatchObject({ 'x-test': '1' });
		expect(request.env).toBeDefined();
	});

	it('creates response with chained mocks', () => {
		const response = createMockResponse();

		response.status(201).json({ ok: true });

		expect(response.status).toHaveBeenCalledWith(201);
		expect(response.json).toHaveBeenCalledWith({ ok: true });
		expect(response._getStatusCode()).toBe(201);
		expect(response._getData()).toEqual({ ok: true });
	});
});
