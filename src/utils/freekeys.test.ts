import { describe, expect, it, vi } from 'vitest';
import { getTmdbKey } from './freekeys';

describe('freekeys', () => {
	describe('getTmdbKey', () => {
		it('returns a valid TMDB key', () => {
			const key = getTmdbKey();
			expect(typeof key).toBe('string');
			expect(key.length).toBeGreaterThan(0);
		});

		it('returns different keys on multiple calls', () => {
			const keys = new Set();
			for (let i = 0; i < 50; i++) {
				keys.add(getTmdbKey());
			}
			expect(keys.size).toBeGreaterThan(1);
		});

		it('returns keys from the available pool', () => {
			const expectedKeys = [
				'fb7bb23f03b6994dafc674c074d01761',
				'e55425032d3d0f371fc776f302e7c09b',
				'8301a21598f8b45668d5711a814f01f6',
				'8cf43ad9c085135b9479ad5cf6bbcbda',
				'da63548086e399ffc910fbc08526df05',
				'13e53ff644a8bd4ba37b3e1044ad24f3',
				'269890f657dddf4635473cf4cf456576',
				'a2f888b27315e62e471b2d587048f32e',
				'8476a7ab80ad76f0936744df0430e67c',
				'5622cafbfe8f8cfe358a29c53e19bba0',
				'ae4bd1b6fce2a5648671bfc171d15ba4',
				'257654f35e3dff105574f97fb4b97035',
				'2f4038e83265214a0dcd6ec2eb3276f5',
				'9e43f45f94705cc8e1d5a0400d19a7b7',
				'af6887753365e14160254ac7f4345dd2',
				'06f10fc8741a672af455421c239a1ffc',
				'fb7bb23f03b6994dafc674c074d01761',
				'09ad8ace66eec34302943272db0e8d2c',
			];

			const key = getTmdbKey();
			expect(expectedKeys).toContain(key);
		});

		it('uses Math.random for selection', () => {
			const randomSpy = vi.spyOn(Math, 'random');
			getTmdbKey();
			expect(randomSpy).toHaveBeenCalled();
			randomSpy.mockRestore();
		});

		it('returns first key when random returns 0', () => {
			const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
			const key = getTmdbKey();
			expect(key).toBe('fb7bb23f03b6994dafc674c074d01761');
			randomSpy.mockRestore();
		});

		it('returns last key when random returns close to 1', () => {
			const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);
			const key = getTmdbKey();
			expect(key).toBe('09ad8ace66eec34302943272db0e8d2c');
			randomSpy.mockRestore();
		});

		it('returns middle key when random returns 0.5', () => {
			const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
			const key = getTmdbKey();
			expect(typeof key).toBe('string');
			expect(key.length).toBe(32);
			randomSpy.mockRestore();
		});
	});
});
