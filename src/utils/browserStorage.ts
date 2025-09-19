export const getLocalStorageItem = (key: string): string | null => {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
};

export const getLocalStorageItemOrDefault = (key: string, fallback: string): string => {
	const value = getLocalStorageItem(key);
	return value ?? fallback;
};

export const getLocalStorageBoolean = (key: string, fallback: boolean): boolean => {
	const value = getLocalStorageItem(key);
	if (value === null) return fallback;
	return value === 'true';
};
