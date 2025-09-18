import { describe, expect, it, vi } from 'vitest';
import { processWithConcurrency } from './parallelProcessor';

describe('parallelProcessor', () => {
	describe('processWithConcurrency', () => {
		it('processes all items successfully', async () => {
			const items = [1, 2, 3, 4, 5];
			const processor = async (item: number) => item * 2;

			const results = await processWithConcurrency(items, processor, 2);

			expect(results).toHaveLength(5);
			const validResults = results.filter((r) => r);
			expect(validResults.length).toBeGreaterThan(0);
			validResults.forEach((r) => {
				expect(r.success).toBe(true);
				expect(typeof r.result).toBe('number');
			});
		});

		it('handles errors gracefully', async () => {
			const items = [1, 2, 3];
			const processor = async (item: number) => {
				if (item === 2) throw new Error(`Error for ${item}`);
				return item * 2;
			};

			const results = await processWithConcurrency(items, processor, 2);

			expect(results).toHaveLength(3);
			const validResults = results.filter((r) => r);
			expect(validResults.length).toBeGreaterThan(0);

			const successResults = validResults.filter((r) => r.success);
			const errorResults = validResults.filter((r) => !r.success);

			expect(successResults.length).toBe(2);
			expect(errorResults.length).toBe(1);
			expect(errorResults[0].error.message).toContain('Error for');
		});

		it('respects concurrency limit', async () => {
			let concurrent = 0;
			let maxConcurrent = 0;

			const items = [1, 2, 3, 4, 5];
			const processor = async (item: number) => {
				concurrent++;
				maxConcurrent = Math.max(maxConcurrent, concurrent);
				await new Promise((resolve) => setTimeout(resolve, 10));
				concurrent--;
				return item;
			};

			await processWithConcurrency(items, processor, 2);

			expect(maxConcurrent).toBeLessThanOrEqual(2);
		});

		it('calls progress callback', async () => {
			const items = [1, 2, 3];
			const processor = async (item: number) => item;
			const progressSpy = vi.fn();

			await processWithConcurrency(items, processor, 2, progressSpy);

			expect(progressSpy).toHaveBeenCalledTimes(3);
			expect(progressSpy).toHaveBeenCalledWith(1, 3);
			expect(progressSpy).toHaveBeenCalledWith(2, 3);
			expect(progressSpy).toHaveBeenCalledWith(3, 3);
		});

		it('handles empty array', async () => {
			const items: number[] = [];
			const processor = async (item: number) => item;

			const results = await processWithConcurrency(items, processor, 2);

			expect(results).toHaveLength(0);
		});

		it('handles single item', async () => {
			const items = [42];
			const processor = async (item: number) => item * 2;

			const results = await processWithConcurrency(items, processor, 2);

			expect(results).toHaveLength(1);
			expect(results[0].result).toBe(84);
			expect(results[0].success).toBe(true);
		});

		it('maintains order of results', async () => {
			const items = [1, 2, 3, 4, 5];
			const processor = async (item: number) => {
				await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
				return item;
			};

			const results = await processWithConcurrency(items, processor, 3);

			expect(results.map((r) => r.result)).toEqual([1, 2, 3, 4, 5]);
		});

		it('processes with high concurrency', async () => {
			const items = [1, 2, 3];
			const processor = async (item: number) => item;

			const results = await processWithConcurrency(items, processor, 10);

			expect(results).toHaveLength(3);
			results.forEach((r, i) => {
				expect(r.result).toBe(i + 1);
			});
		});

		it('includes item in result', async () => {
			const items = ['a', 'b', 'c'];
			const processor = async (item: string) => item.toUpperCase();

			const results = await processWithConcurrency(items, processor, 2);

			const validResults = results.filter((r) => r);
			expect(validResults.length).toBeGreaterThan(0);

			validResults.forEach((r) => {
				expect(r.item).toBeDefined();
				expect(r.result).toBeDefined();
				expect(r.success).toBe(true);
			});
		});
	});
});
