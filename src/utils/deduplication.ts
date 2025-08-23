import { UserTorrent } from '@/torrent/userTorrent';
import { AsyncFunction, runConcurrentFunctions } from '@/utils/batch';
import { normalize } from '@/utils/mediaId';
import { showChoiceDialog } from '@/utils/swalConfig';
import { libraryToastOptions } from '@/utils/toastOptions';
import { toast } from 'react-hot-toast';

type ComparisonField = 'bytes' | 'added';
type PreferenceType = 'smaller' | 'bigger' | 'older' | 'newer';

interface DedupeOptions {
	field: ComparisonField;
	title: string;
	text: string;
	confirmText: string;
	denyText: string;
	getKey: (torrent: UserTorrent) => string;
	wrapDeleteFn: (torrent: UserTorrent) => AsyncFunction<unknown>;
}

export const findDuplicates = (
	filteredList: UserTorrent[],
	field: ComparisonField,
	preference: PreferenceType,
	getKey: (torrent: UserTorrent) => string
): UserTorrent[] => {
	const dupes: UserTorrent[] = [];

	filteredList.reduce((acc: { [key: string]: UserTorrent }, cur: UserTorrent) => {
		const key = getKey(cur);
		if (acc[key]) {
			let isPreferred = false;

			if (field === 'bytes') {
				isPreferred =
					preference === 'bigger'
						? acc[key].bytes > cur.bytes
						: acc[key].bytes < cur.bytes;
			} else if (field === 'added') {
				isPreferred =
					preference === 'newer'
						? acc[key].added > cur.added
						: acc[key].added < cur.added;
			}

			if (isPreferred) {
				dupes.push(acc[key]);
				acc[key] = cur;
			} else {
				dupes.push(cur);
			}
		} else {
			acc[key] = cur;
		}
		return acc;
	}, {});

	return dupes;
};

export const dedupeByField = async (
	options: DedupeOptions,
	filteredList: UserTorrent[]
): Promise<void> => {
	const { field, title, text, confirmText, denyText, getKey, wrapDeleteFn } = options;

	const choice = await showChoiceDialog({
		title,
		text,
		confirmButtonText: confirmText,
		denyButtonText: denyText,
	});

	if (choice === 'cancel') return;

	const preference: PreferenceType =
		field === 'bytes'
			? choice === 'deny'
				? 'bigger'
				: 'smaller'
			: choice === 'confirm'
				? 'older'
				: 'newer';

	const dupes = findDuplicates(filteredList, field, preference, getKey);
	const toDelete = dupes.map(wrapDeleteFn);

	if (toDelete.length === 0) {
		toast('No duplicate torrents found', libraryToastOptions);
		return;
	}

	const progressToast = toast.loading(
		`Deleting 0/${toDelete.length} torrents...`,
		libraryToastOptions
	);

	const [results, errors] = await runConcurrentFunctions(
		toDelete,
		4,
		0,
		(completed, total, errorCount) => {
			const message =
				errorCount > 0
					? `Deleting ${completed}/${total} torrents (${errorCount} errors)...`
					: `Deleting ${completed}/${total} torrents...`;
			toast.loading(message, { id: progressToast });
		}
	);

	// Update the progress toast to show final result
	if (errors.length && results.length) {
		toast.error(`Deleted ${results.length} torrents, failed to delete ${errors.length}`, {
			id: progressToast,
			...libraryToastOptions,
		});
	} else if (errors.length) {
		toast.error(`Failed to delete ${errors.length} torrents`, {
			id: progressToast,
			...libraryToastOptions,
		});
	} else if (results.length) {
		toast.success(`Deleted ${results.length} torrents`, {
			id: progressToast,
			...libraryToastOptions,
		});
	} else {
		toast.dismiss(progressToast);
	}
};

export const createDedupeBySize = (
	filteredList: UserTorrent[],
	wrapDeleteFn: (torrent: UserTorrent) => AsyncFunction<unknown>
) => {
	return () =>
		dedupeByField(
			{
				field: 'bytes',
				title: 'Delete by size',
				text: 'Choose which duplicate torrents to delete based on size:',
				confirmText: 'Delete Smaller',
				denyText: 'Delete Bigger',
				getKey: (torrent) => normalize(torrent.title),
				wrapDeleteFn,
			},
			filteredList
		);
};

export const createDedupeByRecency = (
	filteredList: UserTorrent[],
	wrapDeleteFn: (torrent: UserTorrent) => AsyncFunction<unknown>
) => {
	return () =>
		dedupeByField(
			{
				field: 'added',
				title: 'Delete by date',
				text: 'Choose which duplicate torrents to delete:',
				confirmText: 'Delete Older',
				denyText: 'Delete Newer',
				getKey: (torrent) => normalize(torrent.title),
				wrapDeleteFn,
			},
			filteredList
		);
};
