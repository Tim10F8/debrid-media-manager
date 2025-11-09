import type { ScrapeSearchResult } from '@/services/mediasearch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	filterByMovieConditions,
	filterByTvConditions,
	flexEq,
	getAllPossibleTitles,
	getSeasonNameAndCode,
	getSeasonYear,
	grabMovieMetadata,
	grabTvMetadata,
	hasNoBannedTerms,
	matchesTitle,
	meetsTitleConditions,
	padWithZero,
} from './checks';

const makeResult = (title: string, fileSize: number, hashSeed: string): ScrapeSearchResult => ({
	title,
	fileSize,
	hash: hashSeed.repeat(40).slice(0, 40),
});

describe('checks utilities', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('flexEq matches ignoring separators and diacritics', () => {
		expect(flexEq('The.Matrix.1999.1080p', 'matrix', ['1999'])).toBe(true);
	});

	it('matchesTitle scores based on important terms and years', () => {
		const target = 'The Hidden Fortress';
		const targetYears = ['1958'];
		const test = 'Hidden Fortress 1958 Criterion Collection 1080p';
		expect(matchesTitle(target, targetYears, test)).toBe(true);

		const insufficient = matchesTitle('A Tale', [], 'random file');
		expect(insufficient).toBe(false);
	});

	it('hasNoBannedTerms respects banned word sets', () => {
		expect(hasNoBannedTerms('example', 'Example sex education rip')).toBe(false);
		expect(hasNoBannedTerms('sex education', 'Sex Education Documentary')).toBe(true);
	});

	it('meetsTitleConditions checks parsed metadata and year hints', () => {
		expect(
			meetsTitleConditions('Galaxy Quest', ['1999'], '[YTS] Galaxy Quest 1999 1080p BluRay')
		).toBe(true);
	});

	it('collects movie metadata variants from ratings sources', () => {
		const movieMeta = grabMovieMetadata(
			'tt10872600',
			{
				title: 'Spider-Man: No Way Home',
				original_title: 'El Hombre Araña: Sin Camino a Casa',
				release_date: '2021-12-17',
			},
			{
				year: '2021',
				released: '2021-12-17',
				ratings: [
					{
						source: 'tomatoes',
						score: 97,
						url: 'https://www.rottentomatoes.com/m/spider_man_no_way_home',
					},
					{
						source: 'metacritic',
						score: 90,
						url: 'https://www.metacritic.com/movie/spider-man-no-way-home-extended',
					},
				],
			}
		);

		expect(movieMeta.cleanTitle).toBe('spider-man no way home');
		expect(movieMeta.originalTitle).toBe('el hombre araña: sin camino a casa');
		expect(movieMeta.cleanedTitle).toBe('spider man no way home');
		expect(movieMeta.alternativeTitle).toBe('spider man no way home extended');
		expect(movieMeta.year).toBe('2021');
	});

	it('collects tv metadata with derived seasons', () => {
		const tvMeta = grabTvMetadata(
			'tt9140554',
			{
				name: 'The Wheel of Time',
				original_name: 'La Rueda del Tiempo',
				release_date: '2021-11-19',
			},
			{
				year: '2021',
				released: '2021-11-19',
				seasons: [{ name: 'Season 1', season_number: 1, episode_count: 8 }],
				ratings: [
					{
						source: 'tomatoes',
						score: 80,
						url: 'https://www.rottentomatoes.com/tv/the_wheel_of_time',
					},
				],
			}
		);

		expect(tvMeta.cleanTitle).toBe('the wheel of time');
		expect(tvMeta.originalTitle).toBe('la rueda del tiempo');
		expect(tvMeta.seasons).toHaveLength(1);
		expect(tvMeta.year).toBe('2021');
	});

	it('expands titles with symbol replacements', () => {
		const variants = getAllPossibleTitles(['r&b', 'c+plus', undefined]);
		expect(variants).toContain('r and b');
		expect(variants).toContain('c and plus');
		expect(variants).not.toContain(undefined as any);
	});

	it('filters movie scrapes by tv patterns and size constraints', () => {
		const items: ScrapeSearchResult[] = [
			makeResult('Epic.Movie.2020.1080p', 1500, 'a'),
			makeResult('Show.S01E02.720p', 1500, 'b'),
			makeResult('Huge.Movie.2020.2160p', 300000, 'c'),
		];
		const filtered = filterByMovieConditions(items);
		expect(filtered).toEqual([items[0]]);
	});

	it('filters tv scrapes based on season metadata and years', () => {
		const tvItems: ScrapeSearchResult[] = [
			makeResult('Cool.Show.S02E01.2020', 200, 'd'),
			makeResult('Cool.Show.S03E01', 200, 'e'),
			makeResult('Cool Show Season Two Special', 250, 'f'),
			makeResult('Tiny File', 80, 'g'),
		];
		const filtered = filterByTvConditions(
			tvItems,
			'Cool Show Season 2',
			'2019',
			'2020',
			2,
			'Season Two',
			2
		);

		expect(filtered.map((r) => r.hash)).toEqual([tvItems[0].hash, tvItems[2].hash]);
	});

	it('pads numbers and extracts season metadata', () => {
		expect(padWithZero(7)).toBe('07');
		expect(padWithZero(12)).toBe('12');

		const { seasonName, seasonCode } = getSeasonNameAndCode({ name: 'Saga Origins 02' });
		expect(seasonCode).toBe(2);
		expect(seasonName).toBe('saga origins');
		expect(getSeasonYear({ air_date: '2020-10-10' })).toBe('2020');
	});
});
