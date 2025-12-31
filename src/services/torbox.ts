import axios, { AxiosInstance } from 'axios';
import getConfig from 'next/config';
import {
	TorBoxCachedItem,
	TorBoxCachedResponse,
	TorBoxCreateTorrentResponse,
	TorBoxResponse,
	TorBoxTorrentInfo,
	TorBoxTorrentMetadata,
	TorBoxUser,
} from './types';

export type { TorBoxTorrentInfo, TorBoxUser };

// Safely access Next.js runtime config in test/non-Next environments
const fallbackRuntimeConfig = {
	proxy: '',
	torboxHostname: 'https://api.torbox.app',
};

const config = (() => {
	try {
		const cfg = (getConfig as any)?.();
		return cfg?.publicRuntimeConfig ?? fallbackRuntimeConfig;
	} catch {
		return fallbackRuntimeConfig;
	}
})();

// Constants
const MIN_REQUEST_INTERVAL = (60 * 1000) / 500;
const BASE_URL = 'https://api.torbox.app';
const API_VERSION = 'v1';

// Rate limiting and retry logic
let axiosInstance: AxiosInstance | null = null;
let lastRequestTime = 0;
let currentInterceptorId: number | null = null;

// Custom error class for rate limiting
export class TorBoxRateLimitError extends Error {
	constructor(message: string = 'TorBox API rate limit exceeded. Please wait and try again.') {
		super(message);
		this.name = 'TorBoxRateLimitError';
	}
}

// Function to get proxy URL with random number for load balancing
function getProxyUrl(baseUrl: string): string {
	return baseUrl.replace('#num#', Math.floor(Math.random() * 1000).toString());
}

// Get the base URL for TorBox API (with or without proxy)
function getTorBoxBaseUrl(): string {
	const torboxHost = config.torboxHostname || BASE_URL;
	if (config.proxy) {
		return `${getProxyUrl(config.proxy)}${torboxHost}`;
	}
	return torboxHost;
}

async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = 5,
	baseDelay: number = 1000
): Promise<T> {
	let lastError: any;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error: any) {
			lastError = error;

			// Check if it's a rate limit error (429 or network error that might be 429-related)
			const is429 = error.response?.status === 429;
			const isNetworkError =
				error.message === 'Network Error' || error.code === 'ERR_NETWORK';

			if ((is429 || isNetworkError) && attempt < maxRetries) {
				// Get retry-after header or use exponential backoff
				const retryAfter = error.response?.headers?.['retry-after'];
				const delay = retryAfter
					? parseInt(retryAfter, 10) * 1000
					: Math.min(baseDelay * Math.pow(2, attempt), 30000);

				console.log(
					`[TorBox] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			// Not a retryable error or max retries exceeded
			break;
		}
	}

	// If we exhausted retries due to rate limiting, throw a specific error
	if (
		lastError?.response?.status === 429 ||
		lastError?.message === 'Network Error' ||
		lastError?.code === 'ERR_NETWORK'
	) {
		throw new TorBoxRateLimitError();
	}

	throw lastError;
}

function createAxiosClient(token: string): AxiosInstance {
	if (!axiosInstance) {
		axiosInstance = axios.create();
	}

	// Update request interceptor to use current token and handle rate limiting
	// Eject previous interceptor if it exists (compatible with axios mocks)
	if (currentInterceptorId !== null) {
		axiosInstance.interceptors.request.eject(currentInterceptorId);
	}
	currentInterceptorId = axiosInstance.interceptors.request.use(async (reqConfig) => {
		// Only set Authorization header if token is provided
		if (token) {
			reqConfig.headers.Authorization = `Bearer ${token}`;
		}

		// Rate limiting - wait if needed
		const now = Date.now();
		const timeSinceLastRequest = now - lastRequestTime;
		if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
			await new Promise((resolve) =>
				setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
			);
		}
		lastRequestTime = Date.now();
		return reqConfig;
	});

	return axiosInstance;
}

// ==================== Torrents API ====================

export const createTorrent = async (
	accessToken: string,
	params: {
		file?: File;
		magnet?: string;
		seed?: '1' | '2' | '3';
		allow_zip?: boolean;
		name?: string;
		as_queued?: boolean;
		add_only_if_cached?: boolean;
	}
): Promise<TorBoxResponse<TorBoxCreateTorrentResponse>> => {
	const client = createAxiosClient(accessToken);
	const formData = new FormData();

	if (params.file) formData.append('file', params.file);
	if (params.magnet) formData.append('magnet', params.magnet);
	if (params.seed) formData.append('seed', params.seed);
	if (params.allow_zip !== undefined) formData.append('allow_zip', params.allow_zip.toString());
	if (params.name) formData.append('name', params.name);
	if (params.as_queued !== undefined) formData.append('as_queued', params.as_queued.toString());
	if (params.add_only_if_cached !== undefined)
		formData.append('add_only_if_cached', params.add_only_if_cached.toString());

	return retryWithBackoff(async () => {
		const response = await client.post<TorBoxResponse<TorBoxCreateTorrentResponse>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/createtorrent`,
			formData
		);
		return response.data;
	});
};

export const controlTorrent = async (
	accessToken: string,
	params: {
		torrent_id?: number;
		operation: 'reannounce' | 'delete' | 'resume' | 'pause';
		all?: boolean;
	}
): Promise<TorBoxResponse<null>> => {
	const client = createAxiosClient(accessToken);
	return retryWithBackoff(async () => {
		const response = await client.post<TorBoxResponse<null>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/controltorrent`,
			params
		);
		return response.data;
	});
};

export const deleteTorrent = async (
	accessToken: string,
	torrent_id: number
): Promise<TorBoxResponse<null>> => {
	return controlTorrent(accessToken, { torrent_id, operation: 'delete' });
};

export const getTorrentList = async (
	accessToken: string,
	params?: {
		bypass_cache?: boolean;
		id?: number;
		offset?: number;
		limit?: number;
	}
): Promise<TorBoxResponse<TorBoxTorrentInfo[] | TorBoxTorrentInfo>> => {
	const requestMeta = {
		hasId: Boolean(params?.id),
		offset: params?.offset ?? 0,
		limit: params?.limit ?? 'default',
	};
	const requestStartedAt = Date.now();
	console.log('[TorboxAPI] getTorrentList start', requestMeta);

	const client = createAxiosClient(accessToken);
	// Add fresh query parameter to get uncached results
	const queryParams = {
		...params,
		bypass_cache: true, // Always fetch fresh uncached results
		_fresh: Date.now(), // Additional cache-busting parameter
	};

	return retryWithBackoff(async () => {
		const response = await client.get<TorBoxResponse<TorBoxTorrentInfo[] | TorBoxTorrentInfo>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/mylist`,
			{ params: queryParams }
		);
		const result = response.data;
		const itemCount = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
		const durationMs = Date.now() - requestStartedAt;
		console.log('[TorboxAPI] getTorrentList success', {
			...requestMeta,
			success: result.success,
			itemCount,
			elapsedMs: durationMs,
		});
		return result;
	});
};

export const requestDownloadLink = async (
	accessToken: string,
	params: {
		torrent_id: number;
		file_id?: number;
		zip_link?: boolean;
		user_ip?: string;
		redirect?: boolean;
	}
): Promise<TorBoxResponse<string>> => {
	const client = createAxiosClient(accessToken);
	return retryWithBackoff(async () => {
		const response = await client.get<TorBoxResponse<string>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/requestdl`,
			{
				params: {
					token: accessToken,
					...params,
				},
			}
		);
		return response.data;
	});
};

export const checkCachedStatus = async (
	params: {
		hash: string | string[];
		format?: 'object' | 'list';
		list_files?: boolean;
	},
	accessToken?: string
): Promise<TorBoxResponse<TorBoxCachedResponse | TorBoxCachedItem[] | null>> => {
	const client = createAxiosClient(accessToken || '');
	const hashString = Array.isArray(params.hash) ? params.hash.join(',') : params.hash;
	const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

	return retryWithBackoff(async () => {
		const response = await client.get<
			TorBoxResponse<TorBoxCachedResponse | TorBoxCachedItem[] | null>
		>(`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/checkcached`, {
			params: {
				hash: hashString,
				format: params.format || 'object',
				list_files: params.list_files,
			},
			headers,
		});
		return response.data;
	});
};

export const exportTorrentData = async (
	accessToken: string,
	params: {
		torrent_id: number;
		type: 'magnet' | 'file';
	}
): Promise<TorBoxResponse<string> | Blob> => {
	try {
		const client = createAxiosClient(accessToken);

		if (params.type === 'file') {
			const response = await client.get(
				`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/exportdata`,
				{
					params,
					responseType: 'blob',
				}
			);
			return response.data;
		} else {
			const response = await client.get<TorBoxResponse<string>>(
				`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/exportdata`,
				{ params }
			);
			return response.data;
		}
	} catch (error: any) {
		console.error('Error exporting torrent data:', error.message);
		throw error;
	}
};

export const getTorrentInfo = async (params: {
	hash?: string;
	timeout?: number;
	magnet?: string;
	file?: File;
}): Promise<TorBoxResponse<TorBoxTorrentMetadata>> => {
	try {
		const client = createAxiosClient('');

		if (params.hash && !params.magnet && !params.file) {
			// Use GET method for hash-only requests
			const response = await client.get<TorBoxResponse<TorBoxTorrentMetadata>>(
				`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/torrentinfo`,
				{ params }
			);
			return response.data;
		} else {
			// Use POST method for magnet or file
			const formData = new FormData();
			if (params.magnet) formData.append('magnet', params.magnet);
			if (params.file) formData.append('file', params.file);
			if (params.hash) formData.append('hash', params.hash);
			if (params.timeout) formData.append('timeout', params.timeout.toString());

			const response = await client.post<TorBoxResponse<TorBoxTorrentMetadata>>(
				`${getTorBoxBaseUrl()}/${API_VERSION}/api/torrents/torrentinfo`,
				formData
			);
			return response.data;
		}
	} catch (error: any) {
		console.error('Error getting torrent info:', error.message);
		throw error;
	}
};

// ==================== User API ====================

export const getUserData = async (
	accessToken: string,
	params?: {
		settings?: boolean;
	}
): Promise<TorBoxResponse<TorBoxUser>> => {
	try {
		const client = createAxiosClient(accessToken);
		const response = await client.get<TorBoxResponse<TorBoxUser>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/user/me`,
			{
				params: {
					settings: params?.settings,
				},
			}
		);
		return response.data;
	} catch (error: any) {
		console.error('Error getting user data:', error.message);
		throw error;
	}
};

export const refreshApiToken = async (
	accessToken: string
): Promise<TorBoxResponse<{ token: string }>> => {
	try {
		const client = createAxiosClient(accessToken);
		const response = await client.post<TorBoxResponse<{ token: string }>>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/user/refreshtoken`
		);
		return response.data;
	} catch (error: any) {
		console.error('Error refreshing API token:', error.message);
		throw error;
	}
};

// ==================== Stats API ====================

export const getStats = async (): Promise<TorBoxResponse<any>> => {
	try {
		const client = createAxiosClient('');
		const response = await client.get<TorBoxResponse>(
			`${getTorBoxBaseUrl()}/${API_VERSION}/api/stats`
		);
		return response.data;
	} catch (error: any) {
		console.error('Error getting stats:', error.message);
		throw error;
	}
};
