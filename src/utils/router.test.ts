import { describe, expect, it } from 'vitest';
import { getSafeRedirectPath } from './router';

describe('getSafeRedirectPath', () => {
	it('returns the provided path when it is already safe', () => {
		expect(getSafeRedirectPath('/library')).toBe('/library');
	});

	it('uses the first element when redirect is an array', () => {
		expect(getSafeRedirectPath(['/movie', '/bad'])).toBe('/movie');
	});

	it('rejects paths that are missing a leading slash or contain schemes', () => {
		expect(getSafeRedirectPath('profile', '/fallback')).toBe('/fallback');
		expect(getSafeRedirectPath('//double', '/fallback')).toBe('/fallback');
		expect(getSafeRedirectPath('javascript:alert(1)', '/fallback')).toBe('/fallback');
		expect(getSafeRedirectPath('HTTP://evil', '/fallback')).toBe('/fallback');
	});

	it('trims whitespace before validating the redirect', () => {
		expect(getSafeRedirectPath('   /search   ', '/fallback')).toBe('/search');
	});

	it('sanitizes the fallback before returning it', () => {
		expect(getSafeRedirectPath(undefined, ' http://evil ')).toBe('/');
		expect(getSafeRedirectPath(undefined, '/safe-fallback')).toBe('/safe-fallback');
	});
});
