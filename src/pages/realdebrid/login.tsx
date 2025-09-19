import useLocalStorage from '@/hooks/localStorage';
import { getCredentials, getDeviceCode, getToken } from '@/services/realDebrid';
import { clearRdKeys } from '@/utils/clearLocalStorage';
import { getSafeRedirectPath } from '@/utils/router';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function RealDebridLoginPage() {
	const [verificationUrl, setVerificationUrl] = useState('');
	const intervalId = useRef<number | null>(null);
	const [userCode, setUserCode] = useState('');
	const router = useRouter();
	const [clientId, setClientId] = useLocalStorage<string>('rd:clientId');
	const [clientSecret, setClientSecret] = useLocalStorage<string>('rd:clientSecret');
	const [refreshToken, setRefreshToken] = useLocalStorage<string>('rd:refreshToken');
	const [accessToken, setAccessToken] = useLocalStorage<string>('rd:accessToken');
	const [isCopied, setIsCopied] = useState(false);
	const { isReady, query, replace } = router;
	const redirectPath = useMemo(() => getSafeRedirectPath(query.redirect, '/'), [query.redirect]);

	useEffect(() => {
		const fetchDeviceCode = async () => {
			console.log('[RealDebridLogin] requesting device code');
			const deviceCodeResponse = await getDeviceCode();
			if (deviceCodeResponse) {
				console.log('[RealDebridLogin] device code received', {
					verificationUrl: deviceCodeResponse.verification_url,
					interval: deviceCodeResponse.interval,
				});
				setVerificationUrl(deviceCodeResponse.verification_url);
				setUserCode(deviceCodeResponse.user_code);

				// Save user code to clipboard
				try {
					await navigator.clipboard.writeText(deviceCodeResponse.user_code);
					setIsCopied(true);
				} catch (error) {
					console.error('Error saving user code to clipboard:', (error as any).message);
				}

				const interval = deviceCodeResponse.interval * 1000;
				setRefreshToken(deviceCodeResponse.device_code);
				console.log('[RealDebridLogin] refresh token stored', {
					deviceCode: deviceCodeResponse.device_code,
					intervalMs: interval,
				});

				const checkAuthorization = async () => {
					const credentialsResponse = await getCredentials(
						deviceCodeResponse.device_code
					);
					if (credentialsResponse) {
						console.log('[RealDebridLogin] credentials obtained', {
							clientId: credentialsResponse.client_id,
						});
						setClientId(credentialsResponse.client_id);
						setClientSecret(credentialsResponse.client_secret);
						clearInterval(intervalId.current!);
					}
				};

				const id = setInterval(checkAuthorization, interval) as any as number;
				intervalId.current = id;
			}
		};
		if (!clientId || !clientSecret || !refreshToken) fetchDeviceCode();

		return () => {
			clearInterval(intervalId.current!);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router]);

	useEffect(() => {
		const fetchAccessToken = async () => {
			try {
				// Refresh token is available, so try to get new tokens
				console.log('[RealDebridLogin] requesting access token');
				const response = await getToken(clientId!, clientSecret!, refreshToken!);
				if (response) {
					// New tokens obtained, save them and return authenticated
					const { access_token, expires_in } = response;
					setAccessToken(access_token, expires_in);
					console.log('[RealDebridLogin] access token stored', {
						expiresIn: expires_in,
					});
				} else {
					throw new Error('Unable to get proper response');
				}
			} catch (error) {
				clearRdKeys();
			}
		};
		if (!accessToken && refreshToken && clientId && clientSecret) fetchAccessToken();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clientId, clientSecret, refreshToken]);

	useEffect(() => {
		if (!isReady || !accessToken) {
			console.log('[RealDebridLogin] redirect guard not satisfied', {
				isReady,
				hasAccessToken: !!accessToken,
				redirectPath,
			});
			return;
		}

		console.log('[RealDebridLogin] redirecting after login', { redirectPath });
		void replace(redirectPath);
	}, [accessToken, isReady, redirectPath, replace]);

	return (
		<div className="flex h-screen flex-col items-center justify-center">
			<Head>
				<title>Debrid Media Manager - Real-Debrid Login</title>
			</Head>
			{userCode && (
				<>
					<p className="mb-4 text-lg font-bold">
						Please click the button below. If asked for the code, enter this:{' '}
						<strong>{userCode}</strong> {isCopied && '(copied to clipboard)'}
					</p>
					<form method="post" action={verificationUrl}>
						<input type="hidden" name="usercode" value={userCode} />
						<input type="hidden" name="action" value="Continue" />
						<button
							formTarget="_blank"
							className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
							type="submit"
						>
							Authorize Debrid Media Manager
						</button>
					</form>
				</>
			)}
		</div>
	);
}
