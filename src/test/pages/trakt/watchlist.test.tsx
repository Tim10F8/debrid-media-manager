import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/withAuth', () => ({
	withAuth: (component: any) => component,
}));

const localStorageMock = vi.hoisted(() =>
	vi.fn((key: string) => [key.includes('accessToken') ? 'watch-token' : 'watch-slug'])
);

vi.mock('@/hooks/localStorage', () => ({
	default: localStorageMock,
}));

vi.mock('@/components/poster', () => ({
	default: ({ title }: { title: string }) => <div>{title}</div>,
}));

const traktMocks = vi.hoisted(() => ({
	getWatchlistMovies: vi.fn(),
	getWatchlistShows: vi.fn(),
}));

vi.mock('@/services/trakt', () => traktMocks);

vi.mock('next/head', () => ({
	default: ({ children }: any) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
	Toaster: () => null,
}));

import TraktWatchlist from '@/pages/trakt/watchlist';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('TraktWatchlist page', () => {
	it('renders watchlist items from movies and shows', async () => {
		traktMocks.getWatchlistMovies.mockResolvedValue([
			{
				type: 'movie',
				movie: { ids: { imdb: 'tt3' }, title: 'Queued Film' },
			},
		]);
		traktMocks.getWatchlistShows.mockResolvedValue([
			{
				type: 'show',
				show: { ids: { imdb: 'tt4' }, title: 'Queued Show' },
			},
		]);

		render(<TraktWatchlist />);

		await waitFor(() => {
			expect(screen.getByText('Queued Film')).toBeInTheDocument();
			expect(screen.getByText('Queued Show')).toBeInTheDocument();
		});
		expect(traktMocks.getWatchlistMovies).toHaveBeenCalledWith('watch-token');
		expect(traktMocks.getWatchlistShows).toHaveBeenCalledWith('watch-token');
	});
});
