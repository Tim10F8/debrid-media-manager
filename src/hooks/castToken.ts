import { saveCastProfile } from '@/utils/castApiClient';
import { isLegacyToken } from '@/utils/castApiHelpers';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import useLocalStorage from './localStorage';

export function useCastToken() {
	const [clientId] = useLocalStorage<string>('rd:clientId');
	const [clientSecret] = useLocalStorage<string>('rd:clientSecret');
	const [refreshToken] = useLocalStorage<string>('rd:refreshToken');
	const [accessToken] = useLocalStorage<string>('rd:accessToken');
	const [dmmCastToken, setDmmCastToken] = useLocalStorage<string>('rd:castToken');

	useEffect(() => {
		// Only run if we don't have a token but have all required credentials
		if (!clientId || !clientSecret || !refreshToken || !accessToken) return;

		// If we have a legacy 5-character token, clear it to trigger regeneration
		if (dmmCastToken && isLegacyToken(dmmCastToken)) {
			setDmmCastToken(''); // Clear the legacy token
			return; // Let the next render cycle handle regeneration
		}

		if (dmmCastToken) return;

		const fetchToken = async () => {
			try {
				const res = await fetch('/api/stremio/id?token=' + accessToken);
				const data = await res.json();
				if (data.status !== 'error') {
					saveCastProfile(clientId, clientSecret, refreshToken);
					setDmmCastToken(data.id);

					// Trigger migration for existing users
					try {
						const migrationRes = await fetch('/api/stremio/migrate', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ token: accessToken }),
						});
						const migrationData = await migrationRes.json();
						if (migrationData.migratedCasts > 0) {
							toast.success(
								`Migration complete! ${migrationData.migratedCasts} casted items preserved.`
							);
						} else if (migrationData.totalCasts > 0) {
							toast.warning(
								`Migration complete, but only links with downloads could be preserved.`
							);
						}
					} catch (error) {
						// Migration is optional, don't fail if it errors
						console.error('Migration error:', error);
					}
				}
			} catch (error) {
				toast.error('failed to fetch DMM Cast token');
			}
		};

		fetchToken();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [accessToken, clientId, clientSecret, refreshToken, dmmCastToken]);

	return dmmCastToken;
}
