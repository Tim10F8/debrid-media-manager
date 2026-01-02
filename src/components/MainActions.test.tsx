import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MainActions } from './MainActions';

vi.mock('next/link', () => ({
	__esModule: true,
	default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

describe('MainActions', () => {
	const baseRdUser = {
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

	const baseTbUser = {
		id: 1,
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-01T00:00:00Z',
		email: 'tester@example.com',
		plan: 1,
		total_downloaded: 0,
		customer: 'cus_123',
		server: 1,
		is_subscribed: true,
		premium_expires_at: '2099-01-01',
		cooldown_until: '',
		auth_id: 'auth_123',
		user_referral: 'ref_123',
		base_email: 'tester@example.com',
	};

	it('always renders library and hash list links', () => {
		render(<MainActions rdUser={null} tbUser={null} isLoading={false} />);

		const libraryLink = screen.getByRole('link', { name: /library/i });
		expect(libraryLink.getAttribute('href')).toBe('/library');

		const hashListLink = screen.getByRole('link', { name: /hash lists/i });
		expect(hashListLink.getAttribute('href')).toBe('https://hashlists.debridmediamanager.com');
		expect(hashListLink.getAttribute('target')).toBe('_blank');
	});

	it('shows RD stremio action when only RD user is authenticated', () => {
		render(<MainActions rdUser={baseRdUser} tbUser={null} isLoading={false} />);

		const stremioLink = screen.getByRole('link', { name: /stremio/i });
		expect(stremioLink.getAttribute('href')).toBe('/stremio');
	});

	it('shows TB stremio action when only TB user is authenticated', () => {
		render(<MainActions rdUser={null} tbUser={baseTbUser} isLoading={false} />);

		const stremioLink = screen.getByRole('link', { name: /stremio/i });
		expect(stremioLink.getAttribute('href')).toBe('/stremio-torbox');
	});

	it('shows both stremio actions when both users are authenticated', () => {
		render(<MainActions rdUser={baseRdUser} tbUser={baseTbUser} isLoading={false} />);

		const stremioLinks = screen.getAllByRole('link', { name: /rd|tb/i });
		expect(stremioLinks).toHaveLength(2);
		expect(stremioLinks[0].getAttribute('href')).toBe('/stremio');
		expect(stremioLinks[1].getAttribute('href')).toBe('/stremio-torbox');
	});

	it('hides stremio action when no user is authenticated', () => {
		render(<MainActions rdUser={null} tbUser={null} isLoading={false} />);

		expect(screen.queryByRole('link', { name: /stremio/i })).toBeNull();
	});
});
