import { describe, expect, it } from 'vitest';
import getReleaseTags from './score';

describe('getReleaseTags', () => {
	it('boosts score when premium release tags exist', () => {
		const result = getReleaseTags('Movie.2024.REMUX.PROPER.DoVi.HDR10plus', 100);

		expect(result.remux).toBe(true);
		expect(result.proper_remux).toBe(true);
		expect(result.dolby_vision).toBe(true);
		expect(result.hdr10plus).toBe(true);
		expect(result.hdr).toBe(true);
		expect(result.score).toBe(147);
	});

	it('falls back to the provided file size when tags are absent', () => {
		const result = getReleaseTags('IndieFilm.1080p.BluRay', 12);

		expect(result).toMatchObject({
			remux: false,
			proper_remux: false,
			dolby_vision: false,
			hdr10plus: false,
			hdr: false,
			score: 12,
		});
	});
});
