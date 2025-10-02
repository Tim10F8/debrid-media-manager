class LocalStorageMock {
	private store: Record<string, string> = {};
	private listeners: Array<
		(key: string, oldValue: string | null, newValue: string | null) => void
	> = [];

	getItem(key: string): string | null {
		return this.store[key] || null;
	}

	setItem(key: string, value: string): void {
		const oldValue = this.store[key] || null;
		this.store[key] = value;
		this.listeners.forEach((listener) => listener(key, oldValue, value));
	}

	removeItem(key: string): void {
		const oldValue = this.store[key] || null;
		delete this.store[key];
		this.listeners.forEach((listener) => listener(key, oldValue, null));
	}

	clear(): void {
		this.store = {};
	}

	key(index: number): string | null {
		const keys = Object.keys(this.store);
		return keys[index] || null;
	}

	get length(): number {
		return Object.keys(this.store).length;
	}

	addEventListener(
		callback: (key: string, oldValue: string | null, newValue: string | null) => void
	): void {
		this.listeners.push(callback);
	}

	removeEventListener(
		callback: (key: string, oldValue: string | null, newValue: string | null) => void
	): void {
		const index = this.listeners.indexOf(callback);
		if (index > -1) {
			this.listeners.splice(index, 1);
		}
	}

	// Helper for testing
	_clear(): void {
		this.store = {};
		this.listeners = [];
	}

	_getAll(): Record<string, string> {
		return { ...this.store };
	}
}

export function setupLocalStorageMock(): void {
	if (typeof window !== 'undefined') {
		Object.defineProperty(window, 'localStorage', {
			value: new LocalStorageMock(),
			writable: true,
		});
	}
}

export function getLocalStorageMock(): LocalStorageMock {
	if (typeof window === 'undefined') {
		return new LocalStorageMock();
	}
	return window.localStorage as LocalStorageMock;
}
