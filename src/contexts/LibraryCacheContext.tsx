import { useAllDebridApiKey, useRealDebridAccessToken } from '@/hooks/auth';
import { getMagnetStatus } from '@/services/allDebrid';
import { getUserTorrentsList } from '@/services/realDebrid';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent } from '@/torrent/userTorrent';
import { fetchLatestADTorrents, fetchLatestRDTorrents } from '@/utils/libraryFetching';
import {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react';

interface LibraryCacheContextType {
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

interface LibraryState {
	rdTotalCount: number;
	rdFirstTorrentId: string | null;
	adTotalCount: number;
	adFirstMagnetId: number | null;
	timestamp: number;
}

const LibraryCacheContext = createContext<LibraryCacheContextType | undefined>(undefined);

const torrentDB = new UserTorrentDB();

const LAST_FETCH_KEY = 'library_last_fetch_time';
const LIBRARY_STATE_KEY = 'library_state_snapshot';
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function LibraryCacheProvider({ children }: { children: ReactNode }) {
	const [libraryItems, setLibraryItems] = useState<UserTorrent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isFetching, setIsFetching] = useState(false);
	const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [rdSyncing, setRdSyncing] = useState(false);
	const [adSyncing, setAdSyncing] = useState(false);
	const [selectedTorrents, setSelectedTorrents] = useState<Set<string>>(new Set());
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastLibraryState = useRef<LibraryState | null>(null);

	const [rdKey] = useRealDebridAccessToken();
	const adKey = useAllDebridApiKey();

	// Load last fetch time and state from localStorage
	useEffect(() => {
		const storedTime = localStorage.getItem(LAST_FETCH_KEY);
		if (storedTime) {
			setLastFetchTime(new Date(storedTime));
		}

		const storedState = localStorage.getItem(LIBRARY_STATE_KEY);
		if (storedState) {
			try {
				lastLibraryState.current = JSON.parse(storedState);
			} catch (e) {
				console.error('Failed to parse stored library state:', e);
			}
		}
	}, []);

	// Get current library state (lightweight check like Zurg)
	const getCurrentLibraryState = useCallback(async (): Promise<LibraryState | null> => {
		const state: LibraryState = {
			rdTotalCount: 0,
			rdFirstTorrentId: null,
			adTotalCount: 0,
			adFirstMagnetId: null,
			timestamp: Date.now(),
		};

		try {
			// Check RealDebrid state (just get first page with 1 item)
			if (rdKey) {
				const { data, totalCount } = await getUserTorrentsList(rdKey, 1, 1);
				state.rdTotalCount = totalCount || 0;
				state.rdFirstTorrentId = data.length > 0 ? data[0].id : null;
			}

			// Check AllDebrid state (just get status)
			if (adKey) {
				const magnetStatus = await getMagnetStatus(adKey);
				if (magnetStatus?.data?.magnets) {
					state.adTotalCount = magnetStatus.data.magnets.length;
					state.adFirstMagnetId =
						magnetStatus.data.magnets.length > 0
							? magnetStatus.data.magnets[0].id
							: null;
				}
			}

			return state;
		} catch (error) {
			console.error('Failed to get library state:', error);
			return null;
		}
	}, [rdKey, adKey]);

	// Check if library state has changed
	const hasLibraryChanged = useCallback(
		(oldState: LibraryState | null, newState: LibraryState | null): boolean => {
			if (!oldState || !newState) return true;

			// Check RealDebrid changes
			if (oldState.rdTotalCount !== newState.rdTotalCount) {
				console.log(
					`Library change detected: RD count changed from ${oldState.rdTotalCount} to ${newState.rdTotalCount}`
				);
				return true;
			}
			if (oldState.rdFirstTorrentId !== newState.rdFirstTorrentId) {
				console.log(
					`Library change detected: RD first torrent changed from ${oldState.rdFirstTorrentId} to ${newState.rdFirstTorrentId}`
				);
				return true;
			}

			// Check AllDebrid changes
			if (oldState.adTotalCount !== newState.adTotalCount) {
				console.log(
					`Library change detected: AD count changed from ${oldState.adTotalCount} to ${newState.adTotalCount}`
				);
				return true;
			}
			if (oldState.adFirstMagnetId !== newState.adFirstMagnetId) {
				console.log(
					`Library change detected: AD first magnet changed from ${oldState.adFirstMagnetId} to ${newState.adFirstMagnetId}`
				);
				return true;
			}

			return false;
		},
		[]
	);

	// Full fetch from services (but still uses cache strategy internally)
	const fetchFromServices = useCallback(
		async (forceRefresh: boolean = false) => {
			if (!rdKey && !adKey) {
				setIsLoading(false);
				setError('No debrid service configured');
				return;
			}

			// Prevent multiple simultaneous fetches
			if (isFetching) return;

			// Clear any pending retry
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

			// Set fetching flag immediately
			setIsFetching(true);
			setError(null);

			try {
				// Load from local DB first for immediate display
				const localLibrary = await torrentDB.all();
				if (localLibrary.length > 0) {
					setLibraryItems(localLibrary);
					setIsLoading(false);
				}

				// Fetch from RealDebrid
				if (rdKey) {
					setRdSyncing(true);
					await fetchLatestRDTorrents(
						rdKey,
						torrentDB,
						setLibraryItems,
						setIsLoading,
						setRdSyncing,
						setSelectedTorrents,
						undefined, // customLimit
						forceRefresh
					);
				}

				// Fetch from AllDebrid
				if (adKey) {
					setAdSyncing(true);
					await fetchLatestADTorrents(
						adKey,
						torrentDB,
						setLibraryItems,
						setIsLoading,
						setAdSyncing,
						setSelectedTorrents,
						undefined, // customLimit
						forceRefresh
					);
				}

				// Update state after successful fetch
				const newState = await getCurrentLibraryState();
				if (newState) {
					lastLibraryState.current = newState;
					localStorage.setItem(LIBRARY_STATE_KEY, JSON.stringify(newState));
				}

				const now = new Date();
				setLastFetchTime(now);
				localStorage.setItem(LAST_FETCH_KEY, now.toISOString());
				retryCountRef.current = 0; // Reset retry count on success
			} catch (error) {
				console.error('Failed to fetch library:', error);
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error occurred';
				setError(errorMessage);

				// Retry logic with exponential backoff
				// Only retry for network errors, not for service configuration issues
				const isNetworkError =
					error instanceof Error &&
					(error.message.includes('fetch') ||
						error.message.includes('network') ||
						error.message.includes('timeout'));

				if (isNetworkError && retryCountRef.current < 3) {
					retryCountRef.current++;
					const retryDelay = Math.pow(2, retryCountRef.current) * 1000; // 2s, 4s, 8s
					console.log(
						`Retrying fetch (attempt ${retryCountRef.current}/3) in ${retryDelay}ms`
					);
					retryTimeoutRef.current = setTimeout(() => {
						retryTimeoutRef.current = null;
						fetchFromServices(forceRefresh);
					}, retryDelay);
				}
			} finally {
				setIsFetching(false);
				setIsLoading(false);
			}
		},
		[rdKey, adKey, isFetching, getCurrentLibraryState]
	);

	// Smart refresh with change detection (for auto-refresh)
	const smartRefresh = useCallback(async () => {
		if (isFetching) return;

		// Check if library has changed using lightweight state check
		const currentState = await getCurrentLibraryState();

		if (!hasLibraryChanged(lastLibraryState.current, currentState)) {
			console.log('No library changes detected, skipping refresh');
			return;
		}

		console.log('Library changes detected, performing full refresh');
		await fetchFromServices(false);
	}, [isFetching, getCurrentLibraryState, hasLibraryChanged, fetchFromServices]);

	// Manual refresh (always does full refresh)
	const refreshLibrary = useCallback(async () => {
		// Debounce refresh requests
		if (isFetching) return;
		await fetchFromServices(true);
	}, [fetchFromServices, isFetching]);

	// Optimistic update functions
	const addTorrent = useCallback((torrent: UserTorrent) => {
		setLibraryItems((prev) => [...prev, torrent]);
		torrentDB.add(torrent).catch(console.error);
	}, []);

	const removeTorrent = useCallback((torrentId: string) => {
		setLibraryItems((prev) => prev.filter((t) => t.id !== torrentId));
		torrentDB.deleteById(torrentId).catch(console.error);
	}, []);

	const updateTorrent = useCallback((torrentId: string, updates: Partial<UserTorrent>) => {
		setLibraryItems((prev) => prev.map((t) => (t.id === torrentId ? { ...t, ...updates } : t)));
	}, []);

	// Auto-refresh logic with smart change detection (every 5 minutes)
	useEffect(() => {
		// Set up interval for auto-refresh every 5 minutes
		const intervalId = setInterval(() => {
			smartRefresh();
		}, AUTO_REFRESH_INTERVAL);

		return () => {
			clearInterval(intervalId);
		};
	}, [smartRefresh]);

	// Initial load - skip if cache is fresh (< 10 minutes old)
	useEffect(() => {
		const storedTime = localStorage.getItem(LAST_FETCH_KEY);
		if (storedTime) {
			const lastFetch = new Date(storedTime);
			const timeSinceLastFetch = Date.now() - lastFetch.getTime();
			const tenMinutes = 10 * 60 * 1000; // 10 minutes in milliseconds

			// If cache is less than 10 minutes old and we have items, skip refresh
			if (timeSinceLastFetch < tenMinutes) {
				// Just load from local DB without fetching from services
				torrentDB.all().then((localLibrary) => {
					if (localLibrary.length > 0) {
						setLibraryItems(localLibrary);
						setIsLoading(false);
						setLastFetchTime(lastFetch);
						return;
					}
					// If no local items, fetch anyway
					fetchFromServices(true);
				});
				return;
			}
		}
		// Cache is stale or doesn't exist, fetch from services
		fetchFromServices(true);
	}, [fetchFromServices]);

	// Check network status and retry on reconnection
	useEffect(() => {
		const handleOnline = () => {
			if (error && !isFetching) {
				fetchFromServices(true);
			}
		};

		window.addEventListener('online', handleOnline);
		return () => {
			window.removeEventListener('online', handleOnline);
			// Clear any pending retry on unmount
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
		};
	}, [error, isFetching, fetchFromServices]);

	return (
		<LibraryCacheContext.Provider
			value={{
				libraryItems,
				isLoading,
				isFetching,
				lastFetchTime,
				error,
				refreshLibrary,
				setLibraryItems,
				addTorrent,
				removeTorrent,
				updateTorrent,
			}}
		>
			{children}
		</LibraryCacheContext.Provider>
	);
}

export function useLibraryCache() {
	const context = useContext(LibraryCacheContext);
	if (context === undefined) {
		throw new Error('useLibraryCache must be used within a LibraryCacheProvider');
	}
	return context;
}
