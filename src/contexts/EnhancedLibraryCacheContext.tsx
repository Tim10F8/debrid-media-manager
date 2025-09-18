/**
 * Enhanced Library Cache Context implementing Zurg's efficient patterns
 * Provides centralized library management with multi-level caching,
 * parallel fetching, and automatic state monitoring
 */

import { useAllDebridApiKey, useRealDebridAccessToken, useTorBoxAccessToken } from '@/hooks/auth';
import { CacheManager, getGlobalCache } from '@/services/cache/CacheManager';
import { FetchOptions, UnifiedLibraryFetcher } from '@/services/library/UnifiedLibraryFetcher';
import { LibraryMonitor, MonitorConfig, ServiceConfig } from '@/services/monitor/LibraryMonitor';
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
	lastChange: Date | null;
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

	// Monitoring control
	setAutoRefresh: (enabled: boolean) => void;
	setRefreshInterval: (minutes: number) => void;
	getMonitoringStatus: () => any;
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
let libraryMonitor: LibraryMonitor;

// Initialize services
function initializeServices() {
	if (!cacheManager) {
		cacheManager = getGlobalCache();
		rateLimiter = getGlobalRateLimiter();
		libraryFetcher = new UnifiedLibraryFetcher(cacheManager, rateLimiter);
		libraryMonitor = new LibraryMonitor(libraryFetcher, cacheManager);
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
		lastChange: null,
		cacheHitRate: 0,
		averageFetchTime: 0,
	});

	// Monitoring configuration
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [refreshInterval, setRefreshIntervalState] = useState(5); // minutes

	// Performance tracking
	const fetchTimesRef = useRef<number[]>([]);
	const cacheHitsRef = useRef({ hits: 0, misses: 0 });

	// Initialize services on mount
	useEffect(() => {
		initializeServices();

		// Configure monitor
		const monitorConfig: Partial<MonitorConfig> = {
			checkInterval: 30 * 1000, // 30 seconds
			refreshInterval: refreshInterval * 60 * 1000,
			enableAutoRefresh: autoRefresh,
			enableChangeDetection: true,
		};
		libraryMonitor.updateConfig(monitorConfig);

		// Set up event listeners
		libraryMonitor.addEventListener((event) => {
			switch (event.type) {
				case 'change_detected':
					console.log(`[Monitor] Change detected in ${event.service}`);
					setStats((prev) => ({ ...prev, lastChange: new Date() }));
					break;
				case 'refresh_complete':
					console.log(`[Monitor] Refresh complete for ${event.service}`, event.data);
					handleMonitorRefresh(event.service);
					break;
				case 'error':
					console.error(`[Monitor] Error in ${event.service}:`, event.error);
					toast.error(`Error monitoring ${event.service}: ${event.error?.message}`);
					break;
			}
		});

		// Load any existing data from IndexedDB to display while services initialize
		loadExistingData();

		return () => {
			// Cleanup on unmount
			if (dbSaveTimerRef.current) {
				clearTimeout(dbSaveTimerRef.current);
			}
			libraryMonitor.stop();
		};
	}, []);

	// Track registered services to prevent duplicate registrations
	const registeredServicesRef = useRef<Set<string>>(new Set());

	// Register services when tokens change - monitor handles auto-initialization
	useEffect(() => {
		if (rdKey && !rdLoading) {
			// Check if already registered with same token
			const serviceKey = `realdebrid:${rdKey}`;
			if (registeredServicesRef.current.has(serviceKey)) {
				return; // Already registered with this token
			}

			const config: ServiceConfig = {
				service: 'realdebrid',
				token: rdKey,
				enabled: true,
				priority: 1,
			};

			// Mark as registered before calling async register
			registeredServicesRef.current.add(serviceKey);

			// Monitor will auto-refresh if data is missing/stale
			libraryMonitor.registerService(config);

			// Subscribe to changes
			const unsubscribe = libraryMonitor.onServiceChange('realdebrid', () => {
				const data = libraryMonitor.getLibraryData('realdebrid');
				if (data) {
					console.log(`[LibraryCache] RD service change callback: ${data.length} items`);
					setRdLibrary(data);
					// updateCombinedLibrary will be called automatically via useCallback dependency
				}
			});

			return () => {
				// Cleanup on token change or unmount
				registeredServicesRef.current.delete(serviceKey);
				unsubscribe();
			};
		} else {
			// Clear registration tracking for realdebrid
			Array.from(registeredServicesRef.current)
				.filter((key) => key.startsWith('realdebrid:'))
				.forEach((key) => registeredServicesRef.current.delete(key));
			libraryMonitor.unregisterService('realdebrid');
			setRdLibrary([]);
		}
	}, [rdKey, rdLoading]);

	useEffect(() => {
		if (adKey) {
			// Check if already registered with same token
			const serviceKey = `alldebrid:${adKey}`;
			if (registeredServicesRef.current.has(serviceKey)) {
				return; // Already registered with this token
			}

			const config: ServiceConfig = {
				service: 'alldebrid',
				token: adKey,
				enabled: true,
				priority: 2,
			};

			// Mark as registered before calling async register
			registeredServicesRef.current.add(serviceKey);

			// Monitor will auto-refresh if data is missing/stale
			libraryMonitor.registerService(config);

			const unsubscribe = libraryMonitor.onServiceChange('alldebrid', () => {
				const data = libraryMonitor.getLibraryData('alldebrid');
				if (data) {
					console.log(`[LibraryCache] AD service change callback: ${data.length} items`);
					setAdLibrary(data);
					// updateCombinedLibrary will be called automatically via useCallback dependency
				}
			});

			return () => {
				// Cleanup on token change or unmount
				registeredServicesRef.current.delete(serviceKey);
				unsubscribe();
			};
		} else {
			// Clear registration tracking for alldebrid
			Array.from(registeredServicesRef.current)
				.filter((key) => key.startsWith('alldebrid:'))
				.forEach((key) => registeredServicesRef.current.delete(key));
			libraryMonitor.unregisterService('alldebrid');
			setAdLibrary([]);
		}
	}, [adKey]);

	useEffect(() => {
		if (tbKey) {
			// Check if already registered with same token
			const serviceKey = `torbox:${tbKey}`;
			if (registeredServicesRef.current.has(serviceKey)) {
				return; // Already registered with this token
			}

			const config: ServiceConfig = {
				service: 'torbox',
				token: tbKey,
				enabled: true,
				priority: 3,
			};

			// Mark as registered before calling async register
			registeredServicesRef.current.add(serviceKey);

			// Monitor will auto-refresh if data is missing/stale
			libraryMonitor.registerService(config);

			const unsubscribe = libraryMonitor.onServiceChange('torbox', () => {
				const data = libraryMonitor.getLibraryData('torbox');
				if (data) {
					console.log(`[LibraryCache] TB service change callback: ${data.length} items`);
					setTbLibrary(data);
					// updateCombinedLibrary will be called automatically via useCallback dependency
				}
			});

			return () => {
				// Cleanup on token change or unmount
				registeredServicesRef.current.delete(serviceKey);
				unsubscribe();
			};
		} else {
			// Clear registration tracking for torbox
			Array.from(registeredServicesRef.current)
				.filter((key) => key.startsWith('torbox:'))
				.forEach((key) => registeredServicesRef.current.delete(key));
			libraryMonitor.unregisterService('torbox');
			setTbLibrary([]);
		}
	}, [tbKey]);

	// Start/stop monitoring based on configuration
	useEffect(() => {
		if (autoRefresh && (rdKey || adKey || tbKey)) {
			libraryMonitor.start();
		} else {
			libraryMonitor.stop();
		}
	}, [autoRefresh, rdKey, adKey, tbKey]);

	// Update refresh interval
	useEffect(() => {
		libraryMonitor.updateConfig({
			refreshInterval: refreshInterval * 60 * 1000,
		});
	}, [refreshInterval]);

	// Load existing data from IndexedDB to display while monitor initializes
	const loadExistingData = async () => {
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
	};

	// Handle monitor refresh events
	const handleMonitorRefresh = (service: string) => {
		console.log(`[LibraryCache] Handling monitor refresh event for ${service}`);
		const data = libraryMonitor.getLibraryData(service);
		if (!data) {
			console.warn(`[LibraryCache] No data available from monitor for ${service}`);
			return;
		}

		console.log(`[LibraryCache] Monitor provided ${data.length} items for ${service}`);

		// Update service-specific library
		switch (service) {
			case 'realdebrid':
				console.log(
					`[LibraryCache] Updating RD library from monitor: ${data.length} items`
				);
				setRdLibrary(data);
				break;
			case 'alldebrid':
				console.log(
					`[LibraryCache] Updating AD library from monitor: ${data.length} items`
				);
				setAdLibrary(data);
				break;
			case 'torbox':
				console.log(
					`[LibraryCache] Updating TB library from monitor: ${data.length} items`
				);
				setTbLibrary(data);
				break;
		}

		// updateCombinedLibrary will be called automatically via useCallback dependency

		// Update stats
		setStats((prev) => ({
			...prev,
			lastSync: new Date(),
			[`${service.substring(0, 2)}Items`]: data.length,
		}));
	};

	// Debounce timer ref for IndexedDB saves
	const dbSaveTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

	// Update combined library
	const updateCombinedLibrary = useCallback(() => {
		const combined = [...rdLibrary, ...adLibrary, ...tbLibrary];
		console.log(
			`[LibraryCache] Updating combined library: RD:${rdLibrary.length}, AD:${adLibrary.length}, TB:${tbLibrary.length}, Total:${combined.length}`
		);

		setLibraryItems(combined);

		// Debounce IndexedDB saves to avoid multiple writes in quick succession
		if (dbSaveTimerRef.current) {
			clearTimeout(dbSaveTimerRef.current);
		}

		dbSaveTimerRef.current = setTimeout(() => {
			console.log(`[LibraryCache] Saving ${combined.length} items to IndexedDB...`);
			const dbStart = Date.now();
			torrentDB.clear().then(() => {
				combined.forEach((torrent) => torrentDB.add(torrent));
				console.log(`[LibraryCache] IndexedDB save completed in ${Date.now() - dbStart}ms`);
			});
		}, 500); // Wait 500ms before saving to batch multiple updates

		updateStats(combined);
	}, [rdLibrary, adLibrary, tbLibrary]);

	// Trigger combined library update when any service library changes
	useEffect(() => {
		updateCombinedLibrary();
	}, [rdLibrary, adLibrary, tbLibrary, updateCombinedLibrary]);

	// Update statistics
	const updateStats = (torrents: UserTorrent[]) => {
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
			lastChange: null,
			cacheHitRate: Math.round(cacheHitRate * 100),
			averageFetchTime: Math.round(avgFetchTime),
		});
	};

	// Refresh library for a specific service or all
	const refreshLibrary = async (
		service?: 'realdebrid' | 'alldebrid' | 'torbox',
		force: boolean = false
	) => {
		if (service) {
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
				// If force refresh is requested, use the monitor's forceRefresh method
				// which properly pauses background checking
				if (force) {
					console.log(
						`[LibraryCache] Using force refresh through monitor for ${service}`
					);
					const torrents = await libraryMonitor.forceRefresh(service);

					// Track performance
					const fetchTime = Date.now() - startTime;
					fetchTimesRef.current.push(fetchTime);
					if (fetchTimesRef.current.length > 100) {
						fetchTimesRef.current.shift();
					}

					cacheHitsRef.current.misses++;

					console.log(
						`[LibraryCache] Force refresh completed for ${service} - ${torrents.length} items in ${fetchTime}ms`
					);

					// Note: State is already updated via the monitor's onServiceChange callback
					// No need to update again here to avoid duplicate updates
					toast.success(`${service} library refreshed (${torrents.length} items)`);
				} else {
					// For non-forced refresh, use the regular fetch with cache
					const options: FetchOptions = {
						forceRefresh: false,
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

					// Track performance
					const fetchTime = Date.now() - startTime;
					fetchTimesRef.current.push(fetchTime);
					if (fetchTimesRef.current.length > 100) {
						fetchTimesRef.current.shift();
					}

					cacheHitsRef.current.hits++;

					// Update service-specific library
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

					updateCombinedLibrary();
					toast.success(`${service} library refreshed (${torrents.length} items)`);
				}
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
		} else {
			// Refresh all services
			await refreshAll(force);
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

	// Monitoring control
	const setAutoRefreshFn = (enabled: boolean) => {
		setAutoRefresh(enabled);
		libraryMonitor.updateConfig({ enableAutoRefresh: enabled });
	};

	const setRefreshIntervalFn = (minutes: number) => {
		setRefreshIntervalState(minutes);
		libraryMonitor.updateConfig({ refreshInterval: minutes * 60 * 1000 });
	};

	const getMonitoringStatus = () => {
		return libraryMonitor.getStats();
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
		setAutoRefresh: setAutoRefreshFn,
		setRefreshInterval: setRefreshIntervalFn,
		getMonitoringStatus,
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
