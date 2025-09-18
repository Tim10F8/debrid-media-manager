import { describe, expect, it } from 'vitest';
import { shortenNumber } from './speed';

describe('speed utils', () => {
	it('shortens numbers correctly', () => {
		expect(shortenNumber(undefined)).toBe('');
		expect(shortenNumber(999)).toBe('999.0');
		expect(shortenNumber(1000)).toBe('1 K');
		expect(shortenNumber(1500)).toBe('2 K');
		expect(shortenNumber(1_000_000)).toBe('1 M');
		expect(shortenNumber(2_500_000)).toBe('3 M');
		expect(shortenNumber(1_000_000_000)).toBe('1 G');
		expect(shortenNumber(1_000_000_000_000)).toBe('1000000000000');
	});
});
