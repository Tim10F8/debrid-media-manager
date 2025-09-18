import TrackerClient from 'bittorrent-tracker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { torrentScraper } from './torrentScraper';

// Mock trackerManager to return a fixed list of trackers
vi.mock('./trackerManager', () => ({
	trackerManager: {
		getTrackers: vi.fn(async () => [
			'udp://tracker.one',
			'udp://tracker.two',
			'udp://tracker.three',
		]),
	},
}));

// Mock bittorrent-tracker scrape behavior
vi.mock('bittorrent-tracker', () => ({
	default: { scrape: vi.fn() },
}));

beforeEach(() => {
	const scrape = vi.mocked((TrackerClient as any).scrape);
	scrape.mockReset();
});

describe('torrentScraper', () => {
	it('throws for invalid info hash format', async () => {
		await expect(torrentScraper.scrapeTorrent('not-a-hash')).rejects.toThrow(
			'Invalid info hash format'
		);
	});

	it('aggregates tracker results using maxima and counts successes', async () => {
		// For first two trackers, simulate successful scrape; third fails
		const scrape = vi.mocked((TrackerClient as any).scrape);
		scrape.mockImplementation((opts: any, cb: any) => {
			if (opts.announce.includes('one')) {
				cb(null, { complete: 5, incomplete: 3, downloaded: 100 });
			} else if (opts.announce.includes('two')) {
				cb(null, { complete: 2, incomplete: 4, downloaded: 50 });
			} else {
				cb(new Error('tracker error'));
			}
		});

		const hash = 'abcdef0123456789abcdef0123456789abcdef01';
		const stats = await torrentScraper.scrapeTorrent(hash);
		expect(stats).toEqual({
			seeders: 5,
			leechers: 4,
			downloads: 100,
			successfulTrackers: 2,
			totalTrackers: 3,
		});
	});
});
