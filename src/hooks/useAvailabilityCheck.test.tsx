import { SearchResult } from '@/services/mediasearch';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvailabilityCheck } from './useAvailabilityCheck';

const {
	mockToast,
	mockToastCall,
	mockGenerateTokenAndHash,
	mockInstantCheckInRd,
	mockInstantCheckInTb,
	mockGetCachedTrackerStats,
	mockShouldIncludeTrackerStats,
	mockProcessWithConcurrency,
	toastFunction,
} = vi.hoisted(() => {
	const loading = vi.fn().mockReturnValue('toast-id');
	const success = vi.fn();
	const error = vi.fn();
	const dismiss = vi.fn();
	const promise = vi.fn();
	const call = vi.fn();
	const toastFn = Object.assign(
		(...args: unknown[]) => {
			call(...args);
		},
		{ loading, success, error, dismiss, promise }
	);
	return {
		mockToast: { loading, success, error, dismiss, promise },
		mockToastCall: call,
		mockGenerateTokenAndHash: vi.fn(),
		mockInstantCheckInRd: vi.fn(),
		mockInstantCheckInTb: vi.fn(),
		mockGetCachedTrackerStats: vi.fn(),
		mockShouldIncludeTrackerStats: vi.fn(),
		mockProcessWithConcurrency: vi.fn(),
		toastFunction: toastFn,
	};
});

vi.mock('react-hot-toast', () => ({
	__esModule: true,
	default: toastFunction,
	toast: toastFunction,
}));

vi.mock('@/utils/token', () => ({
	generateTokenAndHash: mockGenerateTokenAndHash,
}));

vi.mock('@/utils/instantChecks', () => ({
	instantCheckInRd: mockInstantCheckInRd,
	instantCheckInTb: mockInstantCheckInTb,
}));

vi.mock('@/utils/trackerStats', () => ({
	getCachedTrackerStats: mockGetCachedTrackerStats,
	shouldIncludeTrackerStats: mockShouldIncludeTrackerStats,
}));

vi.mock('@/utils/parallelProcessor', () => ({
	processWithConcurrency: mockProcessWithConcurrency,
}));

const createSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
	title: overrides.title || 'Sample Torrent',
	fileSize: overrides.fileSize ?? 1024,
	hash: overrides.hash || 'hash-1',
	rdAvailable: overrides.rdAvailable ?? false,
	adAvailable: overrides.adAvailable ?? false,
	tbAvailable: overrides.tbAvailable ?? false,
	files: overrides.files ?? [],
	noVideos: overrides.noVideos ?? false,
	medianFileSize: overrides.medianFileSize ?? 1024,
	biggestFileSize: overrides.biggestFileSize ?? 1024,
	videoCount: overrides.videoCount ?? 1,
	trackerStats: overrides.trackerStats,
});

describe('useAvailabilityCheck', () => {
	const initialSearchResults = [createSearchResult(), createSearchResult({ hash: 'hash-2' })];
	let searchResults = [...initialSearchResults];
	const setSearchResults = vi.fn((updater) => {
		searchResults =
			typeof updater === 'function'
				? (updater as (prev: SearchResult[]) => SearchResult[])(searchResults)
				: updater;
	});
	const addRd = vi.fn();
	const addTb = vi.fn();
	const deleteRd = vi.fn();
	const deleteTb = vi.fn();
	const sortFn = vi.fn((results: SearchResult[]) => results);

	beforeEach(() => {
		vi.useFakeTimers();
		searchResults = [...initialSearchResults];
		setSearchResults.mockClear();
		addRd.mockReset();
		addTb.mockReset();
		deleteRd.mockReset();
		deleteTb.mockReset();
		sortFn.mockClear();
		mockToast.loading.mockClear();
		mockToast.success.mockClear();
		mockToast.error.mockClear();
		mockToast.dismiss.mockClear();
		mockGenerateTokenAndHash.mockResolvedValue(['token', 'hash']);
		mockInstantCheckInRd.mockResolvedValue(undefined);
		mockInstantCheckInTb.mockResolvedValue(undefined);
		mockShouldIncludeTrackerStats.mockReturnValue(true);
		mockGetCachedTrackerStats.mockResolvedValue({
			seeders: 2,
			leechers: 0,
			downloads: 10,
		});
		mockProcessWithConcurrency.mockImplementation(async (items, processor) => {
			const results = [];
			for (const item of items) {
				try {
					const result = await processor(item);
					results.push({ item, success: true, result });
				} catch (error) {
					results.push({ item, success: false, error });
				}
			}
			return results;
		});
		Object.defineProperty(window, 'location', {
			value: { reload: vi.fn() },
			writable: true,
		});
		Object.defineProperty(window, 'localStorage', {
			value: {
				store: new Map<string, string>(),
				getItem(key: string) {
					return this.store.get(key) ?? null;
				},
				setItem(key: string, value: string) {
					this.store.set(key, value);
				},
				removeItem(key: string) {
					this.store.delete(key);
				},
			},
			writable: true,
		});
		addRd.mockResolvedValue({
			id: 'rd-1',
			status: 'downloaded',
			progress: 100,
			links: [],
			files: [],
		});
		addTb.mockResolvedValue({ id: 'tb-1', download_finished: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const renderAvailabilityHook = () =>
		renderHook(() =>
			useAvailabilityCheck(
				'rd-key',
				'tb-key',
				'tt123',
				searchResults,
				setSearchResults,
				{},
				addRd,
				addTb,
				deleteRd,
				deleteTb,
				sortFn
			)
		);

	it('checks individual availability and triggers RD/TB refresh', async () => {
		const { result } = renderAvailabilityHook();

		await act(async () => {
			await result.current.handleCheckAvailability(searchResults[0]);
		});

		expect(addRd).toHaveBeenCalledWith('hash-1', true);
		expect(deleteRd).toHaveBeenCalled();
		expect(addTb).toHaveBeenCalledWith('hash-1', true);
		expect(mockInstantCheckInRd).toHaveBeenCalled();
		expect(mockInstantCheckInTb).toHaveBeenCalled();
		expect(mockToast.success).toHaveBeenCalledWith('Availability check done.', {
			id: 'toast-id',
		});
		vi.runAllTimers();
		expect(window.location.reload).toHaveBeenCalled();
	});

	it('runs bulk availability tests with limits and tracker stats', async () => {
		window.localStorage.setItem('settings:availabilityCheckLimit', '1');
		const { result } = renderAvailabilityHook();

		await act(async () => {
			await result.current.handleAvailabilityTest(searchResults);
		});

		expect(mockToast.loading).toHaveBeenCalled();
		expect(mockToastCall).toHaveBeenCalledWith(
			expect.stringContaining('Checking first 1 of 2'),
			expect.objectContaining({ duration: 4000 })
		);
		expect(addRd).toHaveBeenCalled();
		expect(addTb).toHaveBeenCalled();
		expect(mockGetCachedTrackerStats).toHaveBeenCalled();
		expect(mockToast.dismiss).toHaveBeenCalledWith('toast-id');
	});
});
