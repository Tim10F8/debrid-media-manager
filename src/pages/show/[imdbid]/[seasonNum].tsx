import RelatedMedia from '@/components/RelatedMedia';
import SearchTokens from '@/components/SearchTokens';
import TvSearchResults from '@/components/TvSearchResults';
import Poster from '@/components/poster';
import { showInfoForRD } from '@/components/showInfo';
import { useAllDebridApiKey, useRealDebridAccessToken } from '@/hooks/auth';
import { useAvailabilityCheck } from '@/hooks/useAvailabilityCheck';
import { useExternalSources } from '@/hooks/useExternalSources';
import { useMassReport } from '@/hooks/useMassReport';
import { useTorrentManagement } from '@/hooks/useTorrentManagement';
import { SearchApiResponse, SearchResult } from '@/services/mediasearch';
import { TorrentInfoResponse } from '@/services/types';
import UserTorrentDB from '@/torrent/db';
import { handleCastTvShow } from '@/utils/castApiClient';
import { handleCopyOrDownloadMagnet } from '@/utils/copyMagnet';
import {
	getColorScale,
	getExpectedEpisodeCount,
	getQueryForEpisodeCount,
} from '@/utils/episodeUtils';
import { instantCheckInRd } from '@/utils/instantChecks';
import { quickSearch } from '@/utils/quickSearch';
import { sortByMedian } from '@/utils/results';
import { isVideo } from '@/utils/selectable';
import { defaultEpisodeSize, defaultPlayer } from '@/utils/settings';
import { castToastOptions, searchToastOptions } from '@/utils/toastOptions';
import { generateTokenAndHash } from '@/utils/token';
import { getMultipleTrackerStats } from '@/utils/trackerStats';
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
	const [hasMoreResults, setHasMoreResults] = useState(true);
	const [searchCompleteInfo, setSearchCompleteInfo] = useState<{
		finalResults: number;
		totalAvailableCount: number;
		allSourcesCompleted: boolean;
		pendingAvailabilityChecks: number;
		isAvailabilityOnly?: boolean;
	} | null>(null);
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

	const router = useRouter();
	const { imdbid, seasonNum } = router.query;

	// Use shared hooks
	const { hashAndProgress, fetchHashAndProgress, addRd, addAd, deleteRd, deleteAd } =
		useTorrentManagement(
			rdKey,
			adKey,
			null, // no torbox in TV show page
			imdbid as string,
			searchResults,
			setSearchResults
		);

	const { fetchEpisodeFromExternalSource, getEnabledSources } = useExternalSources(rdKey);

	const { isCheckingAvailability, handleCheckAvailability, handleAvailabilityTest } =
		useAvailabilityCheck(
			rdKey,
			imdbid as string,
			searchResults,
			setSearchResults,
			hashAndProgress,
			addRd,
			deleteRd,
			sortByMedian
		);

	const { handleMassReport } = useMassReport(rdKey, adKey, null, imdbid as string);

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
		}
		setErrorMessage('');
		setSearchState('loading');

		// Track completion
		let completedSources = 0;
		let totalSources = 1; // Start with 1 for DMM
		let totalAvailableCount = 0;
		let externalSourcesActive = 0;
		let pendingAvailabilityChecks = 0;
		let allSourcesCompleted = false;

		// Helper to process results from any source
		const processSourceResults = async (sourceResults: SearchResult[], sourceName: string) => {
			if (!isMounted.current) return;

			// Deduplicate and update results
			setSearchResults((prevResults) => {
				const existingHashes = new Set(prevResults.map((r) => r.hash));
				const newUniqueResults = sourceResults.filter(
					(r) => r.hash && !existingHashes.has(r.hash)
				);

				if (newUniqueResults.length === 0) {
					completedSources++;
					// Check if all done
					if (completedSources === totalSources) {
						allSourcesCompleted = true;
						const finalCount = prevResults.length;
						setSearchState('loaded');
						setSearchCompleteInfo({
							finalResults: finalCount,
							totalAvailableCount,
							allSourcesCompleted,
							pendingAvailabilityChecks,
						});
					}
					return prevResults;
				}

				// Merge and sort
				const merged = [...prevResults, ...newUniqueResults];
				const sorted = merged.sort((a, b) => {
					const aAvailable = a.rdAvailable || a.adAvailable;
					const bAvailable = b.rdAvailable || b.adAvailable;
					if (aAvailable !== bAvailable) {
						return aAvailable ? -1 : 1;
					}
					// Second priority: file size (largest first)
					if (a.fileSize !== b.fileSize) {
						return b.fileSize - a.fileSize;
					}
					// Third priority: hash (alphabetically)
					return a.hash.localeCompare(b.hash);
				});

				// Check availability for new non-cached results
				const nonCachedNew = newUniqueResults.filter(
					(r) => !r.rdAvailable && !r.adAvailable
				);

				// Always increment the completed sources counter synchronously
				completedSources++;

				if (nonCachedNew.length > 0 && rdKey) {
					const hashArr = nonCachedNew.map((r) => r.hash);

					// Track pending availability check
					pendingAvailabilityChecks++;

					// Start async availability check but don't wait for it
					(async () => {
						const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
						const count = await instantCheckInRd(
							tokenWithTimestamp,
							tokenHash,
							imdbId,
							hashArr,
							setSearchResults,
							sortByMedian
						);
						// Update the count
						totalAvailableCount += count;

						// Decrement pending checks
						pendingAvailabilityChecks--;

						// If all sources completed and this was the last availability check
						if (
							allSourcesCompleted &&
							pendingAvailabilityChecks === 0 &&
							totalAvailableCount > 0
						) {
							// Trigger the toast notification through state
							setSearchCompleteInfo({
								finalResults: 0,
								totalAvailableCount,
								allSourcesCompleted,
								pendingAvailabilityChecks,
								isAvailabilityOnly: true,
							});
						}
					})();
				}

				// Check if all sources completed
				if (completedSources === totalSources) {
					allSourcesCompleted = true;
					const finalCount = sorted.length;
					setSearchState('loaded');
					setSearchCompleteInfo({
						finalResults: finalCount,
						totalAvailableCount,
						allSourcesCompleted,
						pendingAvailabilityChecks,
					});
				}

				return sorted;
			});
		};

		try {
			// Start DMM fetch
			const dmmPromise = axios.get<SearchApiResponse>(
				`/api/torrents/tv?imdbId=${imdbId}&seasonNum=${seasonNum}&dmmProblemKey=${tokenWithTimestamp}&solution=${tokenHash}&onlyTrusted=${onlyTrustedTorrents}&maxSize=${episodeMaxSize}&page=${page}`
			);

			// Start external sources if first page
			if (page === 0) {
				const episodeCount = expectedEpisodeCount || 10;

				// Count external sources
				const enabledSources = getEnabledSources();
				totalSources += enabledSources.length;
				externalSourcesActive = enabledSources.length;

				// Start external fetches
				if (externalSourcesActive > 0) {
					// Process each source in parallel
					enabledSources.forEach(async (source) => {
						try {
							let episodeNum = 1;
							let consecutiveEmpty = 0;

							// Keep fetching episodes, 2 at a time
							while (episodeNum <= episodeCount + 10) {
								// Allow some buffer beyond expected
								const batch = [episodeNum, episodeNum + 1];
								const batchPromises = batch.map((ep) =>
									fetchEpisodeFromExternalSource(imdbId, seasonNum, ep, source)
								);

								const batchResults = await Promise.all(batchPromises);

								// Process each episode's results immediately
								let allEmpty = true;
								for (let i = 0; i < batchResults.length; i++) {
									const episodeResults = batchResults[i];
									if (episodeResults.length > 0) {
										allEmpty = false;
										// Send results immediately for progressive display
										processSourceResults(episodeResults, source);
									}
								}

								if (allEmpty) {
									consecutiveEmpty++;
									// Stop if we get 2 consecutive empty batches (4 episodes)
									if (consecutiveEmpty >= 2) {
										break;
									}
								} else {
									consecutiveEmpty = 0;
								}

								episodeNum += 2;

								// Add a small delay to avoid hammering the API
								await new Promise((resolve) => setTimeout(resolve, 100));
							}
						} catch (error) {
							console.error(`Error fetching ${source}:`, error);
						} finally {
							// Source completed
							completedSources++;
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchState('loaded');
								setSearchResults((prevResults) => {
									setSearchCompleteInfo({
										finalResults: prevResults.length,
										totalAvailableCount: 0, // No availability count from external sources
										allSourcesCompleted,
										pendingAvailabilityChecks: 0,
									});
									return prevResults;
								});
							}
						}
					});
				}
			}

			// Process DMM results
			const response = await dmmPromise;

			if (response.status !== 200) {
				setSearchState(response.headers.status ?? 'loaded');
				return;
			}

			const dmmResults = response.data.results || [];
			setHasMoreResults(dmmResults.length > 0);

			// Always process DMM results through processSourceResults for consistency
			const formattedResults = dmmResults.map((r) => ({
				...r,
				rdAvailable: false,
				adAvailable: false,
				noVideos: false,
				files: r.files || [],
			}));
			await processSourceResults(formattedResults, 'DMM');
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
			setSearchState('loaded');
		}
	}

	// Derive filtered results and uncached count using useMemo to prevent setState during render
	const filteredResultsMemo = useMemo(() => {
		if (searchResults.length === 0) {
			return [];
		}
		return quickSearch(query, searchResults);
	}, [query, searchResults]);

	const totalUncachedCount = useMemo(() => {
		return filteredResultsMemo.filter((r) => !r.rdAvailable && !r.adAvailable && !r.tbAvailable)
			.length;
	}, [filteredResultsMemo]);

	// Update filteredResults state when memo changes
	useEffect(() => {
		setFilteredResults(filteredResultsMemo);
	}, [filteredResultsMemo]);

	// Handle toast notifications when search completes
	useEffect(() => {
		if (!searchCompleteInfo) return;

		const {
			finalResults,
			totalAvailableCount,
			allSourcesCompleted,
			pendingAvailabilityChecks,
			isAvailabilityOnly,
		} = searchCompleteInfo;

		// Show search results toast (only if this is not an availability-only update)
		if (!isAvailabilityOnly) {
			if (finalResults === 0) {
				toast('No results found', searchToastOptions);
			} else {
				toast(`Found ${finalResults} unique results`, searchToastOptions);
			}
		}

		// Show availability toast
		if (
			allSourcesCompleted &&
			pendingAvailabilityChecks === 0 &&
			rdKey &&
			totalAvailableCount > 0
		) {
			toast(`Found ${totalAvailableCount} available torrents in RD`, searchToastOptions);
		}

		// Clear the info after handling
		setSearchCompleteInfo(null);
	}, [searchCompleteInfo, rdKey]);

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchState]); // Depend on searchState only

	// Reset the tracker stats flag when season changes
	useEffect(() => {
		hasLoadedTrackerStats.current = false;
	}, [imdbid, seasonNum]);

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

	// Helper function to find the first complete season torrent
	const getFirstCompleteSeasonTorrent = () => {
		// Find torrents that have all or most episodes for the season
		// A complete season typically has videoCount close to expectedEpisodeCount
		return filteredResults.find((result) => {
			// Must be available in RD
			if (!result.rdAvailable) return false;

			// Check if it has enough videos for a complete season
			// Allow some flexibility (e.g., season might have 22 episodes but torrent has 20-24)
			const minEpisodes = Math.max(1, expectedEpisodeCount - 2);
			const maxEpisodes = expectedEpisodeCount + 2;

			return result.videoCount >= minEpisodes && result.videoCount <= maxEpisodes;
		});
	};

	// Helper function to find individual episode torrents
	const getIndividualEpisodeTorrents = () => {
		// Find torrents that are individual episodes (videoCount === 1)
		return filteredResults.filter((result) => {
			// Must be available in RD
			if (!result.rdAvailable) return false;

			// Individual episodes typically have exactly 1 video file
			return result.videoCount === 1;
		});
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
								onClick={() => handleAvailabilityTest(filteredResults)}
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
				<span className="text-xs text-gray-400">
					{
						filteredResults.filter(
							(r) => r.rdAvailable || r.adAvailable || r.tbAvailable
						).length
					}
					/{filteredResults.length}
				</span>
				{query && filteredResults.length > 0 && rdKey && showMassReportButtons && (
					<div className="ml-2 flex gap-2">
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('porn', filteredResults)}
							title="Report all filtered torrents as pornographic content"
						>
							Report as Porn ({filteredResults.length})
						</span>
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('wrong_imdb', filteredResults)}
							title="Report all filtered torrents as wrong IMDB ID"
						>
							Report Wrong IMDB ({filteredResults.length})
						</span>
						<span
							className="cursor-pointer whitespace-nowrap rounded border border-red-500 bg-red-900/30 px-2 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-800/50"
							onClick={() => handleMassReport('wrong_season', filteredResults)}
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
