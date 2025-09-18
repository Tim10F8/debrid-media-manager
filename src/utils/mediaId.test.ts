import { describe, expect, it } from 'vitest';
import { getMediaId, normalize } from './mediaId';

describe('mediaId', () => {
	it('normalizes by deburring and stripping non-alnum', () => {
		expect(normalize('Café del Mar! 2021')).toBe('cafedelmar2021');
	});

	it('builds movie ids with optional year', () => {
		const movie = { title: 'Inception', year: 2010 } as any;
		expect(getMediaId(movie, 'movie')).toBe('inception (2010)');
		expect(getMediaId('Interstellar', 'movie')).toBe('interstellar');
	});

	it('builds tv ids using seasons/episodes ranges', () => {
		const showMulti = { title: 'Show', seasons: [1, 2, 3] } as any;
		expect(getMediaId(showMulti, 'tv')).toBe('show ➡️ s01 to s03');

		const showOne = { title: 'Show', seasons: [2] } as any;
		expect(getMediaId(showOne, 'tv')).toBe('show ➡️ s02');

		const showEp = { title: 'Show', seasons: [1], episodeNumbers: [5] } as any;
		expect(getMediaId(showEp, 'tv')).toBe('show ➡️ s01e05');
	});

	it('handles tv title only and non-system id', () => {
		expect(getMediaId('My Show', 'tv', false)).toBe('My Show');
		const show = { title: 'My Show', seasons: [1], episodeNumbers: [1] } as any;
		expect(getMediaId(show, 'tv', true, true)).toBe('my show');
	});
});
