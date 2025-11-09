import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/withAuth', () => ({
	withAuth: (component: any) => component,
}));

const localStorageMock = vi.hoisted(() =>
	vi.fn((key: string) => [key.includes('accessToken') ? 'tok' : 'slug'])
);

vi.mock('@/hooks/localStorage', () => ({
	default: localStorageMock,
}));

vi.mock('@/components/poster', () => ({
	default: ({ title }: { title: string }) => <div>{title}</div>,
}));

const traktMocks = vi.hoisted(() => ({
	getCollectionMovies: vi.fn(),
	getCollectionShows: vi.fn(),
}));

vi.mock('@/services/trakt', () => traktMocks);

vi.mock('next/head', () => ({
	default: ({ children }: any) => <>{children}</>,
}));

vi.mock('react-hot-toast', () => ({
	Toaster: () => null,
}));

import TraktCollection from '@/pages/trakt/collection';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('TraktCollection page', () => {
	it('renders posters for movies and shows in the collection', async () => {
		traktMocks.getCollectionMovies.mockResolvedValue([
			{
				movie: { ids: { imdb: 'tt1' }, title: 'Movie A' },
				last_collected_at: '2024-01-02T00:00:00Z',
			},
		]);
		traktMocks.getCollectionShows.mockResolvedValue([
			{
				show: { ids: { imdb: 'tt2' }, title: 'Show B' },
				last_collected_at: '2024-01-03T00:00:00Z',
			},
		]);

		render(<TraktCollection />);

		await waitFor(() => {
			expect(screen.getByText('Movie A')).toBeInTheDocument();
			expect(screen.getByText('Show B')).toBeInTheDocument();
		});
		expect(traktMocks.getCollectionMovies).toHaveBeenCalledWith('tok');
		expect(traktMocks.getCollectionShows).toHaveBeenCalledWith('tok');
	});
});
