import handler from '@/pages/api/stremio/cast/updateSizeLimits';
import * as rdModule from '@/services/realDebrid';
import * as repoModule from '@/services/repository';
import * as castHelpersModule from '@/utils/castApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/realDebrid');
vi.mock('@/services/repository');
vi.mock('@/utils/castApiHelpers');

describe('/api/stremio/cast/updateSizeLimits', () => {
	let req: Partial<NextApiRequest>;
	let res: Partial<NextApiResponse>;

	beforeEach(() => {
		req = {
			method: 'POST',
			body: {},
		};
		res = {
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			setHeader: vi.fn().mockReturnThis(),
		};
	});

	it('returns 405 for non-POST requests', async () => {
		req.method = 'GET';
		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(res.status).toHaveBeenCalledWith(405);
		expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
	});

	it('returns 400 if clientId or clientSecret is missing', async () => {
		req.body = { movieMaxSize: 15 };
		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
	});

	it('returns 400 if no size limits are provided', async () => {
		req.body = { clientId: 'client', clientSecret: 'secret' };
		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			error: 'At least one size limit must be provided',
		});
	});

	const tokenResponse = {
		access_token: 'token',
		refresh_token: 'refresh',
		expires_in: 3600,
		token_type: 'Bearer',
	};

	it('updates movie size limit successfully', async () => {
		req.body = {
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			movieMaxSize: 15,
		};

		vi.spyOn(rdModule, 'getToken').mockResolvedValue(tokenResponse);
		vi.spyOn(castHelpersModule, 'generateUserId').mockResolvedValue('user123');
		vi.spyOn(repoModule.repository, 'saveCastProfile').mockResolvedValue({
			userId: 'user123',
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			movieMaxSize: 15,
			episodeMaxSize: 0,
			updatedAt: new Date(),
		});

		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(rdModule.getToken).toHaveBeenCalledWith('client', 'secret', 'refresh', true);
		expect(repoModule.repository.saveCastProfile).toHaveBeenCalledWith(
			'user123',
			'client',
			'secret',
			'refresh',
			15,
			undefined
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('updates episode size limit successfully', async () => {
		req.body = {
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			episodeMaxSize: 3,
		};

		vi.spyOn(rdModule, 'getToken').mockResolvedValue(tokenResponse);
		vi.spyOn(castHelpersModule, 'generateUserId').mockResolvedValue('user123');
		vi.spyOn(repoModule.repository, 'saveCastProfile').mockResolvedValue({
			userId: 'user123',
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			movieMaxSize: 0,
			episodeMaxSize: 3,
			updatedAt: new Date(),
		});

		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(repoModule.repository.saveCastProfile).toHaveBeenCalledWith(
			'user123',
			'client',
			'secret',
			'refresh',
			undefined,
			3
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('updates both size limits successfully', async () => {
		req.body = {
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			movieMaxSize: 15,
			episodeMaxSize: 3,
		};

		vi.spyOn(rdModule, 'getToken').mockResolvedValue(tokenResponse);
		vi.spyOn(castHelpersModule, 'generateUserId').mockResolvedValue('user123');
		vi.spyOn(repoModule.repository, 'saveCastProfile').mockResolvedValue({
			userId: 'user123',
			clientId: 'client',
			clientSecret: 'secret',
			refreshToken: 'refresh',
			movieMaxSize: 15,
			episodeMaxSize: 3,
			updatedAt: new Date(),
		});

		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(repoModule.repository.saveCastProfile).toHaveBeenCalledWith(
			'user123',
			'client',
			'secret',
			'refresh',
			15,
			3
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('returns 500 when token retrieval fails', async () => {
		req.body = {
			clientId: 'client',
			clientSecret: 'secret',
			movieMaxSize: 15,
		};

		vi.spyOn(rdModule, 'getToken').mockRejectedValue(new Error('Token error'));

		await handler(req as NextApiRequest, res as NextApiResponse);

		expect(res.status).toHaveBeenCalledWith(500);
	});
});
