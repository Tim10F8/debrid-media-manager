import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceCard } from './ServiceCard';

const modalControls = vi.hoisted(() => ({
	fireMock: vi.fn(),
	dismissReasons: { cancel: 'cancel' } as const,
}));

vi.mock('../components/modals/modal', () => ({
	__esModule: true,
	default: {
		fire: (...args: unknown[]) => modalControls.fireMock(...args),
		DismissReason: modalControls.dismissReasons,
	},
}));

const fireMock = modalControls.fireMock;
const dismissReasons = modalControls.dismissReasons;

const baseRdUser = {
	id: 1,
	username: 'rd-user',
	email: 'rd@example.com',
	points: 10,
	locale: 'en',
	avatar: '',
	type: 'premium',
	premium: 172800,
	expiration: new Date(Date.now() + 86400000).toISOString(),
} as any;

const baseAdUser = {
	username: 'ad-user',
	email: 'ad@example.com',
	isPremium: true,
	isSubscribed: true,
	isTrial: false,
	premiumUntil: Math.floor(Date.now() / 1000) + 86400,
	lang: 'en',
	preferedDomain: 'alldebrid.com',
	fidelityPoints: 12,
} as any;

const baseTbUser = {
	email: 'tb@example.com',
	created_at: new Date('2023-01-01').toISOString(),
	plan: 2,
	premium_expires_at: new Date(Date.now() + 86400000).toISOString(),
	total_downloaded: 5,
	cooldown_until: null,
	user_referral: 'ref123',
} as any;

const baseTraktUser = {
	user: {
		username: 'trakt-user',
		private: false,
		vip: true,
		joined_at: new Date('2022-01-01').toISOString(),
	},
} as any;

beforeEach(() => {
	fireMock.mockReset();
});

describe('ServiceCard', () => {
	it('launches Real-Debrid details and confirms logout when requested', async () => {
		const onLogout = vi.fn();
		fireMock
			.mockResolvedValueOnce({ isDismissed: true, dismiss: dismissReasons.cancel })
			.mockResolvedValueOnce({ isConfirmed: true });

		render(
			<ServiceCard
				service="rd"
				user={baseRdUser}
				onTraktLogin={vi.fn()}
				onLogout={onLogout}
			/>
		);

		await userEvent.click(screen.getByRole('button', { name: /Real-Debrid/i }));

		await waitFor(() => expect(fireMock).toHaveBeenCalledTimes(2));
		expect(fireMock.mock.calls[0][0].title).toBe('Real-Debrid');
		expect(onLogout).toHaveBeenCalledWith('rd:');
	});

	it('shows AllDebrid, Torbox, and Trakt account shortcuts', () => {
		render(
			<div className="space-y-2">
				<ServiceCard
					service="ad"
					user={baseAdUser}
					onTraktLogin={vi.fn()}
					onLogout={vi.fn()}
				/>
				<ServiceCard
					service="tb"
					user={baseTbUser}
					onTraktLogin={vi.fn()}
					onLogout={vi.fn()}
				/>
				<ServiceCard
					service="trakt"
					user={baseTraktUser}
					onTraktLogin={vi.fn()}
					onLogout={vi.fn()}
				/>
			</div>
		);

		expect(screen.getByRole('button', { name: /AllDebrid/ })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Torbox/ })).toHaveTextContent('tb');
		expect(screen.getByRole('button', { name: /Trakt/ })).toHaveTextContent('trakt-user');
	});

	it('presents login buttons when accounts are missing', async () => {
		const onLogin = vi.fn();
		render(
			<div className="space-y-2">
				<ServiceCard service="rd" user={null} onTraktLogin={onLogin} onLogout={vi.fn()} />
				<ServiceCard service="tb" user={null} onTraktLogin={onLogin} onLogout={vi.fn()} />
				<ServiceCard
					service="trakt"
					user={null}
					onTraktLogin={onLogin}
					onLogout={vi.fn()}
				/>
			</div>
		);

		const loginButtons = screen.getAllByRole('button', { name: /Login/ });
		expect(loginButtons).toHaveLength(3);
		await userEvent.click(loginButtons[0]);
		await userEvent.click(loginButtons[1]);
		await userEvent.click(loginButtons[2]);
		expect(onLogin).toHaveBeenCalledTimes(3);
	});
});
