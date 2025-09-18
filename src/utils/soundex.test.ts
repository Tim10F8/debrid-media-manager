import { describe, expect, it } from 'vitest';
import { soundex } from './soundex';

describe('soundex', () => {
	it('returns 0000 for empty', () => {
		expect(soundex('')).toBe('0000');
	});

	it('encodes common words consistently', () => {
		// Typical SOUNDEX comparisons
		expect(soundex('Robert')).toBe(soundex('Rupert'));
		expect(soundex('Ashcraft')).toBe(soundex('Ashcroft'));
		expect(soundex('Tymczak')).toBe('T522');
	});
});
