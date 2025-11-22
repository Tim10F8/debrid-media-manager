import { SearchResult } from '@/services/mediasearch';
import { describe, expect, it } from 'vitest';
import {
	borderColor,
	btnColor,
	btnIcon,
	btnLabel,
	fileSize,
	sortByBiggest,
	sortByMedian,
	torrentPrefix,
} from './results';

describe('results utils', () => {
	describe('borderColor', () => {
		it('returns green border for downloaded torrents', () => {
			expect(borderColor(true, false)).toBe('border-green-400 border-4');
		});

		it('returns red border for downloading torrents', () => {
			expect(borderColor(false, true)).toBe('border-red-400 border-4');
		});

		it('returns black border for normal torrents', () => {
			expect(borderColor(false, false)).toBe('border-black border-2');
		});

		it('prioritizes downloaded over downloading', () => {
			expect(borderColor(true, true)).toBe('border-green-400 border-4');
		});
	});

	describe('fileSize', () => {
		it('converts bytes to MB and formats to 2 decimals', () => {
			expect(fileSize(1024)).toBe('1.00');
			expect(fileSize(2048)).toBe('2.00');
			expect(fileSize(1536)).toBe('1.50');
		});

		it('handles zero size', () => {
			expect(fileSize(0)).toBe('0.00');
		});

		it('handles large file sizes', () => {
			expect(fileSize(10240000)).toBe('10000.00');
		});
	});

	describe('btnColor', () => {
		it('returns green for available torrents', () => {
			expect(btnColor(true, false)).toBe('green');
		});

		it('returns gray for torrents with no videos', () => {
			expect(btnColor(false, true)).toBe('gray');
		});

		it('returns blue for normal torrents', () => {
			expect(btnColor(false, false)).toBe('blue');
		});

		it('prioritizes available status', () => {
			expect(btnColor(true, true)).toBe('green');
		});
	});

	describe('torrentPrefix', () => {
		it('returns RD badge for RealDebrid torrents', () => {
			const result = torrentPrefix('rd:12345');
			expect(result.props.className).toContain('bg-[#b5d496]');
			expect(result.props.children).toBe('RD');
		});

		it('returns TB badge for TorBox torrents', () => {
			const result = torrentPrefix('tb:12345');
			expect(result.props.className).toContain('bg-[#4f46e5]');
			expect(result.props.children).toBe('TB');
		});

		it('returns AD badge for AllDebrid torrents', () => {
			const result = torrentPrefix('ad:12345');
			expect(result.props.className).toContain('bg-[#fbc730]');
			expect(result.props.children).toBe('AD');
		});

		it('defaults to AD badge for unknown prefix', () => {
			const result = torrentPrefix('unknown:12345');
			expect(result.props.className).toContain('bg-[#fbc730]');
		});
	});

	describe('btnIcon', () => {
		it('returns Zap icon for available torrents', () => {
			const result = btnIcon(true);
			expect(result.type.displayName).toBe('Zap');
		});

		it('returns Download icon for unavailable torrents', () => {
			const result = btnIcon(false);
			expect(result.type.displayName).toBe('Download');
		});
	});

	describe('btnLabel', () => {
		it('returns instant label for available torrents', () => {
			const result = btnLabel(true, 'RD');
			expect(result).not.toBe('string');
			if (typeof result !== 'string') {
				expect(result.props.children).toEqual(['Instant ', 'RD']);
			}
		});

		it('returns download label for unavailable torrents', () => {
			const result = btnLabel(false, 'RD');
			expect(result).toBe('DL with RD');
		});

		it('handles different service names', () => {
			const result = btnLabel(true, 'TorBox');
			expect(result).not.toBe('string');
			if (typeof result !== 'string') {
				expect(result.props.children).toEqual(['Instant ', 'TorBox']);
			}
		});
	});

	describe('sortByMedian', () => {
		it('sorts available torrents before unavailable ones', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: 'Test 1',
					rdAvailable: false,
					adAvailable: false,
					videoCount: 0,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Test 2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					medianFileSize: 50,
					fileSize: 500,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			expect(sorted[0].rdAvailable).toBe(true);
		});

		it('sorts by median file size for multi-file torrents', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: 'Test 1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Test 2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					medianFileSize: 200,
					fileSize: 2000,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			expect(sorted[0].medianFileSize).toBe(200);
		});

		it('uses fileSize for single file torrents', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: 'Test 1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					medianFileSize: 100,
					fileSize: 1024,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Test 2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					medianFileSize: 200,
					fileSize: 2048,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			expect(sorted[0].fileSize).toBe(2048);
		});

		it('sorts by video count when sizes are equal', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: 'Test 1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 10,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Test 2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 20,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			expect(sorted[0].videoCount).toBe(20);
		});

		it('sorts alphabetically when all other factors are equal', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: 'Zebra',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 10,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Apple',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 10,
					medianFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			expect(sorted[0].title).toBe('Apple');
		});

		it('handles empty titles', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					title: '',
					rdAvailable: true,
					adAvailable: false,
					tbAvailable: false,
					videoCount: 10,
					medianFileSize: 100,
					fileSize: 1000,
					files: [],
					noVideos: false,
					biggestFileSize: 100,
				} as SearchResult,
				{
					hash: 'hash2',
					title: 'Test',
					rdAvailable: true,
					adAvailable: false,
					tbAvailable: false,
					videoCount: 10,
					medianFileSize: 100,
					fileSize: 1000,
					files: [],
					noVideos: false,
					biggestFileSize: 100,
				} as SearchResult,
			];

			const sorted = sortByMedian(results);
			// Empty title is sorted first
			expect(sorted[0].title).toBe('');
		});
	});

	describe('sortByBiggest', () => {
		it('sorts available torrents before unavailable ones', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					rdAvailable: false,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 50,
					fileSize: 500,
				} as SearchResult,
			];

			const sorted = sortByBiggest(results);
			expect(sorted[0].rdAvailable).toBe(true);
		});

		it('sorts by biggest file size for multi-file torrents', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					biggestFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					biggestFileSize: 200,
					fileSize: 2000,
				} as SearchResult,
			];

			const sorted = sortByBiggest(results);
			expect(sorted[0].biggestFileSize).toBe(200);
		});

		it('uses fileSize for single file torrents', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'hash2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 200,
					fileSize: 2000,
				} as SearchResult,
			];

			const sorted = sortByBiggest(results);
			expect(sorted[0].fileSize).toBe(2000);
		});

		it('sorts by hash alphabetically when sizes are equal', () => {
			const results: SearchResult[] = [
				{
					hash: 'zebra',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
				{
					hash: 'apple',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 0,
					biggestFileSize: 100,
					fileSize: 1000,
				} as SearchResult,
			];

			const sorted = sortByBiggest(results);
			expect(sorted[0].hash).toBe('apple');
		});

		it('correctly multiplies biggest file size by 1_000_000', () => {
			const results: SearchResult[] = [
				{
					hash: 'hash1',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					biggestFileSize: 2, // 2MB = 2_000_000 bytes
					fileSize: 10000000,
				} as SearchResult,
				{
					hash: 'hash2',
					rdAvailable: true,
					adAvailable: false,
					videoCount: 5,
					biggestFileSize: 3, // 3MB = 3_000_000 bytes
					fileSize: 15000000,
				} as SearchResult,
			];

			const sorted = sortByBiggest(results);
			expect(sorted[0].biggestFileSize).toBe(3);
		});
	});
});
