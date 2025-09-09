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

function createAxiosClient(token: string): AxiosInstance {
	if (!axiosInstance) {
		axiosInstance = axios.create({
			baseURL: config.torboxHostname || BASE_URL,
		});

		// Rate limiting configuration
		let lastRequestTime = 0;

		// Add request interceptor for rate limiting and token
		axiosInstance.interceptors.request.use(async (config) => {
			// Set the current token
			config.headers.Authorization = `Bearer ${token}`;

			// Rate limiting
			const now = Date.now();
			const timeSinceLastRequest = now - lastRequestTime;
			if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
				await new Promise((resolve) =>
					setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
				);
			}
			lastRequestTime = Date.now();
			return config;
		});

		// Add response interceptor for handling 429 errors
		axiosInstance.interceptors.response.use(
			(response) => response,
			async (error) => {
				const maxRetries = 10;
				let retryCount = 0;

				while (error.response?.status === 429 && retryCount < maxRetries) {
					retryCount++;
					const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
					await new Promise((resolve) => setTimeout(resolve, delay));
					try {
						return await axiosInstance!.request(error.config);
					} catch (retryError) {
						error = retryError;
					}
				}

				throw error;
			}
		);
	}

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
	try {
		const client = createAxiosClient(accessToken);
		const formData = new FormData();

		if (params.file) formData.append('file', params.file);
		if (params.magnet) formData.append('magnet', params.magnet);
		if (params.seed) formData.append('seed', params.seed);
		if (params.allow_zip !== undefined)
			formData.append('allow_zip', params.allow_zip.toString());
		if (params.name) formData.append('name', params.name);
		if (params.as_queued !== undefined)
			formData.append('as_queued', params.as_queued.toString());
		if (params.add_only_if_cached !== undefined)
			formData.append('add_only_if_cached', params.add_only_if_cached.toString());

		const response = await client.post<TorBoxResponse<TorBoxCreateTorrentResponse>>(
			`/${API_VERSION}/api/torrents/createtorrent`,
			formData
		);
		return response.data;
	} catch (error: any) {
		console.error('Error creating torrent:', error.message);
		throw error;
	}
};

export const controlTorrent = async (
	accessToken: string,
	params: {
		torrent_id?: number;
		operation: 'reannounce' | 'delete' | 'resume' | 'pause';
		all?: boolean;
	}
): Promise<TorBoxResponse<null>> => {
	try {
		const client = createAxiosClient(accessToken);
		const response = await client.post<TorBoxResponse<null>>(
			`/${API_VERSION}/api/torrents/controltorrent`,
			params
		);
		return response.data;
	} catch (error: any) {
		console.error('Error controlling torrent:', error.message);
		throw error;
	}
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
	try {
		const client = createAxiosClient(accessToken);
		// Add fresh query parameter to get uncached results
		const queryParams = {
			...params,
			bypass_cache: true, // Always fetch fresh uncached results
			_fresh: Date.now(), // Additional cache-busting parameter
		};
		const response = await client.get<TorBoxResponse<TorBoxTorrentInfo[] | TorBoxTorrentInfo>>(
			`/${API_VERSION}/api/torrents/mylist`,
			{ params: queryParams }
		);
		return response.data;
	} catch (error: any) {
		console.error('Error getting torrent list:', error.message);
		throw error;
	}
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
	try {
		const client = createAxiosClient(accessToken);
		const response = await client.get<TorBoxResponse<string>>(
			`/${API_VERSION}/api/torrents/requestdl`,
			{
				params: {
					token: accessToken,
					...params,
				},
			}
		);
		return response.data;
	} catch (error: any) {
		console.error('Error requesting download link:', error.message);
		throw error;
	}
};

export const checkCachedStatus = async (
	params: {
		hash: string | string[];
		format?: 'object' | 'list';
		list_files?: boolean;
	},
	accessToken?: string
): Promise<TorBoxResponse<TorBoxCachedResponse | TorBoxCachedItem[] | null>> => {
	try {
		const client = createAxiosClient(accessToken || '');
		const hashString = Array.isArray(params.hash) ? params.hash.join(',') : params.hash;

		const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
		const response = await client.get<
			TorBoxResponse<TorBoxCachedResponse | TorBoxCachedItem[] | null>
		>(`/${API_VERSION}/api/torrents/checkcached`, {
			params: {
				hash: hashString,
				format: params.format || 'object',
				list_files: params.list_files,
			},
			headers,
		});
		return response.data;
	} catch (error: any) {
		console.error('Error checking cached status:', error.message);
		throw error;
	}
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
			const response = await client.get(`/${API_VERSION}/api/torrents/exportdata`, {
				params,
				responseType: 'blob',
			});
			return response.data;
		} else {
			const response = await client.get<TorBoxResponse<string>>(
				`/${API_VERSION}/api/torrents/exportdata`,
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
				`/${API_VERSION}/api/torrents/torrentinfo`,
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
				`/${API_VERSION}/api/torrents/torrentinfo`,
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
			`/${API_VERSION}/api/user/me`,
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
			`/${API_VERSION}/api/user/refreshtoken`
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
		const response = await client.get<TorBoxResponse>(`/${API_VERSION}/api/stats`);
		return response.data;
	} catch (error: any) {
		console.error('Error getting stats:', error.message);
		throw error;
	}
};
