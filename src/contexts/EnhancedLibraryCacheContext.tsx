/**
 * Enhanced Library Cache Context implementing Zurg's efficient patterns
 * Provides centralized library management with multi-level caching,
 * parallel fetching, and automatic state monitoring
 */

import { useAllDebridApiKey, useRealDebridAccessToken, useTorBoxAccessToken } from '@/hooks/auth';
import { CacheManager, getGlobalCache } from '@/services/cache/CacheManager';
import { FetchOptions, UnifiedLibraryFetcher } from '@/services/library/UnifiedLibraryFetcher';
import { UnifiedRateLimiter, getGlobalRateLimiter } from '@/services/rateLimit/UnifiedRateLimiter';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent } from '@/torrent/userTorrent';
import {
	ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react';
import toast from 'react-hot-toast';

interface LibraryStats {
	totalItems: number;
	rdItems: number;
	adItems: number;
	tbItems: number;
	lastSync: Date | null;
	cacheHitRate: number;
	averageFetchTime: number;
}

interface SyncStatus {
	isLoading: boolean;
	isSyncing: boolean;
	service: string | null;
	progress: number;
	total: number;
	error: string | null;
}

interface EnhancedLibraryCacheContextType {
	// Library data
	libraryItems: UserTorrent[];
	rdLibrary: UserTorrent[];
	adLibrary: UserTorrent[];
	tbLibrary: UserTorrent[];

	// Status and stats
	syncStatus: SyncStatus;
	stats: LibraryStats;

	// Actions
	refreshLibrary: (
		service?: 'realdebrid' | 'alldebrid' | 'torbox',
		force?: boolean
	) => Promise<void>;
	refreshAll: (force?: boolean) => Promise<void>;
	clearCache: (service?: string) => Promise<void>;

	// Individual item operations
	addTorrent: (torrent: UserTorrent) => void;
	removeTorrent: (torrentId: string) => void;
	updateTorrent: (torrentId: string, updates: Partial<UserTorrent>) => void;
}

const EnhancedLibraryCacheContext = createContext<EnhancedLibraryCacheContextType | undefined>(
	undefined
);

// Database instance
const torrentDB = new UserTorrentDB();

// Service instances (singletons)
let cacheManager: CacheManager;
let rateLimiter: UnifiedRateLimiter;
let libraryFetcher: UnifiedLibraryFetcher;

// Initialize services
function initializeServices() {
	if (!cacheManager) {
		cacheManager = getGlobalCache();
		rateLimiter = getGlobalRateLimiter();
		libraryFetcher = new UnifiedLibraryFetcher(cacheManager, rateLimiter);
	}
}

export function EnhancedLibraryCacheProvider({ children }: { children: ReactNode }) {
	// Authentication tokens
	const [rdKey, rdLoading] = useRealDebridAccessToken();
	const adKey = useAllDebridApiKey();
	const tbKey = useTorBoxAccessToken();

	// Library state
	const [libraryItems, setLibraryItems] = useState<UserTorrent[]>([]);
	const [rdLibrary, setRdLibrary] = useState<UserTorrent[]>([]);
	const [adLibrary, setAdLibrary] = useState<UserTorrent[]>([]);
	const [tbLibrary, setTbLibrary] = useState<UserTorrent[]>([]);

	// Auth state helper
	const hasAnyAuth = Boolean(rdKey || adKey || tbKey);

	// Sync status
	const [syncStatus, setSyncStatus] = useState<SyncStatus>({
		isLoading: true,
		isSyncing: false,
		service: null,
		progress: 0,
		total: 0,
		error: null,
	});

	// Statistics
	const [stats, setStats] = useState<LibraryStats>({
		totalItems: 0,
		rdItems: 0,
		adItems: 0,
		tbItems: 0,
		lastSync: null,
		cacheHitRate: 0,
		averageFetchTime: 0,
	});

	// Performance tracking
	const fetchTimesRef = useRef<number[]>([]);
	const cacheHitsRef = useRef({ hits: 0, misses: 0 });
	const dbSaveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Update statistics
	const updateStats = useCallback((torrents: UserTorrent[]) => {
		const rd = torrents.filter((t) => t.id.startsWith('rd:')).length;
		const ad = torrents.filter((t) => t.id.startsWith('ad:')).length;
		const tb = torrents.filter((t) => t.id.startsWith('tb:')).length;

		const cacheHitRate =
			cacheHitsRef.current.hits + cacheHitsRef.current.misses > 0
				? cacheHitsRef.current.hits /
					(cacheHitsRef.current.hits + cacheHitsRef.current.misses)
				: 0;

		const avgFetchTime =
			fetchTimesRef.current.length > 0
				? fetchTimesRef.current.reduce((a, b) => a + b, 0) / fetchTimesRef.current.length
				: 0;

		setStats({
			totalItems: torrents.length,
			rdItems: rd,
			adItems: ad,
			tbItems: tb,
			lastSync: new Date(),
			cacheHitRate: Math.round(cacheHitRate * 100),
			averageFetchTime: Math.round(avgFetchTime),
		});
	}, []);

	// Load existing data from IndexedDB to display while monitor initializes
	const loadExistingData = useCallback(async () => {
		try {
			// Load any existing data to show while monitor initializes
			const cachedTorrents = await torrentDB.all();
			if (cachedTorrents.length > 0) {
				setLibraryItems(cachedTorrents);

				// Separate by service
				const rd = cachedTorrents.filter((t) => t.id.startsWith('rd:'));
				const ad = cachedTorrents.filter((t) => t.id.startsWith('ad:'));
				const tb = cachedTorrents.filter((t) => t.id.startsWith('tb:'));

				setRdLibrary(rd);
				setAdLibrary(ad);
				setTbLibrary(tb);

				updateStats(cachedTorrents);
			}
		} catch (error) {
			console.error('Failed to load cached data:', error);
		} finally {
			setSyncStatus((prev) => ({ ...prev, isLoading: false }));
		}
	}, [updateStats]);

	// Initialize services on mount and restore cached data for display
	useEffect(() => {
		initializeServices();
		loadExistingData();

		return () => {
			if (dbSaveTimerRef.current) {
				clearTimeout(dbSaveTimerRef.current);
			}
		};
	}, [loadExistingData]);

	// Reset per-service libraries when tokens are cleared
	useEffect(() => {
		if (!rdKey || rdLoading) {
			setRdLibrary([]);
		}
	}, [rdKey, rdLoading]);

	useEffect(() => {
		if (!adKey) {
			setAdLibrary([]);
		}
	}, [adKey]);

	useEffect(() => {
		if (!tbKey) {
			setTbLibrary([]);
		}
	}, [tbKey]);

	// Update combined library
	const updateCombinedLibrary = useCallback(() => {
		const combined = [...rdLibrary, ...adLibrary, ...tbLibrary];

		// Skip noisy logs and DB work when unauthenticated and empty
		const shouldLogAndPersist = hasAnyAuth || combined.length > 0;
		if (shouldLogAndPersist) {
			console.log(
				`[LibraryCache] Updating combined library: RD:${rdLibrary.length}, AD:${adLibrary.length}, TB:${tbLibrary.length}, Total:${combined.length}`
			);
		}

		setLibraryItems(combined);

		// Debounce IndexedDB saves to avoid multiple writes in quick succession
		if (dbSaveTimerRef.current) {
			clearTimeout(dbSaveTimerRef.current);
		}

		if (shouldLogAndPersist) {
			dbSaveTimerRef.current = setTimeout(() => {
				console.log(`[LibraryCache] Saving ${combined.length} items to IndexedDB...`);
				const dbStart = Date.now();
				torrentDB.clear().then(() => {
					combined.forEach((torrent) => torrentDB.add(torrent));
					console.log(
						`[LibraryCache] IndexedDB save completed in ${Date.now() - dbStart}ms`
					);
				});
			}, 500); // Wait 500ms before saving to batch multiple updates
		}

		updateStats(combined);
	}, [rdLibrary, adLibrary, tbLibrary, updateStats, hasAnyAuth]);

	// Trigger combined library update when any service library changes
	useEffect(() => {
		updateCombinedLibrary();
	}, [rdLibrary, adLibrary, tbLibrary, updateCombinedLibrary]);

	// Refresh library for a specific service or all
	const refreshLibrary = async (
		service?: 'realdebrid' | 'alldebrid' | 'torbox',
		force: boolean = false
	) => {
		if (!service) {
			await refreshAll(force);
			return;
		}

		console.log(`[LibraryCache] Starting refresh for ${service}, force: ${force}`);

		setSyncStatus({
			isLoading: false,
			isSyncing: true,
			service,
			progress: 0,
			total: 0,
			error: null,
		});

		const startTime = Date.now();

		try {
			const options: FetchOptions = {
				forceRefresh: force,
				onProgress: (progress, total) => {
					setSyncStatus((prev) => ({
						...prev,
						progress,
						total,
					}));
				},
			};

			let token: string | undefined;
			switch (service) {
				case 'realdebrid':
					token = rdKey || undefined;
					break;
				case 'alldebrid':
					token = adKey || undefined;
					break;
				case 'torbox':
					token = tbKey || undefined;
					break;
			}

			if (!token) {
				throw new Error(`No token for ${service}`);
			}

			const torrents = await libraryFetcher.fetchLibrary(service, token, options);

			const fetchTime = Date.now() - startTime;
			fetchTimesRef.current.push(fetchTime);
			if (fetchTimesRef.current.length > 100) {
				fetchTimesRef.current.shift();
			}

			if (force) {
				cacheHitsRef.current.misses++;
			} else {
				cacheHitsRef.current.hits++;
			}

			switch (service) {
				case 'realdebrid':
					setRdLibrary(torrents);
					break;
				case 'alldebrid':
					setAdLibrary(torrents);
					break;
				case 'torbox':
					setTbLibrary(torrents);
					break;
			}

			toast.success(`${service} library refreshed (${torrents.length} items)`);
		} catch (error: any) {
			const errorTime = Date.now() - startTime;
			console.error(
				`[LibraryCache] Failed to refresh ${service} after ${errorTime}ms:`,
				error
			);
			setSyncStatus((prev) => ({
				...prev,
				error: error.message,
			}));
			toast.error(`Failed to refresh ${service}: ${error.message}`);
		} finally {
			console.log(`[LibraryCache] Refresh completed for ${service}`);
			setSyncStatus((prev) => ({
				...prev,
				isSyncing: false,
				service: null,
			}));
		}
	};

	// Refresh all services
	const refreshAll = async (force: boolean = false) => {
		const services: Array<['realdebrid' | 'alldebrid' | 'torbox', string | undefined]> = [
			['realdebrid', rdKey || undefined],
			['alldebrid', adKey || undefined],
			['torbox', tbKey || undefined],
		];

		for (const [service, token] of services) {
			if (token) {
				await refreshLibrary(service, force);
			}
		}
	};

	// Clear cache
	const clearCache = async (service?: string) => {
		if (service) {
			await libraryFetcher.clearCache(service);
		} else {
			await cacheManager.clear();
		}
		toast.success('Cache cleared');
	};

	// Individual item operations
	const addTorrent = (torrent: UserTorrent) => {
		setLibraryItems((prev) => [...prev, torrent]);
		// Adapt to current DB API
		torrentDB.add(torrent);

		// Add to service-specific library
		if (torrent.id.startsWith('rd:')) {
			setRdLibrary((prev) => [...prev, torrent]);
		} else if (torrent.id.startsWith('ad:')) {
			setAdLibrary((prev) => [...prev, torrent]);
		} else if (torrent.id.startsWith('tb:')) {
			setTbLibrary((prev) => [...prev, torrent]);
		}
	};

	const removeTorrent = (torrentId: string) => {
		setLibraryItems((prev) => prev.filter((t) => t.id !== torrentId));
		// Adapt to current DB API
		torrentDB.deleteById(torrentId);

		// Remove from service-specific library
		if (torrentId.startsWith('rd:')) {
			setRdLibrary((prev) => prev.filter((t) => t.id !== torrentId));
		} else if (torrentId.startsWith('ad:')) {
			setAdLibrary((prev) => prev.filter((t) => t.id !== torrentId));
		} else if (torrentId.startsWith('tb:')) {
			setTbLibrary((prev) => prev.filter((t) => t.id !== torrentId));
		}
	};

	const updateTorrent = (torrentId: string, updates: Partial<UserTorrent>) => {
		const updateFn = (prev: UserTorrent[]) =>
			prev.map((t) => (t.id === torrentId ? { ...t, ...updates } : t));

		setLibraryItems(updateFn);

		// Update service-specific library
		if (torrentId.startsWith('rd:')) {
			setRdLibrary(updateFn);
		} else if (torrentId.startsWith('ad:')) {
			setAdLibrary(updateFn);
		} else if (torrentId.startsWith('tb:')) {
			setTbLibrary(updateFn);
		}

		// Update in database
		const torrent = libraryItems.find((t) => t.id === torrentId);
		if (torrent) {
			// No explicit update method; re-add to replace existing
			torrentDB.add({ ...torrent, ...updates });
		}
	};

	const contextValue: EnhancedLibraryCacheContextType = {
		libraryItems,
		rdLibrary,
		adLibrary,
		tbLibrary,
		syncStatus,
		stats,
		refreshLibrary,
		refreshAll,
		clearCache,
		addTorrent,
		removeTorrent,
		updateTorrent,
	};

	return (
		<EnhancedLibraryCacheContext.Provider value={contextValue}>
			{children}
		</EnhancedLibraryCacheContext.Provider>
	);
}

export function useEnhancedLibraryCache() {
	const context = useContext(EnhancedLibraryCacheContext);
	if (!context) {
		throw new Error('useEnhancedLibraryCache must be used within EnhancedLibraryCacheProvider');
	}
	return context;
}
