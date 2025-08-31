import axios, { AxiosRequestConfig } from 'axios';
import getConfig from 'next/config';

const { publicRuntimeConfig: config } = getConfig();

// Helper function to create axios config with Bearer token
const getAxiosConfig = (apikey?: string): AxiosRequestConfig => {
	const axiosConfig: AxiosRequestConfig = {};
	if (apikey) {
		axiosConfig.headers = {
			Authorization: `Bearer ${apikey}`,
		};
	}
	return axiosConfig;
};

// API Response wrapper
interface ApiResponse<T> {
	status: 'success' | 'error';
	data?: T;
	error?: {
		code: string;
		message: string;
	};
}

// Pin interfaces
interface PinData {
	pin: string;
	check: string;
	expires_in: number;
	user_url: string;
	base_url: string;
	check_url?: string; // For backward compatibility
}

interface PinCheckData {
	activated: boolean;
	expires_in: number;
	apikey?: string;
}

// User interfaces
interface UserData {
	user: {
		username: string;
		email: string;
		isPremium: boolean;
		isSubscribed: boolean;
		isTrial: boolean;
		premiumUntil: number;
		lang: string;
		preferedDomain: string;
		fidelityPoints: number;
		limitedHostersQuotas: Record<string, number>;
		remainingTrialQuota?: number;
		notifications: string[];
	};
}

// Magnet interfaces
interface MagnetObject {
	magnet: string;
	name?: string;
	id?: number;
	hash?: string;
	size?: number;
	ready?: boolean;
	error?: {
		code: string;
		message: string;
	};
}

interface MagnetUploadData {
	magnets: MagnetObject[];
}

// For backward compatibility with existing code
interface LinkObject {
	link: string;
	filename: string;
	size: number;
	files: { n: string; s?: number }[];
}

export interface MagnetStatus {
	id: number;
	filename: string;
	size: number;
	hash?: string;
	status: string;
	statusCode: number;
	downloaded?: number;
	uploaded?: number;
	processingPerc?: number;
	seeders?: number;
	downloadSpeed?: number;
	uploadSpeed?: number;
	uploadDate?: number;
	completionDate?: number;
	links: LinkObject[]; // For backward compatibility
	type?: string;
	notified?: boolean;
	version?: number;
	files?: MagnetFile[]; // v4.1 structure
}

interface MagnetStatusData {
	magnets: MagnetStatus[];
	counter?: number;
	fullsync?: boolean;
}

export interface MagnetFile {
	n: string; // name
	s?: number; // size
	l?: string; // link
	e?: MagnetFile[]; // sub-entries (folders)
}

interface MagnetFilesData {
	magnets: Array<{
		id: string;
		files?: MagnetFile[];
		error?: {
			code: string;
			message: string;
		};
	}>;
}

interface MagnetDeleteData {
	message: string;
}

interface MagnetRestartData {
	message?: string;
	magnets?: Array<{
		magnet: string;
		message?: string;
		error?: {
			code: string;
			message: string;
		};
	}>;
}

interface MagnetInstantData {
	data: {
		magnets: Array<{
			magnet: string;
			hash: string;
			instant: boolean;
			files?: MagnetFile[];
			error?: {
				code: string;
				message: string;
			};
		}>;
	};
}

// Response type to maintain backward compatibility
interface MagnetStatusResponse {
	status: string;
	data: {
		magnets: MagnetStatus[];
	};
}

// Public endpoints (no auth required)
export const getPin = async (): Promise<PinData> => {
	try {
		const endpoint = `${config.allDebridHostname}/v4.1/pin/get`;
		const response = await axios.get<ApiResponse<PinData>>(endpoint);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!;
	} catch (error) {
		console.error('Error fetching PIN:', (error as any).message);
		throw error;
	}
};

export const checkPin = async (pin: string, check: string): Promise<PinCheckData> => {
	const endpoint = `${config.allDebridHostname}/v4/pin/check`;
	try {
		let pinCheck = await axios.post<ApiResponse<PinCheckData>>(endpoint, {
			pin,
			check,
		});

		if (pinCheck.data.status === 'error') {
			throw new Error(pinCheck.data.error?.message || 'Unknown error');
		}

		while (!pinCheck.data.data!.activated) {
			await new Promise((resolve) => setTimeout(resolve, 5000));
			pinCheck = await axios.post<ApiResponse<PinCheckData>>(endpoint, {
				pin,
				check,
			});

			if (pinCheck.data.status === 'error') {
				throw new Error(pinCheck.data.error?.message || 'Unknown error');
			}
		}

		// Return in old format for backward compatibility
		return pinCheck.data.data!;
	} catch (error) {
		console.error('Error checking PIN:', (error as any).message);
		throw error;
	}
};

// Authenticated endpoints
export const getAllDebridUser = async (apikey: string) => {
	const endpoint = `${config.allDebridHostname}/v4/user`;
	try {
		const response = await axios.get<ApiResponse<UserData>>(endpoint, getAxiosConfig(apikey));

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!.user;
	} catch (error) {
		console.error('Error fetching user info:', (error as any).message);
		throw error;
	}
};

export const uploadMagnet = async (apikey: string, hashes: string[]): Promise<MagnetUploadData> => {
	try {
		const endpoint = `${config.allDebridHostname}/v4/magnet/upload`;
		const response = await axios.post<ApiResponse<MagnetUploadData>>(
			endpoint,
			{ magnets: hashes },
			getAxiosConfig(apikey)
		);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!;
	} catch (error) {
		console.error('Error uploading magnet:', (error as any).message);
		throw error;
	}
};

// Helper function to convert MagnetFile structure to LinkObject for backward compatibility
function convertFilesToLinks(files?: MagnetFile[]): LinkObject[] {
	if (!files || files.length === 0) return [];

	const links: LinkObject[] = [];

	function processFile(file: MagnetFile, parentPath: string = ''): void {
		const fullPath = parentPath ? `${parentPath}/${file.n}` : file.n;

		if (file.l) {
			// It's a file with a link
			links.push({
				link: file.l,
				filename: fullPath,
				size: file.s || 0,
				files: [],
			});
		} else if (file.e) {
			// It's a folder with sub-entries
			file.e.forEach((subFile) => processFile(subFile, fullPath));
		}
	}

	files.forEach((file) => processFile(file));
	return links;
}

export const getMagnetStatus = async (
	apikey: string,
	magnetId?: string,
	statusFilter?: string,
	session?: number,
	counter?: number
): Promise<MagnetStatusResponse> => {
	const endpoint = `${config.allDebridHostname}/v4.1/magnet/status`;
	const params: any = {};

	if (magnetId) {
		params.id = magnetId;
	} else if (statusFilter) {
		params.status = statusFilter;
	}

	if (session !== undefined) {
		params.session = session;
	}

	if (counter !== undefined) {
		params.counter = counter;
	}

	try {
		const response = await axios.post<ApiResponse<MagnetStatusData>>(
			endpoint,
			params,
			getAxiosConfig(apikey)
		);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		// Get files for ready magnets if needed (for backward compatibility)
		const magnets = response.data.data!.magnets;
		const readyMagnets = magnets.filter((m) => m.statusCode === 4);

		if (readyMagnets.length > 0 && !magnetId) {
			// Batch fetch files for ready magnets
			try {
				const filesResponse = await getMagnetFiles(
					apikey,
					readyMagnets.map((m) => m.id)
				);

				// Map files back to magnets
				filesResponse.magnets.forEach((fileData) => {
					const magnet = magnets.find((m) => m.id === parseInt(fileData.id));
					if (magnet && fileData.files) {
						magnet.files = fileData.files;
						magnet.links = convertFilesToLinks(fileData.files);
					}
				});
			} catch (error) {
				console.warn('Failed to fetch magnet files:', error);
				// Initialize empty links array for backward compatibility
				magnets.forEach((m) => {
					if (!m.links) m.links = [];
				});
			}
		} else {
			// Initialize empty links array for backward compatibility
			magnets.forEach((m) => {
				if (!m.links) m.links = [];
			});
		}

		// Return in old format for backward compatibility
		return {
			status: response.data.status,
			data: {
				magnets: magnets,
			},
		};
	} catch (error) {
		console.error('Error fetching magnet status:', (error as any).message);
		throw error;
	}
};

export const getMagnetFiles = async (
	apikey: string,
	magnetIds: number[]
): Promise<MagnetFilesData> => {
	const endpoint = `${config.allDebridHostname}/v4/magnet/files`;

	try {
		const response = await axios.post<ApiResponse<MagnetFilesData>>(
			endpoint,
			{ id: magnetIds },
			getAxiosConfig(apikey)
		);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!;
	} catch (error) {
		console.error('Error fetching magnet files:', (error as any).message);
		throw error;
	}
};

export const deleteMagnet = async (apikey: string, id: string): Promise<MagnetDeleteData> => {
	const endpoint = `${config.allDebridHostname}/v4/magnet/delete`;
	try {
		const response = await axios.post<ApiResponse<MagnetDeleteData>>(
			endpoint,
			{ id },
			getAxiosConfig(apikey)
		);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!;
	} catch (error) {
		console.error('Error deleting magnet:', (error as any).message);
		throw error;
	}
};

export const restartMagnet = async (apikey: string, id: string): Promise<MagnetRestartData> => {
	const endpoint = `${config.allDebridHostname}/v4/magnet/restart`;
	try {
		const response = await axios.post<ApiResponse<MagnetRestartData>>(
			endpoint,
			{ id },
			getAxiosConfig(apikey)
		);

		if (response.data.status === 'error') {
			throw new Error(response.data.error?.message || 'Unknown error');
		}

		return response.data.data!;
	} catch (error) {
		console.error('Error restarting magnet:', (error as any).message);
		throw error;
	}
};

export const adInstantCheck = async (
	apikey: string,
	hashes: string[]
): Promise<MagnetInstantData> => {
	const endpoint = `${config.allDebridHostname}/v4/magnet/instant`;
	try {
		const response = await axios.get<MagnetInstantData>(endpoint, {
			...getAxiosConfig(apikey),
			params: { magnets: hashes },
		});

		return response.data;
	} catch (error: any) {
		console.error('Error fetching magnet availability:', error.message);
		throw error;
	}
};
