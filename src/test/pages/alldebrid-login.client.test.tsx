import AllDebridLoginPage from '@/pages/alldebrid/login';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useRouterMock, useLocalStorageMock, getPinMock, checkPinMock, getSafeRedirectPathMock } =
	vi.hoisted(() => ({
		useRouterMock: vi.fn(),
		useLocalStorageMock: vi.fn(),
		getPinMock: vi.fn(),
		checkPinMock: vi.fn(),
		getSafeRedirectPathMock: vi.fn(),
	}));

vi.mock('next/router', () => ({
	useRouter: useRouterMock,
}));

vi.mock('@/hooks/localStorage', () => ({
	default: useLocalStorageMock,
}));

vi.mock('@/services/allDebrid', () => ({
	getPin: getPinMock,
	checkPin: checkPinMock,
}));

vi.mock('@/utils/router', () => ({
	getSafeRedirectPath: getSafeRedirectPathMock,
}));

describe('AllDebrid login page', () => {
	const replaceMock = vi.fn();
	const pushMock = vi.fn();
	const setApiKeyMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		useRouterMock.mockReturnValue({
			isReady: true,
			query: {},
			replace: replaceMock,
			push: pushMock,
			asPath: '/alldebrid/login',
			pathname: '/alldebrid/login',
		});
		useLocalStorageMock.mockReturnValue([null, setApiKeyMock]);
		getSafeRedirectPathMock.mockReturnValue('/');
		(window as any).open = vi.fn();
		(navigator as any).clipboard = {
			writeText: vi.fn().mockRejectedValue(new Error('clipboard blocked')),
		};
	});

	it('requests a pin code and stores the resulting API key', async () => {
		getPinMock.mockResolvedValue({
			user_url: 'https://alldebrid.com/pin',
			check: 'https://alldebrid.com/check',
			pin: '1234',
		});
		checkPinMock.mockResolvedValue({ apikey: 'new-key' });

		render(<AllDebridLoginPage />);

		await waitFor(() => screen.getByText(/enter this code/i));
		expect(screen.getByText(/1234/)).toBeInTheDocument();
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1234');
		expect(setApiKeyMock).toHaveBeenCalledWith('new-key');

		fireEvent.click(screen.getByRole('button', { name: /authorize/i }));
		expect(window.open).toHaveBeenCalledWith('https://alldebrid.com/pin', '_blank');
	});

	it('redirects once an API key already exists', async () => {
		useLocalStorageMock.mockReturnValueOnce(['stored-key', vi.fn()]);
		getSafeRedirectPathMock.mockReturnValueOnce('/library');

		render(<AllDebridLoginPage />);

		await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/library'));
		expect(getPinMock).not.toHaveBeenCalled();
	});
});
