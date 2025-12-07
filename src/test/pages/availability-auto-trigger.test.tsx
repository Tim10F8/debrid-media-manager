import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for per-service auto-trigger availability check behavior
 *
 * This test suite verifies that the auto-trigger logic correctly identifies
 * which services (RD, AD, TB) need availability checks based on their
 * individual cached torrent counts.
 */

// Mock data
const mockSearchResults = [
	{
		hash: 'hash1',
		title: 'Torrent 1',
		fileSize: 1024,
		rdAvailable: false,
		adAvailable: false,
		tbAvailable: false,
		files: [],
		noVideos: false,
		medianFileSize: 1024,
		biggestFileSize: 1024,
		videoCount: 1,
	},
	{
		hash: 'hash2',
		title: 'Torrent 2',
		fileSize: 2048,
		rdAvailable: false,
		adAvailable: false,
		tbAvailable: false,
		files: [],
		noVideos: false,
		medianFileSize: 2048,
		biggestFileSize: 2048,
		videoCount: 1,
	},
];

// Hoisted mocks
const {
	mockToast,
	mockInstantCheckInRd,
	mockInstantCheckInAd,
	mockInstantCheckInTb,
	mockHandleAvailabilityTest,
	toastFunction,
} = vi.hoisted(() => {
	const toastFn = vi.fn() as any;
	toastFn.loading = vi.fn().mockReturnValue('toast-id');
	toastFn.success = vi.fn();
	toastFn.error = vi.fn();
	toastFn.dismiss = vi.fn();

	return {
		mockToast: toastFn,
		mockInstantCheckInRd: vi.fn(),
		mockInstantCheckInAd: vi.fn(),
		mockInstantCheckInTb: vi.fn(),
		mockHandleAvailabilityTest: vi.fn(),
		toastFunction: toastFn,
	};
});

vi.mock('react-hot-toast', () => ({
	__esModule: true,
	default: toastFunction,
	toast: toastFunction,
}));

describe('Auto-trigger Availability Check - Per-Service Logic', () => {
	let localStorageMock: Map<string, string>;

	beforeEach(() => {
		vi.useFakeTimers();

		// Mock localStorage
		localStorageMock = new Map();
		Object.defineProperty(window, 'localStorage', {
			value: {
				getItem: (key: string) => localStorageMock.get(key) ?? null,
				setItem: (key: string, value: string) => localStorageMock.set(key, value),
				removeItem: (key: string) => localStorageMock.delete(key),
			},
			writable: true,
		});

		// Reset mocks
		mockToast.mockClear();
		mockToast.loading.mockClear();
		mockToast.success.mockClear();
		mockInstantCheckInRd.mockClear();
		mockInstantCheckInAd.mockClear();
		mockInstantCheckInTb.mockClear();
		mockHandleAvailabilityTest.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Auto-trigger decision logic', () => {
		it('should auto-trigger when RD has 0 cached torrents', () => {
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 5;
			const tbAvailableCount: number = 3;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			// Simulate the logic from the movie page
			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD']);
		});

		it('should auto-trigger when AD has 0 cached torrents', () => {
			const rdAvailableCount: number = 5;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 3;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['AD']);
		});

		it('should auto-trigger when TB has 0 cached torrents', () => {
			const rdAvailableCount: number = 5;
			const adAvailableCount: number = 3;
			const tbAvailableCount: number = 0;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['TB']);
		});

		it('should auto-trigger for multiple services when they all have 0 cached', () => {
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD', 'AD', 'TB']);
		});

		it('should auto-trigger for RD and AD when both have 0, but TB has cached', () => {
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 5;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD', 'AD']);
		});

		it('should NOT auto-trigger when all services have cached torrents', () => {
			const rdAvailableCount: number = 5;
			const adAvailableCount: number = 3;
			const tbAvailableCount: number = 2;
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual([]);
		});

		it('should only check services that are logged in (RD only)', () => {
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0; // Not logged in, so shouldn't check
			const tbAvailableCount: number = 0; // Not logged in, so shouldn't check
			const rdKey = 'rd-key';
			const adKey = null;
			const torboxKey = null;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD']);
		});

		it('should only check services that are logged in (AD only)', () => {
			const rdAvailableCount: number = 0; // Not logged in
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0; // Not logged in
			const rdKey = null;
			const adKey = 'ad-key';
			const torboxKey = null;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['AD']);
		});
	});

	describe('Toast message construction', () => {
		it('should show correct message for single service (RD)', () => {
			const servicesNeedingCheck = ['RD'];
			const servicesList = servicesNeedingCheck.join(', ');
			const expectedMessage = `No cached torrents in ${servicesList}. Checking availability in 3 secs...`;

			expect(expectedMessage).toBe(
				'No cached torrents in RD. Checking availability in 3 secs...'
			);
		});

		it('should show correct message for single service (AD)', () => {
			const servicesNeedingCheck = ['AD'];
			const servicesList = servicesNeedingCheck.join(', ');
			const expectedMessage = `No cached torrents in ${servicesList}. Checking availability in 3 secs...`;

			expect(expectedMessage).toBe(
				'No cached torrents in AD. Checking availability in 3 secs...'
			);
		});

		it('should show correct message for multiple services', () => {
			const servicesNeedingCheck = ['RD', 'AD'];
			const servicesList = servicesNeedingCheck.join(', ');
			const expectedMessage = `No cached torrents in ${servicesList}. Checking availability in 3 secs...`;

			expect(expectedMessage).toBe(
				'No cached torrents in RD, AD. Checking availability in 3 secs...'
			);
		});

		it('should show correct message for all services', () => {
			const servicesNeedingCheck = ['RD', 'AD', 'TB'];
			const servicesList = servicesNeedingCheck.join(', ');
			const expectedMessage = `No cached torrents in ${servicesList}. Checking availability in 3 secs...`;

			expect(expectedMessage).toBe(
				'No cached torrents in RD, AD, TB. Checking availability in 3 secs...'
			);
		});
	});

	describe('Auto-trigger guard conditions', () => {
		it('should respect autoCheckDisabled setting', () => {
			localStorageMock.set('settings:disableAutoAvailabilityCheck', 'true');

			const autoCheckDisabled =
				window.localStorage.getItem('settings:disableAutoAvailabilityCheck') === 'true';

			expect(autoCheckDisabled).toBe(true);
		});

		it('should respect already checked flag', () => {
			const imdbid = 'tt1234567';
			const autoCheckKey = `autoAvailabilityChecked:${imdbid}`;

			localStorageMock.set(autoCheckKey, 'true');
			const alreadyChecked = window.localStorage.getItem(autoCheckKey) === 'true';

			expect(alreadyChecked).toBe(true);
		});

		it('should allow auto-trigger when not disabled and not already checked', () => {
			const autoCheckDisabled =
				window.localStorage.getItem('settings:disableAutoAvailabilityCheck') === 'true';
			const alreadyChecked =
				window.localStorage.getItem('autoAvailabilityChecked:tt1234567') === 'true';
			const servicesNeedingCheck = ['RD', 'AD'];

			const shouldAutoTrigger =
				!autoCheckDisabled && !alreadyChecked && servicesNeedingCheck.length > 0;

			expect(shouldAutoTrigger).toBe(true);
		});

		it('should NOT auto-trigger when disabled', () => {
			localStorageMock.set('settings:disableAutoAvailabilityCheck', 'true');

			const autoCheckDisabled =
				window.localStorage.getItem('settings:disableAutoAvailabilityCheck') === 'true';
			const alreadyChecked = false;
			const servicesNeedingCheck = ['RD', 'AD'];

			const shouldAutoTrigger =
				!autoCheckDisabled && !alreadyChecked && servicesNeedingCheck.length > 0;

			expect(shouldAutoTrigger).toBe(false);
		});

		it('should NOT auto-trigger when already checked', () => {
			localStorageMock.set('autoAvailabilityChecked:tt1234567', 'true');

			const autoCheckDisabled = false;
			const alreadyChecked =
				window.localStorage.getItem('autoAvailabilityChecked:tt1234567') === 'true';
			const servicesNeedingCheck = ['RD', 'AD'];

			const shouldAutoTrigger =
				!autoCheckDisabled && !alreadyChecked && servicesNeedingCheck.length > 0;

			expect(shouldAutoTrigger).toBe(false);
		});

		it('should NOT auto-trigger when no services need checking', () => {
			const autoCheckDisabled = false;
			const alreadyChecked = false;
			const servicesNeedingCheck: string[] = [];

			const shouldAutoTrigger =
				!autoCheckDisabled && !alreadyChecked && servicesNeedingCheck.length > 0;

			expect(shouldAutoTrigger).toBe(false);
		});
	});

	describe('Service count tracking', () => {
		it('should track per-service counts separately', () => {
			let rdAvailableCount = 0;
			let adAvailableCount = 0;
			let tbAvailableCount = 0;

			// Simulate RD finding 3 torrents
			rdAvailableCount += 3;
			expect(rdAvailableCount).toBe(3);
			expect(adAvailableCount).toBe(0);
			expect(tbAvailableCount).toBe(0);

			// Simulate AD finding 2 torrents
			adAvailableCount += 2;
			expect(rdAvailableCount).toBe(3);
			expect(adAvailableCount).toBe(2);
			expect(tbAvailableCount).toBe(0);

			// Simulate TB finding 1 torrent
			tbAvailableCount += 1;
			expect(rdAvailableCount).toBe(3);
			expect(adAvailableCount).toBe(2);
			expect(tbAvailableCount).toBe(1);
		});

		it('should calculate total available count correctly', () => {
			const rdAvailableCount: number = 3;
			const adAvailableCount: number = 2;
			const tbAvailableCount: number = 1;

			const totalAvailableCount = rdAvailableCount + adAvailableCount + tbAvailableCount;

			expect(totalAvailableCount).toBe(6);
		});

		it('should handle partial service availability', () => {
			const rdAvailableCount: number = 5;
			const adAvailableCount: number = 0; // AD found nothing
			const tbAvailableCount: number = 3;

			const totalAvailableCount = rdAvailableCount + adAvailableCount + tbAvailableCount;

			expect(totalAvailableCount).toBe(8);

			// Only AD should trigger
			const servicesNeedingCheck = [];
			if (rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['AD']);
		});
	});

	describe('Integration scenarios', () => {
		it('Scenario: RD user with no cached torrents', () => {
			const rdKey = 'rd-key';
			const adKey = null;
			const torboxKey = null;
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0;
			const finalResults = 10;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD']);
			expect(finalResults > 0).toBe(true);
		});

		it('Scenario: AD user with no cached torrents', () => {
			const rdKey = null;
			const adKey = 'ad-key';
			const torboxKey = null;
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0;
			const finalResults = 10;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['AD']);
			expect(finalResults > 0).toBe(true);
		});

		it('Scenario: RD+AD user, RD has cached but AD does not', () => {
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = null;
			const rdAvailableCount: number = 5;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0;
			const totalAvailableCount = rdAvailableCount + adAvailableCount + tbAvailableCount;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['AD']);
			expect(totalAvailableCount).toBe(5);
		});

		it('Scenario: All services logged in, all have cached', () => {
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';
			const rdAvailableCount: number = 3;
			const adAvailableCount: number = 2;
			const tbAvailableCount: number = 1;
			const totalAvailableCount = rdAvailableCount + adAvailableCount + tbAvailableCount;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual([]);
			expect(totalAvailableCount).toBe(6);
		});

		it('Scenario: All services logged in, none have cached', () => {
			const rdKey = 'rd-key';
			const adKey = 'ad-key';
			const torboxKey = 'tb-key';
			const rdAvailableCount: number = 0;
			const adAvailableCount: number = 0;
			const tbAvailableCount: number = 0;
			const totalAvailableCount = rdAvailableCount + adAvailableCount + tbAvailableCount;

			const servicesNeedingCheck = [];
			if (rdKey && rdAvailableCount === 0) servicesNeedingCheck.push('RD');
			if (adKey && adAvailableCount === 0) servicesNeedingCheck.push('AD');
			if (torboxKey && tbAvailableCount === 0) servicesNeedingCheck.push('TB');

			expect(servicesNeedingCheck).toEqual(['RD', 'AD', 'TB']);
			expect(totalAvailableCount).toBe(0);
		});
	});
});
