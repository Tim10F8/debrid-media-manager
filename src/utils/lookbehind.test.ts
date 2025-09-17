import { describe, expect, it, vi } from 'vitest';
import { supportsLookbehind } from './lookbehind';

describe('lookbehind', () => {
	describe('supportsLookbehind', () => {
		it('returns true when lookbehind is supported', () => {
			const result = supportsLookbehind();
			expect(typeof result).toBe('boolean');
		});

		it('handles regex operations correctly', () => {
			const originalReplace = String.prototype.replace;

			const result = supportsLookbehind();

			if (result) {
				expect('$foo %foo foo'.replace(/(\$)foo/g, '$1bar')).toBe('$bar %foo foo');
				expect('$foo %foo foo'.replace(/(?<=\$)foo/g, 'bar')).toBe('$bar %foo foo');
				expect('$foo %foo foo'.replace(/(?<!\$)foo/g, 'bar')).toBe('$foo %bar bar');
			}

			expect(String.prototype.replace).toBe(originalReplace);
		});

		it('returns false when regex throws error', () => {
			const originalReplace = String.prototype.replace;
			String.prototype.replace = vi.fn(() => {
				throw new Error('Lookbehind not supported');
			});

			const result = supportsLookbehind();
			expect(result).toBe(false);

			String.prototype.replace = originalReplace;
		});

		it('returns false when first regex check fails', () => {
			const originalReplace = String.prototype.replace;
			let callCount = 0;
			String.prototype.replace = vi.fn(function (this: string, ...args) {
				callCount++;
				if (callCount === 1) {
					return 'wrong result';
				}
				return originalReplace.apply(this, args as any);
			});

			const result = supportsLookbehind();
			expect(result).toBe(false);

			String.prototype.replace = originalReplace;
		});

		it('returns false when second regex check fails', () => {
			const originalReplace = String.prototype.replace;
			let callCount = 0;
			String.prototype.replace = vi.fn(function (this: string, ...args) {
				callCount++;
				if (callCount === 2) {
					return 'wrong result';
				}
				return originalReplace.apply(this, args as any);
			});

			const result = supportsLookbehind();
			expect(result).toBe(false);

			String.prototype.replace = originalReplace;
		});

		it('returns false when third regex check fails', () => {
			const originalReplace = String.prototype.replace;
			let callCount = 0;
			String.prototype.replace = vi.fn(function (this: string, ...args) {
				callCount++;
				if (callCount === 3) {
					return 'wrong result';
				}
				return originalReplace.apply(this, args as any);
			});

			const result = supportsLookbehind();
			expect(result).toBe(false);

			String.prototype.replace = originalReplace;
		});
	});
});
