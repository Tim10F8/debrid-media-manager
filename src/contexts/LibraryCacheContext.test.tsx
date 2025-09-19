import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefreshAll = vi.fn();
const mockAddTorrent = vi.fn();
const mockRemoveTorrent = vi.fn();
const mockUpdateTorrent = vi.fn();

const enhancedMock = {
	libraryItems: [],
	rdLibrary: [],
	adLibrary: [],
	tbLibrary: [],
	syncStatus: {
		isLoading: false,
		isSyncing: false,
		service: null,
		progress: 0,
		total: 0,
		error: null,
	},
	stats: {
		totalItems: 0,
		rdItems: 0,
		adItems: 0,
		tbItems: 0,
		lastSync: null as Date | null,
		cacheHitRate: 0,
		averageFetchTime: 0,
	},
	refreshAll: mockRefreshAll,
	refreshLibrary: vi.fn(),
	clearCache: vi.fn(),
	addTorrent: mockAddTorrent,
	removeTorrent: mockRemoveTorrent,
	updateTorrent: mockUpdateTorrent,
};

vi.mock('@/contexts/EnhancedLibraryCacheContext', () => ({
	EnhancedLibraryCacheProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	useEnhancedLibraryCache: () => enhancedMock,
}));

import { useLibraryCache } from './LibraryCacheContext';

function TestComponent() {
	const { lastFetchTime } = useLibraryCache();
	return <span>{lastFetchTime ? lastFetchTime.toISOString() : 'none'}</span>;
}

describe('useLibraryCache last fetch persistence', () => {
	const storageKey = 'library:lastSync';

	beforeEach(() => {
		vi.clearAllMocks();
		enhancedMock.stats.lastSync = null;
		localStorage.clear();
	});

	it('returns persisted last sync when context provides none', () => {
		const storedIso = new Date('2024-01-01T00:00:00.000Z').toISOString();
		localStorage.setItem(storageKey, storedIso);

		render(<TestComponent />);

		expect(screen.getByText(storedIso)).toBeInTheDocument();
	});

	it('stores new last sync updates to localStorage', async () => {
		const newSync = new Date('2024-02-01T12:00:00.000Z');

		const { rerender } = render(<TestComponent />);

		enhancedMock.stats.lastSync = newSync;
		rerender(<TestComponent />);

		await waitFor(() => {
			expect(localStorage.getItem(storageKey)).toBe(newSync.toISOString());
		});

		expect(screen.getByText(newSync.toISOString())).toBeInTheDocument();
	});

	it('responds to storage events from other tabs', async () => {
		render(<TestComponent />);

		const nextSync = new Date('2024-03-05T08:30:00.000Z');
		act(() => {
			window.dispatchEvent(
				new StorageEvent('storage', {
					key: storageKey,
					newValue: nextSync.toISOString(),
				})
			);
		});

		await waitFor(() => {
			expect(screen.getByText(nextSync.toISOString())).toBeInTheDocument();
		});
	});
});
