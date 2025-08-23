import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import { normalize } from '@/utils/mediaId';
import { quickSearchLibrary } from '@/utils/quickSearch';
import { isFailed, isInProgress, isSlowOrNoLinks } from '@/utils/slow';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

interface FilterState {
	query: string;
	filteredList: UserTorrent[];
	slowCount: number;
	inProgressCount: number;
	failedCount: number;
	helpText: string;
}

interface FilterParams {
	userTorrentsList: UserTorrent[];
	selectedTorrents: Set<string>;
	sameTitle: Set<string>;
	sameHash: Set<string>;
	uncachedRdHashes: Set<string>;
	uncachedAdIDs: string[];
	loading: boolean;
	grouping: boolean;
}

const tips = [
	'Tip: You can use hash lists to share your library with others anonymously. Click on the button, wait for the page to finish processing, and share the link to your friends.',
	'Tip: You can make a local backup of your library by using the "Local backup" button. This will generate a file containing your whole library that you can use to restore your library later.',
	'Tip: You can restore a local backup by using the "Local restore" button. It will only restore the torrents that are not already in your library.',
	'Tip: The quick search box will filter the list by filename and id. You can use multiple words or even regex to filter your library. This way, you can select multiple torrents and delete them at once, or share them as a hash list.',
	'Have you tried clicking on a torrent? You can see the links, the progress, and the status of the torrent. You can also select the files you want to download.',
	'I don\'t know what to put here, so here\'s a random tip: "The average person walks the equivalent of five times around the world in a lifetime."',
];

export const useLibraryFilters = (params: FilterParams) => {
	const router = useRouter();
	const {
		userTorrentsList,
		selectedTorrents,
		sameTitle,
		sameHash,
		uncachedRdHashes,
		uncachedAdIDs,
		loading,
		grouping,
	} = params;

	const [filterState, setFilterState] = useState<FilterState>({
		query: '',
		filteredList: [],
		slowCount: 0,
		inProgressCount: 0,
		failedCount: 0,
		helpText: '',
	});

	const setQuery = useCallback((query: string) => {
		setFilterState((prev) => ({ ...prev, query }));
	}, []);

	const setHelpText = useCallback((text: string) => {
		setFilterState((prev) => ({ ...prev, helpText: text }));
	}, []);

	const getRandomTip = useCallback(() => {
		const date = new Date();
		const minute = date.getMinutes();
		const index = minute % tips.length;
		return tips[index];
	}, []);

	const hasNoQueryParamsBut = useCallback(
		(...params: string[]) => {
			return Object.keys(router.query).filter((p) => !params.includes(p)).length === 0;
		},
		[router.query]
	);

	const applyFilters = useCallback(() => {
		if (loading || grouping) return;

		const counts = {
			slow: userTorrentsList.filter(isSlowOrNoLinks).length,
			inProgress: userTorrentsList.filter(isInProgress).length,
			failed: userTorrentsList.filter(isFailed).length,
		};

		let tmpList = userTorrentsList;

		// No filters - show all with quick search
		if (hasNoQueryParamsBut('page')) {
			setFilterState((prev) => ({
				...prev,
				filteredList: quickSearchLibrary(prev.query, userTorrentsList),
				slowCount: counts.slow,
				inProgressCount: counts.inProgress,
				failedCount: counts.failed,
				helpText: prev.helpText !== 'hide' ? getRandomTip() : prev.helpText,
			}));
			return;
		}

		// Apply status filters
		const { status, titleFilter, tvTitleFilter, hashFilter, mediaType } = router.query;

		let newHelpText: string | undefined;

		if (status === 'slow') {
			tmpList = tmpList.filter(isSlowOrNoLinks);
			newHelpText =
				'The displayed torrents are older than one hour and lack any seeders. You can use the "Delete shown" option to remove them.';
		} else if (status === 'inprogress') {
			tmpList = tmpList.filter(isInProgress);
			newHelpText = 'Torrents that are still downloading';
		} else if (status === 'failed') {
			tmpList = tmpList.filter(isFailed);
			newHelpText = 'Torrents that have a failure status';
		} else if (status === 'uncached') {
			tmpList = tmpList.filter(
				(t) =>
					(t.status === UserTorrentStatus.finished &&
						t.id.startsWith('rd:') &&
						uncachedRdHashes.has(t.hash)) ||
					(t.id.startsWith('ad:') && uncachedAdIDs.includes(t.id))
			);
			newHelpText = 'Torrents that are no longer cached';
		} else if (status === 'selected') {
			tmpList = tmpList.filter((t) => selectedTorrents.has(t.id));
			newHelpText = 'Torrents that you have selected';
		} else if (status === 'sametitle') {
			tmpList = tmpList.filter((t) => sameTitle.has(normalize(t.title)));
		} else if (status === 'samehash') {
			tmpList = tmpList.filter((t) => sameHash.has(t.hash));
		}

		// Apply other filters
		if (titleFilter) {
			const decoded = decodeURIComponent(titleFilter as string);
			tmpList = tmpList.filter((t) => normalize(t.title) === decoded);
		}
		if (tvTitleFilter) {
			const decoded = decodeURIComponent(tvTitleFilter as string);
			tmpList = tmpList.filter(
				(t) => t.mediaType === 'tv' && t.info?.title && normalize(t.info.title) === decoded
			);
		}
		if (hashFilter) {
			tmpList = tmpList.filter((t) => t.hash === hashFilter);
		}
		if (mediaType) {
			tmpList = tmpList.filter((t) => mediaType === t.mediaType);
			if (!newHelpText) {
				const mediaTypeTexts = {
					movie: 'movies',
					tv: 'TV shows',
					other: 'non-movie/TV content',
				};
				newHelpText = `Torrents shown are detected as ${mediaTypeTexts[mediaType as keyof typeof mediaTypeTexts]}.`;
			}
		}

		setFilterState((prev) => ({
			...prev,
			filteredList: quickSearchLibrary(prev.query, tmpList),
			slowCount: counts.slow,
			inProgressCount: counts.inProgress,
			failedCount: counts.failed,
			helpText: newHelpText && prev.helpText !== 'hide' ? newHelpText : prev.helpText,
		}));
	}, [
		loading,
		grouping,
		userTorrentsList,
		hasNoQueryParamsBut,
		getRandomTip,
		router.query,
		selectedTorrents,
		sameTitle,
		sameHash,
		uncachedRdHashes,
		uncachedAdIDs,
	]);

	useEffect(() => {
		applyFilters();
	}, [applyFilters]);

	return {
		...filterState,
		setQuery,
		setHelpText,
	};
};
