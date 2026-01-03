import { TrackerStatsService } from '@/services/database/trackerStats';
import { RATE_LIMIT_CONFIGS, withIpRateLimit } from '@/services/rateLimit/withRateLimit';
import { NextApiHandler } from 'next';

function isValidTorrentHash(hash: string): boolean {
	return /^[a-fA-F0-9]{40}$/i.test(hash);
}

const handler: NextApiHandler = async (req, res) => {
	// Only allow POST requests
	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		const { hashes, maxAgeHours = 24 } = req.body;

		// Validate hashes parameter
		if (!hashes || !Array.isArray(hashes)) {
			return res.status(400).json({ error: 'Missing or invalid "hashes" parameter' });
		}

		if (hashes.length === 0) {
			return res.status(400).json({ error: 'Hashes array cannot be empty' });
		}

		if (hashes.length > 100) {
			return res.status(400).json({ error: 'Maximum 100 hashes allowed per request' });
		}

		// Validate each hash
		const invalidHashes = hashes.filter(
			(hash) => typeof hash !== 'string' || !isValidTorrentHash(hash)
		);
		if (invalidHashes.length > 0) {
			return res.status(400).json({
				error: 'Invalid hash format(s). All hashes must be 40 hexadecimal characters.',
				invalidHashes: invalidHashes.slice(0, 5),
			});
		}

		// Validate maxAgeHours
		if (typeof maxAgeHours !== 'number' || maxAgeHours < 0 || maxAgeHours > 168) {
			return res
				.status(400)
				.json({ error: 'maxAgeHours must be a number between 0 and 168 (7 days)' });
		}

		const trackerStatsService = new TrackerStatsService();
		const storedStats = await trackerStatsService.getTrackerStatsByHashes(hashes);

		const now = new Date();
		const cutoffTime = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);

		const available: any[] = [];
		const stale: string[] = [];
		const missing: string[] = [];

		// Categorize each hash
		for (const hash of hashes) {
			const stat = storedStats.find((s) => s.hash === hash);

			if (!stat) {
				missing.push(hash);
			} else if (stat.lastChecked < cutoffTime) {
				stale.push(hash);
				available.push({
					hash: stat.hash,
					seeders: stat.seeders,
					leechers: stat.leechers,
					downloads: stat.downloads,
					successfulTrackers: stat.successfulTrackers,
					totalTrackers: stat.totalTrackers,
					lastChecked: stat.lastChecked.toISOString(),
					isStale: true,
				});
			} else {
				available.push({
					hash: stat.hash,
					seeders: stat.seeders,
					leechers: stat.leechers,
					downloads: stat.downloads,
					successfulTrackers: stat.successfulTrackers,
					totalTrackers: stat.totalTrackers,
					lastChecked: stat.lastChecked.toISOString(),
					isStale: false,
				});
			}
		}

		return res.status(200).json({
			available,
			missing,
			stale: stale.filter((hash) => !missing.includes(hash)), // Only include stale hashes that aren't missing
			summary: {
				total: hashes.length,
				available: available.length,
				missing: missing.length,
				stale: stale.length,
			},
		});
	} catch (error) {
		console.error('Error checking tracker stats availability:', error);
		return res.status(500).json({
			error: 'Failed to check tracker stats availability',
			message: error instanceof Error ? error.message : 'Unknown error',
		});
	}
};

export default withIpRateLimit(handler, RATE_LIMIT_CONFIGS.torrents);
