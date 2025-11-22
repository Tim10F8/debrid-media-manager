import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SearchTokens from './SearchTokens';

describe('SearchTokens', () => {
	it('renders tokens from title words and year', () => {
		const onTokenClick = vi.fn();
		render(<SearchTokens title="Breaking Bad" year="2008" onTokenClick={onTokenClick} />);

		expect(screen.getByText('breaking')).toBeInTheDocument();
		expect(screen.getByText('bad')).toBeInTheDocument();
		expect(screen.getByText('2008')).toBeInTheDocument();
	});

	it('formats year as season number for shows', () => {
		const onTokenClick = vi.fn();
		render(
			<SearchTokens
				title="Game of Thrones"
				year="1"
				isShow={true}
				onTokenClick={onTokenClick}
			/>
		);

		expect(screen.getByText('s01')).toBeInTheDocument();
	});

	it('handles multi-digit season numbers', () => {
		const onTokenClick = vi.fn();
		render(
			<SearchTokens
				title="The Simpsons"
				year="12"
				isShow={true}
				onTokenClick={onTokenClick}
			/>
		);

		expect(screen.getByText('s12')).toBeInTheDocument();
	});

	it('calls onTokenClick when a token is clicked', async () => {
		const onTokenClick = vi.fn();
		const user = userEvent.setup();
		render(<SearchTokens title="The Matrix" year="1999" onTokenClick={onTokenClick} />);

		await user.click(screen.getByText('matrix'));

		expect(onTokenClick).toHaveBeenCalledWith('matrix');
	});

	it('removes duplicate tokens', () => {
		const onTokenClick = vi.fn();
		render(<SearchTokens title="The The Movie" year="2020" onTokenClick={onTokenClick} />);

		const theTokens = screen.getAllByText('the');
		expect(theTokens).toHaveLength(1);
	});

	it('filters out empty strings from title', () => {
		const onTokenClick = vi.fn();
		const { container } = render(
			<SearchTokens title="  Multiple   Spaces  " year="2021" onTokenClick={onTokenClick} />
		);

		const tokens = container.querySelectorAll('span');
		expect(tokens.length).toBe(3); // multiple, spaces, 2021
	});

	it('converts title to lowercase', () => {
		const onTokenClick = vi.fn();
		render(<SearchTokens title="UPPERCASE TITLE" year="2022" onTokenClick={onTokenClick} />);

		expect(screen.getByText('uppercase')).toBeInTheDocument();
		expect(screen.getByText('title')).toBeInTheDocument();
	});

	it('applies correct CSS classes for styling', () => {
		const onTokenClick = vi.fn();
		const { container } = render(
			<SearchTokens title="Test" year="2023" onTokenClick={onTokenClick} />
		);

		const token = container.querySelector('span');
		expect(token).toHaveClass('cursor-pointer', 'whitespace-nowrap', 'rounded', 'border');
	});
});
