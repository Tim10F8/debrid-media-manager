import { getLocalStorageMock, setupLocalStorageMock } from '@/test/utils/localStorage';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useLocalStorage from './localStorage';

describe('useLocalStorage', () => {
	beforeEach(() => {
		setupLocalStorageMock();
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		getLocalStorageMock()._clear();
	});

	it('should return default value when localStorage is empty', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 'default-value'));

		expect(result.current[0]).toBe('default-value');
	});

	it('should return null when no default value is provided', () => {
		const { result } = renderHook(() => useLocalStorage('test-key'));

		expect(result.current[0]).toBeNull();
	});

	it('should return existing value from localStorage', () => {
		const localStorageMock = getLocalStorageMock();
		localStorageMock.setItem('test-key', JSON.stringify('existing-value'));

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(result.current[0]).toBe('existing-value');
	});

	it('should save value to localStorage when set', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		act(() => {
			result.current[1]('new-value');
		});

		const localStorageMock = getLocalStorageMock();
		expect(localStorageMock.getItem('test-key')).toBe(JSON.stringify('new-value'));
		expect(result.current[0]).toBe('new-value');
	});

	it('should handle function updater', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 0));

		act(() => {
			result.current[1]((prev) => (prev as number) + 1);
		});

		expect(result.current[0]).toBe(1);
	});

	it('should save with expiry when expiry time is provided', () => {
		const { result } = renderHook(() => useLocalStorage<string>('test-key', null));

		act(() => {
			result.current[1]('expiring-value', 3600); // 1 hour
		});

		const localStorageMock = getLocalStorageMock();
		const stored = JSON.parse(localStorageMock.getItem('test-key')!);

		expect(stored.value).toBe('expiring-value');
		expect(stored.expiry).toBeGreaterThan(Date.now());
	});

	it('should handle null values correctly', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		// Set value to null
		act(() => {
			result.current[1](null);
		});

		const localStorageMock = getLocalStorageMock();
		// When localStorage starts empty and null is set, nothing is saved to localStorage
		expect(localStorageMock.getItem('test-key')).toBeNull();
		// The state reverts to the default due to the useEffect syncing
		expect(result.current[0]).toBe('default');
	});

	it('should return default value for expired items', () => {
		const localStorageMock = getLocalStorageMock();
		const expiredItem = {
			value: 'expired-value',
			expiry: Date.now() - 1000, // 1 second ago
		};
		localStorageMock.setItem('test-key', JSON.stringify(expiredItem));

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(result.current[0]).toBe('default');
		expect(localStorageMock.getItem('test-key')).toBeNull(); // Should be removed
	});

	it('should handle non-expiring items correctly', () => {
		const localStorageMock = getLocalStorageMock();
		localStorageMock.setItem('test-key', JSON.stringify('plain-value'));

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(result.current[0]).toBe('plain-value');
	});

	it('should handle invalid JSON in localStorage', () => {
		const localStorageMock = getLocalStorageMock();
		localStorageMock.setItem('test-key', 'invalid-json{');

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(result.current[0]).toBe('default');
		expect(console.error).toHaveBeenCalledWith(
			'Error reading localStorage key "test-key": ',
			expect.any(Error)
		);
	});

	it('should handle localStorage read errors', () => {
		const localStorageMock = getLocalStorageMock();
		const originalGetItem = localStorageMock.getItem;
		localStorageMock.getItem = vi.fn(() => {
			throw new Error('Storage access denied');
		});

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(result.current[0]).toBe('default');
		expect(console.error).toHaveBeenCalledWith(
			'Error reading localStorage key "test-key": ',
			expect.any(Error)
		);

		localStorageMock.getItem = originalGetItem;
	});

	it('should sync with storage events from other tabs', () => {
		const { result, rerender } = renderHook(() => useLocalStorage('test-key', 'default'));

		// Simulate storage event from another tab
		act(() => {
			const localStorageMock = getLocalStorageMock();
			localStorageMock.setItem('test-key', JSON.stringify('updated-from-other-tab'));

			// Manually trigger storage event
			window.dispatchEvent(
				new StorageEvent('storage', {
					key: 'test-key',
					newValue: JSON.stringify('updated-from-other-tab'),
					oldValue: JSON.stringify('default'),
				})
			);
		});

		expect(result.current[0]).toBe('updated-from-other-tab');
	});

	it('should handle storage events with null key (clear all)', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

		act(() => {
			window.dispatchEvent(
				new StorageEvent('storage', {
					key: null,
				})
			);
		});

		expect(result.current[0]).toBe('initial'); // Should return to default
	});

	it('should handle custom local-storage events', () => {
		const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

		act(() => {
			window.dispatchEvent(
				new CustomEvent('local-storage', {
					detail: { key: 'test-key' },
				})
			);
		});

		expect(result.current[0]).toBe('initial');
	});

	it('should ignore storage events for other keys', () => {
		const localStorageMock = getLocalStorageMock();
		localStorageMock.setItem('test-key', JSON.stringify('original-value'));

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		act(() => {
			window.dispatchEvent(
				new StorageEvent('storage', {
					key: 'other-key',
					newValue: JSON.stringify('other-value'),
				})
			);
		});

		expect(result.current[0]).toBe('original-value');
	});

	it('should clean up event listeners on unmount', () => {
		const addSpy = vi.spyOn(window, 'addEventListener');
		const removeSpy = vi.spyOn(window, 'removeEventListener');

		const { unmount } = renderHook(() => useLocalStorage('test-key', 'default'));

		expect(addSpy).toHaveBeenCalledWith('storage', expect.any(Function));
		expect(addSpy).toHaveBeenCalledWith('local-storage', expect.any(Function));

		unmount();

		expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith('local-storage', expect.any(Function));
	});

	it('should handle StorageEvent constructor errors gracefully', () => {
		const originalStorageEvent = global.StorageEvent;
		// @ts-ignore - Simulate environment that doesn't support StorageEvent
		global.StorageEvent = vi.fn(() => {
			throw new Error('StorageEvent not supported');
		});

		const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

		// Should not throw when setting value
		act(() => {
			result.current[1]('test-value');
		});

		expect(result.current[0]).toBe('test-value');

		global.StorageEvent = originalStorageEvent;
	});
});
