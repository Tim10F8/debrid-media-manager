import type { TraktSearchResult } from '@/services/trakt';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from './SearchBar';

const push = vi.fn();

vi.mock('next/router', () => ({
	useRouter: () => ({ push }),
}));

vi.mock('axios', () => ({
	__esModule: true,
	default: { get: vi.fn() },
}));
const mockedGet = axios.get as ReturnType<typeof vi.fn>;

vi.mock('./poster', () => ({
	__esModule: true,
	default: ({ imdbId }: { imdbId: string }) => <div data-testid={`poster-${imdbId}`} />,
}));

describe('SearchBar', () => {
	beforeEach(() => {
		push.mockReset();
		mockedGet.mockReset();
	});

	const typeQuery = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
		const input = screen.getByPlaceholderText('Search movies & shows...');
		await user.clear(input);
		await user.type(input, value);
		return input;
	};

	it('debounces queries, shows suggestions, and routes movie selections', async () => {
		const user = userEvent.setup();
		const suggestion: TraktSearchResult = {
			type: 'movie',
			score: 100,
			movie: {
				title: 'Inception',
				year: 2010,
				ids: { imdb: 'tt1375666', trakt: 1 },
			},
		};
		mockedGet.mockResolvedValue({ data: [suggestion] });

		render(<SearchBar />);
		await typeQuery(user, 'Inception');

		await waitFor(() =>
			expect(mockedGet).toHaveBeenCalledWith(
				expect.stringContaining('/api/trakt/search?query=Inception')
			)
		);

		await user.click(await screen.findByText('Inception'));
		await waitFor(() => expect(push).toHaveBeenCalledWith('/movie/tt1375666'));
	});

	it('falls back to search routing when suggestion lacks an IMDb id', async () => {
		const user = userEvent.setup();
		const suggestion: TraktSearchResult = {
			type: 'show',
			score: 85,
			show: {
				title: 'Severance',
				year: 2022,
				ids: { trakt: 2 },
			},
		};
		mockedGet.mockResolvedValue({ data: [suggestion] });

		render(<SearchBar />);
		await typeQuery(user, 'Severance');
		await waitFor(() => expect(mockedGet).toHaveBeenCalled());

		await user.click(await screen.findByText('Severance'));
		await waitFor(() => expect(push).toHaveBeenCalledWith('/search?query=Severance'));
	});

	it('submits IMDb identifiers directly and generic queries through search page', async () => {
		render(<SearchBar />);
		const user = userEvent.setup();

		await typeQuery(user, 'tt7654321');
		await user.click(screen.getByRole('button', { name: /Search/i }));
		await waitFor(() => expect(push).toHaveBeenCalledWith('/x/tt7654321/'));

		push.mockClear();
		await typeQuery(user, 'Avatar');
		await user.click(screen.getByRole('button', { name: /Search/i }));
		await waitFor(() => expect(push).toHaveBeenCalledWith('/search?query=Avatar'));
	});

	it('closes suggestions when clicking outside and ignores short queries', async () => {
		const user = userEvent.setup();
		mockedGet.mockResolvedValue({
			data: [
				{
					type: 'movie',
					score: 92,
					movie: {
						title: 'Dune',
						year: 2021,
						ids: { imdb: 'tt1160419', trakt: 3 },
					},
				} as TraktSearchResult,
			],
		});

		render(<SearchBar />);
		await typeQuery(user, 'D');
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(mockedGet).not.toHaveBeenCalled();

		await typeQuery(user, 'Dune');
		await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

		await screen.findByText('Dune');
		fireEvent.mouseDown(document.body);
		await waitFor(() => expect(screen.queryByText('Dune')).toBeNull());
	});
});
