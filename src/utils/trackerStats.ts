export interface TrackerStatsResponse {
	hash: string;
	seeders: number;
	leechers: number;
	downloads: number;
	successfulTrackers: number;
	totalTrackers: number;
	lastChecked: string;
}

export async function submitTrackerStats(hash: string) {
	try {
		const response = await fetch(`/api/torrents/stats?hash=${hash}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to fetch tracker stats');
		}

		return await response.json();
	} catch (error) {
		console.error('Error fetching tracker stats:', error);
		throw error;
	}
}

export async function getTrackerStats(hash: string): Promise<TrackerStatsResponse | null> {
	try {
		const response = await fetch(`/api/torrents/stats/stored?hash=${hash}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		if (response.status === 404) {
			return null; // No stored stats found
		}

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to get stored tracker stats');
		}

		return await response.json();
	} catch (error) {
		console.error('Error getting stored tracker stats:', error);
		throw error;
	}
}

export async function getMultipleTrackerStats(hashes: string[]): Promise<TrackerStatsResponse[]> {
	try {
		const response = await fetch('/api/torrents/stats/bulk', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ hashes }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to get bulk tracker stats');
		}

		return await response.json();
	} catch (error) {
		console.error('Error getting bulk tracker stats:', error);
		throw error;
	}
}

export async function refreshTrackerStats(hashes: string[]): Promise<TrackerStatsResponse[]> {
	try {
		const response = await fetch('/api/torrents/stats/refresh', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ hashes }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to refresh tracker stats');
		}

		return await response.json();
	} catch (error) {
		console.error('Error refreshing tracker stats:', error);
		throw error;
	}
}

export async function checkTrackerStatsAvailability(hashes: string[]): Promise<{
	available: TrackerStatsResponse[];
	missing: string[];
	stale: string[];
}> {
	try {
		const response = await fetch('/api/torrents/stats/availability', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ hashes }),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Failed to check tracker stats availability');
		}

		return await response.json();
	} catch (error) {
		console.error('Error checking tracker stats availability:', error);
		throw error;
	}
}

// Helper function to determine if tracker stats should be included based on user settings
export function shouldIncludeTrackerStats(): boolean {
	if (typeof window === 'undefined') return false;
	return window.localStorage.getItem('settings:includeTrackerStats') === 'true';
}

// Helper function to format tracker stats for display
export function formatTrackerStats(stats: TrackerStatsResponse): string {
	const { seeders, leechers, downloads, successfulTrackers, totalTrackers } = stats;
	const successRate =
		totalTrackers > 0 ? Math.round((successfulTrackers / totalTrackers) * 100) : 0;

	return `🌱 ${seeders} seeders • 📥 ${leechers} leechers • 📊 ${downloads} downloads • ✅ ${successRate}% trackers`;
}

// Helper function to get tracker stats with caching
export async function getCachedTrackerStats(
	hash: string,
	maxAgeHours: number = 24
): Promise<TrackerStatsResponse | null> {
	try {
		// First, try to get stored stats
		const stored = await getTrackerStats(hash);

		if (stored) {
			const lastChecked = new Date(stored.lastChecked);
			const now = new Date();
			const ageHours = (now.getTime() - lastChecked.getTime()) / (1000 * 60 * 60);

			// If stats are fresh enough, return them
			if (ageHours < maxAgeHours) {
				return stored;
			}
		}

		// If no stored stats or they're stale, fetch fresh ones
		const fresh = await submitTrackerStats(hash);
		return {
			hash: fresh.hash,
			seeders: fresh.seeders,
			leechers: fresh.leechers,
			downloads: fresh.downloads,
			successfulTrackers: fresh.trackers.successful,
			totalTrackers: fresh.trackers.total,
			lastChecked: new Date().toISOString(),
		};
	} catch (error) {
		console.error(`Error getting cached tracker stats for ${hash}:`, error);
		return null;
	}
}
