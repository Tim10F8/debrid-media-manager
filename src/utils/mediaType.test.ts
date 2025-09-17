import { describe, expect, it } from 'vitest';
import { getTypeByName, getTypeByNameAndFileCount } from './mediaType';

describe('mediaType', () => {
	it('detects tv patterns', () => {
		expect(getTypeByName('Series S01E02 1080p')).toBe('tv');
		expect(getTypeByName('Season 1 Complete')).toBe('tv');
		expect(getTypeByName('tv pack')).toBe('tv');
		expect(getTypeByName('saison 2')).toBe('tv');
		expect(getTypeByName('a - 01')).toBe('tv');
		expect(getTypeByName('2020 - 2021')).toBe('tv');
	});

	it('defaults to movie otherwise', () => {
		expect(getTypeByName('Inception.2010.1080p')).toBe('movie');
	});

	it('has equivalent behavior with file count variant', () => {
		expect(getTypeByNameAndFileCount('S02E03')).toBe('tv');
		expect(getTypeByNameAndFileCount('Some.Movie.2023')).toBe('movie');
	});
});
