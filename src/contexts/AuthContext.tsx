import { useCurrentUser, useDebridLogin } from '@/hooks/auth';
import { AuthProvider } from '@/types/auth';
import { handleLogout } from '@/utils/logout';
import { useRouter } from 'next/router';
import React, { createContext, useContext, useMemo } from 'react';

interface AuthContextValue {
	isAuthenticated: boolean;
	isLoading: boolean;
	providers: Map<string, AuthProvider>;
	loginWithService: (service: 'realdebrid' | 'alldebrid' | 'torbox') => void;
	logoutService: (service: string) => void;
	logoutAll: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const router = useRouter();
	const {
		rdUser,
		rdError,
		hasRDAuth,
		adUser,
		adError,
		hasADAuth,
		tbUser,
		tbError,
		hasTBAuth,
		isLoading: usersLoading,
	} = useCurrentUser();

	const { loginWithRealDebrid, loginWithAllDebrid, loginWithTorbox } = useDebridLogin();

	const providers = useMemo(() => {
		const providerMap = new Map<string, AuthProvider>();

		// RealDebrid provider
		if (hasRDAuth) {
			providerMap.set('realdebrid', {
				name: 'RealDebrid',
				isAuthenticated: !!rdUser && !rdError,
				isLoading: usersLoading && hasRDAuth,
				user: rdUser
					? {
							id: rdUser.id,
							username: rdUser.username,
							email: rdUser.email,
							isPremium: rdUser.type === 'premium',
							expirationDate: rdUser.expiration,
							service: 'realdebrid',
						}
					: null,
				error: rdError,
				login: () => {
					loginWithRealDebrid();
				},
				logout: async () => await handleLogout('rd:', router),
			});
		}

		// AllDebrid provider
		if (hasADAuth) {
			providerMap.set('alldebrid', {
				name: 'AllDebrid',
				isAuthenticated: !!adUser && !adError,
				isLoading: usersLoading && hasADAuth,
				user: adUser
					? {
							username: adUser.username,
							email: adUser.email,
							isPremium: adUser.isPremium,
							service: 'alldebrid',
						}
					: null,
				error: adError,
				login: () => {
					loginWithAllDebrid();
				},
				logout: async () => await handleLogout('ad:', router),
			});
		}

		// Torbox provider
		if (hasTBAuth) {
			providerMap.set('torbox', {
				name: 'Torbox',
				isAuthenticated: !!tbUser && !tbError,
				isLoading: usersLoading && hasTBAuth,
				user: tbUser
					? {
							id: tbUser.id,
							username: tbUser.email,
							email: tbUser.email,
							isPremium: tbUser.plan !== 0,
							service: 'torbox',
						}
					: null,
				error: tbError,
				login: () => {
					loginWithTorbox();
				},
				logout: async () => await handleLogout('tb:', router),
			});
		}

		return providerMap;
	}, [
		rdUser,
		rdError,
		hasRDAuth,
		adUser,
		adError,
		hasADAuth,
		tbUser,
		tbError,
		hasTBAuth,
		usersLoading,
		loginWithRealDebrid,
		loginWithAllDebrid,
		loginWithTorbox,
		router,
	]);

	const isAuthenticated = useMemo(() => {
		return Array.from(providers.values()).some((provider) => provider.isAuthenticated);
	}, [providers]);

	const isLoading = useMemo(() => {
		return Array.from(providers.values()).some((provider) => provider.isLoading);
	}, [providers]);

	const loginWithService = (service: 'realdebrid' | 'alldebrid' | 'torbox') => {
		const loginMap = {
			realdebrid: loginWithRealDebrid,
			alldebrid: loginWithAllDebrid,
			torbox: loginWithTorbox,
		};
		loginMap[service]();
	};

	const logoutService = (service: string) => {
		const provider = providers.get(service);
		if (provider) {
			provider.logout();
		}
	};

	const logoutAll = async () => {
		await handleLogout(undefined, router);
	};

	const value: AuthContextValue = {
		isAuthenticated,
		isLoading,
		providers,
		loginWithService,
		logoutService,
		logoutAll,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthContextProvider');
	}
	return context;
};
