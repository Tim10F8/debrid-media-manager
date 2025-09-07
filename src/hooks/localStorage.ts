import { useEffect, useState } from 'react';

type ExpirableValue<T> = {
	value: T;
	expiry: number;
};

function useLocalStorage<T>(
	key: string,
	defaultValue: T | null = null
): [T | null, (newValue: T | ((prevState: T | null) => T), expiryTimeInSecs?: number) => void] {
	const [storedValue, setStoredValue] = useState<T | null>(() => {
		if (typeof window === 'undefined') {
			// Running on the server, return the default value
			return defaultValue;
		}

		try {
			const item = window.localStorage.getItem(key);
			if (item) {
				const parsedItem = JSON.parse(item);
				if (isExpirableValue(parsedItem)) {
					if (parsedItem.expiry >= Date.now()) {
						return parsedItem.value;
					} else {
						window.localStorage.removeItem(key);
						return defaultValue;
					}
				}
				return parsedItem;
			}
		} catch (error) {
			console.error('Error reading localStorage key "' + key + '": ', error);
			return defaultValue;
		}
		return defaultValue;
	});

	const setValue = (newValue: T | ((prevState: T | null) => T), expiryTimeInSecs?: number) => {
		const valueToStore: T = newValue instanceof Function ? newValue(storedValue) : newValue;

		setStoredValue(valueToStore);

		if (expiryTimeInSecs) {
			const expiryDate = Date.now() + expiryTimeInSecs * 1000;
			const expirableValue: ExpirableValue<T> = {
				value: valueToStore,
				expiry: expiryDate,
			};
			window.localStorage.setItem(key, JSON.stringify(expirableValue));
		} else if (valueToStore !== null) {
			window.localStorage.setItem(key, JSON.stringify(valueToStore));
		}

		// Notify other hook instances in this tab and across tabs
		try {
			const newRawValue = window.localStorage.getItem(key);
			// Dispatch native storage event (won't normally fire in same tab, so we dispatch manually)
			window.dispatchEvent(
				new StorageEvent('storage', {
					key,
					newValue: newRawValue,
				})
			);
			// Also dispatch a custom event as a fallback for environments that restrict StorageEvent
			window.dispatchEvent(
				new CustomEvent('local-storage', {
					detail: { key },
				})
			);
		} catch (e) {
			// Best-effort; ignore if environment blocks constructing StorageEvent
		}
	};

	// Sync state when localStorage changes (same-tab via custom event or other tabs via storage event)
	useEffect(() => {
		const readAndSet = () => {
			try {
				const item = window.localStorage.getItem(key);
				if (item) {
					const parsedItem = JSON.parse(item);
					if (isExpirableValue<T>(parsedItem)) {
						if (parsedItem.expiry >= Date.now()) {
							setStoredValue(parsedItem.value as T);
						} else {
							window.localStorage.removeItem(key);
							setStoredValue(defaultValue);
						}
						return;
					}
					setStoredValue(parsedItem as T);
				} else {
					setStoredValue(defaultValue);
				}
			} catch (error) {
				console.error('Error reading localStorage key "' + key + '": ', error);
				setStoredValue(defaultValue);
			}
		};

		const handleStorage = (e: StorageEvent) => {
			if (e.key === null || e.key === key) {
				readAndSet();
			}
		};
		const handleCustom = (e: Event) => {
			const detail = (e as CustomEvent).detail as { key?: string } | undefined;
			if (!detail || detail.key === key) {
				readAndSet();
			}
		};

		window.addEventListener('storage', handleStorage);
		window.addEventListener('local-storage', handleCustom as EventListener);
		return () => {
			window.removeEventListener('storage', handleStorage);
			window.removeEventListener('local-storage', handleCustom as EventListener);
		};
	}, [key, defaultValue]);

	return [storedValue, setValue];
}

function isExpirableValue<T>(value: any): value is ExpirableValue<T> {
	return typeof value === 'object' && value !== null && 'expiry' in value && 'value' in value;
}

export default useLocalStorage;
