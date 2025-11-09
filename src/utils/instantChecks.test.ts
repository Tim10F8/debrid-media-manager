import { adInstantCheck } from '@/services/allDebrid';
import { checkCachedStatus } from '@/services/torbox';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAvailabilityByHashes } from './availability';
import {
	instantCheckInAd2,
	instantCheckInRd2,
	instantCheckInTb2,
	wrapLoading,
} from './instantChecks';

vi.mock('./availability', () => ({
	checkAvailabilityByHashes: vi.fn(),
	checkAvailability: vi.fn(),
}));

vi.mock('@/services/allDebrid', () => ({
	adInstantCheck: vi.fn(),
}));

vi.mock('@/services/torbox', () => ({
	checkCachedStatus: vi.fn(),
}));

vi.mock('react-hot-toast', () => {
	const promise = vi.fn((p) => p);
	const success = vi.fn();
	const loading = vi.fn(() => 'toast-id');
	const error = vi.fn();
	return {
		toast: {
			promise,
			success,
			loading,
			error,
		},
	};
});

vi.mock('@/utils/selectable', () => ({
	isVideo: ({ path }: { path: string }) => path.endsWith('.mkv'),
}));

const mockCheckAvailabilityByHashes = vi.mocked(checkAvailabilityByHashes);
const mockAdInstantCheck = vi.mocked(adInstantCheck);
const mockCheckCachedStatus = vi.mocked(checkCachedStatus);

const createStateHarness = <T extends { hash: string }>(initial: T[]) => {
	let state = [...initial];
	const setter = vi.fn((updater: ((prev: T[]) => T[]) | T[]) => {
		state = typeof updater === 'function' ? updater(state) : updater;
		return state;
	});
	return {
		getState: () => state,
		setter,
	};
};

describe('instantChecks utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('marks RD torrents as available when instant cache hits', async () => {
		mockCheckAvailabilityByHashes.mockResolvedValue({
			available: [
				{
					hash: 'hash-1',
					files: [{ file_id: 1, path: 'Movie.mkv', bytes: 2048 }],
				},
			],
		} as any);
		const { setter, getState } = createStateHarness([
			{
				hash: 'hash-1',
				noVideos: false,
				rdAvailable: false,
				files: [],
			},
		] as any[]);

		const instantHits = await instantCheckInRd2(
			'problem',
			'solution',
			'rd-key',
			['hash-1'],
			setter
		);

		expect(instantHits).toBe(1);
		expect(getState()[0].rdAvailable).toBe(true);
		expect(getState()[0].files).toHaveLength(1);
	});

	it('marks AD torrents as available when magnets indicate instant status', async () => {
		mockAdInstantCheck.mockResolvedValue({
			data: {
				magnets: [
					{
						hash: 'hash-ad',
						instant: true,
						files: [{ n: 'Episode.mkv', s: 1024 }],
					},
				],
			},
		} as any);
		const { setter, getState } = createStateHarness([
			{
				hash: 'hash-ad',
				noVideos: false,
				adAvailable: false,
				files: [],
			},
		] as any[]);

		const hits = await instantCheckInAd2('ad-key', ['hash-ad'], setter);

		expect(hits).toBe(1);
		expect(getState()[0].adAvailable).toBe(true);
		expect(getState()[0].files[0]).toMatchObject({ filename: 'Episode.mkv' });
	});

	it('marks TB torrents as available when cached data exists', async () => {
		mockCheckCachedStatus.mockResolvedValue({
			success: true,
			data: {
				'hash-tb': {
					files: [{ name: 'Show.mkv', size: 2048 }],
				},
			},
		} as any);
		const { setter, getState } = createStateHarness([
			{
				hash: 'hash-tb',
				noVideos: false,
				tbAvailable: false,
				files: [],
			},
		] as any[]);

		const hits = await instantCheckInTb2('tb-key', ['hash-tb'], setter);

		expect(hits).toBe(1);
		expect(getState()[0].tbAvailable).toBe(true);
		expect(getState()[0].files[0]).toMatchObject({ filename: 'Show.mkv' });
	});

	it('wrapLoading proxies toast.promise to surface async results', async () => {
		const asyncCheck = Promise.resolve(3);
		const result = await wrapLoading('RD', asyncCheck);
		expect(result).toBe(3);
	});
});
