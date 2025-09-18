import { describe, expect, it } from 'vitest';
import {
	defaultAvailabilityCheckLimit,
	defaultDownloadMagnets,
	defaultEpisodeSize,
	defaultMagnetHandlerEnabled,
	defaultMagnetInstructionsHidden,
	defaultMovieSize,
	defaultPlayer,
	defaultTorrentsFilter,
} from './settings';

describe('settings', () => {
	it('exports correct default player', () => {
		expect(defaultPlayer).toBe('web/rd');
	});

	it('exports correct default movie size', () => {
		expect(defaultMovieSize).toBe('0');
	});

	it('exports correct default episode size', () => {
		expect(defaultEpisodeSize).toBe('0');
	});

	it('exports correct default torrents filter', () => {
		expect(defaultTorrentsFilter).toBe('');
	});

	it('exports correct default magnet handler enabled', () => {
		expect(defaultMagnetHandlerEnabled).toBe(false);
	});

	it('exports correct default magnet instructions hidden', () => {
		expect(defaultMagnetInstructionsHidden).toBe(false);
	});

	it('exports correct default download magnets', () => {
		expect(defaultDownloadMagnets).toBe(false);
	});

	it('exports correct default availability check limit', () => {
		expect(defaultAvailabilityCheckLimit).toBe('0');
	});

	it('has all expected exports', () => {
		expect(typeof defaultPlayer).toBe('string');
		expect(typeof defaultMovieSize).toBe('string');
		expect(typeof defaultEpisodeSize).toBe('string');
		expect(typeof defaultTorrentsFilter).toBe('string');
		expect(typeof defaultMagnetHandlerEnabled).toBe('boolean');
		expect(typeof defaultMagnetInstructionsHidden).toBe('boolean');
		expect(typeof defaultDownloadMagnets).toBe('boolean');
		expect(typeof defaultAvailabilityCheckLimit).toBe('string');
	});
});
