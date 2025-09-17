import { describe, expect, it } from 'vitest';
import { groupBy } from './groupBy';

describe('groupBy', () => {
	it('splits array into groups of given size', () => {
		const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		expect(groupBy(3, items)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f'], ['g']]);
	});

	it('handles empty input', () => {
		expect(groupBy(5, [])).toEqual([]);
	});
});
