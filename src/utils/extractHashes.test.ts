import { describe, expect, it } from 'vitest';
import {
	SHA1_REGEX,
	extractHashes,
	extractMagnets,
	isValidHash,
	normalizeHash,
} from './extractHashes';

describe('extractHashes utils', () => {
	it('validates SHA1 hashes', () => {
		const valid = 'A'.repeat(40);
		const invalids = ['G'.repeat(40), 'abc', ''.padEnd(39, 'a')];
		expect(SHA1_REGEX.test(valid)).toBe(true);
		expect(isValidHash(valid)).toBe(true);
		for (const s of invalids) {
			expect(isValidHash(s)).toBe(false);
		}
	});

	it('normalizes hashes to lowercase and rejects invalid', () => {
		expect(normalizeHash('ABCDEF0123456789ABCDEF0123456789ABCDEF01')).toBe(
			'abcdef0123456789abcdef0123456789abcdef01'
		);
		expect(normalizeHash('not-a-hash')).toBe('');
		expect(normalizeHash(undefined as any)).toBe('');
		expect(normalizeHash(null as any)).toBe('');
	});

	it('extracts unique hashes from mixed input', () => {
		const hash1 = 'abcdef0123456789abcdef0123456789abcdef01';
		const hash2 = '1234567890abcdef1234567890abcdef12345678';
		const input = [
			`magnet:?xt=urn:btih:${hash1.toUpperCase()}`,
			'some text',
			hash1, // duplicate
			`another ${hash2} entry`,
		].join(' ');

		const hashes = extractHashes(input);
		expect(hashes.sort()).toEqual([hash1, hash2].sort());
	});

	it('extracts or builds magnets from input', () => {
		const hash = 'abcdef0123456789abcdef0123456789abcdef01';
		const magnet = `magnet:?xt=urn:btih:${hash}`;
		expect(extractMagnets(`foo ${magnet} bar`)).toEqual([magnet]);
		// When only hashes provided, convert them to magnets
		expect(extractMagnets(`hashes: ${hash}`)).toEqual([magnet]);
	});
});
