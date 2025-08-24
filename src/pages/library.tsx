import LibraryActionButtons from '@/components/LibraryActionButtons';
import LibraryHelpText from '@/components/LibraryHelpText';
import LibraryMenuButtons from '@/components/LibraryMenuButtons';
import LibrarySize from '@/components/LibrarySize';
import LibraryTableHeader from '@/components/LibraryTableHeader';
import LibraryTorrentRow from '@/components/LibraryTorrentRow';
import { useLibraryCache } from '@/contexts/LibraryCacheContext';
import { useAllDebridApiKey, useRealDebridAccessToken } from '@/hooks/auth';
import { getTorrentInfo, proxyUnrestrictLink } from '@/services/realDebrid';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import {
	handleAddAsMagnetInAd,
	handleAddAsMagnetInRd,
	handleAddMultipleHashesInAd,
	handleAddMultipleHashesInRd,
	handleReinsertTorrentinRd,
	handleRestartTorrent,
} from '@/utils/addMagnet';
import { AsyncFunction, runConcurrentFunctions } from '@/utils/batch';
import { deleteFilteredTorrents } from '@/utils/deleteList';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import { extractHashes } from '@/utils/extractHashes';
import { getRdStatus } from '@/utils/fetchTorrents';
import { generateHashList } from '@/utils/hashList';
import { handleSelectTorrent, resetSelection, selectShown } from '@/utils/librarySelection';
import { handleChangeType } from '@/utils/libraryTypeManagement';
import { localRestore } from '@/utils/localRestore';
import { normalize } from '@/utils/mediaId';
import { quickSearchLibrary } from '@/utils/quickSearch';
import { isFailed, isInProgress, isSlowOrNoLinks } from '@/utils/slow';
import { libraryToastOptions, magnetToastOptions, searchToastOptions } from '@/utils/toastOptions';
import { getHashOfTorrent } from '@/utils/torrentFile';
import { handleShowInfoForAD, handleShowInfoForRD } from '@/utils/torrentInfo';
import { withAuth } from '@/utils/withAuth';
import { saveAs } from 'file-saver';
import { BookOpen } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import Swal from '../components/modals/modal';

const ITEMS_PER_PAGE = 100;

interface SortBy {
	column: 'id' | 'filename' | 'title' | 'bytes' | 'progress' | 'status' | 'added';
	direction: 'asc' | 'desc';
}

interface RestoredFile {
	filename: string;
	hash: string;
}

interface RDFileInfo {
	id: number;
	path: string;
	bytes: number;
	selected: boolean;
}

const torrentDB = new UserTorrentDB();

function TorrentsPage() {
	const router = useRouter();
	const {
		title: titleFilter,
		tvTitle: tvTitleFilter,
		hash: hashFilter,
		mediaType,
		status,
	} = router.query;
	const [query, setQuery] = useState('');
	const [currentPage, setCurrentPage] = useState(1);

	// Use cached library data
	const {
		libraryItems: cachedLibraryItems,
		isLoading: cacheLoading,
		isFetching,
		refreshLibrary,
		setLibraryItems: setCachedLibraryItems,
		addTorrent,
		removeTorrent: removeFromCache,
		updateTorrent: updateInCache,
		error: cacheError,
		lastFetchTime,
	} = useLibraryCache();

	// loading states
	const [rdSyncing, setRdSyncing] = useState(false);
	const [adSyncing, setAdSyncing] = useState(false);
	const [filtering, setFiltering] = useState(false);
	const [grouping, setGrouping] = useState(false);

	// Use cached items directly instead of duplicating state
	const userTorrentsList = cachedLibraryItems;
	const loading = cacheLoading;
	const setUserTorrentsList = setCachedLibraryItems;
	const [filteredList, setFilteredList] = useState<UserTorrent[]>([]);
	const [sortBy, setSortBy] = useState<SortBy>({ column: 'added', direction: 'desc' });
	const [helpText, setHelpText] = useState('');
	const [selectedTorrents, setSelectedTorrents] = useState<Set<string>>(() => new Set());

	// keys
	const [rdKey] = useRealDebridAccessToken();
	const adKey = useAllDebridApiKey();

	const [defaultTitleGrouping] = useState<Record<string, number>>(() => ({}));
	const [movieTitleGrouping] = useState<Record<string, number>>(() => ({}));
	const [tvGroupingByEpisode] = useState<Record<string, number>>(() => ({}));
	const [tvGroupingByTitle] = useState<Record<string, number>>(() => ({}));
	const [hashGrouping] = useState<Record<string, number>>(() => ({}));
	const [sameTitle] = useState<Set<string>>(() => new Set());
	const [sameHash] = useState<Set<string>>(() => new Set());

	const [uncachedRdHashes, setUncachedRdHashes] = useState<Set<string>>(() => new Set());
	const [uncachedAdIDs, setUncachedAdIDs] = useState<string[]>(() => []);
	const [shouldDownloadMagnets] = useState(
		() =>
			typeof window !== 'undefined' &&
			window.localStorage.getItem('settings:downloadMagnets') === 'true'
	);

	// filter counts
	const [slowCount, setSlowCount] = useState(0);
	const [inProgressCount, setInProgressCount] = useState(0);
	const [failedCount, setFailedCount] = useState(0);

	// stats
	const [totalBytes, setTotalBytes] = useState<number>(0);

	const relevantList = selectedTorrents.size
		? userTorrentsList.filter((t) => selectedTorrents.has(t.id))
		: filteredList;

	// generate STRM files for each video in torrent
	useEffect(() => {
		if (typeof window !== 'undefined' && rdKey) {
			(window as any).generateStrmFiles = async (filename: string, links: string[]) => {
				for (const link of links) {
					try {
						// Get unrestricted link first
						const resp = await proxyUnrestrictLink(rdKey, link);

						// Get filename from Real-Debrid response
						const nameWithoutExt = resp.filename.substring(
							0,
							resp.filename.lastIndexOf('.')
						);

						// If streamable, use just the name without extension
						// If not streamable, keep the original extension
						const strmName = resp.streamable
							? `${nameWithoutExt}.strm`
							: `${resp.filename}.strm`;

						// Create STRM file with just the direct URL
						const blob = new Blob([resp.download], { type: 'text/plain' });
						const strmLink = document.createElement('a');
						strmLink.href = URL.createObjectURL(blob);
						strmLink.download = strmName;
						strmLink.click();
						URL.revokeObjectURL(strmLink.href);
					} catch (e) {
						console.error(e);
					}
				}
			};

			// Cleanup function to remove global window function
			return () => {
				delete (window as any).generateStrmFiles;
			};
		}
	}, [rdKey]);

	// export download links list
	useEffect(() => {
		if (typeof window !== 'undefined' && rdKey) {
			(window as any).exportLinks = async (filename: string, links: string[]) => {
				let textContent = '';
				for (const link of links) {
					try {
						const resp = await proxyUnrestrictLink(rdKey, link);
						textContent += resp.download + '\n';
					} catch (e) {
						console.error(e);
					}
				}
				const blob = new Blob([textContent], { type: 'text/plain' });
				const link = document.createElement('a');
				link.href = URL.createObjectURL(blob);
				link.download = `${filename}.txt`;
				link.click();
				URL.revokeObjectURL(link.href);
			};

			// Cleanup function to remove global window function
			return () => {
				delete (window as any).exportLinks;
			};
		}
	}, [rdKey]);

	// Set up global refresh function for dialogs
	useEffect(() => {
		if (typeof window !== 'undefined') {
			(window as any).triggerFetchLatestRDTorrents = async () => {
				await refreshLibrary();
			};

			// Cleanup function to remove global window function
			return () => {
				delete (window as any).triggerFetchLatestRDTorrents;
			};
		}
	}, [refreshLibrary]);

	// add hash to library
	useEffect(() => {
		const { addMagnet } = router.query;
		if (!addMagnet) return;
		router.push(`/library?page=1`);
		const hashes = extractHashes(addMagnet as string);
		if (hashes.length !== 1) return;

		let isCancelled = false;

		// Handle both services but only refresh once at the end
		const promises: Promise<void>[] = [];

		if (rdKey) {
			promises.push(
				new Promise<void>((resolve) => {
					handleAddMultipleHashesInRd(rdKey, hashes, async () => resolve());
				})
			);
		}
		if (adKey) {
			promises.push(
				new Promise<void>((resolve) => {
					handleAddMultipleHashesInAd(adKey, hashes, async () => resolve());
				})
			);
		}

		// Wait for all operations to complete, then refresh once
		Promise.all(promises).then(() => {
			if (!isCancelled && promises.length > 0) {
				refreshLibrary();
			}
		});

		// Cleanup function to prevent refresh if component unmounts
		return () => {
			isCancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router]);

	const handlePrevPage = useCallback(() => {
		if (router.query.page === '1') return;
		router.push({
			query: { ...router.query, page: currentPage - 1 },
		});
	}, [currentPage, router]);

	const handleNextPage = useCallback(() => {
		router.push({
			query: { ...router.query, page: currentPage + 1 },
		});
	}, [currentPage, router]);

	// pagination query params
	useEffect(() => {
		const { page } = router.query;
		if (!page || Array.isArray(page)) return;
		setCurrentPage(parseInt(page, 10));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router]);

	// pressing arrow keys to navigate
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft') {
				handlePrevPage();
			}
			if (e.key === 'ArrowRight') {
				handleNextPage();
			}
			const queryBox = document.getElementById('query');
			if (!queryBox?.matches(':focus') && /^[a-zA-Z]$/.test(e.key)) {
				document.getElementById('query')?.focus();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [handlePrevPage, handleNextPage]);

	const triggerFetchLatestRDTorrents = async (customLimit?: number) => {
		// Use refreshLibrary from cache context instead
		await refreshLibrary();
	};

	const triggerFetchLatestADTorrents = async () => {
		// Use refreshLibrary from cache context instead
		await refreshLibrary();
	};

	// No longer needed since we're using cached items directly

	// aggregate metadata
	useEffect(() => {
		if (loading) return;

		setGrouping(true);
		setTotalBytes(0);
		sameTitle.clear();
		sameHash.clear();

		// title grouping
		clearGroupings(defaultTitleGrouping);
		clearGroupings(movieTitleGrouping);
		clearGroupings(tvGroupingByEpisode);
		// tv show title grouping
		clearGroupings(tvGroupingByTitle);
		// hash grouping
		clearGroupings(hashGrouping);

		for (const t of userTorrentsList) {
			if (/^Magnet/.test(t.title)) continue;

			// group by hash
			if (t.hash in hashGrouping) {
				if (hashGrouping[t.hash] === 1) sameHash.add(t.hash);
				hashGrouping[t.hash]++;
			} else {
				hashGrouping[t.hash] = 1;
				setTotalBytes((prev) => prev + t.bytes);
			}

			/// group by title
			const titleId = normalize(t.title);
			if (titleId in getTitleGroupings(t.mediaType)) {
				if (getTitleGroupings(t.mediaType)[titleId] === 1) sameTitle.add(titleId);
				getTitleGroupings(t.mediaType)[titleId]++;
			} else {
				getTitleGroupings(t.mediaType)[titleId] = 1;
			}

			/// group by tv title
			if (t.mediaType === 'tv' && t.info?.title) {
				const tvShowTitleId = normalize(t.info.title);
				if (tvShowTitleId in tvGroupingByTitle) {
					tvGroupingByTitle[tvShowTitleId]++;
				} else {
					tvGroupingByTitle[tvShowTitleId] = 1;
				}
			}
		}
		setGrouping(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		userTorrentsList,
		loading,
		defaultTitleGrouping,
		movieTitleGrouping,
		tvGroupingByEpisode,
		tvGroupingByTitle,
	]);

	useEffect(() => {
		if (!adKey || adSyncing) return;
		const uncachedIDs = userTorrentsList
			.filter((r) => r.id.startsWith('ad:') && r.serviceStatus === '11')
			.map((r) => r.id);
		setUncachedAdIDs(uncachedIDs);
		uncachedIDs.length &&
			toast.success(
				`Found ${uncachedIDs.length} uncached torrents in AllDebrid`,
				searchToastOptions
			);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [adKey, adSyncing]);

	// set the list you see
	const tips = [
		'Tip: You can use hash lists to share your library with others anonymously. Click on the button, wait for the page to finish processing, and share the link to your friends.',
		'Tip: You can make a local backup of your library by using the "Local backup" button. This will generate a file containing your whole library that you can use to restore your library later.',
		'Tip: You can restore a local backup by using the "Local restore" button. It will only restore the torrents that are not already in your library.',
		'Tip: The quick search box will filter the list by filename and id. You can use multiple words or even regex to filter your library. This way, you can select multiple torrents and delete them at once, or share them as a hash list.',
		'Have you tried clicking on a torrent? You can see the links, the progress, and the status of the torrent. You can also select the files you want to download.',
		'I don\'t know what to put here, so here\'s a random tip: "The average person walks the equivalent of five times around the world in a lifetime."',
	];
	function setHelpTextBasedOnTime() {
		const date = new Date();
		const minute = date.getMinutes();
		const index = minute % tips.length;
		const randomTip = tips[index];
		if (helpText !== 'hide') setHelpText(randomTip);
	}

	// filter the list
	useEffect(() => {
		if (loading || grouping) return;
		setFiltering(true);
		setSlowCount(userTorrentsList.filter(isSlowOrNoLinks).length);
		setInProgressCount(userTorrentsList.filter(isInProgress).length);
		setFailedCount(userTorrentsList.filter(isFailed).length);
		if (hasNoQueryParamsBut('page')) {
			setFilteredList(quickSearchLibrary(query, userTorrentsList));
			// deleteFailedTorrents(userTorrentsList); // disabled because this is BAD!
			setFiltering(false);
			setHelpTextBasedOnTime();
			return;
		}
		let tmpList = userTorrentsList;
		if (status === 'slow') {
			tmpList = tmpList.filter(isSlowOrNoLinks);
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide')
				setHelpText(
					'The displayed torrents are older than one hour and lack any seeders. You can use the "Delete shown" option to remove them.'
				);
		}
		if (status === 'inprogress') {
			tmpList = tmpList.filter(isInProgress);
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide') setHelpText('Torrents that are still downloading');
		}
		if (status === 'failed') {
			tmpList = tmpList.filter(isFailed);
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide') setHelpText('Torrents that have a failure status');
		}
		if (status === 'uncached') {
			tmpList = tmpList.filter(
				(t) =>
					(t.status === UserTorrentStatus.finished &&
						t.id.startsWith('rd:') &&
						uncachedRdHashes.has(t.hash)) ||
					(t.id.startsWith('ad:') && uncachedAdIDs.includes(t.id))
			);
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide') setHelpText('Torrents that are no longer cached');
		}
		if (status === 'selected') {
			tmpList = tmpList.filter((t) => selectedTorrents.has(t.id));
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide') setHelpText('Torrents that you have selected');
		}
		if (titleFilter) {
			const decoded = decodeURIComponent(titleFilter as string);
			tmpList = tmpList.filter((t) => normalize(t.title) === decoded);
			setFilteredList(quickSearchLibrary(query, tmpList));
		}
		if (tvTitleFilter) {
			const decoded = decodeURIComponent(tvTitleFilter as string);
			tmpList = tmpList.filter(
				(t) => t.mediaType === 'tv' && t.info?.title && normalize(t.info.title) === decoded
			);
			setFilteredList(quickSearchLibrary(query, tmpList));
		}
		if (hashFilter) {
			const hashVal = hashFilter as string;
			tmpList = tmpList.filter((t) => t.hash === hashVal);
			setFilteredList(quickSearchLibrary(query, tmpList));
		}
		if (status === 'sametitle') {
			tmpList = tmpList.filter((t) => sameTitle.has(normalize(t.title)));
			setFilteredList(quickSearchLibrary(query, tmpList));
		}
		if (status === 'samehash') {
			tmpList = tmpList.filter((t) => sameHash.has(t.hash));
			setFilteredList(quickSearchLibrary(query, tmpList));
		}
		if (mediaType) {
			tmpList = tmpList.filter((t) => mediaType === t.mediaType);
			setFilteredList(quickSearchLibrary(query, tmpList));
			if (helpText !== 'hide')
				setHelpText(
					`Torrents shown are detected as ${['movies', 'TV shows', 'non-movie/TV content'][['movie', 'tv', 'other'].indexOf(mediaType as string)]}.`
				);
		}
		setFiltering(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [router.query, userTorrentsList, loading, grouping, query, currentPage, uncachedRdHashes]);

	function handleSort(column: typeof sortBy.column) {
		setSortBy({
			column,
			direction: sortBy.column === column && sortBy.direction === 'asc' ? 'desc' : 'asc',
		});
	}

	const sortedData = useMemo(() => {
		return [...filteredList].sort((a, b) => {
			const isAsc = sortBy.direction === 'asc';
			let comparison = 0;

			if (sortBy.column === 'title') {
				const titleA = a[sortBy.column] as string;
				const titleB = b[sortBy.column] as string;
				const lowerA = titleA.toLowerCase();
				const lowerB = titleB.toLowerCase();

				if (lowerA === lowerB) {
					comparison = titleA < titleB ? -1 : 1; // Uppercase first
				} else {
					comparison = lowerA < lowerB ? -1 : 1;
				}
			} else {
				if (a[sortBy.column] > b[sortBy.column]) {
					comparison = 1;
				} else if (a[sortBy.column] < b[sortBy.column]) {
					comparison = -1;
				}
			}

			return isAsc ? comparison : comparison * -1;
		});
	}, [filteredList, sortBy]);

	const currentPageData = useMemo(() => {
		return sortedData.slice(
			(currentPage - 1) * ITEMS_PER_PAGE,
			(currentPage - 1) * ITEMS_PER_PAGE + ITEMS_PER_PAGE
		);
	}, [sortedData, currentPage]);

	const getTitleGroupings = (mediaType: UserTorrent['mediaType']) => {
		switch (mediaType) {
			case 'movie':
				return movieTitleGrouping;
			case 'tv':
				return tvGroupingByEpisode;
			default:
				return defaultTitleGrouping;
		}
	};

	function clearGroupings(frequencyMap: { [x: string]: number }) {
		for (let key in frequencyMap) {
			delete frequencyMap[key];
		}
	}

	async function handleReinsertTorrents() {
		if (
			relevantList.length > 0 &&
			!(
				await Swal.fire({
					title: 'Reinsert shown',
					text: `This will reinsert the ${relevantList.length} torrents filtered. Are you sure?`,
					icon: 'warning',
					showCancelButton: true,
					confirmButtonColor: '#0891b2',
					cancelButtonColor: '#374151',
					confirmButtonText: 'Yes, reinsert!',
					background: '#111827',
					color: '#f3f4f6',
					customClass: {
						popup: 'bg-gray-900',
						htmlContainer: 'text-gray-100',
					},
				})
			).isConfirmed
		)
			return;
		const toReinsert = relevantList.map(wrapReinsertFn);

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
			resetSelection(setSelectedTorrents);
			await refreshLibrary();
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
			resetSelection(setSelectedTorrents);
			await refreshLibrary();
		} else {
			toast.dismiss(progressToast);
		}
	}

	async function handleGenerateHashlist() {
		// get title from input popup
		const { value: title } = await Swal.fire({
			title: 'Enter a title for the hash list',
			input: 'text',
			inputPlaceholder: 'Enter a title',
			inputAttributes: {
				autocapitalize: 'off',
			},
			showCancelButton: true,
			confirmButtonColor: '#0891b2',
			cancelButtonColor: '#374151',
			background: '#111827',
			color: '#f3f4f6',
			customClass: {
				popup: 'bg-gray-900',
				htmlContainer: 'text-gray-100',
				input: 'bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500',
			},
		});
		if (!title) return;
		generateHashList(title, relevantList);
	}

	async function handleDeleteShownTorrents() {
		if (
			relevantList.length > 0 &&
			!(
				await Swal.fire({
					title: 'Delete shown',
					text: `This will delete the ${relevantList.length} torrents filtered. Are you sure?`,
					icon: 'warning',
					showCancelButton: true,
					confirmButtonColor: '#0891b2',
					cancelButtonColor: '#374151',
					confirmButtonText: 'Yes, delete!',
					background: '#111827',
					color: '#f3f4f6',
					customClass: {
						popup: 'bg-gray-900',
						htmlContainer: 'text-gray-100',
					},
				})
			).isConfirmed
		)
			return;
		await deleteFilteredTorrents(relevantList, wrapDeleteFn);
		resetSelection(setSelectedTorrents);
	}

	function wrapDeleteFn(t: UserTorrent) {
		return async () => {
			const oldId = t.id;
			const torrentBackup = t; // Store the torrent for rollback

			// Optimistic update - remove from cache immediately
			removeFromCache(oldId);
			setSelectedTorrents((prev) => {
				const newSet = new Set(prev);
				newSet.delete(oldId);
				return newSet;
			});

			try {
				if (rdKey && t.id.startsWith('rd:')) {
					await handleDeleteRdTorrent(rdKey, t.id);
				}
				if (adKey && t.id.startsWith('ad:')) {
					await handleDeleteAdTorrent(adKey, t.id);
				}
			} catch (error) {
				// Rollback optimistic update on failure
				console.error('Failed to delete torrent:', error);

				// Re-add the torrent to cache
				addTorrent(torrentBackup);

				// Re-add to selection if it was selected
				setSelectedTorrents((prev) => {
					const newSet = new Set(prev);
					newSet.add(oldId);
					return newSet;
				});

				// Show error message to user
				toast.error(
					`Failed to delete torrent: ${error instanceof Error ? error.message : 'Unknown error'}`,
					libraryToastOptions
				);

				// Throw error so caller knows it failed
				throw error;
			}
		};
	}

	function wrapReinsertFn(t: UserTorrent) {
		return async () => {
			try {
				const oldId = t.id;
				if (rdKey && t.id.startsWith('rd:')) {
					await handleReinsertTorrentinRd(rdKey, t, true);
					await torrentDB.deleteById(oldId);
					removeFromCache(oldId); // Update global cache - this will trigger re-render
					setSelectedTorrents((prev) => {
						prev.delete(oldId);
						return new Set(prev);
					});
				}
				if (adKey && t.id.startsWith('ad:')) {
					await handleRestartTorrent(adKey, t.id);
				}
			} catch (error) {
				throw error;
			}
		};
	}

	async function dedupeBySize() {
		const deletePreference = await Swal.fire({
			title: 'Delete by size',
			text: 'Choose which duplicate torrents to delete based on size:',
			icon: 'question',
			showCancelButton: true,
			confirmButtonColor: '#0891b2',
			cancelButtonColor: '#374151',
			denyButtonColor: '#059669',
			confirmButtonText: 'Delete Smaller',
			denyButtonText: 'Delete Bigger',
			showDenyButton: true,
			cancelButtonText: `Cancel`,
			background: '#111827',
			color: '#f3f4f6',
			customClass: {
				popup: 'bg-gray-900',
				htmlContainer: 'text-gray-100',
			},
		});

		// If the user cancels the operation, return without doing anything
		if (deletePreference.isDismissed) return;

		// Determine the preference for deletion
		const deleteBigger = deletePreference.isDenied;

		// Get the key by status
		const getKey = (torrent: UserTorrent) => normalize(torrent.title);
		const dupes: UserTorrent[] = [];
		filteredList.reduce((acc: { [key: string]: UserTorrent }, cur: UserTorrent) => {
			let key = getKey(cur);
			if (acc[key]) {
				// Check if current is bigger or smaller based on the user's choice
				const isPreferred = deleteBigger
					? acc[key].bytes > cur.bytes
					: acc[key].bytes < cur.bytes;
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

		// Map duplicates to delete function based on preference
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
	}

	async function dedupeByRecency() {
		// New dialog to select whether to delete newer or older torrents
		const deletePreference = await Swal.fire({
			title: 'Delete by date',
			text: 'Choose which duplicate torrents to delete:',
			icon: 'question',
			showCancelButton: true,
			confirmButtonColor: '#0891b2',
			cancelButtonColor: '#374151',
			denyButtonColor: '#059669',
			confirmButtonText: 'Delete Older',
			denyButtonText: 'Delete Newer',
			showDenyButton: true,
			cancelButtonText: `Cancel`,
			background: '#111827',
			color: '#f3f4f6',
			customClass: {
				popup: 'bg-gray-900',
				htmlContainer: 'text-gray-100',
			},
		});

		// If the user cancels the operation, return without doing anything
		if (deletePreference.isDismissed) return;

		// Determine the preference for deletion
		const deleteOlder = deletePreference.isConfirmed;

		// Get the key by status
		const getKey = (torrent: UserTorrent) => normalize(torrent.title);
		const dupes: UserTorrent[] = [];
		filteredList.reduce((acc: { [key: string]: UserTorrent }, cur: UserTorrent) => {
			let key = getKey(cur);
			if (acc[key]) {
				// Check if current is newer based on the user's choice
				const isPreferred = deleteOlder
					? acc[key].added < cur.added
					: acc[key].added > cur.added;
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

		// Map duplicates to delete function based on preference
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
	}

	async function combineSameHash() {
		const dupeHashes: Map<string, UserTorrent[]> = new Map();
		filteredList.reduce((acc: { [key: string]: UserTorrent }, cur: UserTorrent) => {
			if (cur.status !== UserTorrentStatus.finished) return acc;
			let key = cur.hash;
			if (acc[key]) {
				if (!dupeHashes.has(key)) {
					dupeHashes.set(key, new Array(acc[key]));
				}
				dupeHashes.get(key)?.push(cur);
			} else {
				acc[key] = cur;
			}
			return acc;
		}, {});
		let dupeHashesCount = 0;
		dupeHashes.forEach((hashes) => {
			dupeHashesCount += hashes.length;
		});
		if (
			dupeHashesCount > 0 &&
			!(
				await Swal.fire({
					title: 'Merge same hash',
					text: `This will combine the ${dupeHashesCount} completed torrents with identical hashes into ${dupeHashes.size} and select all streamable files. Make sure to backup before doing this. Do you want to proceed?`,
					icon: 'question',
					showCancelButton: true,
					confirmButtonColor: '#0891b2',
					cancelButtonColor: '#374151',
					confirmButtonText: 'Yes, proceed!',
					background: '#111827',
					color: '#f3f4f6',
					customClass: {
						popup: 'bg-gray-900',
						htmlContainer: 'text-gray-100',
					},
				})
			).isConfirmed
		)
			return;
		let toReinsertAndDelete: AsyncFunction<unknown>[] = [];
		dupeHashes.forEach((sameHashTorrents: UserTorrent[]) => {
			const reinsert = sameHashTorrents.pop();
			if (reinsert) {
				toReinsertAndDelete.push(
					wrapReinsertFn(reinsert),
					...sameHashTorrents.map(wrapDeleteFn)
				);
			}
		});
		if (toReinsertAndDelete.length === 0) {
			toast('No torrents to merge', libraryToastOptions);
			return;
		}

		const progressToast = toast.loading(
			`Merging 0/${toReinsertAndDelete.length} operations...`,
			libraryToastOptions
		);

		const [results, errors] = await runConcurrentFunctions(
			toReinsertAndDelete,
			4,
			0,
			(completed, total, errorCount) => {
				const message =
					errorCount > 0
						? `Merging ${completed}/${total} operations (${errorCount} errors)...`
						: `Merging ${completed}/${total} operations...`;
				toast.loading(message, { id: progressToast });
			}
		);

		// Update the progress toast to show final result
		if (errors.length && results.length) {
			toast.error(`Merged ${results.length} torrents, failed ${errors.length} operations`, {
				id: progressToast,
				...libraryToastOptions,
			});
			await refreshLibrary();
		} else if (errors.length) {
			toast.error(`Failed to merge ${errors.length} torrents`, {
				id: progressToast,
				...libraryToastOptions,
			});
		} else if (results.length) {
			toast.success(`Merged ${results.length} torrents`, {
				id: progressToast,
				...libraryToastOptions,
			});
			await refreshLibrary();
		} else {
			toast.dismiss(progressToast);
		}
	}

	async function localBackup() {
		const backupChoice = await Swal.fire({
			title: 'Backup Library',
			text: 'Choose which torrents to backup:',
			icon: 'question',
			showCancelButton: true,
			confirmButtonColor: '#0891b2',
			cancelButtonColor: '#374151',
			denyButtonColor: '#059669',
			confirmButtonText: 'All Torrents',
			denyButtonText: 'Filtered List',
			showDenyButton: true,
			cancelButtonText: 'Cancel',
			background: '#111827',
			color: '#f3f4f6',
			customClass: {
				popup: 'bg-gray-900',
				htmlContainer: 'text-gray-100',
			},
		});

		if (backupChoice.isDismissed) return;

		const listToBackup = backupChoice.isConfirmed ? userTorrentsList : filteredList;
		const backupType = backupChoice.isConfirmed ? 'full' : 'filtered';

		toast('Generating a local backup file', libraryToastOptions);
		try {
			const hashList = listToBackup.map((t) => ({
				filename: t.filename,
				hash: t.hash,
			}));
			const blob = new Blob([JSON.stringify(hashList, null, 2)], {
				type: 'application/json',
			});
			saveAs(blob, `backup-${backupType}-${Date.now()}.dmm.json`);
		} catch (error) {
			toast.error(`Error creating a backup file`, libraryToastOptions);
			console.error(error);
		}
	}

	async function wrapLocalRestoreFn(debridService: string) {
		return await localRestore((files: RestoredFile[]) => {
			const allHashes = new Set(userTorrentsList.map((t) => t.hash));
			const addMagnet = (hash: string) => {
				if (rdKey && debridService === 'rd') return handleAddAsMagnetInRd(rdKey, hash);
				if (adKey && debridService === 'ad') return handleAddAsMagnetInAd(adKey, hash);
			};

			function wrapAddMagnetFn(hash: string) {
				return async () => await addMagnet(hash);
			}

			const processingPromise = new Promise<{ success: number; error: number }>(
				async (resolve) => {
					toast.loading(`DO NOT REFRESH THE PAGE`, libraryToastOptions);
					const notAddingCount = files.filter((f) => allHashes.has(f.hash)).length;
					if (notAddingCount > 0)
						toast.error(
							`${notAddingCount} torrents are already in your library`,
							libraryToastOptions
						);
					const toAdd = files
						.map((f) => f.hash)
						.filter((h) => !allHashes.has(h))
						.map(wrapAddMagnetFn);
					const concurrencyCount = 1;
					const [results, errors] = await runConcurrentFunctions(
						toAdd,
						concurrencyCount,
						0,
						(completed, total, errorCount) => {
							const message =
								errorCount > 0
									? `Restoring ${completed}/${total} downloads (${errorCount} errors)...`
									: `Restoring ${completed}/${total} downloads...`;
							toast.loading(message, { id: 'restore-progress' });
						}
					);
					toast.dismiss('restore-progress');
					if (results.length) {
						await refreshLibrary();
					}
					resolve({ success: results.length, error: errors.length });
				}
			);

			toast.promise(
				processingPromise,
				{
					loading: `Restoring ${files.length} downloads in your library.`,
					success: ({ success, error }) => {
						setTimeout(() => location.reload(), 10000);
						return `Restored ${success} torrents but failed on ${error} others in your ${debridService.toUpperCase()} library. Refreshing the page in 10 seconds.`;
					},
					error: '',
				},
				{
					...libraryToastOptions,
					duration: 10000,
				}
			);
		});
	}

	async function handleAddMagnet(debridService: string) {
		const { value: input, dismiss } = await Swal.fire({
			title: `Add to your ${debridService.toUpperCase()} library`,
			html: `
				<div class="bg-gray-900 p-4 rounded-lg">
					<textarea
						id="magnetInput"
						class="w-full h-32 bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
						placeholder="Paste your Magnet link(s) here"
					></textarea>
					<div class="mt-4">
						<label class="block text-sm text-gray-300 mb-2">Or upload .torrent file(s)</label>
						<input
							type="file"
							id="torrentFile"
							accept=".torrent"
							multiple
							class="block w-full text-sm text-gray-300
								file:mr-4 file:py-2 file:px-4
								file:rounded file:border-0
								file:text-sm file:font-medium
								file:bg-cyan-900 file:text-cyan-100
								hover:file:bg-cyan-800
								cursor-pointer
								border border-gray-700 rounded
							"
						/>
					</div>
				</div>
			`,
			background: '#111827',
			color: '#f3f4f6',
			confirmButtonColor: '#0891b2',
			cancelButtonColor: '#374151',
			showCancelButton: true,
			customClass: {
				popup: 'bg-gray-900',
				htmlContainer: 'text-gray-100',
			},
			preConfirm: async () => {
				const magnetInput = (document.getElementById('magnetInput') as HTMLTextAreaElement)
					.value;
				const fileInput = document.getElementById('torrentFile') as HTMLInputElement;
				const files = fileInput.files;

				let hashes: string[] = [];

				// Process magnet links
				if (magnetInput) {
					hashes.push(...extractHashes(magnetInput));
				}

				// Process torrent files
				if (files && files.length > 0) {
					try {
						const fileHashes = await Promise.all(
							Array.from(files).map((file) => getHashOfTorrent(file))
						);
						hashes.push(
							...fileHashes.filter((hash): hash is string => hash !== undefined)
						);
					} catch (error) {
						Swal.showValidationMessage(`Failed to process torrent file: ${error}`);
						return false;
					}
				}

				if (hashes.length === 0) {
					Swal.showValidationMessage(
						'Please provide either magnet links or torrent files'
					);
					return false;
				}

				return hashes;
			},
		});

		if (dismiss === Swal.DismissReason.cancel || !input) return;

		const hashes = input as string[];

		if (rdKey && hashes && debridService === 'rd') {
			handleAddMultipleHashesInRd(rdKey, hashes, async () => await refreshLibrary());
		}
		if (adKey && hashes && debridService === 'ad') {
			handleAddMultipleHashesInAd(adKey, hashes, async () => await refreshLibrary());
		}
	}

	const hasNoQueryParamsBut = (...params: string[]) =>
		Object.keys(router.query).filter((p) => !params.includes(p)).length === 0;

	const resetFilters = () => {
		setQuery('');
		setSortBy({ column: 'added', direction: 'desc' });
		router.push(`/library?page=1`);
	};

	// Remove the initialize function as we're using cached data now

	return (
		<div className="mx-1 my-0 min-h-screen bg-gray-900 text-gray-100">
			<Head>
				<title>Debrid Media Manager - Library</title>
			</Head>
			<Toaster position="bottom-right" />
			<div className="mb-1 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h1 className="text-xl font-bold text-white">
						<BookOpen className="mr-1 inline-block h-5 w-5 text-cyan-400" />
						Library{' '}
						<LibrarySize
							torrentCount={userTorrentsList.length}
							totalBytes={totalBytes}
							isLoading={isFetching}
						/>
						{selectedTorrents.size > 0 && (
							<span className="ml-2 text-sm font-normal text-cyan-400">
								({selectedTorrents.size}/{filteredList.length} selected)
							</span>
						)}
					</h1>
					<div className="flex items-center gap-2">
						{lastFetchTime && (
							<span className="text-xs text-gray-500">
								{(() => {
									const diff = Date.now() - lastFetchTime.getTime();
									const minutes = Math.floor(diff / 60000);
									const hours = Math.floor(minutes / 60);
									if (hours > 0) return `${hours}h ago`;
									if (minutes > 0) return `${minutes}m ago`;
									return 'Just now';
								})()}
							</span>
						)}
						<button
							onClick={refreshLibrary}
							disabled={isFetching}
							className={`rounded-full p-1.5 transition-all ${
								isFetching
									? 'cursor-not-allowed bg-gray-700 text-gray-500'
									: cacheError
										? 'bg-red-900/50 text-red-400 hover:bg-red-800/50'
										: 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800/50 hover:text-cyan-300'
							}`}
							title={cacheError ? `Retry (${cacheError})` : 'Refresh library'}
						>
							<svg
								className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
						</button>
					</div>
				</div>

				<Link
					href="/"
					className="rounded border-2 border-cyan-500 bg-cyan-900/30 px-2 py-0.5 text-sm text-cyan-100 transition-colors hover:bg-cyan-800/50"
				>
					Go Home
				</Link>
			</div>
			<div className="mb-2 flex items-center border-b-2 border-gray-600 py-0">
				<input
					className="mr-3 w-full appearance-none border-none bg-transparent px-2 py-0.5 text-xs leading-tight text-gray-100 focus:outline-none"
					type="text"
					id="query"
					placeholder="search by filename/hash/id, supports regex"
					value={query}
					onChange={(e) => {
						setCurrentPage(1);
						setQuery(e.target.value.toLocaleLowerCase());
					}}
				/>
			</div>
			<LibraryMenuButtons
				currentPage={currentPage}
				maxPages={Math.ceil(sortedData.length / ITEMS_PER_PAGE)}
				onPrevPage={handlePrevPage}
				onNextPage={handleNextPage}
				onResetFilters={resetFilters}
				sameHashSize={sameHash.size}
				sameTitleSize={sameTitle.size}
				selectedTorrentsSize={selectedTorrents.size}
				uncachedCount={uncachedAdIDs.length + uncachedRdHashes.size}
				inProgressCount={inProgressCount}
				slowCount={slowCount}
				failedCount={failedCount}
			/>
			<LibraryActionButtons
				onSelectShown={() => selectShown(currentPageData, setSelectedTorrents)}
				onResetSelection={() => resetSelection(setSelectedTorrents)}
				onReinsertTorrents={handleReinsertTorrents}
				onGenerateHashlist={handleGenerateHashlist}
				onDeleteShownTorrents={handleDeleteShownTorrents}
				onAddMagnet={handleAddMagnet}
				onLocalRestore={wrapLocalRestoreFn}
				onLocalBackup={localBackup}
				onDedupeBySize={dedupeBySize}
				onDedupeByRecency={dedupeByRecency}
				onCombineSameHash={combineSameHash}
				selectedTorrentsSize={selectedTorrents.size}
				rdKey={rdKey}
				adKey={adKey}
				showDedupe={
					router.query.status === 'sametitle' ||
					(!!titleFilter && filteredList.length > 1)
				}
				showHashCombine={
					router.query.status === 'samehash' || (!!hashFilter && filteredList.length > 1)
				}
			/>
			<LibraryHelpText helpText={helpText} onHide={() => setHelpText('hide')} />
			<div className="overflow-x-auto">
				{loading || grouping || filtering ? (
					<div className="mt-2 flex items-center justify-center">
						<div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
					</div>
				) : (
					<table className="w-full">
						<thead>
							<LibraryTableHeader
								sortBy={sortBy}
								onSort={handleSort}
								filteredListLength={filteredList.length}
								selectedTorrentsSize={selectedTorrents.size}
							/>
						</thead>
						<tbody>
							{currentPageData.map((torrent) => (
								<LibraryTorrentRow
									key={torrent.id}
									torrent={torrent}
									rdKey={rdKey}
									adKey={adKey}
									shouldDownloadMagnets={shouldDownloadMagnets}
									hashGrouping={hashGrouping}
									titleGrouping={getTitleGroupings(torrent.mediaType)}
									tvGroupingByTitle={tvGroupingByTitle}
									hashFilter={hashFilter as string}
									titleFilter={titleFilter as string}
									tvTitleFilter={tvTitleFilter as string}
									isSelected={selectedTorrents.has(torrent.id)}
									onSelect={(id) =>
										handleSelectTorrent(
											id,
											selectedTorrents,
											setSelectedTorrents
										)
									}
									onDelete={async (id) => {
										// Use optimistic update from cache
										removeFromCache(id);
										setSelectedTorrents((prev) => {
											const newSet = new Set(prev);
											newSet.delete(id);
											return newSet;
										});
									}}
									onShowInfo={async (t) => {
										if (t.id.startsWith('rd:') && rdKey) {
											const info = await getTorrentInfo(
												rdKey,
												t.id.substring(3)
											);
											if (
												t.status === UserTorrentStatus.waiting ||
												t.status === UserTorrentStatus.downloading
											) {
												const selectedFiles = info.files.filter(
													(f: RDFileInfo) => f.selected
												);
												updateInCache(t.id, {
													progress: info.progress,
													seeders: info.seeders,
													speed: info.speed,
													status: getRdStatus(info),
													serviceStatus: info.status,
													links: info.links,
													selectedFiles: selectedFiles.map(
														(f: RDFileInfo, idx: number) => ({
															fileId: f.id,
															filename: f.path,
															filesize: f.bytes,
															link:
																selectedFiles.length ===
																info.links.length
																	? info.links[idx]
																	: '',
														})
													),
												});
												await torrentDB.add(t);
											}
											// Show the info dialog
											await handleShowInfoForRD(
												t,
												rdKey,
												setUserTorrentsList,
												torrentDB,
												setSelectedTorrents
											);
										} else if (t.id.startsWith('ad:') && adKey) {
											await handleShowInfoForAD(t, adKey);
										} else {
											console.error(
												'Cannot show info: missing debrid service key'
											);
										}
									}}
									onTypeChange={(t) => {
										// Update in cache optimistically
										updateInCache(t.id, { mediaType: t.mediaType });
										// Also update in database
										handleChangeType(t, setUserTorrentsList, torrentDB);
									}}
								/>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

export default withAuth(TorrentsPage);
