import { describe, expect, it } from 'vitest';
import { showInfoForAD, showInfoForRD } from './showInfo';

describe('showInfo exports', () => {
	it('exports showInfoForRD function', () => {
		expect(showInfoForRD).toBeDefined();
		expect(typeof showInfoForRD).toBe('function');
	});

	it('exports showInfoForAD function', () => {
		expect(showInfoForAD).toBeDefined();
		expect(typeof showInfoForAD).toBe('function');
	});
});
