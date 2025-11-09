import TorboxLoginPage from '@/pages/torbox/login';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useRouterMock, useLocalStorageMock, getUserDataMock, getSafeRedirectPathMock } = vi.hoisted(
	() => ({
		useRouterMock: vi.fn(),
		useLocalStorageMock: vi.fn(),
		getUserDataMock: vi.fn(),
		getSafeRedirectPathMock: vi.fn(),
	})
);

vi.mock('next/router', () => ({
	useRouter: useRouterMock,
}));

vi.mock('@/hooks/localStorage', () => ({
	default: useLocalStorageMock,
}));

vi.mock('@/services/torbox', () => ({
	getUserData: getUserDataMock,
}));

vi.mock('@/utils/router', () => ({
	getSafeRedirectPath: getSafeRedirectPathMock,
}));

describe('Torbox login page', () => {
	const replaceMock = vi.fn();
	const setApiKeyMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		useRouterMock.mockReturnValue({
			query: { redirect: '/library' },
			replace: replaceMock,
		});
		useLocalStorageMock.mockReturnValue([null, setApiKeyMock]);
		getSafeRedirectPathMock.mockReturnValue('/library');
		(window as any).open = vi.fn();
	});

	const submitApiKey = (value: string) => {
		render(<TorboxLoginPage />);
		fireEvent.change(screen.getByLabelText(/api key/i), { target: { value } });
		fireEvent.click(screen.getByRole('button', { name: /save api key/i }));
	};

	it('validates and stores the API key before redirecting', async () => {
		getUserDataMock.mockResolvedValue({ success: true });

		submitApiKey('tb-key');

		await waitFor(() => expect(getUserDataMock).toHaveBeenCalledWith('tb-key'));
		expect(setApiKeyMock).toHaveBeenCalledWith('tb-key');
		expect(replaceMock).toHaveBeenCalledWith('/library');
	});

	it('surfaced API errors to the user', async () => {
		getUserDataMock.mockRejectedValue({
			message: 'bad key',
			response: { data: { message: 'invalid' }, status: 401 },
		});

		submitApiKey('tb-key');

		await waitFor(() =>
			expect(screen.getByText(/API Error: invalid. Status: 401/i)).toBeInTheDocument()
		);
	});

	it('opens the Torbox settings link', () => {
		render(<TorboxLoginPage />);
		fireEvent.click(screen.getByRole('button', { name: /get api key/i }));
		expect(window.open).toHaveBeenCalledWith('https://torbox.app/settings', '_blank');
	});
});
