import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerMock = {
	query: { code: 'abc123' },
	push: vi.fn(),
};

vi.mock('next/router', () => ({
	useRouter: () => routerMock,
}));

const localStorageMock = vi.hoisted(() => ({
	setRefreshToken: vi.fn(),
	setAccessToken: vi.fn(),
}));

vi.mock('@/hooks/localStorage', () => ({
	default: (key: string) => [
		null,
		key.includes('refreshToken')
			? localStorageMock.setRefreshToken
			: localStorageMock.setAccessToken,
	],
}));

import TraktCallbackPage from '@/pages/trakt/callback';

beforeEach(() => {
	vi.clearAllMocks();
	(globalThis.fetch as any) = vi.fn();
});

describe('TraktCallbackPage', () => {
	it('stores tokens and redirects on success', async () => {
		(globalThis.fetch as any).mockResolvedValue({
			json: async () => ({
				access_token: 'new-access',
				refresh_token: 'new-refresh',
				expires_in: 3600,
			}),
		});

		render(<TraktCallbackPage />);

		await waitFor(() => {
			expect(localStorageMock.setAccessToken).toHaveBeenCalledWith('new-access', 3600);
			expect(localStorageMock.setRefreshToken).toHaveBeenCalledWith('new-refresh');
			expect(routerMock.push).toHaveBeenCalledWith('/');
		});
	});

	it('shows errors from the exchange endpoint', async () => {
		(globalThis.fetch as any).mockResolvedValue({
			json: async () => ({
				error: 'invalid_grant',
				error_description: 'Code expired',
			}),
		});

		render(<TraktCallbackPage />);

		await waitFor(() => {
			expect(screen.getByText('Error: invalid_grant, Code expired')).toBeInTheDocument();
		});
		expect(localStorageMock.setAccessToken).not.toHaveBeenCalled();
	});
});
