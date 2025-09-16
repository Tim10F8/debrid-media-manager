import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTokenAndHash, validateTokenWithHash } from './token';

// Mock getTimeISO used by generateTokenAndHash
vi.mock('@/services/realDebrid', () => ({
	getTimeISO: vi.fn(async () => new Date(10_000).toISOString()), // 10s after epoch
}));

// Provide deterministic crypto.getRandomValues
beforeEach(() => {
	const arr = new Uint32Array([0x1abc]);
	vi.spyOn(globalThis.crypto as any, 'getRandomValues').mockImplementation(
		(buffer: Uint32Array) => {
			buffer.set(arr);
			return buffer;
		}
	);
});

describe('token utils', () => {
	it('generates a token/hash pair that validates', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(12_000)); // 12s after epoch

		const [tokenWithTimestamp, hash] = await generateTokenAndHash();
		expect(typeof tokenWithTimestamp).toBe('string');
		expect(typeof hash).toBe('string');
		// Should validate under threshold
		expect(validateTokenWithHash(tokenWithTimestamp, hash)).toBe(true);

		vi.useRealTimers();
	});

	it('fails validation if hash mismatches', async () => {
		const [tokenWithTimestamp] = await generateTokenAndHash();
		expect(validateTokenWithHash(tokenWithTimestamp, 'deadbeef')).toBe(false);
	});

	it('expires tokens outside threshold', async () => {
		vi.useFakeTimers();
		// getTimeISO returns ~10s; jump far ahead to exceed 5 minutes threshold
		vi.setSystemTime(new Date(3600_000));
		const [tokenWithTimestamp, hash] = await generateTokenAndHash();

		// Move 10 minutes ahead
		vi.setSystemTime(new Date(3600_000 + 10 * 60_000));
		expect(validateTokenWithHash(tokenWithTimestamp, hash)).toBe(false);

		vi.useRealTimers();
	});
});
