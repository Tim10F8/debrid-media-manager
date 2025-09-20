import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MainActions } from './MainActions';

vi.mock('next/link', () => ({
	__esModule: true,
	default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

describe('MainActions', () => {
	const baseUser = {
		id: 1,
		username: 'tester',
		email: 'tester@example.com',
		points: 0,
		locale: 'en',
		avatar: '',
		type: 'premium' as const,
		premium: 1,
		expiration: '2099-01-01',
	};

	it('always renders library and hash list links', () => {
		render(<MainActions rdUser={null} isLoading={false} />);

		const libraryLink = screen.getByRole('link', { name: /library/i });
		expect(libraryLink.getAttribute('href')).toBe('/library');

		const hashListLink = screen.getByRole('link', { name: /hash lists/i });
		expect(hashListLink.getAttribute('href')).toBe('https://hashlists.debridmediamanager.com');
		expect(hashListLink.getAttribute('target')).toBe('_blank');
	});

	it('shows stremio action when the user is authenticated', () => {
		render(<MainActions rdUser={baseUser} isLoading={false} />);

		const stremioLink = screen.getByRole('link', { name: /stremio/i });
		expect(stremioLink.getAttribute('href')).toBe('/stremio');
	});

	it('hides stremio action when the user is not authenticated', () => {
		render(<MainActions rdUser={null} isLoading={false} />);

		expect(screen.queryByRole('link', { name: /stremio/i })).toBeNull();
	});
});
