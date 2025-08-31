export interface AuthUser {
	id?: string | number;
	username?: string;
	email?: string;
	isPremium: boolean;
	expirationDate?: string;
	service: 'realdebrid' | 'alldebrid' | 'torbox' | 'trakt';
}

export interface AuthProvider {
	name: string;
	isAuthenticated: boolean;
	isLoading: boolean;
	user: AuthUser | null;
	error: Error | null;
	login: () => Promise<void> | void;
	logout: () => Promise<void> | void;
	refresh?: () => Promise<void>;
}

export interface AuthState {
	providers: Map<string, AuthProvider>;
	isAuthenticated: boolean;
	isLoading: boolean;
	primaryProvider: string | null;
}
