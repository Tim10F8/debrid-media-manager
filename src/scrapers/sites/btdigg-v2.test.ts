import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testing } from './btdigg-v2';

const { convertToMB, isFoundDateRecent, calculateMaxPages, processInBatches } = __testing;

describe('btdigg helpers', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-06-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('converts file sizes to megabytes', () => {
		expect(convertToMB('10 MB')).toBe(10);
		expect(convertToMB('2 GB')).toBe(2048);
	});

	it('compares found dates to air dates', () => {
		expect(isFoundDateRecent('found 2 days ago', '2024-05-25')).toBe(true);
		expect(isFoundDateRecent('found 3 years ago', '2023-01-01')).toBe(false);
		expect(isFoundDateRecent('found 2 hours ago', '2024-01-01')).toBe(true);
		expect(() => isFoundDateRecent('unknown pattern', '2024-01-01')).toThrow(
			'Invalid found string'
		);
	});

	it('calculates max pages with caps', () => {
		expect(calculateMaxPages(95, 10, 100)).toBe(10);
		expect(calculateMaxPages(2000, 10, 100)).toBe(100);
	});

	it('processes batches until the bad-count threshold is met', async () => {
		const batchPromises = [
			() =>
				Promise.resolve({
					results: [{ hash: 'a', title: 'Test A', fileSize: 100 }],
					badCount: 12,
					numResults: 0,
				}),
			() =>
				Promise.resolve({
					results: [{ hash: 'b', title: 'Test B', fileSize: 200 }],
					badCount: 10,
					numResults: 0,
				}),
			() =>
				Promise.resolve({
					results: [{ hash: 'c', title: 'Test C', fileSize: 300 }],
					badCount: 0,
					numResults: 0,
				}),
		];

		const results = await processInBatches('title', batchPromises, 2);

		expect(results).toEqual([
			{ hash: 'a', title: 'Test A', fileSize: 100 },
			{ hash: 'b', title: 'Test B', fileSize: 200 },
		]);
	});
});
