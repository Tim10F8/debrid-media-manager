import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentUserMock = vi.fn();

const { checkPremiumStatusMock, pushMock, toastMock } = vi.hoisted(() => ({
	checkPremiumStatusMock: vi.fn().mockResolvedValue({ shouldLogout: false }),
	pushMock: vi.fn(),
	toastMock: Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock('@/components/BrowseSection', () => ({
	__esModule: true,
	BrowseSection: () => <div data-testid="browse-section" />,
}));

vi.mock('@/components/InfoSection', () => ({
	__esModule: true,
	InfoSection: () => <div data-testid="info-section" />,
}));

vi.mock('@/components/Logo', () => ({
	__esModule: true,
	Logo: () => <div data-testid="logo" />,
}));

vi.mock('@/components/MainActions', () => ({
	__esModule: true,
	MainActions: () => <div data-testid="main-actions" />,
}));

vi.mock('@/components/SearchBar', () => ({
	__esModule: true,
	SearchBar: () => <div data-testid="search-bar" />,
}));

vi.mock('@/components/ServiceCard', () => ({
	__esModule: true,
	ServiceCard: () => <div data-testid="service-card" />,
}));

vi.mock('@/components/SettingsSection', () => ({
	__esModule: true,
	SettingsSection: () => <div data-testid="settings-section" />,
}));

vi.mock('@/components/TraktSection', () => ({
	__esModule: true,
	TraktSection: () => <div data-testid="trakt-section" />,
}));

vi.mock('@/hooks/auth', () => ({
	__esModule: true,
	useCurrentUser: () => currentUserMock(),
	useDebridLogin: () => ({
		loginWithRealDebrid: vi.fn(),
		loginWithAllDebrid: vi.fn(),
		loginWithTorbox: vi.fn(),
	}),
}));

vi.mock('@/hooks/castToken', () => ({
	__esModule: true,
	useCastToken: () => undefined,
}));

vi.mock('@/utils/browseTerms', () => ({
	__esModule: true,
	getTerms: () => ['search-term'],
}));

vi.mock('@/utils/logout', () => ({
	__esModule: true,
	handleLogout: vi.fn(),
}));

vi.mock('@/utils/premiumCheck', () => ({
	__esModule: true,
	checkPremiumStatus: () => checkPremiumStatusMock(),
}));

vi.mock('@/utils/toastOptions', () => ({
	__esModule: true,
	genericToastOptions: {},
}));

vi.mock('@/utils/withAuth', () => ({
	__esModule: true,
	withAuth: (component: any) => component,
}));

vi.mock('lucide-react', () => ({
	__esModule: true,
	Megaphone: () => <svg data-testid="megaphone-icon" />,
	Star: () => <svg data-testid="star-icon" />,
	X: () => <svg data-testid="x-icon" />,
}));

vi.mock('next/head', () => ({
	__esModule: true,
	default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
	__esModule: true,
	default: ({ href, children, ...rest }: any) => (
		<a href={typeof href === 'string' ? href : String(href)} {...rest}>
			{children}
		</a>
	),
}));

vi.mock('next/router', () => ({
	__esModule: true,
	useRouter: () => ({
		push: pushMock,
		prefetch: vi.fn(),
		replace: vi.fn(),
		asPath: '/',
	}),
}));

vi.mock('react-hot-toast', () => ({
	__esModule: true,
	default: toastMock,
	Toaster: () => null,
}));

import IndexPage from '@/pages/index';

describe('IndexPage Real-Debrid status link', () => {
	beforeEach(() => {
		currentUserMock.mockReset();
		checkPremiumStatusMock.mockClear();
	});

	it('shows the Real-Debrid status helper when an RD user is present', () => {
		currentUserMock.mockReturnValue({
			rdUser: { username: 'demo' },
			rdError: null,
			hasRDAuth: true,
			rdIsRefreshing: false,
			adUser: null,
			adError: null,
			hasADAuth: false,
			tbUser: null,
			tbError: null,
			hasTBAuth: false,
			traktUser: null,
			traktError: null,
			hasTraktAuth: false,
			isLoading: false,
		});

		render(<IndexPage />);

		const statusLink = screen.getByRole('link', { name: 'Is Real-Debrid down?' });
		expect(statusLink).toBeTruthy();
		expect(statusLink).toHaveAttribute('href', '/is-real-debrid-down-or-just-me');
	});

	it('hides the Real-Debrid status helper when the user is logged out of RD', () => {
		currentUserMock.mockReturnValue({
			rdUser: null,
			rdError: null,
			hasRDAuth: false,
			rdIsRefreshing: false,
			adUser: null,
			adError: null,
			hasADAuth: false,
			tbUser: null,
			tbError: null,
			hasTBAuth: false,
			traktUser: null,
			traktError: null,
			hasTraktAuth: false,
			isLoading: false,
		});

		render(<IndexPage />);

		expect(screen.queryByRole('link', { name: 'Is Real-Debrid down?' })).toBeNull();
	});
});
