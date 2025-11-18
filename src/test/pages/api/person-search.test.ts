import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosMockModule, axiosGetMock, nextConfigMockModule } = vi.hoisted(() => {
	const get = vi.fn();
	const isAxiosError = (error: unknown) => Boolean((error as any)?.isAxiosError);
	return {
		axiosGetMock: get,
		axiosMockModule: {
			__esModule: true,
			default: Object.assign(get, {
				get,
				isAxiosError,
			}),
			get,
			isAxiosError,
		},
		nextConfigMockModule: {
			__esModule: true,
			default: () => ({ publicRuntimeConfig: { traktClientId: 'runtime-test-id' } }),
		},
	};
});

vi.mock('axios', () => axiosMockModule);
vi.mock('next/config', () => nextConfigMockModule);

import handler from '@/pages/api/person/search';

type MockResponse = Pick<NextApiResponse, 'status' | 'json' | 'setHeader'>;

const createResponse = () => {
	const res: Partial<MockResponse> = {};
	res.setHeader = vi.fn();
	res.status = vi.fn().mockReturnThis();
	res.json = vi.fn().mockReturnThis();
	return res as unknown as MockResponse;
};

describe('person search API', () => {
	beforeEach(() => {
		axiosGetMock.mockReset();
		process.env.TRAKT_CLIENT_ID = 'test-client-id';
	});

	it('returns person search results from Trakt', async () => {
		const mockedData = [
			{
				type: 'person',
				score: 100,
				person: {
					name: 'Leonardo DiCaprio',
					ids: {
						trakt: 6000,
						slug: 'leonardo-dicaprio',
						imdb: 'nm0000138',
						tmdb: 6193,
					},
				},
			},
		];
		axiosGetMock.mockResolvedValue({ data: mockedData });

		const res = createResponse();
		await handler(
			{
				method: 'GET',
				query: { query: 'Leonardo DiCaprio' },
			} as unknown as NextApiRequest,
			res as unknown as NextApiResponse
		);

		expect(axiosGetMock).toHaveBeenCalledWith(
			'https://api.trakt.tv/search/person',
			expect.objectContaining({
				headers: expect.objectContaining({
					'trakt-api-key': 'test-client-id',
				}),
				params: { query: 'Leonardo DiCaprio' },
			})
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			results: [
				{
					name: 'Leonardo DiCaprio',
					slug: 'leonardo-dicaprio',
					imdb: 'nm0000138',
					tmdb: 6193,
					score: 100,
				},
			],
		});
	});

	it('validates required query parameter', async () => {
		const res = createResponse();
		await handler(
			{ method: 'GET', query: {} } as unknown as NextApiRequest,
			res as unknown as NextApiResponse
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ message: 'Missing query parameter.' });
	});

	it('returns 405 for non-GET methods', async () => {
		const res = createResponse();
		await handler(
			{ method: 'POST', query: { query: 'test' } } as unknown as NextApiRequest,
			res as unknown as NextApiResponse
		);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
		expect(res.json).toHaveBeenCalledWith({ message: 'Method Not Allowed' });
	});

	it('handles Trakt API errors gracefully', async () => {
		axiosGetMock.mockRejectedValue({
			isAxiosError: true,
			response: {
				status: 500,
				data: 'Internal Server Error',
			},
		});

		const res = createResponse();
		await handler(
			{
				method: 'GET',
				query: { query: 'test' },
			} as unknown as NextApiRequest,
			res as unknown as NextApiResponse
		);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'Failed to search for person.' });
	});

	it('uses runtime config when env variable is missing', async () => {
		delete process.env.TRAKT_CLIENT_ID;
		axiosGetMock.mockResolvedValue({
			data: [
				{
					type: 'person',
					score: 100,
					person: {
						name: 'Test Person',
						ids: {
							trakt: 1,
							slug: 'test-person',
							imdb: 'nm0000001',
							tmdb: 1,
						},
					},
				},
			],
		});

		const res = createResponse();
		await handler(
			{
				method: 'GET',
				query: { query: 'test' },
			} as unknown as NextApiRequest,
			res as unknown as NextApiResponse
		);

		expect(axiosGetMock).toHaveBeenCalledWith(
			'https://api.trakt.tv/search/person',
			expect.objectContaining({
				headers: expect.objectContaining({
					'trakt-api-key': 'runtime-test-id',
				}),
			})
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
