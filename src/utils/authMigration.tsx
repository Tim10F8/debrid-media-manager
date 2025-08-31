import { AuthContextProvider } from '@/contexts/AuthContext';
import { ComponentType } from 'react';
import { withAuth as withAuthRefactored } from './withAuthRefactored';

/**
 * Migration wrapper that combines the new AuthContext with the refactored withAuth HOC.
 * This allows gradual migration from the old withAuth to the new system.
 *
 * Usage:
 * 1. For pages that need auth: export default withAuthMigration(PageComponent)
 * 2. For pages that don't need auth: export default withAuthMigration(PageComponent, { requireAuth: false })
 */
export const withAuthMigration = <P extends object>(
	Component: ComponentType<P>,
	options = { requireAuth: true }
) => {
	const WrappedWithAuth = withAuthRefactored(Component, options);

	return function WithAuthMigration(props: P) {
		return (
			<AuthContextProvider>
				<WrappedWithAuth {...props} />
			</AuthContextProvider>
		);
	};
};

/**
 * Hook to check if browser supports required features.
 * Extracted from the old withAuth to keep concerns separated.
 */
export const useBrowserCompatibility = () => {
	if (typeof window === 'undefined') {
		return { isCompatible: true, error: null };
	}

	try {
		// Check for lookbehind support
		const supportsLookbehind = (() => {
			try {
				return new RegExp('(?<=a)b').test('ab');
			} catch {
				return false;
			}
		})();

		if (!supportsLookbehind) {
			return {
				isCompatible: false,
				error: 'Your browser does not support required JavaScript features. Please update your browser.',
			};
		}

		return { isCompatible: true, error: null };
	} catch (error) {
		return { isCompatible: true, error: null };
	}
};
