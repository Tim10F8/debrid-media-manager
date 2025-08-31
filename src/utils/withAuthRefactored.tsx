import { Logo } from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import { ComponentType } from 'react';

interface WithAuthOptions {
	requireAuth?: boolean;
	fallback?: React.ReactNode;
}

export const withAuth = <P extends object>(
	Component: ComponentType<P>,
	options: WithAuthOptions = {}
) => {
	const { requireAuth = true, fallback } = options;

	return function WithAuthComponent(props: P) {
		const { isAuthenticated, isLoading } = useAuth();
		const { isRedirecting } = useAuthRedirect({
			isAuthenticated,
			isLoading,
			requireAuth,
		});

		// Show loading state while checking auth or redirecting
		if (isLoading || isRedirecting) {
			if (fallback) {
				return <>{fallback}</>;
			}

			return (
				<div className="flex min-h-screen flex-col items-center justify-center">
					<Logo />
					<h1 className="text-2xl">Debrid Media Manager is loading...</h1>
				</div>
			);
		}

		// If auth is required but user is not authenticated, they'll be redirected
		// by useAuthRedirect hook, so we can show loading state
		if (requireAuth && !isAuthenticated) {
			return (
				<div className="flex min-h-screen flex-col items-center justify-center">
					<Logo />
					<h1 className="text-2xl">Redirecting to login...</h1>
				</div>
			);
		}

		// Render the component
		return <Component {...props} />;
	};
};
