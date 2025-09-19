import { deleteMagnet as deleteAdTorrent } from '@/services/allDebrid';
import { deleteTorrent as deleteRdTorrent } from '@/services/realDebrid';
import { deleteTorrent as deleteTbTorrent } from '@/services/torbox';
import toast from 'react-hot-toast';
import { magnetToastOptions } from './toastOptions';

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
		toast.error(`Failed to delete ${id} in RD.`);
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
		toast.error(`Failed to delete ${id} in AD.`);
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
		toast.error(`Failed to delete ${id} in TorBox.`);
	}
};
