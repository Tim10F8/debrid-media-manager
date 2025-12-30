import { deleteMagnet as deleteAdTorrent } from '@/services/allDebrid';
import { deleteTorrent as deleteRdTorrent } from '@/services/realDebrid';
import { deleteTorrent as deleteTbTorrent } from '@/services/torbox';
import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { magnetToastOptions } from './toastOptions';

// RD: { error: "infringing_file", error_code: 35 }
const getRdError = (error: unknown): string | null => {
	if (error instanceof AxiosError) {
		return error.response?.data?.error || null;
	}
	return null;
};

// AD: { status: "error", error: { code: "...", message: "..." } }
const getAdError = (error: unknown): string | null => {
	if (error instanceof AxiosError) {
		const data = error.response?.data;
		return data?.error?.message || data?.error || null;
	}
	return null;
};

// TB: { success: false, error: "BOZO_TORRENT", detail: "Invalid Magnet Link..." }
const getTbError = (error: unknown): string | null => {
	if (error instanceof AxiosError) {
		const data = error.response?.data;
		return data?.detail || data?.error || null;
	}
	return null;
};

export const handleDeleteRdTorrent = async (
	rdKey: string,
	id: string,
	disableToast: boolean = false
) => {
	try {
		console.log('[rdDelete] request', { id, disableToast });
		await deleteRdTorrent(rdKey, id.substring(3));
		console.log('[rdDelete] success', { id });
		if (!disableToast) toast(`Deleted ${id} from RD.`, magnetToastOptions);
	} catch (error) {
		console.error('[rdDelete] failed', {
			id,
			error: error instanceof Error ? error.message : 'Unknown error',
		});
		console.error(
			'Error deleting RD torrent:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		const apiError = getRdError(error);
		toast.error(apiError ? `RD error: ${apiError}` : `Failed to delete ${id} in RD.`);
	}
};

export const handleDeleteAdTorrent = async (
	adKey: string,
	id: string,
	disableToast: boolean = false
) => {
	try {
		await deleteAdTorrent(adKey, id.substring(3));
		if (!disableToast) toast(`Deleted ${id} from AD.`, magnetToastOptions);
	} catch (error) {
		console.error(
			'Error deleting AD torrent:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		const apiError = getAdError(error);
		toast.error(apiError ? `AD error: ${apiError}` : `Failed to delete ${id} in AD.`);
	}
};

export const handleDeleteTbTorrent = async (
	tbKey: string,
	id: string,
	disableToast: boolean = false
) => {
	try {
		await deleteTbTorrent(tbKey, parseInt(id.substring(3)));
		if (!disableToast) toast(`Deleted ${id} from TorBox.`, magnetToastOptions);
	} catch (error) {
		console.error(
			'Error deleting TB torrent:',
			error instanceof Error ? error.message : 'Unknown error'
		);
		const apiError = getTbError(error);
		toast.error(apiError ? `TorBox error: ${apiError}` : `Failed to delete ${id} in TorBox.`);
	}
};
