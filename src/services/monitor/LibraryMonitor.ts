/**
 * Library monitoring system inspired by Zurg's state monitoring
 * Implements background checking, auto-refresh, and change detection
 */

import { UserTorrent } from '@/torrent/userTorrent';
import { CacheManager } from '../cache/CacheManager';
import {
	FetchOptions,
	LibraryState,
	UnifiedLibraryFetcher,
} from '../library/UnifiedLibraryFetcher';

export interface MonitorConfig {
	checkInterval: number; // How often to check for changes (ms)
	refreshInterval: number; // How often to force refresh (ms)
	enableAutoRefresh: boolean;
	enableChangeDetection: boolean;
	maxRetries: number;
	retryDelay: number;
	staleDataThreshold: number; // How old data can be before considered stale (ms)
	autoInitialize: boolean; // Whether to auto-refresh on initialization if data is missing/stale
}

export interface ServiceConfig {
	service: 'realdebrid' | 'alldebrid' | 'torbox';
	token: string;
	enabled: boolean;
	priority: number; // Higher priority services are checked first
}

export interface MonitorEvent {
	type: 'change_detected' | 'refresh_complete' | 'error' | 'state_check';
	service: string;
	timestamp: number;
	data?: any;
	error?: Error;
}

type MonitorEventHandler = (event: MonitorEvent) => void;

export class LibraryMonitor {
	private fetcher: UnifiedLibraryFetcher;
	private cache: CacheManager;
	private config: MonitorConfig;
	private services: Map<string, ServiceConfig> = new Map();
	private intervals: Map<string, NodeJS.Timeout> = new Map();
	private lastChecks: Map<string, number> = new Map();
	private lastRefreshes: Map<string, number> = new Map();
	private states: Map<string, LibraryState> = new Map();
	private eventHandlers: Set<MonitorEventHandler> = new Set();
	private isRunning: boolean = false;
	private checkPromises: Map<string, Promise<void>> = new Map();
	private libraryData: Map<string, UserTorrent[]> = new Map();
	private changeCallbacks: Map<string, Set<() => void>> = new Map();
	private manualRefreshInProgress: Map<string, boolean> = new Map();
	private pausedServices: Set<string> = new Set();

	constructor(
		fetcher: UnifiedLibraryFetcher,
		cache: CacheManager,
		config?: Partial<MonitorConfig>
	) {
		console.log(`[Monitor] 🚀 LibraryMonitor constructor - CACHE KEY FIX VERSION`);
		this.fetcher = fetcher;
		this.cache = cache;
		this.config = {
			checkInterval: 30 * 1000, // 30 seconds default
			refreshInterval: 5 * 60 * 1000, // 5 minutes default
			enableAutoRefresh: true,
			enableChangeDetection: true,
			maxRetries: 3,
			retryDelay: 5000,
			staleDataThreshold: 5 * 60 * 1000, // 5 minutes default
			autoInitialize: true, // Auto-refresh on init by default
			...config,
		};
	}

	/**
	 * Register a service for monitoring
	 */
	async registerService(config: ServiceConfig): Promise<void> {
		console.log(
			`[Monitor] Registering service: ${config.service}, enabled: ${config.enabled}, priority: ${config.priority}`
		);

		this.services.set(config.service, config);
		this.changeCallbacks.set(config.service, new Set());

		// Mark as manual refresh in progress during registration to prevent duplicate fetches
		this.manualRefreshInProgress.set(config.service, true);

		// Load last known state from cache
		const stateLoadStart = Date.now();
		await this.loadState(config.service);
		console.log(`[Monitor] ${config.service} state loaded in ${Date.now() - stateLoadStart}ms`);

		// Check if we need to auto-initialize
		if (this.config.autoInitialize && config.enabled) {
			console.log(`[Monitor] ${config.service} auto-initialization check starting...`);
			const autoInitStart = Date.now();
			await this.checkAndAutoRefresh(config.service, config);
			console.log(
				`[Monitor] ${config.service} auto-initialization completed in ${Date.now() - autoInitStart}ms`
			);
		}

		// Clear the manual refresh flag
		this.manualRefreshInProgress.set(config.service, false);

		if (this.isRunning && config.enabled) {
			console.log(`[Monitor] Starting monitoring for ${config.service}`);
			// Add delay after auto-initialization to prevent immediate duplicate checks
			const delayAfterInit = this.config.autoInitialize ? 30000 : 0; // 30 second delay
			setTimeout(() => {
				this.startServiceMonitoring(config.service);
			}, delayAfterInit);
		}

		console.log(`[Monitor] Service ${config.service} registration complete`);
	}

	/**
	 * Check if service needs auto-refresh on initialization
	 */
	private async checkAndAutoRefresh(service: string, config: ServiceConfig): Promise<void> {
		console.log(`[Monitor] ⭐️ NEW CODE VERSION ${service} auto-refresh check starting...`);
		const now = Date.now();

		// Check if we have any data in memory
		const hasData = this.libraryData.has(service) && this.libraryData.get(service)!.length > 0;
		console.log(
			`[Monitor] ${service} hasData in memory: ${hasData} (${this.libraryData.get(service)?.length || 0} items)`
		);

		// Check when last refresh was
		const lastRefresh = this.lastRefreshes.get(service) || 0;
		const timeSinceRefresh = now - lastRefresh;
		const isStale = timeSinceRefresh >= this.config.staleDataThreshold;
		console.log(
			`[Monitor] ${service} last refresh: ${lastRefresh ? new Date(lastRefresh).toISOString() : 'never'}, age: ${Math.round(timeSinceRefresh / 1000)}s, stale: ${isStale} (threshold: ${this.config.staleDataThreshold / 1000}s)`
		);

		// Check if we have cached data in the persistent cache
		// Use same key format as UnifiedLibraryFetcher: rd/ad/tb instead of full service name
		const servicePrefix =
			config.service === 'realdebrid' ? 'rd' : config.service === 'alldebrid' ? 'ad' : 'tb';
		const cacheKey = `${servicePrefix}:library:${config.token}`;
		console.log(`[Monitor] ${service} checking cache with key: ${cacheKey}`);

		const cacheCheckStart = Date.now();
		const cachedData = await this.cache.get<UserTorrent[]>(cacheKey);
		const cacheCheckTime = Date.now() - cacheCheckStart;
		const hasCachedData = cachedData && cachedData.length > 0;

		console.log(
			`[Monitor] ${service} cache check completed in ${cacheCheckTime}ms - hasCachedData: ${hasCachedData} (${cachedData?.length || 0} items)`
		);

		// Auto-refresh if:
		// 1. No data in memory AND no cached data
		// 2. Data is stale (older than threshold)
		const shouldAutoRefresh = (!hasData && !hasCachedData) || isStale;
		const reason = !hasData && !hasCachedData ? 'no_data' : isStale ? 'stale_data' : 'none';

		console.log(
			`[Monitor] ${service} auto-refresh decision: ${shouldAutoRefresh} (reason: ${reason})`
		);

		if (shouldAutoRefresh) {
			console.log(`[Monitor] Proceeding with auto-refresh for ${service}`);

			this.emitEvent({
				type: 'state_check',
				service,
				timestamp: now,
				data: {
					reason,
					lastRefresh,
					threshold: this.config.staleDataThreshold,
					timeSinceRefresh,
					hasData,
					hasCachedData,
					cachedItemCount: cachedData?.length || 0,
				},
			});

			// Perform initial refresh
			try {
				await this.forceRefresh(service);
			} catch (error) {
				console.error(`[Monitor] Failed to auto-refresh ${service}:`, error);
				// Don't throw - let the app continue with cached/empty data
			}
		} else if (hasCachedData && !hasData) {
			// Load cached data into memory if we have it
			console.log(
				`[Monitor] Loading ${cachedData!.length} cached items for ${service} into memory`
			);
			this.libraryData.set(service, cachedData!);
			this.lastRefreshes.set(service, lastRefresh || now);

			// Notify callbacks that data is available
			const callbacks = this.changeCallbacks.get(service);
			if (callbacks && callbacks.size > 0) {
				console.log(
					`[Monitor] Notifying ${callbacks.size} callbacks about cached data for ${service}`
				);
				callbacks.forEach((callback) => callback());
			}
		} else {
			console.log(
				`[Monitor] No action needed for ${service} - data already available and fresh`
			);
		}
	}

	/**
	 * Unregister a service from monitoring
	 */
	unregisterService(service: string): void {
		this.stopServiceMonitoring(service);
		this.services.delete(service);
		this.changeCallbacks.delete(service);
		this.libraryData.delete(service);
	}

	/**
	 * Start monitoring all registered services
	 */
	start(): void {
		if (this.isRunning) return;

		this.isRunning = true;

		for (const [service, config] of this.services) {
			if (config.enabled) {
				this.startServiceMonitoring(service);
			}
		}

		this.emitEvent({
			type: 'state_check',
			service: 'monitor',
			timestamp: Date.now(),
			data: { status: 'started' },
		});
	}

	/**
	 * Stop monitoring all services
	 */
	stop(): void {
		if (!this.isRunning) return;

		this.isRunning = false;

		for (const service of this.services.keys()) {
			this.stopServiceMonitoring(service);
		}

		this.emitEvent({
			type: 'state_check',
			service: 'monitor',
			timestamp: Date.now(),
			data: { status: 'stopped' },
		});
	}

	private startServiceMonitoring(service: string): void {
		// Clear any existing interval
		this.stopServiceMonitoring(service);

		// Skip immediate check if we just did auto-initialization
		const lastRefresh = this.lastRefreshes.get(service) || 0;
		const timeSinceRefresh = Date.now() - lastRefresh;
		const skipImmediateCheck = timeSinceRefresh < 5000; // Skip if refreshed within last 5 seconds

		if (!skipImmediateCheck) {
			// Start immediate check
			this.checkService(service);
		}

		// Set up periodic checking
		const interval = setInterval(() => {
			this.checkService(service);
		}, this.config.checkInterval);

		this.intervals.set(service, interval);
	}

	private stopServiceMonitoring(service: string): void {
		const interval = this.intervals.get(service);
		if (interval) {
			clearInterval(interval);
			this.intervals.delete(service);
		}

		// Cancel any pending check
		const promise = this.checkPromises.get(service);
		if (promise) {
			// In browser, we can't actually cancel promises, but we can ignore the result
			this.checkPromises.delete(service);
		}
	}

	private async checkService(service: string): Promise<void> {
		const config = this.services.get(service);
		if (!config || !config.enabled) return;

		// Skip if service is paused due to manual refresh
		if (this.pausedServices.has(service)) {
			return;
		}

		// Prevent concurrent checks for the same service
		const existingPromise = this.checkPromises.get(service);
		if (existingPromise) {
			return existingPromise;
		}

		const checkPromise = this.performCheck(service, config);
		this.checkPromises.set(service, checkPromise);

		try {
			await checkPromise;
		} finally {
			this.checkPromises.delete(service);
		}
	}

	private async performCheck(service: string, config: ServiceConfig): Promise<void> {
		const now = Date.now();
		let retryCount = 0;

		while (retryCount <= this.config.maxRetries) {
			try {
				// Skip if manual refresh is in progress for this service
				if (this.manualRefreshInProgress.get(service)) {
					return;
				}

				// Check if we need a full refresh
				const lastRefresh = this.lastRefreshes.get(service) || 0;
				const shouldRefresh =
					this.config.enableAutoRefresh &&
					now - lastRefresh >= this.config.refreshInterval;

				if (shouldRefresh) {
					// Perform full refresh
					await this.refreshLibrary(service, config);
				} else if (this.config.enableChangeDetection) {
					// Perform lightweight state check (like Zurg)
					await this.checkForChanges(service, config);
				}

				this.lastChecks.set(service, now);
				return; // Success, exit retry loop
			} catch (error) {
				retryCount++;

				if (retryCount > this.config.maxRetries) {
					this.emitEvent({
						type: 'error',
						service,
						timestamp: Date.now(),
						error: error as Error,
					});
					throw error;
				}

				// Wait before retrying
				await this.sleep(this.config.retryDelay * retryCount);
			}
		}
	}

	private async checkForChanges(service: string, config: ServiceConfig): Promise<void> {
		// Skip if manual refresh is in progress
		if (this.manualRefreshInProgress.get(service)) {
			console.log(
				`[Monitor] Skipping change check for ${service} - manual refresh in progress`
			);
			return;
		}

		// Skip if we just refreshed recently (within last 2 minutes)
		const lastRefresh = this.lastRefreshes.get(service) || 0;
		const timeSinceRefresh = Date.now() - lastRefresh;
		const recentRefreshThreshold = 2 * 60 * 1000; // 2 minutes

		if (timeSinceRefresh < recentRefreshThreshold) {
			console.log(
				`[Monitor] Skipping change check for ${service} - refreshed ${Math.round(timeSinceRefresh / 1000)}s ago`
			);
			return;
		}

		console.log(`[Monitor] Checking for changes in ${service}...`);
		// Get current state (lightweight check like Zurg)
		const hasChanged = await this.fetcher.hasLibraryChanged(config.service, config.token);

		if (hasChanged) {
			console.log(`[Monitor] Changes detected in ${service}`);
			this.emitEvent({
				type: 'change_detected',
				service,
				timestamp: Date.now(),
				data: { hasChanged: true },
			});

			// Trigger refresh if changes detected (unless manual refresh is now in progress)
			if (!this.manualRefreshInProgress.get(service)) {
				await this.refreshLibrary(service, config);
			}
		} else {
			console.log(`[Monitor] No changes detected in ${service}`);
		}
	}

	private async refreshLibrary(service: string, config: ServiceConfig): Promise<void> {
		console.log(`[Monitor] Starting library refresh for ${service}`);
		const refreshStart = Date.now();

		const options: FetchOptions = {
			forceRefresh: true,
			onProgress: (progress, total) => {
				console.log(
					`[Monitor] ${service} progress: ${progress}/${total} items (${Math.round((progress / total) * 100)}%)`
				);
			},
			onBatchComplete: (batch) => {
				console.log(`[Monitor] ${service} batch completed: ${batch.length} items`);
			},
		};

		try {
			console.log(`[Monitor] Fetching library for ${service}...`);
			const fetchStart = Date.now();

			const torrents = await this.fetcher.fetchLibrary(config.service, config.token, options);

			const fetchTime = Date.now() - fetchStart;
			console.log(
				`[Monitor] Library fetched for ${service} in ${fetchTime}ms - ${torrents.length} items`
			);

			// Store the fetched data
			this.libraryData.set(service, torrents);
			this.lastRefreshes.set(service, Date.now());

			// Save state
			console.log(`[Monitor] Saving state for ${service}...`);
			const stateStart = Date.now();
			await this.saveState(service);
			console.log(`[Monitor] State saved for ${service} in ${Date.now() - stateStart}ms`);

			// Notify change callbacks
			const callbacks = this.changeCallbacks.get(service);
			if (callbacks && callbacks.size > 0) {
				console.log(`[Monitor] Notifying ${callbacks.size} callbacks for ${service}`);
				callbacks.forEach((callback) => callback());
			}

			const totalTime = Date.now() - refreshStart;
			console.log(
				`[Monitor] Library refresh completed for ${service} in ${totalTime}ms (fetch: ${fetchTime}ms, total: ${torrents.length} items)`
			);

			this.emitEvent({
				type: 'refresh_complete',
				service,
				timestamp: Date.now(),
				data: {
					count: torrents.length,
					firstId: torrents[0]?.id,
					lastId: torrents[torrents.length - 1]?.id,
					fetchTime,
					totalTime,
				},
			});
		} catch (error) {
			const totalTime = Date.now() - refreshStart;
			console.error(
				`[Monitor] Library refresh failed for ${service} after ${totalTime}ms:`,
				error
			);

			this.emitEvent({
				type: 'error',
				service,
				timestamp: Date.now(),
				error: error as Error,
			});
			throw error;
		}
	}

	/**
	 * Get cached library data for a service
	 */
	getLibraryData(service: string): UserTorrent[] | null {
		return this.libraryData.get(service) || null;
	}

	/**
	 * Get all library data
	 */
	getAllLibraryData(): Map<string, UserTorrent[]> {
		return new Map(this.libraryData);
	}

	/**
	 * Force refresh for a specific service
	 */
	async forceRefresh(service: string): Promise<UserTorrent[]> {
		const config = this.services.get(service);
		if (!config) {
			throw new Error(`Service ${service} not registered`);
		}

		console.log(`[Monitor] Force refresh starting for ${service}`);
		const forceRefreshStart = Date.now();

		// Pause background checking for this service during manual refresh
		console.log(`[Monitor] Pausing background monitoring for ${service}`);
		this.pauseService(service);
		this.manualRefreshInProgress.set(service, true);

		try {
			await this.refreshLibrary(service, config);
			const data = this.libraryData.get(service) || [];
			const refreshTime = Date.now() - forceRefreshStart;
			console.log(
				`[Monitor] Force refresh completed for ${service} in ${refreshTime}ms - ${data.length} items`
			);
			return data;
		} catch (error) {
			const refreshTime = Date.now() - forceRefreshStart;
			console.error(
				`[Monitor] Force refresh failed for ${service} after ${refreshTime}ms:`,
				error
			);
			throw error;
		} finally {
			// Resume background checking after manual refresh completes
			console.log(`[Monitor] Resuming background monitoring for ${service}`);
			this.manualRefreshInProgress.set(service, false);
			this.resumeService(service);
		}
	}

	/**
	 * Pause background checking for a service
	 */
	private pauseService(service: string): void {
		this.pausedServices.add(service);

		// Cancel any pending check
		const promise = this.checkPromises.get(service);
		if (promise) {
			this.checkPromises.delete(service);
		}
	}

	/**
	 * Resume background checking for a service
	 */
	private resumeService(service: string): void {
		this.pausedServices.delete(service);

		// Restart checking if monitor is running
		if (this.isRunning && this.services.get(service)?.enabled) {
			// Schedule next check after a short delay
			setTimeout(() => this.checkService(service), 1000);
		}
	}

	/**
	 * Subscribe to change events for a service
	 */
	onServiceChange(service: string, callback: () => void): () => void {
		const callbacks = this.changeCallbacks.get(service);
		if (callbacks) {
			callbacks.add(callback);
		}

		// Return unsubscribe function
		return () => {
			const callbacks = this.changeCallbacks.get(service);
			if (callbacks) {
				callbacks.delete(callback);
			}
		};
	}

	/**
	 * Add event handler
	 */
	addEventListener(handler: MonitorEventHandler): void {
		this.eventHandlers.add(handler);
	}

	/**
	 * Remove event handler
	 */
	removeEventListener(handler: MonitorEventHandler): void {
		this.eventHandlers.delete(handler);
	}

	private emitEvent(event: MonitorEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch (error) {
				console.error('Error in event handler:', error);
			}
		}
	}

	/**
	 * Load saved state from cache
	 */
	private async loadState(service: string): Promise<void> {
		try {
			const state = await this.cache.getState(`monitor:state:${service}`);
			if (state) {
				this.states.set(service, state.libraryState);
				this.lastChecks.set(service, state.lastCheck || 0);
				this.lastRefreshes.set(service, state.lastRefresh || 0);
			}
		} catch (error) {
			console.warn(`Failed to load state for ${service}:`, error);
		}
	}

	/**
	 * Save current state to cache
	 */
	private async saveState(service: string): Promise<void> {
		try {
			const state = {
				libraryState: this.states.get(service),
				lastCheck: this.lastChecks.get(service),
				lastRefresh: this.lastRefreshes.get(service),
				timestamp: Date.now(),
			};
			await this.cache.saveState(`monitor:state:${service}`, state);
		} catch (error) {
			console.warn(`Failed to save state for ${service}:`, error);
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get monitoring statistics
	 */
	getStats(): any {
		const stats: any = {
			isRunning: this.isRunning,
			services: {},
		};

		for (const [service, config] of this.services) {
			stats.services[service] = {
				enabled: config.enabled,
				lastCheck: this.lastChecks.get(service),
				lastRefresh: this.lastRefreshes.get(service),
				hasData: this.libraryData.has(service),
				dataCount: this.libraryData.get(service)?.length || 0,
				state: this.states.get(service),
				isPaused: this.pausedServices.has(service),
				isManualRefreshing: this.manualRefreshInProgress.get(service) || false,
			};
		}

		return stats;
	}

	/**
	 * Check if any service is currently being manually refreshed
	 */
	isManualRefreshInProgress(service?: string): boolean {
		if (service) {
			return this.manualRefreshInProgress.get(service) || false;
		}
		// Check if any service is being manually refreshed
		for (const inProgress of this.manualRefreshInProgress.values()) {
			if (inProgress) return true;
		}
		return false;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<MonitorConfig>): void {
		this.config = { ...this.config, ...config };

		// Restart monitoring with new config if running
		if (this.isRunning) {
			this.stop();
			this.start();
		}
	}

	/**
	 * Enable/disable a specific service
	 */
	setServiceEnabled(service: string, enabled: boolean): void {
		const config = this.services.get(service);
		if (config) {
			config.enabled = enabled;

			if (this.isRunning) {
				if (enabled) {
					this.startServiceMonitoring(service);
				} else {
					this.stopServiceMonitoring(service);
				}
			}
		}
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.stop();
		this.eventHandlers.clear();
		this.changeCallbacks.clear();
		this.libraryData.clear();
		this.states.clear();
		this.services.clear();
	}
}
