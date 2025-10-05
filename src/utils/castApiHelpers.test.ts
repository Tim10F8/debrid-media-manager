import crypto from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateLegacyUserId, generateUserId } from './castApiHelpers';

vi.mock('@/services/realDebrid', () => ({
	getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/services/realDebrid';

const originalSalt = process.env.DMMCAST_SALT;
const testSalt = 'test-cast-salt';

describe('castApiHelpers', () => {
	beforeEach(() => {
		process.env.DMMCAST_SALT = testSalt;
		vi.mocked(getCurrentUser).mockReset();
	});

	afterAll(() => {
		process.env.DMMCAST_SALT = originalSalt;
	});

	it('generates deterministic user id through the shared RealDebrid client', async () => {
		vi.mocked(getCurrentUser).mockResolvedValue({ username: 'rate-limit-user' } as any);

		const result = await generateUserId('token-123');

		expect(getCurrentUser).toHaveBeenCalledWith('token-123');
		const expected = crypto
			.createHmac('sha256', testSalt)
			.update('rate-limit-user')
			.digest('base64url')
			.slice(0, 12);
		expect(result).toBe(expected);
	});

	it('generates legacy user id via the shared RealDebrid client', async () => {
		vi.mocked(getCurrentUser).mockResolvedValue({ username: 'legacy-user' } as any);

		const result = await generateLegacyUserId('legacy-token');

		expect(getCurrentUser).toHaveBeenCalledWith('legacy-token');
		const expected = crypto
			.createHash('sha256')
			.update('legacy-user' + testSalt)
			.digest('base64')
			.replace(/\+/g, 'a')
			.replace(/\//g, 'b')
			.replace(/=/g, '')
			.slice(0, 5);
		expect(result).toBe(expected);
	});
});
