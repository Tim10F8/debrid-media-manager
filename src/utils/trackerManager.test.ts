import axios from 'axios';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('axios', () => ({
	default: {
		get: vi.fn(),
	},
}));

type TrackerManagerInstance = (typeof import('./trackerManager'))['trackerManager'];

const axiosGet = axios.get as unknown as Mock;

describe('trackerManager', () => {
	let trackerManager: TrackerManagerInstance;
	const importManager = async () => {
		const mod = await import('./trackerManager');
		return mod.trackerManager;
	};

	beforeEach(async () => {
		vi.resetModules();
		axiosGet.mockReset();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
		trackerManager = await importManager();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('fetches trackers from the first working endpoint and caches the result', async () => {
		axiosGet.mockResolvedValue({
			data: 'udp://tracker-one\n\n#comment\nudp://tracker-two',
		});

		const trackers = await trackerManager.getTrackers();
		expect(trackers).toEqual(['udp://tracker-one', 'udp://tracker-two']);
		expect(axiosGet).toHaveBeenCalledTimes(1);

		vi.setSystemTime(new Date('2024-01-01T01:00:00Z'));
		axiosGet.mockClear();

		const cached = await trackerManager.getTrackers();
		expect(cached).toEqual(trackers);
		expect(axiosGet).not.toHaveBeenCalled();
	});

	it('retries sources and falls back to cached trackers when refresh fails', async () => {
		axiosGet
			.mockResolvedValueOnce({
				data: 'udp://cached-tracker',
			})
			.mockRejectedValue(new Error('network'));

		const cached = await trackerManager.getTrackers();
		expect(cached).toEqual(['udp://cached-tracker']);

		vi.setSystemTime(new Date('2024-01-03T00:00:00Z'));

		const staleButUsable = await trackerManager.getTrackers();
		expect(staleButUsable).toEqual(['udp://cached-tracker']);
	});

	it('falls back to the built-in tracker list when every fetch fails', async () => {
		axiosGet.mockRejectedValue(new Error('network down'));

		const fallback = await trackerManager.getTrackers();

		expect(fallback.length).toBeGreaterThan(0);
		expect(fallback).toContain('udp://93.158.213.92:1337/announce');
		expect(axiosGet).toHaveBeenCalledTimes(3);
	});
});
