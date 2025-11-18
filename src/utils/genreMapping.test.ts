import { describe, expect, it } from 'vitest';
import { formatGenreForUrl, mapTmdbGenreToTrakt } from './genreMapping';

describe('genreMapping', () => {
	describe('mapTmdbGenreToTrakt', () => {
		it('maps known TMDB genres to Trakt slugs', () => {
			expect(mapTmdbGenreToTrakt('Action')).toBe('action');
			expect(mapTmdbGenreToTrakt('Science Fiction')).toBe('science-fiction');
			expect(mapTmdbGenreToTrakt('Comedy')).toBe('comedy');
		});

		it('returns null for unknown genres', () => {
			expect(mapTmdbGenreToTrakt('TV Movie')).toBe(null);
			expect(mapTmdbGenreToTrakt('Unknown Genre')).toBe(null);
		});
	});

	describe('formatGenreForUrl', () => {
		it('uses mapped genre slug for known genres', () => {
			expect(formatGenreForUrl('Science Fiction')).toBe('science-fiction');
			expect(formatGenreForUrl('Action')).toBe('action');
		});

		it('formats unknown genres with lowercase and hyphens', () => {
			expect(formatGenreForUrl('TV Movie')).toBe('tv-movie');
			expect(formatGenreForUrl('Some New Genre')).toBe('some-new-genre');
		});
	});
});
