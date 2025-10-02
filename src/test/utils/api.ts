import type { Env } from '@next/env';
import { NextApiRequest, NextApiResponse } from 'next';
import { vi } from 'vitest';

export interface MockResponse extends NextApiResponse {
	_getStatusCode(): number;
	_getData(): unknown;
	_getHeaders(): Record<string, string>;
	_setStatusCode(code: number): void;
}

export function createMockResponse(): MockResponse {
	let statusCode = 200;
	let data: unknown;
	const headers: Record<string, string> = {};

	const response = {} as MockResponse;

	const trackStatus = (code: number) => {
		statusCode = code;
		return response;
	};
	const trackJson = (jsonData: unknown) => {
		data = jsonData;
		return response;
	};
	const trackSend = (sendData: unknown) => {
		data = sendData;
		return response;
	};
	const trackSetHeader = (name: string, value: string) => {
		headers[name] = value;
		return response;
	};
	const trackRedirect = (...args: [string] | [number, string]) => {
		if (typeof args[0] === 'number') {
			statusCode = args[0];
		}
		return response;
	};

	response.status = vi.fn(trackStatus);
	response.json = vi.fn(trackJson);
	response.send = vi.fn(trackSend);
	response.setHeader = vi.fn(trackSetHeader);
	response.end = vi.fn(() => response);
	response.setPreviewData = vi.fn(() => response);
	response.clearPreviewData = vi.fn(() => response);
	response.redirect = vi.fn(trackRedirect) as unknown as MockResponse['redirect'];
	response.setDraftMode = vi.fn(() => response);
	response.revalidate = vi.fn(async () => {});
	response._getStatusCode = () => statusCode;
	response._getData = () => data;
	response._getHeaders = () => headers;
	response._setStatusCode = (code: number) => {
		statusCode = code;
	};

	return response;
}

export function createMockRequest(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
	const base = {
		method: 'GET',
		query: {},
		cookies: {},
		body: {},
		headers: {},
		url: '/api/test',
		env: process.env as Env,
		draftMode: false,
		preview: false,
		previewData: undefined,
	};

	return {
		...base,
		...overrides,
		headers: { ...base.headers, ...overrides.headers },
		query: { ...base.query, ...overrides.query },
		cookies: { ...base.cookies, ...overrides.cookies },
	} as NextApiRequest;
}

export function createAuthenticatedRequest(
	overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
	return createMockRequest({
		headers: {
			authorization: 'Bearer test-token',
			...overrides.headers,
		},
		...overrides,
	});
}
