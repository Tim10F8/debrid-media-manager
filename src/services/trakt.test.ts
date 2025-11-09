import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('axios', () => ({
	default: {
		get: vi.fn(),
	},
}));

vi.mock('next/config', () => ({
	default: () => ({
		publicRuntimeConfig: { traktClientId: 'client-id' },
	}),
}));

import {
	fetchListItems,
	getCollectionMovies,
	getCollectionShows,
	getLikedLists,
	getMediaData,
	getPopularByGenre,
	getSearchSuggestions,
	getTraktUser,
	getTrendingByGenre,
	getUsersPersonalLists,
	getWatchlistMovies,
	getWatchlistShows,
} from './trakt';

const mockedGet = vi.mocked(axios.get);

describe('trakt service helpers', () => {
	beforeEach(() => {
		mockedGet.mockReset();
	});

	it('returns suggestions for valid search queries and handles failures', async () => {
		mockedGet.mockResolvedValueOnce({
			data: [{ type: 'movie', score: 10 }],
		} as any);
		const results = await getSearchSuggestions('blade runner', ['movie'], 'client-id');
		expect(results).toHaveLength(1);
		expect(mockedGet).toHaveBeenCalledWith(
			expect.stringContaining('/search/movie?query=blade%20runner'),
			expect.any(Object)
		);

		mockedGet.mockRejectedValueOnce(new Error('network'));
		const fallback = await getSearchSuggestions('noise', ['movie'], 'client-id');
		expect(fallback).toEqual([]);
	});

	it('returns empty array when search query is blank', async () => {
		const results = await getSearchSuggestions('', ['movie'], 'client-id');
		expect(results).toEqual([]);
		expect(mockedGet).not.toHaveBeenCalled();
	});

	it('fetches generic media data and rethrows errors', async () => {
		mockedGet.mockResolvedValueOnce({ data: [{ movie: { title: 'A' } }] } as any);
		const data = await getMediaData('client-id', 'movies/popular');
		expect(data).toHaveLength(1);

		const boom = new Error('boom');
		mockedGet.mockRejectedValueOnce(boom);
		await expect(getMediaData('client-id', 'movies/popular')).rejects.toBe(boom);
	});

	it('fetches trending and popular genres with graceful fallbacks', async () => {
		mockedGet.mockResolvedValueOnce({ data: [{ movie: { title: 'Trending' } }] } as any);
		const trending = await getTrendingByGenre('client-id', 'sci-fi', 'movies');
		expect(trending).toHaveLength(1);

		mockedGet.mockRejectedValueOnce(new Error('fail'));
		const trendingFallback = await getTrendingByGenre('client-id', 'sci-fi', 'movies');
		expect(trendingFallback).toEqual([]);

		mockedGet.mockResolvedValueOnce({
			data: [{ title: 'Popular', year: 2020, ids: { trakt: 1 } }],
		} as any);
		const popular = await getPopularByGenre('client-id', 'sci-fi', 'movies');
		expect(popular[0].movie).toMatchObject({ title: 'Popular', year: 2020 });
	});

	it('retrieves trakt user settings and propagates errors', async () => {
		mockedGet.mockResolvedValueOnce({
			status: 200,
			data: { user: { username: 'demo' } },
		} as any);
		const user = await getTraktUser('token');
		expect(user.user.username).toBe('demo');

		const error = new Error('unauthorized');
		mockedGet.mockRejectedValueOnce(error);
		await expect(getTraktUser('token')).rejects.toThrow('unauthorized');
	});

	it('paginates through personal and liked lists', async () => {
		mockedGet
			.mockResolvedValueOnce({ data: [{ name: 'List 1' }] } as any)
			.mockResolvedValueOnce({ data: [] } as any);
		const personal = await getUsersPersonalLists('token', 'slug');
		expect(personal).toHaveLength(1);

		mockedGet.mockReset();
		mockedGet
			.mockResolvedValueOnce({ data: [{ list: { name: 'Liked' } }] } as any)
			.mockResolvedValueOnce({ data: [] } as any);
		const liked = await getLikedLists('token', 'slug');
		expect(liked).toHaveLength(1);
	});

	it('fetches list items and surfaces failures', async () => {
		mockedGet.mockResolvedValueOnce({ data: [{ movie: { title: 'Entry' } }] } as any);
		const items = await fetchListItems('token', 'slug', 1, 'movies');
		expect(items).toHaveLength(1);

		mockedGet.mockRejectedValueOnce(new Error('bad'));
		await expect(fetchListItems('token', 'slug', 2)).rejects.toThrow(
			'Error fetching list items'
		);
	});

	it('retrieves watchlists and collections', async () => {
		mockedGet.mockResolvedValueOnce({ data: [{ type: 'movie' }] } as any);
		const wlMovies = await getWatchlistMovies('token');
		expect(wlMovies).toHaveLength(1);

		mockedGet.mockResolvedValueOnce({ data: [{ type: 'show' }] } as any);
		const wlShows = await getWatchlistShows('token');
		expect(wlShows).toHaveLength(1);

		mockedGet.mockResolvedValueOnce({ data: [{ movie: { title: 'Collector' } }] } as any);
		const collectionMovies = await getCollectionMovies('token');
		expect(collectionMovies).toHaveLength(1);

		mockedGet.mockRejectedValueOnce(new Error('collection error'));
		await expect(getCollectionShows('token')).rejects.toThrow('collection error');
	});
});
