import { describe, expect, it } from 'vitest';
import { checkArithmeticSequenceInFilenames, isVideo } from './selectable';

describe('selectable utils', () => {
	it('detects video files by extension and filters common non-video patterns', () => {
		expect(isVideo({ path: 'movie.mkv' })).toBe(true);
		expect(isVideo({ path: 'clip.MP4' })).toBe(true);
		expect(isVideo({ path: '/RARBG/readme.txt' })).toBe(false);
		expect(isVideo({ path: 'sample-trailer.mkv' })).toBe(false);
		expect(isVideo({ path: 'trailer.mov' })).toBe(false);
	});

	it('finds increasing numeric sequences in aligned video filenames', () => {
		const files = ['S01E01.mkv', 'S01E02.mkv', 'S01E03.mkv'];
		expect(checkArithmeticSequenceInFilenames(files)).toBe(true);
	});

	it('returns false when files are fewer than three or not aligned', () => {
		expect(checkArithmeticSequenceInFilenames(['a.mkv', 'b.mkv'])).toBe(false);
		// Numbers present but not aligned at same index across names
		const files = ['ep1_file.mkv', 'file_ep2.mkv', 'another3.mkv'];
		expect(checkArithmeticSequenceInFilenames(files)).toBe(false);
	});
});
