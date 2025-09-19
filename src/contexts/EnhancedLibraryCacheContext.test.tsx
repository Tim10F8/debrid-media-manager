import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllDebridApiKey, useRealDebridAccessToken, useTorBoxAccessToken } from '@/hooks/auth';
import {
	EnhancedLibraryCacheProvider,
	useEnhancedLibraryCache,
} from './EnhancedLibraryCacheContext';

vi.mock('react-hot-toast', () => {
	const mock = {
		success: vi.fn(),
		error: vi.fn(),
	};
	return {
		...mock,
		default: mock,
	};
});

const { fetchLibraryMock, clearLibraryCacheMock, cacheClearMock, torrentDbMocks } = vi.hoisted(
	() => {
		const resolved = () => vi.fn().mockResolvedValue(undefined);
		return {
			fetchLibraryMock: vi.fn(),
			clearLibraryCacheMock: vi.fn(),
			cacheClearMock: vi.fn(),
			torrentDbMocks: {
				all: vi.fn().mockResolvedValue([]),
				replaceAll: resolved(),
				upsert: resolved(),
				addAll: resolved(),
				deleteById: resolved(),
				deleteMany: resolved(),
				add: resolved(),
			},
		};
	}
);

vi.mock('@/services/library/UnifiedLibraryFetcher', () => {
	class MockUnifiedLibraryFetcher {
		fetchLibrary = fetchLibraryMock;
		clearCache = clearLibraryCacheMock;
	}

	return {
		UnifiedLibraryFetcher: MockUnifiedLibraryFetcher,
		fetchLibraryMock,
	};
});

vi.mock('@/services/cache/CacheManager', () => {
	class MockCacheManager {
		clear = cacheClearMock;
	}

	return {
		CacheManager: MockCacheManager,
		getGlobalCache: vi.fn(() => new MockCacheManager()),
	};
});

class MockUnifiedRateLimiter {}

vi.mock('@/services/rateLimit/UnifiedRateLimiter', () => {
	class MockUnifiedRateLimiter {}

	return {
		UnifiedRateLimiter: MockUnifiedRateLimiter,
		getGlobalRateLimiter: vi.fn(() => new MockUnifiedRateLimiter()),
	};
});

vi.mock('@/torrent/db', () => ({
	default: class MockUserTorrentDB {
		all = torrentDbMocks.all;
		replaceAll = torrentDbMocks.replaceAll;
		upsert = torrentDbMocks.upsert;
		addAll = torrentDbMocks.addAll;
		deleteById = torrentDbMocks.deleteById;
		deleteMany = torrentDbMocks.deleteMany;
		add = torrentDbMocks.add;
	},
}));

vi.mock('@/hooks/auth', () => ({
	useRealDebridAccessToken: vi.fn(),
	useAllDebridApiKey: vi.fn(),
	useTorBoxAccessToken: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
	<EnhancedLibraryCacheProvider>{children}</EnhancedLibraryCacheProvider>
);

const mockedUseRealDebridAccessToken = vi.mocked(useRealDebridAccessToken);
const mockedUseAllDebridApiKey = vi.mocked(useAllDebridApiKey);
const mockedUseTorBoxAccessToken = vi.mocked(useTorBoxAccessToken);

describe('EnhancedLibraryCacheContext refreshLibrary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchLibraryMock.mockReset();
		clearLibraryCacheMock.mockReset();
		cacheClearMock.mockReset();
		for (const mockFn of Object.values(torrentDbMocks)) {
			mockFn.mockClear();
		}
		mockedUseRealDebridAccessToken.mockReturnValue([null, false, false]);
		mockedUseAllDebridApiKey.mockReturnValue(null);
		mockedUseTorBoxAccessToken.mockReturnValue(null);
	});

	afterEach(() => {});

	it('refreshes every authenticated service when called without an explicit target', async () => {
		mockedUseRealDebridAccessToken.mockReturnValue(['rd-token', false, false]);
		mockedUseAllDebridApiKey.mockReturnValue('ad-token');
		fetchLibraryMock
			.mockResolvedValueOnce([{ id: 'rd:1' }] as any)
			.mockResolvedValueOnce([{ id: 'ad:1' }] as any);

		const { result } = renderHook(() => useEnhancedLibraryCache(), { wrapper });

		await waitFor(() => expect(result.current.refreshLibrary).toBeDefined());

		await act(async () => {
			await result.current.refreshLibrary(undefined, true);
		});

		expect(fetchLibraryMock).toHaveBeenCalledTimes(2);
		expect(fetchLibraryMock).toHaveBeenNthCalledWith(
			1,
			'realdebrid',
			'rd-token',
			expect.objectContaining({ forceRefresh: true })
		);
		expect(fetchLibraryMock).toHaveBeenNthCalledWith(
			2,
			'alldebrid',
			'ad-token',
			expect.objectContaining({ forceRefresh: true })
		);
	});

	it('throws when a specific service is requested without a token', async () => {
		const { result } = renderHook(() => useEnhancedLibraryCache(), { wrapper });

		await waitFor(() => expect(result.current.refreshLibrary).toBeDefined());

		await expect(
			act(async () => {
				await result.current.refreshLibrary('alldebrid', false);
			})
		).rejects.toThrow('No token for alldebrid');
	});
});
