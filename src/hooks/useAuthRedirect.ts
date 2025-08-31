import { useRouter } from 'next/router';
import { useEffect } from 'react';

const START_ROUTE = '/start';
const LOGIN_ROUTE = '/login';
const RETURN_URL_KEY = 'dmm_return_url';

interface UseAuthRedirectOptions {
	isAuthenticated: boolean;
	isLoading: boolean;
	requireAuth?: boolean;
}

export const useAuthRedirect = ({
	isAuthenticated,
	isLoading,
	requireAuth = true,
}: UseAuthRedirectOptions) => {
	const router = useRouter();

	useEffect(() => {
		// Don't redirect while loading
		if (isLoading) {
			return;
		}

		const currentPath = router.pathname;
		const isAuthRoute = currentPath === START_ROUTE || currentPath.endsWith(LOGIN_ROUTE);

		// Handle unauthenticated users on protected routes
		if (!isAuthenticated && requireAuth && !isAuthRoute) {
			// Store the current URL to return to after login
			localStorage.setItem(RETURN_URL_KEY, router.asPath);
			router.push(START_ROUTE);
			return;
		}

		// Handle authenticated users - check for return URL
		if (isAuthenticated && !isAuthRoute) {
			const returnUrl = localStorage.getItem(RETURN_URL_KEY);
			if (returnUrl && returnUrl !== START_ROUTE && !returnUrl.endsWith(LOGIN_ROUTE)) {
				localStorage.removeItem(RETURN_URL_KEY);
				router.push(returnUrl);
			}
		}
	}, [isAuthenticated, isLoading, requireAuth, router]);

	return { isRedirecting: isLoading };
};

export const clearReturnUrl = () => {
	localStorage.removeItem(RETURN_URL_KEY);
};

export const getReturnUrl = () => {
	return localStorage.getItem(RETURN_URL_KEY);
};
