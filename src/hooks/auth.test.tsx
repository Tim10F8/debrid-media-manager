import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRealDebridStateForTests, useCurrentUser, useRealDebridAccessToken } from './auth';

const {
	mockGetRealDebridUser,
	mockGetToken,
	mockGetAllDebridUser,
	mockGetTorboxUser,
	mockGetTraktUser,
} = vi.hoisted(() => ({
	mockGetRealDebridUser: vi.fn(),
	mockGetToken: vi.fn(),
	mockGetAllDebridUser: vi.fn(),
	mockGetTorboxUser: vi.fn(),
	mockGetTraktUser: vi.fn(),
}));

vi.mock('../services/realDebrid', () => ({
	getCurrentUser: mockGetRealDebridUser,
	getToken: mockGetToken,
}));

vi.mock('../services/allDebrid', () => ({
	getAllDebridUser: mockGetAllDebridUser,
}));

vi.mock('../services/torbox', () => ({
	getUserData: mockGetTorboxUser,
}));

vi.mock('../services/trakt', () => ({
	getTraktUser: mockGetTraktUser,
}));

const setStoredValue = (key: string, value: unknown) => {
	window.localStorage.setItem(key, JSON.stringify(value));
};

describe('auth hooks', () => {
	beforeEach(() => {
		window.localStorage.clear();
		__resetRealDebridStateForTests();
		vi.clearAllMocks();
	});

	it('returns existing RD token once the user is validated', async () => {
		setStoredValue('rd:accessToken', 'rd-token');
		setStoredValue('rd:refreshToken', 'refresh');
		setStoredValue('rd:clientId', 'client');
		setStoredValue('rd:clientSecret', 'secret');
		mockGetRealDebridUser.mockResolvedValue({ username: 'rd-user' });

		const { result } = renderHook(() => useRealDebridAccessToken());

		await waitFor(() => expect(result.current[1]).toBe(false));
		expect(result.current[0]).toBe('rd-token');
		expect(mockGetRealDebridUser).toHaveBeenCalledWith('rd-token');
	});

	it('refreshes RD token when the stored one is invalid', async () => {
		setStoredValue('rd:accessToken', 'stale');
		setStoredValue('rd:refreshToken', 'refresh');
		setStoredValue('rd:clientId', 'client');
		setStoredValue('rd:clientSecret', 'secret');
		mockGetRealDebridUser
			.mockRejectedValueOnce(new Error('expired'))
			.mockResolvedValueOnce({ username: 'rd-user' });
		mockGetToken.mockResolvedValue({ access_token: 'new-token', expires_in: 60 });

		const { result } = renderHook(() => useRealDebridAccessToken());

		await waitFor(() => expect(result.current[1]).toBe(false));
		expect(mockGetToken).toHaveBeenCalledWith('client', 'secret', 'refresh');
		expect(mockGetRealDebridUser).toHaveBeenLastCalledWith('new-token');
	});

	it('combines providers in useCurrentUser', async () => {
		setStoredValue('rd:accessToken', 'rd-token');
		setStoredValue('rd:refreshToken', 'refresh');
		setStoredValue('rd:clientId', 'client');
		setStoredValue('rd:clientSecret', 'secret');
		setStoredValue('ad:apiKey', 'ad-key');
		setStoredValue('tb:apiKey', 'tb-key');
		setStoredValue('trakt:accessToken', 'trakt-token');

		mockGetRealDebridUser.mockResolvedValue({ username: 'rd-user' });
		mockGetAllDebridUser.mockResolvedValue({ username: 'ad-user' });
		mockGetTorboxUser.mockResolvedValue({ success: true, data: { email: 'tb@example.com' } });
		mockGetTraktUser.mockResolvedValue({ user: { ids: { slug: 'sluggy' } } });

		const { result } = renderHook(() => useCurrentUser());

		await waitFor(() => expect(result.current.rdUser?.username).toBe('rd-user'));
		expect(result.current.hasRDAuth).toBe(true);
		expect(result.current.adUser?.username).toBe('ad-user');
		expect(result.current.tbUser?.email).toBe('tb@example.com');
		expect(result.current.hasTraktAuth).toBe(true);
		expect(window.localStorage.getItem('trakt:userSlug')).toContain('sluggy');
	});

	it('authenticates after login when page remounts with new tokens', async () => {
		mockGetRealDebridUser.mockResolvedValue({ username: 'rd-user' });

		const { result: result1, unmount } = renderHook(() => useRealDebridAccessToken());

		await waitFor(() => expect(result1.current[1]).toBe(false));
		expect(result1.current[0]).toBeNull();
		expect(mockGetRealDebridUser).not.toHaveBeenCalled();

		unmount();
		__resetRealDebridStateForTests();

		setStoredValue('rd:accessToken', 'new-token');
		setStoredValue('rd:refreshToken', 'refresh');
		setStoredValue('rd:clientId', 'client');
		setStoredValue('rd:clientSecret', 'secret');

		const { result: result2 } = renderHook(() => useRealDebridAccessToken());

		await waitFor(() => expect(result2.current[1]).toBe(false));
		expect(result2.current[0]).toBe('new-token');
		expect(mockGetRealDebridUser).toHaveBeenCalledWith('new-token');
	});
});
