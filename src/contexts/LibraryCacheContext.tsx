import {
	EnhancedLibraryCacheProvider,
	useEnhancedLibraryCache,
} from '@/contexts/EnhancedLibraryCacheContext';
import { UserTorrent } from '@/torrent/userTorrent';
import { ReactNode } from 'react';

export interface LibraryCacheContextType {
	libraryItems: UserTorrent[];
	isLoading: boolean;
	isFetching: boolean;
	lastFetchTime: Date | null;
	error: string | null;
	refreshLibrary: () => Promise<void>;
	setLibraryItems: React.Dispatch<React.SetStateAction<UserTorrent[]>>;
	addTorrent: (torrent: UserTorrent) => void;
	removeTorrent: (torrentId: string) => void;
	updateTorrent: (torrentId: string, updates: Partial<UserTorrent>) => void;
}

// Provider stays the same name but delegates to the enhanced provider
export function LibraryCacheProvider({ children }: { children: ReactNode }) {
	return <EnhancedLibraryCacheProvider>{children}</EnhancedLibraryCacheProvider>;
}

// Hook keeps the same name/signature but adapts to the enhanced context
export function useLibraryCache(): LibraryCacheContextType {
	const enhanced = useEnhancedLibraryCache();

	const setLibraryItems: React.Dispatch<React.SetStateAction<UserTorrent[]>> = (next) => {
		const current = enhanced.libraryItems;
		const desired =
			typeof next === 'function'
				? (next as (p: UserTorrent[]) => UserTorrent[])(current)
				: next;

		const currentMap = new Map(current.map((t) => [t.id, t] as const));
		const desiredMap = new Map(desired.map((t) => [t.id, t] as const));

		// Remove items not present anymore
		for (const id of currentMap.keys()) {
			if (!desiredMap.has(id)) enhanced.removeTorrent(id);
		}
		// Add or update items
		for (const [id, t] of desiredMap.entries()) {
			if (!currentMap.has(id)) enhanced.addTorrent(t);
			else enhanced.updateTorrent(id, t);
		}
	};

	const refreshLibrary = async () => {
		// Legacy behavior: full refresh across all services
		await enhanced.refreshAll(true);
	};

	return {
		libraryItems: enhanced.libraryItems,
		isLoading: enhanced.syncStatus.isLoading,
		isFetching: enhanced.syncStatus.isSyncing,
		lastFetchTime: enhanced.stats.lastSync,
		error: enhanced.syncStatus.error,
		refreshLibrary,
		setLibraryItems,
		addTorrent: enhanced.addTorrent,
		removeTorrent: enhanced.removeTorrent,
		updateTorrent: enhanced.updateTorrent,
	};
}
