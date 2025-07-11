import { UserTorrent } from '@/torrent/userTorrent';
import toast from 'react-hot-toast';
import { AsyncFunction, runConcurrentFunctions } from './batch';
import { magnetToastOptions } from './toastOptions';

export async function reinsertFilteredTorrents(
	torrentList: UserTorrent[],
	wrapReinsertFn: (t: UserTorrent) => AsyncFunction<void>
) {
	const toReinsert = torrentList.map(wrapReinsertFn);

	if (toReinsert.length === 0) {
		toast('No torrents to reinsert', magnetToastOptions);
		return;
	}

	const progressToast = toast.loading(
		`Reinserting 0/${toReinsert.length} torrents...`,
		magnetToastOptions
	);

	const [results, errors] = await runConcurrentFunctions(
		toReinsert,
		4,
		0,
		(completed, total, errorCount) => {
			const message =
				errorCount > 0
					? `Reinserting ${completed}/${total} torrents (${errorCount} errors)...`
					: `Reinserting ${completed}/${total} torrents...`;
			toast.loading(message, { id: progressToast });
		}
	);

	// Update the progress toast to show final result
	if (errors.length && results.length) {
		toast.error(`Reinserted ${results.length} torrents, failed ${errors.length}`, {
			id: progressToast,
			...magnetToastOptions,
		});
	} else if (errors.length) {
		toast.error(`Failed to reinsert ${errors.length} torrents`, {
			id: progressToast,
			...magnetToastOptions,
		});
	} else if (results.length) {
		toast.success(`Reinserted ${results.length} torrents`, {
			id: progressToast,
			...magnetToastOptions,
		});
	} else {
		toast.dismiss(progressToast);
	}
}
