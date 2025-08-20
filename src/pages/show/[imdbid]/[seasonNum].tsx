import RelatedMedia from '@/components/RelatedMedia';
import SearchTokens from '@/components/SearchTokens';
import TvSearchResults from '@/components/TvSearchResults';
import Poster from '@/components/poster';
import { showInfoForRD } from '@/components/showInfo';
import { useAllDebridApiKey, useRealDebridAccessToken } from '@/hooks/auth';
import { SearchApiResponse, SearchResult } from '@/services/mediasearch';
import { TorrentInfoResponse } from '@/services/types';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent } from '@/torrent/userTorrent';
import { handleAddAsMagnetInAd, handleAddAsMagnetInRd } from '@/utils/addMagnet';
import { removeAvailability, submitAvailability } from '@/utils/availability';
import { handleCastTvShow } from '@/utils/castApiClient';
import { handleCopyOrDownloadMagnet } from '@/utils/copyMagnet';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import {
	getColorScale,
	getExpectedEpisodeCount,
	getQueryForEpisodeCount,
} from '@/utils/episodeUtils';
import { convertToUserTorrent, fetchAllDebrid } from '@/utils/fetchTorrents';
import { instantCheckInAd, instantCheckInRd, wrapLoading } from '@/utils/instantChecks';
import { processWithConcurrency } from '@/utils/parallelProcessor';
import { quickSearch } from '@/utils/quickSearch';
import { sortByMedian } from '@/utils/results';
import { isVideo } from '@/utils/selectable';
import { defaultEpisodeSize, defaultPlayer } from '@/utils/settings';
import { castToastOptions, searchToastOptions } from '@/utils/toastOptions';
import { generateTokenAndHash } from '@/utils/token';
import {
	getCachedTrackerStats,
	getMultipleTrackerStats,
	shouldIncludeTrackerStats,
} from '@/utils/trackerStats';
import { withAuth } from '@/utils/withAuth';
import axios, { AxiosError } from 'axios';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FunctionComponent, useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

type ShowInfo = {
	title: string;
	description: string;
	poster: string;
	backdrop: string;
	season_count: number;
	season_names: string[];
	imdb_score: number;
	season_episode_counts: Record<number, number>;
};

const torrentDB = new UserTorrentDB();

const TvSearch: FunctionComponent = () => {
	const isMounted = useRef(true);
	const hasLoadedTrackerStats = useRef(false);
	const player = window.localStorage.getItem('settings:player') || defaultPlayer;
	const episodeMaxSize =
		window.localStorage.getItem('settings:episodeMaxSize') || defaultEpisodeSize;
	const onlyTrustedTorrents =
		window.localStorage.getItem('settings:onlyTrustedTorrents') === 'true';
	const defaultTorrentsFilter = useMemo(
		() => window.localStorage.getItem('settings:defaultTorrentsFilter') ?? '',
		[]
	);

	const [showInfo, setShowInfo] = useState<ShowInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [searchState, setSearchState] = useState<string>('loading');
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [filteredResults, setFilteredResults] = useState<SearchResult[]>([]);
	const [errorMessage, setErrorMessage] = useState('');
	const [query, setQuery] = useState(defaultTorrentsFilter);
	const [descLimit, setDescLimit] = useState(100);
	const [rdKey] = useRealDebridAccessToken();
	const adKey = useAllDebridApiKey();
	const [onlyShowCached, setOnlyShowCached] = useState<boolean>(false);
	const [currentPage, setCurrentPage] = useState(0);
	const [totalUncachedCount, setTotalUncachedCount] = useState<number>(0);
	const [hasMoreResults, setHasMoreResults] = useState(true);
	const [hashAndProgress, setHashAndProgress] = useState<Record<string, number>>({});
	const [shouldDownloadMagnets] = useState(
		() =>
			typeof window !== 'undefined' &&
			window.localStorage.getItem('settings:downloadMagnets') === 'true'
	);
	const [showMassReportButtons] = useState(
		() =>
			typeof window !== 'undefined' &&
			window.localStorage.getItem('settings:showMassReportButtons') === 'true'
	);
	const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

	const router = useRouter();
	const { imdbid, seasonNum } = router.query;

	const expectedEpisodeCount = useMemo(
		() =>
			getExpectedEpisodeCount(
				seasonNum as string | undefined,
				showInfo?.season_episode_counts || {}
			),
		[seasonNum, showInfo]
	);

	useEffect(() => {
		if (!imdbid || !seasonNum) return;

		const fetchShowInfo = async () => {
			try {
				const response = await axios.get(`/api/info/show?imdbid=${imdbid}`);
				setShowInfo(response.data);

				if (parseInt(seasonNum as string) > response.data.season_count) {
					router.push(`/show/${imdbid}/1`);
				}
			} catch (error) {
				console.error('Error fetching show info:', error);
				setErrorMessage('Failed to fetch show information');
			} finally {
				setIsLoading(false);
			}
		};

		fetchShowInfo();
	}, [imdbid, seasonNum, router]);

	useEffect(() => {
		if (!imdbid || !seasonNum || isLoading) return;

		// Clear previous results and query input when season changes
		setSearchResults([]);
		setFilteredResults([]);
		setQuery(defaultTorrentsFilter); // Reset query to default filter

		const initializeData = async () => {
			await torrentDB.initializeDB();
			await Promise.all([
				fetchData(imdbid as string, parseInt(seasonNum as string), 0),
				fetchHashAndProgress(),
			]);
		};

		initializeData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [imdbid, seasonNum, isLoading, defaultTorrentsFilter]);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	async function fetchData(imdbId: string, seasonNum: number, page: number = 0) {
		const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
		if (page === 0) {
			setSearchResults([]);
			setTotalUncachedCount(0);
		}
		setErrorMessage('');
		setSearchState('loading');
		try {
			const response = await axios.get<SearchApiResponse>(
				`/api/torrents/tv?imdbId=${imdbId}&seasonNum=${seasonNum}&dmmProblemKey=${tokenWithTimestamp}&solution=${tokenHash}&onlyTrusted=${onlyTrustedTorrents}&maxSize=${episodeMaxSize}&page=${page}`
			);

			if (response.status !== 200) {
				setSearchState(response.headers.status ?? 'loaded');
				return;
			}

			if (response.data.results?.length && isMounted.current) {
				const results = response.data.results;
				setSearchResults((prevResults) => {
					const newResults = [
						...prevResults,
						...results.map((r) => ({
							...r,
							rdAvailable: false,
							adAvailable: false,
							noVideos: false,
							files: [],
						})),
					];
					return newResults.sort((a, b) => {
						const aAvailable = a.rdAvailable || a.adAvailable;
						const bAvailable = b.rdAvailable || b.adAvailable;
						if (aAvailable !== bAvailable) {
							return aAvailable ? -1 : 1;
						}
						return b.fileSize - a.fileSize;
					});
				});
				setHasMoreResults(results.length > 0);
				toast(`Found ${results.length} results`, searchToastOptions);

				const hashArr = results.map((r) => r.hash);
				const instantChecks = [];
				if (rdKey) {
					// Generate fresh token for instant checks
					instantChecks.push(
						wrapLoading(
							'RD',
							(async () => {
								const [tokenWithTimestamp, tokenHash] =
									await generateTokenAndHash();
								return instantCheckInRd(
									tokenWithTimestamp,
									tokenHash,
									imdbId,
									hashArr,
									setSearchResults,
									sortByMedian
								);
							})()
						)
					);
				}
				if (adKey)
					instantChecks.push(
						wrapLoading(
							'AD',
							instantCheckInAd(adKey, hashArr, setSearchResults, sortByMedian)
						)
					);
				const counts = await Promise.all(instantChecks);
				setSearchState('loaded');
				const newUncachedCount = hashArr.length - counts.reduce((acc, cur) => acc + cur, 0);
				setTotalUncachedCount((prev) => prev + newUncachedCount);
			} else {
				if (page === 0) {
					setSearchResults([]);
					setFilteredResults([]);
				}
				setHasMoreResults(false);
				toast(`No${page === 0 ? '' : ' more'} results found`, searchToastOptions);
			}
		} catch (error) {
			console.error(
				'Error fetching torrents:',
				error instanceof Error ? error.message : 'Unknown error'
			);
			if ((error as AxiosError).response?.status === 403) {
				setErrorMessage(
					'Please check the time in your device. If it is correct, please try again.'
				);
			} else {
				setErrorMessage(
					'There was an error searching for the query. Please try again later.'
				);
				setHasMoreResults(false);
			}
		} finally {
			setSearchState('loaded');
		}
	}

	useEffect(() => {
		if (searchResults.length === 0) {
			setFilteredResults([]);
			return;
		}
		const filteredResults = quickSearch(query, searchResults);
		setFilteredResults(filteredResults);
	}, [query, searchResults]);

	// Load cached tracker stats from database for uncached torrents
	useEffect(() => {
		async function loadCachedTrackerStats() {
			// Find uncached results that don't have tracker stats yet
			const uncachedResults = searchResults.filter(
				(r) => !r.rdAvailable && !r.adAvailable && !r.tbAvailable && !r.trackerStats
			);

			if (uncachedResults.length === 0) {
				return;
			}

			try {
				// Bulk fetch existing tracker stats from database (no new scraping)
				const hashes = uncachedResults.map((r) => r.hash);
				const trackerStatsArray = await getMultipleTrackerStats(hashes);

				if (!isMounted.current) return;

				// Update search results with cached tracker stats
				if (trackerStatsArray.length > 0) {
					setSearchResults((prev) => {
						return prev.map((r) => {
							const stats = trackerStatsArray.find((s) => s.hash === r.hash);
							if (stats) {
								return {
									...r,
									trackerStats: {
										seeders: stats.seeders,
										leechers: stats.leechers,
										downloads: stats.downloads,
										hasActivity:
											stats.seeders >= 1 &&
											stats.leechers + stats.downloads >= 1,
									},
								};
							}
							return r;
						});
					});
				}
				// Mark that we've loaded tracker stats
				hasLoadedTrackerStats.current = true;
			} catch (error) {
				console.error('Error loading cached tracker stats:', error);
			}
		}

		// Only run once when search is loaded and we haven't loaded stats yet
		if (
			searchState === 'loaded' &&
			searchResults.length > 0 &&
			!hasLoadedTrackerStats.current
		) {
			loadCachedTrackerStats();
		}
	}, [searchState, searchResults.length]); // Depend on searchState and length only

	// Reset the tracker stats flag when season changes
	useEffect(() => {
		hasLoadedTrackerStats.current = false;
	}, [imdbid, seasonNum]);

	async function fetchHashAndProgress(hash?: string) {
		const torrents = await torrentDB.all();
		const records: Record<string, number> = {};
		for (const t of torrents) {
			if (hash && t.hash !== hash) continue;
			records[`${t.id.substring(0, 3)}${t.hash}`] = t.progress;
		}
		setHashAndProgress((prev) => ({ ...prev, ...records }));
	}

	async function addRd(hash: string, isCheckingAvailability = false): Promise<any> {
		const torrentResult = searchResults.find((r) => r.hash === hash);
		const wasMarkedAvailable = torrentResult?.rdAvailable || false;
		let torrentInfo: TorrentInfoResponse | null = null;

		await handleAddAsMagnetInRd(rdKey!, hash, async (info: TorrentInfoResponse) => {
			torrentInfo = info;
			const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();

			// Only handle false positives for actual usage, not availability checks
			if (!isCheckingAvailability && wasMarkedAvailable) {
				// Check for false positive conditions
				const isFalsePositive =
					info.status !== 'downloaded' ||
					info.progress !== 100 ||
					info.files?.filter((f) => f.selected === 1).length === 0;

				if (isFalsePositive) {
					// Remove false positive from availability database
					await removeAvailability(
						tokenWithTimestamp,
						tokenHash,
						hash,
						`Status: ${info.status}, Progress: ${info.progress}%, Selected files: ${info.files?.filter((f) => f.selected === 1).length || 0}`
					);

					// Update UI
					setSearchResults((prev) =>
						prev.map((r) => (r.hash === hash ? { ...r, rdAvailable: false } : r))
					);

					toast.error('This torrent was incorrectly marked as available.');
				}
			}

			// Only submit availability for truly available torrents
			if (info.status === 'downloaded' && info.progress === 100) {
				await submitAvailability(tokenWithTimestamp, tokenHash, info, imdbid as string);
			}

			await torrentDB.add(convertToUserTorrent(info)).then(() => fetchHashAndProgress(hash));
		});

		return isCheckingAvailability ? torrentInfo : undefined;
	}

	async function addAd(hash: string) {
		await handleAddAsMagnetInAd(adKey!, hash);
		await fetchAllDebrid(
			adKey!,
			async (torrents: UserTorrent[]) => await torrentDB.addAll(torrents)
		);
		await fetchHashAndProgress();
	}

	async function deleteRd(hash: string) {
		const torrents = await torrentDB.getAllByHash(hash);
		for (const t of torrents) {
			if (!t.id.startsWith('rd:')) continue;
			await handleDeleteRdTorrent(rdKey!, t.id);
			await torrentDB.deleteByHash('rd', hash);
			setHashAndProgress((prev) => {
				const newHashAndProgress = { ...prev };
				delete newHashAndProgress[`rd:${hash}`];
				return newHashAndProgress;
			});
		}
	}

	async function deleteAd(hash: string) {
		const torrents = await torrentDB.getAllByHash(hash);
		for (const t of torrents) {
			if (!t.id.startsWith('ad:')) continue;
			await handleDeleteAdTorrent(adKey!, t.id);
			await torrentDB.deleteByHash('ad', hash);
			setHashAndProgress((prev) => {
				const newHashAndProgress = { ...prev };
				delete newHashAndProgress[`ad:${hash}`];
				return newHashAndProgress;
			});
		}
	}

	const handleShowInfo = (result: SearchResult) => {
		let files = result.files
			.filter((file) => isVideo({ path: file.filename }))
			.map((file) => ({
				id: file.fileId,
				path: file.filename,
				bytes: file.filesize,
				selected: 1,
			}));
		const info = {
			id: '',
			filename: result.title,
			original_filename: result.title,
			hash: result.hash,
			bytes: result.fileSize * 1024 * 1024,
			original_bytes: result.fileSize,
			progress: 100,
			files,
			links: [],
			fake: true,
			host: '',
			split: 0,
			status: 'downloaded',
			added: '',
			ended: '',
			speed: 0,
			seeders: 0,
		} as TorrentInfoResponse;
		rdKey && showInfoForRD(player, rdKey!, info, imdbid as string, 'tv', shouldDownloadMagnets);
	};

	async function handleCast(hash: string, fileIds: string[]) {
		await toast.promise(
			handleCastTvShow(imdbid as string, rdKey!, hash, fileIds),
			{
				loading: `Casting ${fileIds.length} episodes`,
				success: 'Casting successful',
				error: 'Casting failed',
			},
			castToastOptions
		);
		// open stremio after casting
		window.open(`stremio://detail/series/${imdbid}/${imdbid}:${seasonNum}:1`);
	}

	async function handleCheckAvailability(result: SearchResult) {
		if (result.rdAvailable) {
			toast.success('This torrent is already available in Real Debrid');
			return;
		}

		const toastId = toast.loading('Checking availability...');

		try {
			// Run both checks in parallel
			const [rdCheckResult, trackerStatsResult] = await Promise.allSettled([
				// RD availability check
				(async () => {
					let addRdResponse: any;
					// Check if torrent is in progress
					if (`rd:${result.hash}` in hashAndProgress) {
						await deleteRd(result.hash);
						addRdResponse = await addRd(result.hash, true); // Pass flag to indicate this is a check
					} else {
						addRdResponse = await addRd(result.hash, true); // Pass flag to indicate this is a check
						await deleteRd(result.hash);
					}

					// Check if addRd found it cached (returns response with ID)
					const isCachedInRD =
						addRdResponse &&
						addRdResponse.id &&
						addRdResponse.status === 'downloaded' &&
						addRdResponse.progress === 100;

					return { addRdResponse, isCachedInRD };
				})(),

				// Tracker stats check (only if enabled and not already RD available)
				(async () => {
					if (!shouldIncludeTrackerStats() || result.rdAvailable) {
						return null;
					}

					// For single torrent checks, force refresh if it was previously dead
					// This ensures we always check if dead torrents have come back to life
					const currentStats = result.trackerStats;
					const forceRefresh = currentStats && currentStats.seeders === 0;

					// Use cached stats if fresh, otherwise scrape new ones
					// Dead torrents have 1-hour cache, live torrents have 24-hour cache
					return await getCachedTrackerStats(result.hash, 24, forceRefresh);
				})(),
			]);

			// Process RD check result
			let isCachedInRD = false;
			if (rdCheckResult.status === 'fulfilled') {
				isCachedInRD = rdCheckResult.value.isCachedInRD;
			} else {
				console.error('RD availability check failed:', rdCheckResult.reason);
			}

			// Process tracker stats result (only if not cached in RD)
			if (
				trackerStatsResult.status === 'fulfilled' &&
				trackerStatsResult.value &&
				!isCachedInRD
			) {
				const trackerStats = trackerStatsResult.value;

				// Update the search result with tracker stats
				const updatedResults = searchResults.map((r) => {
					if (r.hash === result.hash) {
						return {
							...r,
							trackerStats: {
								seeders: trackerStats.seeders,
								leechers: trackerStats.leechers,
								downloads: trackerStats.downloads,
								hasActivity:
									trackerStats.seeders >= 1 &&
									trackerStats.leechers + trackerStats.downloads >= 1,
							},
						};
					}
					return r;
				});
				setSearchResults(updatedResults);
				setFilteredResults(
					updatedResults.filter((r) =>
						onlyShowCached ? r.rdAvailable || r.adAvailable : true
					)
				);
			} else if (trackerStatsResult.status === 'rejected' && !isCachedInRD) {
				console.error('Failed to get tracker stats:', trackerStatsResult.reason);
			}

			toast.success('Availability check complete', { id: toastId });

			// Refetch data instead of reloading
			if (isMounted.current) {
				const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
				const hashArr = [result.hash];
				await instantCheckInRd(
					tokenWithTimestamp,
					tokenHash,
					imdbid as string,
					hashArr,
					setSearchResults,
					sortByMedian
				);
			}

			// Reload the page after a short delay to show the result
			setTimeout(() => {
				if (isMounted.current) {
					window.location.reload();
				}
			}, 1500);
		} catch (error) {
			toast.error('Failed to check availability', { id: toastId });
			console.error('Availability check error:', error);

			// Reload the page after a short delay even on error
			setTimeout(() => {
				if (isMounted.current) {
					window.location.reload();
				}
			}, 1500);
		}
	}

	async function handleAvailabilityTest() {
		if (isCheckingAvailability) return;

		const nonAvailableResults = filteredResults.filter((r) => !r.rdAvailable);
		let progressToast: string | null = null;
		let realtimeAvailableCount = 0;

		// Show initial toast immediately
		if (nonAvailableResults.length === 0) {
			toast.error('No torrents to test for availability');
			return;
		}

		// Get availability check limit from settings
		const availabilityCheckLimit = parseInt(
			window.localStorage.getItem('settings:availabilityCheckLimit') || '0'
		);

		// Apply limit if set (0 means no limit)
		let torrentsToCheck = nonAvailableResults;
		if (availabilityCheckLimit > 0 && nonAvailableResults.length > availabilityCheckLimit) {
			torrentsToCheck = nonAvailableResults.slice(0, availabilityCheckLimit);
			toast(
				`Checking first ${availabilityCheckLimit} torrents out of ${nonAvailableResults.length} (limit set in settings)`,
				{ duration: 4000 }
			);
		}

		setIsCheckingAvailability(true);
		progressToast = toast.loading(
			`Starting availability test for ${torrentsToCheck.length} torrents...`
		);

		// Track progress for both operations
		let rdProgress = { completed: 0, total: torrentsToCheck.length };
		let statsProgress = { completed: 0, total: 0 };
		let torrentsWithSeeds = 0;

		const updateProgressMessage = () => {
			let message = '';

			// RD progress
			if (rdProgress.total > 0) {
				message =
					realtimeAvailableCount > 0
						? `RD: ${rdProgress.completed}/${rdProgress.total} (${realtimeAvailableCount} found)`
						: `RD: ${rdProgress.completed}/${rdProgress.total}`;
			}

			// Tracker stats progress (only show if enabled and has items)
			if (shouldIncludeTrackerStats() && statsProgress.total > 0) {
				if (message) message += ' | ';
				message +=
					torrentsWithSeeds > 0
						? `Tracker Stats: ${statsProgress.completed}/${statsProgress.total} (${torrentsWithSeeds} with seeds)`
						: `Tracker Stats: ${statsProgress.completed}/${statsProgress.total}`;
			}

			if (progressToast && isMounted.current && message) {
				toast.loading(message, { id: progressToast });
			}
		};

		try {
			// Run RD checks and tracker stats completely in parallel
			const [rdCheckResults, trackerStatsResults] = await Promise.all([
				// RD availability checks with concurrency limit
				processWithConcurrency(
					torrentsToCheck,
					async (result: SearchResult) => {
						try {
							let addRdResponse: any;
							if (`rd:${result.hash}` in hashAndProgress) {
								await deleteRd(result.hash);
								addRdResponse = await addRd(result.hash, true); // Pass flag for availability test
							} else {
								addRdResponse = await addRd(result.hash, true); // Pass flag for availability test
								await deleteRd(result.hash);
							}

							// Check if addRd returned a response with an ID AND is truly available
							const isCachedInRD =
								addRdResponse &&
								addRdResponse.id &&
								addRdResponse.status === 'downloaded' &&
								addRdResponse.progress === 100;

							if (isCachedInRD) {
								realtimeAvailableCount++;
							}

							return { result, isCachedInRD };
						} catch (error) {
							console.error(`Failed RD check for ${result.title}:`, error);
							throw error;
						}
					},
					3,
					(completed: number, total: number) => {
						rdProgress = { completed, total };
						updateProgressMessage();
					}
				),

				// Tracker stats checks (only for non-RD available torrents)
				(async () => {
					if (!shouldIncludeTrackerStats()) {
						return [];
					}

					// Filter out torrents that are already RD available
					const torrentsNeedingStats = torrentsToCheck.filter((t) => !t.rdAvailable);

					if (torrentsNeedingStats.length === 0) {
						return [];
					}

					statsProgress.total = torrentsNeedingStats.length;
					updateProgressMessage();

					return processWithConcurrency(
						torrentsNeedingStats,
						async (result: SearchResult) => {
							try {
								// For bulk checks, use 72-hour cache to reduce load
								const trackerStats = await getCachedTrackerStats(
									result.hash,
									72,
									false
								);
								if (trackerStats) {
									result.trackerStats = {
										seeders: trackerStats.seeders,
										leechers: trackerStats.leechers,
										downloads: trackerStats.downloads,
										hasActivity:
											trackerStats.seeders >= 1 &&
											trackerStats.leechers + trackerStats.downloads >= 1,
									};

									// Count torrents with seeds
									if (trackerStats.seeders > 0) {
										torrentsWithSeeds++;
									}
								}
								return { result, trackerStats };
							} catch (error) {
								console.error(
									`Failed to get tracker stats for ${result.title}:`,
									error
								);
								return { result, trackerStats: null };
							}
						},
						5, // Higher concurrency for tracker stats since they're lighter
						(completed: number, total: number) => {
							statsProgress = { completed, total };
							updateProgressMessage();
						}
					);
				})(),
			]);

			// Filter out tracker stats for torrents that turned out to be RD cached
			const rdCachedHashes = new Set(
				rdCheckResults
					.filter((r) => r.success && r.result?.isCachedInRD)
					.map((r) => r.item.hash)
			);

			// Apply tracker stats only to non-cached torrents
			trackerStatsResults.forEach((statsResult: any) => {
				if (
					statsResult.success &&
					statsResult.result?.trackerStats &&
					!rdCachedHashes.has(statsResult.item.hash)
				) {
					// Stats will already be set on the result object
				} else if (statsResult.success && rdCachedHashes.has(statsResult.item.hash)) {
					// Clear tracker stats for RD cached torrents
					delete statsResult.item.trackerStats;
				}
			});

			const succeeded = rdCheckResults.filter((r) => r.success);
			const failed = rdCheckResults.filter((r) => !r.success);

			if (progressToast && isMounted.current) {
				toast.dismiss(progressToast);
			}

			// Get the final accurate count with a single instant check
			let availableCount = 0;
			if (succeeded.length > 0 && isMounted.current) {
				const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
				const successfulHashes = succeeded.map((r) => r.item.hash);
				availableCount = await instantCheckInRd(
					tokenWithTimestamp,
					tokenHash,
					imdbid as string,
					successfulHashes,
					setSearchResults,
					sortByMedian
				);
			}

			// Update search results with tracker stats for torrents that have them
			if (isMounted.current) {
				setSearchResults((prevResults) => {
					return prevResults.map((r) => {
						const torrentWithStats = torrentsToCheck.find((t) => t.hash === r.hash);
						if (torrentWithStats && torrentWithStats.trackerStats) {
							return {
								...r,
								trackerStats: torrentWithStats.trackerStats,
							};
						}
						return r;
					});
				});
			}

			const totalCount = rdCheckResults.length;
			if (failed.length > 0) {
				toast.error(
					`Failed to test ${failed.length} out of ${totalCount} torrents. Successfully tested ${succeeded.length} (${availableCount} found).`,
					{ duration: 5000 }
				);
			} else {
				toast.success(
					`Successfully tested all ${totalCount} torrents (${availableCount} found)`,
					{
						duration: 3000,
					}
				);
			}

			// Reload the page after a short delay to show the final result
			setTimeout(() => {
				if (isMounted.current) {
					window.location.reload();
				}
			}, 1500);
		} catch (error) {
			if (progressToast && isMounted.current) {
				toast.dismiss(progressToast);
			}
			if (isMounted.current) {
				toast.error('Failed to complete availability test');
			}
			console.error('Availability test error:', error);

			// Reload the page after a short delay even on error
			setTimeout(() => {
				if (isMounted.current) {
					window.location.reload();
				}
			}, 1500);
		} finally {
			setIsCheckingAvailability(false);
		}
	}

	const getFirstAvailableRdTorrent = () => {
		return filteredResults.find((r) => r.rdAvailable && !r.noVideos);
	};

	const getFirstCompleteSeasonTorrent = () => {
		return filteredResults.find(
			(r) => r.rdAvailable && !r.noVideos && r.videoCount === expectedEpisodeCount
		);
	};

	const getIndividualEpisodeTorrents = () => {
		return filteredResults.filter((r) => r.rdAvailable && !r.noVideos && r.videoCount === 1);
	};

	async function handleInstantRdWholeSeason() {
		const completeSeasonTorrent = getFirstCompleteSeasonTorrent();
		if (!completeSeasonTorrent) {
			toast.error('No complete season torrents available');
			return;
		}

		// Check if torrent is already in library
		if (`rd:${completeSeasonTorrent.hash}` in hashAndProgress) {
			toast.success('This season torrent is already in your Real-Debrid library');
			return;
		}

		addRd(completeSeasonTorrent.hash);
	}

	async function handleInstantRdEveryEpisode() {
		const individualEpisodes = getIndividualEpisodeTorrents();
		if (individualEpisodes.length === 0) {
			toast.error('No individual episode torrents available');
			return;
		}

		// Extract episode numbers from torrents
		const episodesWithNumbers = individualEpisodes.map((ep) => {
			// Try to extract episode number from title or filename
			let episodeNum = 0;
			const title = ep.title.toLowerCase();

			// Common patterns: S##E##, ##x##, E##, Episode ##
			const patterns = [
				/s\d+e(\d+)/i, // S01E05
				/\d+x(\d+)/i, // 1x05
				/episode\s*(\d+)/i, // Episode 5
				/ep\s*(\d+)/i, // Ep 5
				/e(\d+)/i, // E05
				/\s(\d{1,2})\s/, // isolated numbers
			];

			for (const pattern of patterns) {
				const match = title.match(pattern);
				if (match && match[1]) {
					episodeNum = parseInt(match[1]);
					break;
				}
			}

			// If still no match, check first file in torrent
			if (episodeNum === 0 && ep.files && ep.files.length > 0) {
				const filename = ep.files[0].filename.toLowerCase();
				for (const pattern of patterns) {
					const match = filename.match(pattern);
					if (match && match[1]) {
						episodeNum = parseInt(match[1]);
						break;
					}
				}
			}

			return { ...ep, episodeNum };
		});

		// Sort by episode number (0 will go to the end)
		episodesWithNumbers.sort((a, b) => {
			if (a.episodeNum === 0) return 1;
			if (b.episodeNum === 0) return -1;
			return a.episodeNum - b.episodeNum;
		});

		// Create a map for quick episode lookup
		const episodeMap = new Map<number, (typeof episodesWithNumbers)[0]>();
		episodesWithNumbers.forEach((ep) => {
			if (ep.episodeNum > 0 && !episodeMap.has(ep.episodeNum)) {
				episodeMap.set(ep.episodeNum, ep);
			}
		});

		// Determine the range of episodes to add
		const maxEpisode = Math.max(expectedEpisodeCount, ...Array.from(episodeMap.keys()));

		const toastId = toast.loading(`Checking episodes 1-${maxEpisode}...`);

		let addedCount = 0;
		let skippedCount = 0;
		let notFoundCount = 0;
		const notFoundEpisodes: number[] = [];

		try {
			// Process episodes sequentially from 1 to max
			for (let epNum = 1; epNum <= maxEpisode; epNum++) {
				const episode = episodeMap.get(epNum);

				if (!episode) {
					notFoundCount++;
					notFoundEpisodes.push(epNum);
					toast.error(`Episode ${epNum}: Not found`, { duration: 2000 });
					continue;
				}

				// Check if already in library
				if (`rd:${episode.hash}` in hashAndProgress) {
					skippedCount++;
					toast(`Episode ${epNum}: Already in library`, { duration: 2000 });
					continue;
				}

				// Update progress toast
				toast.loading(
					`Adding Episode ${epNum} (${addedCount} added, ${skippedCount} skipped, ${notFoundCount} missing)...`,
					{ id: toastId }
				);

				// Add to RD
				await addRd(episode.hash);
				addedCount++;
				toast.success(`Episode ${epNum}: Added successfully`, { duration: 2000 });
			}

			// Final summary
			toast.dismiss(toastId);

			const summaryParts = [];
			if (addedCount > 0) summaryParts.push(`${addedCount} added`);
			if (skippedCount > 0) summaryParts.push(`${skippedCount} already in library`);
			if (notFoundCount > 0) {
				summaryParts.push(`${notFoundCount} not found`);
				if (notFoundEpisodes.length <= 5) {
					summaryParts.push(`(Episodes ${notFoundEpisodes.join(', ')})`);
				}
			}

			const summaryMessage = `Episodes 1-${maxEpisode}: ${summaryParts.join(', ')}`;

			if (notFoundCount === 0) {
				toast.success(summaryMessage, { duration: 5000 });
			} else if (addedCount > 0) {
				toast.success(summaryMessage, { duration: 5000 });
			} else {
				toast.error(summaryMessage, { duration: 5000 });
			}
		} catch (error) {
			toast.error('Failed to add some episodes', { id: toastId });
			console.error('Error adding episodes:', error);
		}
	}

	async function handleMassReport(type: 'porn' | 'wrong_imdb' | 'wrong_season') {
		if (!rdKey) {
			toast.error('Please login to Real-Debrid first');
			return;
		}

		if (filteredResults.length === 0) {
			toast.error('No torrents to report');
			return;
		}

		// Confirm with user
		const typeLabels = {
			porn: 'pornographic content',
			wrong_imdb: 'wrong IMDB ID',
			wrong_season: 'wrong season',
		};
		const confirmMessage = `Report ${filteredResults.length} torrents as ${typeLabels[type]}?`;
		if (!confirm(confirmMessage)) return;

		const toastId = toast.loading(`Reporting ${filteredResults.length} torrents...`);

		try {
			// Use the RD/AD key as userId, same as individual ReportButton
			const userId = rdKey || adKey || '';

			// Prepare reports data
			const reports = filteredResults.map((result) => ({
				hash: result.hash,
				imdbId: imdbid as string,
			}));

			// Send mass report
			const response = await axios.post('/api/report/mass', {
				reports,
				userId,
				type,
			});

			if (response.data.success) {
				toast.success(`Successfully reported ${response.data.reported} torrents`, {
					id: toastId,
				});
				if (response.data.failed > 0) {
					toast.error(`Failed to report ${response.data.failed} torrents`);
				}
			} else {
				toast.error('Failed to report torrents', { id: toastId });
			}

			// Reload the page after a short delay to refresh the results
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			console.error('Mass report error:', error);
			toast.error('Failed to report torrents', { id: toastId });

			// Reload the page after a short delay even on error
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		}
	}

	const backdropStyle = showInfo?.backdrop
		? {
				backgroundImage: `linear-gradient(to bottom, hsl(0, 0%, 12%,0.5) 0%, hsl(0, 0%, 12%,0) 50%, hsl(0, 0%, 12%,0.5) 100%), url(${showInfo.backdrop})`,
				backgroundPosition: 'center',
				backgroundSize: 'screen',
			}
		: {};

	if (isLoading) {
		return <div className="mx-2 my-1 min-h-screen bg-gray-900 text-white">Loading...</div>;
	}

	if (!showInfo) {
		return (
			<div className="mx-2 my-1 min-h-screen bg-gray-900 text-white">
				No show information available
			</div>
		);
	}

	return (
		<div className="min-h-screen max-w-full bg-gray-900 text-gray-100">
			<Head>
				<title>
					Debrid Media Manager - TV Show - {showInfo.title} - Season {seasonNum}
				</title>
			</Head>
			<Toaster position="bottom-right" />

			<div
				className="grid auto-cols-auto grid-flow-col auto-rows-auto gap-2"
				style={backdropStyle}
			>
				{(showInfo.poster && (
					<Image
						width={200}
						height={300}
						src={showInfo.poster}
						alt="Show poster"
						className="row-span-5 shadow-lg"
					/>
				)) || <Poster imdbId={imdbid as string} title={showInfo.title} />}

				<div className="flex justify-end p-2">
					<Link
						href="/"
						className="h-fit w-fit rounded border-2 border-cyan-500 bg-cyan-900/30 px-2 py-1 text-sm text-cyan-100 transition-colors hover:bg-cyan-800/50"
					>
						Go Home
					</Link>
				</div>

				<h2 className="text-xl font-bold [text-shadow:_0_2px_0_rgb(0_0_0_/_80%)]">
					{showInfo.title} - Season {seasonNum}
				</h2>

				<div className="h-fit w-fit bg-slate-900/75" onClick={() => setDescLimit(0)}>
					{descLimit > 0
						? showInfo.description.substring(0, descLimit) + '..'
						: showInfo.description}{' '}
					{showInfo.imdb_score > 0 && (
						<div className="inline text-yellow-100">
							<Link href={`https://www.imdb.com/title/${imdbid}/`} target="_blank">
								IMDB Score:{' '}
								{showInfo.imdb_score < 10
									? showInfo.imdb_score
									: showInfo.imdb_score / 10}
							</Link>
						</div>
					)}
				</div>

				<div className="flex items-center overflow-x-auto">
					{Array.from(
						{ length: showInfo.season_count },
						(_, i) => showInfo.season_count - i
					).map((season, idx) => {
						const color = parseInt(seasonNum as string) === season ? 'red' : 'yellow';
						return (
							<Link
								key={idx}
								href={`/show/${imdbid}/${season}`}
								className={`inline-flex items-center border-2 p-1 text-xs border-${color}-500 bg-${color}-900/30 text-${color}-100 hover:bg-${color}-800/50 mb-1 mr-2 rounded transition-colors`}
							>
								<span role="img" aria-label="tv show" className="mr-2">
									📺
								</span>{' '}
								<span className="whitespace-nowrap">
									{showInfo.season_names && showInfo.season_names[season - 1]
										? showInfo.season_names[season - 1]
										: `Season ${season}`}
								</span>
							</Link>
						);
					})}
				</div>

				<div>
					{rdKey && (
						<>
							<button
								className="mb-1 mr-2 mt-0 rounded border-2 border-yellow-500 bg-yellow-900/30 p-1 text-xs text-yellow-100 transition-colors hover:bg-yellow-800/50 disabled:cursor-not-allowed disabled:opacity-50"
								onClick={handleAvailabilityTest}
								disabled={isCheckingAvailability}
							>
								<b>
									{isCheckingAvailability
										? '🔄 Checking...'
										: '🕵🏻Check Available'}
								</b>
							</button>
							{getFirstCompleteSeasonTorrent() && (
								<button
									className="haptic-sm mb-1 mr-2 mt-0 rounded border-2 border-green-500 bg-green-900/30 p-1 text-xs text-green-100 transition-colors hover:bg-green-800/50"
									onClick={handleInstantRdWholeSeason}
								>
									<b>⚡Instant RD (Whole Season)</b>
								</button>
							)}
							{getIndividualEpisodeTorrents().length > 0 && (
								<button
									className="haptic-sm mb-1 mr-2 mt-0 rounded border-2 border-green-500 bg-green-900/30 p-1 text-xs text-green-100 transition-colors hover:bg-green-800/50"
									onClick={handleInstantRdEveryEpisode}
								>
									<b>⚡Instant RD (Every Episode)</b>
								</button>
							)}
							<button
								className="mb-1 mr-2 mt-0 rounded border-2 border-purple-500 bg-purple-900/30 p-1 text-xs text-purple-100 transition-colors hover:bg-purple-800/50"
								onClick={() =>
									window.open(
										`stremio://detail/series/${imdbid}/${imdbid}:${seasonNum}:1`
									)
								}
							>
								<b>🔮Stremio</b>
							</button>
						</>
					)}
					{onlyShowCached && totalUncachedCount > 0 && (
						<button
							className="haptic-sm mb-1 mr-2 mt-0 rounded border-2 border-blue-500 bg-blue-900/30 p-1 text-xs text-blue-100 transition-colors hover:bg-blue-800/50"
							onClick={() => {
								setOnlyShowCached(false);
							}}
						>
							Show {totalUncachedCount} uncached
						</button>
					)}
					<RelatedMedia imdbId={imdbid as string} mediaType="show" />
				</div>
			</div>

			{searchState === 'loading' && (
				<div className="flex items-center justify-center bg-black">Loading...</div>
			)}
			{searchState === 'requested' && (
				<div className="relative mt-4 rounded border border-yellow-400 bg-yellow-500 px-4 py-3 text-yellow-900">
					<strong className="font-bold">Notice:</strong>
					<span className="block sm:inline">
						{' '}
						The request has been received. This might take at least 5 minutes.
					</span>
				</div>
			)}
			{searchState === 'processing' && (
				<div className="relative mt-4 rounded border border-blue-400 bg-blue-700 px-4 py-3 text-blue-100">
					<strong className="font-bold">Notice:</strong>
					<span className="block sm:inline">
						{' '}
						Looking for torrents in the dark web. Please wait for 1-2 minutes.
					</span>
				</div>
			)}
			{errorMessage && (
				<div className="relative mt-4 rounded border border-red-400 bg-red-900 px-4 py-3">
					<strong className="font-bold">Error:</strong>
					<span className="block sm:inline"> {errorMessage}</span>
				</div>
			)}

			<div className="mb-1 flex items-center border-b-2 border-gray-600 py-2">
				<input
					className="mr-3 w-full appearance-none border-none bg-transparent px-2 py-1 text-sm leading-tight text-gray-100 focus:outline-none"
					type="text"
					id="query"
					placeholder="filter results, supports regex"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value.toLocaleLowerCase());
					}}
				/>
				<span
					className="me-2 cursor-pointer rounded bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
					onClick={() => setQuery('')}
				>
					Reset
				</span>
				{query && filteredResults.length > 0 && rdKey && showMassReportButtons && (
					<div className="ml-2 flex gap-2">
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('porn')}
							title="Report all filtered torrents as pornographic content"
						>
							Report as Porn ({filteredResults.length})
						</span>
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('wrong_imdb')}
							title="Report all filtered torrents as wrong IMDB ID"
						>
							Report Wrong IMDB ({filteredResults.length})
						</span>
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('wrong_season')}
							title="Report all filtered torrents as wrong season"
						>
							Report Wrong Season ({filteredResults.length})
						</span>
					</div>
				)}
			</div>

			<div className="mb-2 flex items-center gap-2 overflow-x-auto p-2">
				<SearchTokens
					title={showInfo.title}
					year={seasonNum as string}
					isShow={true}
					onTokenClick={(token) =>
						setQuery((prev) => (prev ? `${prev} ${token}` : token))
					}
				/>
				{getColorScale(expectedEpisodeCount).map((scale, idx) => (
					<span
						key={idx}
						className={`bg-${scale.color} cursor-pointer whitespace-nowrap rounded px-2 py-1 text-xs text-white`}
						onClick={() => {
							const queryText = getQueryForEpisodeCount(
								scale.threshold,
								expectedEpisodeCount
							);
							setQuery((prev) => {
								const cleanedPrev = prev.replace(/\bvideos:[^\s]+/g, '').trim();
								return cleanedPrev ? `${cleanedPrev} ${queryText}` : queryText;
							});
						}}
					>
						{scale.label}
					</span>
				))}
			</div>

			<TvSearchResults
				filteredResults={filteredResults}
				expectedEpisodeCount={expectedEpisodeCount}
				onlyShowCached={onlyShowCached}
				episodeMaxSize={episodeMaxSize}
				rdKey={rdKey}
				adKey={adKey}
				player={player}
				hashAndProgress={hashAndProgress}
				handleShowInfo={handleShowInfo}
				handleCast={handleCast}
				handleCopyMagnet={(hash) => handleCopyOrDownloadMagnet(hash, shouldDownloadMagnets)}
				handleCheckAvailability={handleCheckAvailability}
				addRd={addRd}
				addAd={addAd}
				deleteRd={deleteRd}
				deleteAd={deleteAd}
				imdbId={imdbid as string}
			/>

			{searchResults.length > 0 && searchState === 'loaded' && hasMoreResults && (
				<button
					className="haptic my-4 w-full rounded border-2 border-gray-500 bg-gray-800/30 px-4 py-2 font-medium text-gray-100 shadow-md transition-colors duration-200 hover:bg-gray-700/50 hover:shadow-lg"
					onClick={() => {
						setCurrentPage((prev) => prev + 1);
						fetchData(imdbid as string, parseInt(seasonNum as string), currentPage + 1);
					}}
				>
					Show More Results
				</button>
			)}
		</div>
	);
};

export default withAuth(TvSearch);
