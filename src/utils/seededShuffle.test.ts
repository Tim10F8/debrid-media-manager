import { describe, expect, it } from 'vitest';
import { lcg, shuffle } from './seededShuffle';

describe('seededShuffle', () => {
	it('lcg produces repeatable sequence for same seed', () => {
		const rng1 = lcg(123);
		const rng2 = lcg(123);
		const seq1 = [rng1(), rng1(), rng1()];
		const seq2 = [rng2(), rng2(), rng2()];
		expect(seq1).toEqual(seq2);
	});

	it('shuffle returns a permutation of input array', () => {
		const items = [1, 2, 3, 4, 5, 6];
		const shuffled = shuffle([...items], lcg(42));
		expect(shuffled.sort()).toEqual(items);
	});
});
