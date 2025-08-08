import { TrackerStatsService } from './src/services/database/trackerStats';
import { torrentScraper } from './src/utils/torrentScraper';

// Example usage of TrackerStatsService
async function exampleUsage() {
	const trackerStatsService = new TrackerStatsService();

	// Example: Scrape and store tracker stats for a torrent
	const hash = 'ba0e267579fa62981795dcc059fb61e1af5ca429';

	try {
		// Get tracker stats using the torrent scraper
		const scrapedStats = await torrentScraper.scrapeTorrent(hash);

		// Store the stats in the database
		await trackerStatsService.upsertTrackerStats({
			hash,
			seeders: scrapedStats.seeders,
			leechers: scrapedStats.leechers,
			downloads: scrapedStats.downloads,
			successfulTrackers: scrapedStats.successfulTrackers,
			totalTrackers: scrapedStats.totalTrackers,
		});

		console.log(`Stored tracker stats for hash ${hash}`);

		// Retrieve stored stats
		const storedStats = await trackerStatsService.getTrackerStats(hash);
		console.log('Retrieved stats:', storedStats);

		// Get stats for multiple hashes
		const multipleStats = await trackerStatsService.getTrackerStatsByHashes([
			hash,
			'another_hash_here',
		]);
		console.log('Multiple stats:', multipleStats);

		// Clean up old stats (older than 30 days)
		const cleanedCount = await trackerStatsService.cleanupOldTrackerStats(30);
		console.log(`Cleaned up ${cleanedCount} old tracker stats`);

		// Get recent stats
		const recentStats = await trackerStatsService.getRecentTrackerStats(10);
		console.log(`Found ${recentStats.length} recent tracker stats`);
	} catch (error) {
		console.error('Error:', error);
	}
}

// Integration with availability checks
async function enhancedAvailabilityCheck(hashes: string[]) {
	const trackerStatsService = new TrackerStatsService();

	// Check if user wants tracker stats included
	const includeTrackerStats = window?.localStorage?.getItem('settings:includeTrackerStats') === 'true';

	if (includeTrackerStats) {
		// Get existing tracker stats
		const existingStats = await trackerStatsService.getTrackerStatsByHashes(hashes);
		const existingHashes = new Set(existingStats.map(s => s.hash));

		// Find hashes that need fresh tracker stats
		const staleHashes = hashes.filter(hash => !existingHashes.has(hash));

		// Scrape tracker stats for stale hashes
		for (const hash of staleHashes) {
			try {
				const scrapedStats = await torrentScraper.scrapeTorrent(hash);
				await trackerStatsService.upsertTrackerStats({
					hash,
					seeders: scrapedStats.seeders,
					leechers: scrapedStats.leechers,
					downloads: scrapedStats.downloads,
					successfulTrackers: scrapedStats.successfulTrackers,
					totalTrackers: scrapedStats.totalTrackers,
				});
			} catch (error) {
				console.error(`Failed to scrape stats for ${hash}:`, error);
			}
		}

		// Return enhanced results with tracker stats
		const allStats = await trackerStatsService.getTrackerStatsByHashes(hashes);
		return hashes.map(hash => {
			const stats = allStats.find(s => s.hash === hash);
			return {
				hash,
				trackerStats: stats || null,
			};
		});
	}

	// Return basic results without tracker stats
	return hashes.map(hash => ({ hash, trackerStats: null }));
}

export { exampleUsage, enhancedAvailabilityCheck };