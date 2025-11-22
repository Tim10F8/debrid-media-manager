import { describe, expect, it } from 'vitest';
import { flattenAndRemoveDuplicates, ScrapeSearchResult, sortByFileSize } from './mediasearch';

describe('mediasearch service', () => {
	describe('flattenAndRemoveDuplicates', () => {
		it('flattens nested arrays into a single array', () => {
			const input: ScrapeSearchResult[][] = [
				[
					{ title: 'Movie 1', fileSize: 1000, hash: 'a'.repeat(40) },
					{ title: 'Movie 2', fileSize: 2000, hash: 'b'.repeat(40) },
				],
				[{ title: 'Movie 3', fileSize: 3000, hash: 'c'.repeat(40) }],
			];

			const result = flattenAndRemoveDuplicates(input);

			expect(result).toHaveLength(3);
			expect(result[0].title).toBe('Movie 1');
			expect(result[1].title).toBe('Movie 2');
			expect(result[2].title).toBe('Movie 3');
		});

		it('removes duplicate hashes keeping first occurrence', () => {
			const duplicateHash = 'a'.repeat(40);
			const input: ScrapeSearchResult[][] = [
				[
					{ title: 'Movie 1', fileSize: 1000, hash: duplicateHash },
					{ title: 'Movie 2', fileSize: 2000, hash: 'b'.repeat(40) },
				],
				[{ title: 'Movie 1 Duplicate', fileSize: 3000, hash: duplicateHash }],
			];

			const result = flattenAndRemoveDuplicates(input);

			expect(result).toHaveLength(2);
			expect(result.find((r) => r.hash === duplicateHash)?.title).toBe('Movie 1');
		});

		it('filters out invalid hashes (not 40 hex characters)', () => {
			const input: ScrapeSearchResult[][] = [
				[
					{ title: 'Valid', fileSize: 1000, hash: 'a'.repeat(40) },
					{ title: 'Invalid - Too short', fileSize: 2000, hash: 'abc123' },
					{ title: 'Invalid - Not hex', fileSize: 3000, hash: 'z'.repeat(40) },
					{ title: 'Invalid - Uppercase', fileSize: 4000, hash: 'A'.repeat(40) },
				],
			];

			const result = flattenAndRemoveDuplicates(input);

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('Valid');
		});

		it('handles empty arrays', () => {
			const result = flattenAndRemoveDuplicates([]);
			expect(result).toEqual([]);
		});

		it('handles arrays with empty sub-arrays', () => {
			const input: ScrapeSearchResult[][] = [[], [], []];
			const result = flattenAndRemoveDuplicates(input);
			expect(result).toEqual([]);
		});

		it('preserves all unique valid hashes', () => {
			const input: ScrapeSearchResult[][] = [
				[
					{ title: 'Movie 1', fileSize: 1000, hash: '1'.repeat(40) },
					{ title: 'Movie 2', fileSize: 2000, hash: '2'.repeat(40) },
				],
				[
					{ title: 'Movie 3', fileSize: 3000, hash: 'a'.repeat(40) },
					{ title: 'Movie 4', fileSize: 4000, hash: 'b'.repeat(40) },
				],
			];

			const result = flattenAndRemoveDuplicates(input);

			expect(result).toHaveLength(4);
		});
	});

	describe('sortByFileSize', () => {
		it('sorts results by file size in descending order', () => {
			const input: ScrapeSearchResult[] = [
				{ title: 'Small', fileSize: 1000, hash: 'a'.repeat(40) },
				{ title: 'Large', fileSize: 5000, hash: 'b'.repeat(40) },
				{ title: 'Medium', fileSize: 3000, hash: 'c'.repeat(40) },
			];

			const result = sortByFileSize(input);

			expect(result[0].title).toBe('Large');
			expect(result[0].fileSize).toBe(5000);
			expect(result[1].title).toBe('Medium');
			expect(result[1].fileSize).toBe(3000);
			expect(result[2].title).toBe('Small');
			expect(result[2].fileSize).toBe(1000);
		});

		it('handles already sorted arrays', () => {
			const input: ScrapeSearchResult[] = [
				{ title: 'Large', fileSize: 5000, hash: 'a'.repeat(40) },
				{ title: 'Medium', fileSize: 3000, hash: 'b'.repeat(40) },
				{ title: 'Small', fileSize: 1000, hash: 'c'.repeat(40) },
			];

			const result = sortByFileSize(input);

			expect(result[0].fileSize).toBe(5000);
			expect(result[1].fileSize).toBe(3000);
			expect(result[2].fileSize).toBe(1000);
		});

		it('handles arrays with equal file sizes', () => {
			const input: ScrapeSearchResult[] = [
				{ title: 'A', fileSize: 2000, hash: 'a'.repeat(40) },
				{ title: 'B', fileSize: 2000, hash: 'b'.repeat(40) },
				{ title: 'C', fileSize: 2000, hash: 'c'.repeat(40) },
			];

			const result = sortByFileSize(input);

			expect(result).toHaveLength(3);
			result.forEach((r) => expect(r.fileSize).toBe(2000));
		});

		it('handles empty arrays', () => {
			const result = sortByFileSize([]);
			expect(result).toEqual([]);
		});

		it('handles single item arrays', () => {
			const input: ScrapeSearchResult[] = [
				{ title: 'Only', fileSize: 1000, hash: 'a'.repeat(40) },
			];

			const result = sortByFileSize(input);

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('Only');
		});

		it('mutates the original array', () => {
			const input: ScrapeSearchResult[] = [
				{ title: 'Small', fileSize: 1000, hash: 'a'.repeat(40) },
				{ title: 'Large', fileSize: 5000, hash: 'b'.repeat(40) },
			];

			const result = sortByFileSize(input);

			expect(result).toBe(input); // Same reference
			expect(input[0].title).toBe('Large');
		});
	});
});
