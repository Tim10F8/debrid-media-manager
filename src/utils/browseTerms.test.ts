import { describe, expect, it, vi } from 'vitest';
import { getTerms } from './browseTerms';

describe('browseTerms', () => {
	describe('getTerms', () => {
		it('returns requested number of terms', () => {
			const terms5 = getTerms(5);
			expect(terms5).toHaveLength(5);

			const terms10 = getTerms(10);
			expect(terms10).toHaveLength(10);

			const terms20 = getTerms(20);
			expect(terms20).toHaveLength(20);
		});

		it('returns unique terms', () => {
			const terms = getTerms(50);
			const uniqueTerms = new Set(terms);
			expect(uniqueTerms.size).toBe(terms.length);
		});

		it('returns different terms at different times', () => {
			const originalDateNow = Date.now;

			Date.now = vi.fn().mockReturnValue(1000000000);
			const terms1 = getTerms(10);

			Date.now = vi.fn().mockReturnValue(2000000000);
			const terms2 = getTerms(10);

			expect(terms1).not.toEqual(terms2);

			Date.now = originalDateNow;
		});

		it('returns all terms when limit exceeds available terms', () => {
			const allTerms = getTerms(200);
			expect(allTerms.length).toBeLessThanOrEqual(120);
			expect(allTerms.length).toBeGreaterThan(0);
		});

		it('returns empty array when limit is 0', () => {
			const terms = getTerms(0);
			expect(terms).toHaveLength(0);
		});

		it('returns terms with emoji prefixes', () => {
			const terms = getTerms(10);
			terms.forEach((term) => {
				expect(term).toMatch(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}]/u);
			});
		});

		it('includes expected term categories', () => {
			const allTerms = getTerms(200);
			const termString = allTerms.join(' ');

			const hasGenres = /action|comedy|drama|horror|fantasy/.test(termString);
			const hasServices = /netflix|amazon|disney|hbo/.test(termString);
			const hasCountries = /japan|korea|french|german/.test(termString);

			expect(hasGenres || hasServices || hasCountries).toBe(true);
		});
	});
});
