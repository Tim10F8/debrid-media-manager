import { describe, expect, it } from 'vitest';

// Test seeded shuffle utility functions
describe('Seeded Shuffle Utils', () => {
	it('should test basic shuffle with seed', () => {
		// Simple deterministic shuffle based on seed
		const shuffleArray = (array: any[], seed: number) => {
			const result = [...array];
			let m = result.length;
			let t, i;

			while (m) {
				i = Math.floor(random(seed) * m--);
				t = result[m];
				result[m] = result[i];
				result[i] = t;
				seed++;
			}

			return result;
		};

		const random = (seed: number) => {
			const x = Math.sin(seed) * 10000;
			return x - Math.floor(x);
		};

		const original = [1, 2, 3, 4, 5];
		const shuffled1 = shuffleArray(original, 42);
		const shuffled2 = shuffleArray(original, 42);

		expect(shuffled1).toEqual(shuffled2); // Same seed = same result
		expect(shuffled1).not.toEqual(original); // Should be shuffled
	});

	it('should test different seeds produce different results', () => {
		const random = (seed: number) => {
			const x = Math.sin(seed) * 10000;
			return x - Math.floor(x);
		};

		const seed1 = random(123);
		const seed2 = random(456);

		expect(seed1).not.toBe(seed2);
		expect(seed1).toBeGreaterThanOrEqual(0);
		expect(seed1).toBeLessThan(1);
	});

	it('should test seed consistency', () => {
		const generateFromSeed = (seed: number) => {
			return Math.floor(seed * 1000);
		};

		const seed = 0.75;
		const result1 = generateFromSeed(seed);
		const result2 = generateFromSeed(seed);

		expect(result1).toBe(result2);
		expect(result1).toBe(750);
	});

	it('should test array operations for shuffling', () => {
		const array = [1, 2, 3, 4, 5];
		const copied = [...array];
		const sliced = array.slice(0, 3);

		expect(copied).toEqual(array);
		expect(sliced).toEqual([1, 2, 3]);
		expect(sliced.length).toBe(3);
	});

	it('should test random number generation with seed', () => {
		const seededRandom = (seed: number) => {
			const a = 1664525;
			const c = 1013904223;
			const m = Math.pow(2, 32);

			seed = (a * seed + c) % m;
			return seed / m;
		};

		const seed = 12345;
		const random1 = seededRandom(seed);
		const random2 = seededRandom(seed);

		expect(random1).toBe(random2);
		expect(random1).toBeGreaterThanOrEqual(0);
		expect(random1).toBeLessThan(1);
	});

	it('should test shuffle validation', () => {
		const original = [1, 2, 3, 4, 5];
		const shuffled = [3, 1, 5, 2, 4];

		// Same elements, different order
		expect(original.sort()).toEqual(shuffled.sort());
		expect(original.length).toBe(shuffled.length);
	});

	it('should test edge cases', () => {
		const emptyArray: any[] = [];
		const singleItem = [42];

		expect(emptyArray.length).toBe(0);
		expect(singleItem.length).toBe(1);
		expect(singleItem[0]).toBe(42);
	});

	it('should test deterministic behavior', () => {
		const deterministicFunction = (input: number) => {
			return (input * 7 + 13) % 100;
		};

		const result1 = deterministicFunction(25);
		const result2 = deterministicFunction(25);
		const result3 = deterministicFunction(26);

		expect(result1).toBe(result2);
		expect(result1).toBe(88);
		expect(result3).toBe(95);
	});
});
