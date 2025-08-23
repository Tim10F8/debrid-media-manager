import MovieSearchResults from '@/components/MovieSearchResults';
import RelatedMedia from '@/components/RelatedMedia';
import SearchTokens from '@/components/SearchTokens';
import Poster from '@/components/poster';
import { showInfoForRD } from '@/components/showInfo';
import { useAllDebridApiKey, useRealDebridAccessToken, useTorBoxAccessToken } from '@/hooks/auth';
import { FileData, SearchApiResponse, SearchResult } from '@/services/mediasearch';
import { TorrentInfoResponse } from '@/services/types';
import UserTorrentDB from '@/torrent/db';
import { UserTorrent } from '@/torrent/userTorrent';
import {
	handleAddAsMagnetInAd,
	handleAddAsMagnetInRd,
	handleAddAsMagnetInTb,
} from '@/utils/addMagnet';
import { removeAvailability, submitAvailability } from '@/utils/availability';
import { handleCastMovie } from '@/utils/castApiClient';
import { handleCopyOrDownloadMagnet } from '@/utils/copyMagnet';
import {
	handleDeleteAdTorrent,
	handleDeleteRdTorrent,
	handleDeleteTbTorrent,
} from '@/utils/deleteTorrent';
import { convertToUserTorrent, fetchAllDebrid } from '@/utils/fetchTorrents';
import { instantCheckInRd } from '@/utils/instantChecks';
import { processWithConcurrency } from '@/utils/parallelProcessor';
import { quickSearch } from '@/utils/quickSearch';
import { sortByBiggest } from '@/utils/results';
import { isVideo } from '@/utils/selectable';
import { defaultMovieSize, defaultPlayer } from '@/utils/settings';
import { castToastOptions, searchToastOptions } from '@/utils/toastOptions';
import { generateTokenAndHash } from '@/utils/token';
import {
	getCachedTrackerStats,
	getMultipleTrackerStats,
	shouldIncludeTrackerStats,
} from '@/utils/trackerStats';
import { withAuth } from '@/utils/withAuth';
import axios from 'axios';
import getConfig from 'next/config';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FunctionComponent, useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

type MovieInfo = {
	title: string;
	description: string;
	poster: string;
	backdrop: string;
	year: string;
	imdb_score: number;
};

const torrentDB = new UserTorrentDB();

// Update the getColorScale function with proper Tailwind color classes
const getColorScale = () => {
	const scale = [
		{ threshold: 1, color: 'gray-800', label: 'Single' },
		{ threshold: Infinity, color: 'blue-900', label: 'With extras' },
	];
	return scale;
};

// Add this helper function near the other utility functions at the top
const getQueryForMovieCount = (videoCount: number) => {
	if (videoCount === 1) return 'videos:1'; // Single episode
	return `videos:>1`; // With extras
};

const MovieSearch: FunctionComponent = () => {
	const router = useRouter();
	const { imdbid } = router.query;
	const isMounted = useRef(true);
	const hasLoadedTrackerStats = useRef(false);
	const [movieInfo, setMovieInfo] = useState<MovieInfo>({
		title: '',
		description: '',
		poster: '',
		backdrop: '',
		year: '',
		imdb_score: 0,
	});

	const player = window.localStorage.getItem('settings:player') || defaultPlayer;
	const movieMaxSize = window.localStorage.getItem('settings:movieMaxSize') || defaultMovieSize;
	const onlyTrustedTorrents =
		window.localStorage.getItem('settings:onlyTrustedTorrents') === 'true';
	const defaultTorrentsFilter =
		window.localStorage.getItem('settings:defaultTorrentsFilter') ?? '';
	const { publicRuntimeConfig: config } = getConfig();
	const [searchState, setSearchState] = useState<string>('loading');
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [filteredResults, setFilteredResults] = useState<SearchResult[]>([]);
	const [errorMessage, setErrorMessage] = useState('');
	const [query, setQuery] = useState(defaultTorrentsFilter);
	const [descLimit, setDescLimit] = useState(100);
	const [rdKey] = useRealDebridAccessToken();
	const adKey = useAllDebridApiKey();
	const torboxKey = useTorBoxAccessToken();
	const [onlyShowCached, setOnlyShowCached] = useState<boolean>(false);
	const [totalUncachedCount, setTotalUncachedCount] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(0);
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

	useEffect(() => {
		if (!imdbid) return;

		const fetchMovieInfo = async () => {
			try {
				const response = await axios.get(`/api/info/movie?imdbid=${imdbid}`);
				setMovieInfo(response.data);
			} catch (error) {
				console.error('Failed to fetch movie info:', error);
			}
		};

		fetchMovieInfo();
	}, [imdbid]);

	useEffect(() => {
		if (!imdbid) return;

		const initializeData = async () => {
			await torrentDB.initializeDB();
			await Promise.all([fetchData(imdbid as string), fetchHashAndProgress()]);
		};

		initializeData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [imdbid]);

	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	// Load cached tracker stats from database for uncached torrents
	useEffect(() => {
		async function loadCachedTrackerStats() {
			// Get uncached torrents that don't have tracker stats yet
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

				// Update search results with cached tracker stats
				if (isMounted.current && trackerStatsArray.length > 0) {
					setSearchResults((prevResults) => {
						return prevResults.map((r) => {
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

	// Reset the tracker stats flag when search results change significantly (new search)
	useEffect(() => {
		hasLoadedTrackerStats.current = false;
	}, [imdbid]);

	async function fetchData(imdbId: string, page: number = 0) {
		const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
		if (page === 0) {
			setSearchResults([]);
			setTotalUncachedCount(0);
		}
		setErrorMessage('');
		setSearchState('loading');

		// Track completion of all sources
		let completedSources = 0;
		let totalSources = 1; // Start with 1 for DMM
		const allSourcesResults: SearchResult[][] = [];
		let totalAvailableCount = 0;
		let pendingAvailabilityChecks = 0;
		let allSourcesCompleted = false;

		// Helper function to process results from any source
		const processSourceResults = async (sourceResults: SearchResult[], sourceName: string) => {
			if (!isMounted.current) return;

			// Deduplicate with existing results
			setSearchResults((prevResults) => {
				const existingHashes = new Set(prevResults.map((r) => r.hash));
				const newUniqueResults = sourceResults.filter(
					(r) => r.hash && !existingHashes.has(r.hash)
				);

				if (newUniqueResults.length === 0) {
					completedSources++;
					// Check if all sources completed
					if (completedSources === totalSources) {
						allSourcesCompleted = true;
						const finalResults = prevResults.length;
						if (finalResults === 0) {
							toast('No results found', searchToastOptions);
						} else {
							toast(`Found ${finalResults} unique results`, searchToastOptions);
						}
						setSearchState('loaded');

						// If no pending availability checks, show the RD count now
						if (pendingAvailabilityChecks === 0 && rdKey && totalAvailableCount > 0) {
							toast(
								`Found ${totalAvailableCount} available torrents in RD`,
								searchToastOptions
							);
						}
					}
					return prevResults;
				}

				// Add to tracking
				allSourcesResults.push(newUniqueResults);

				// Merge and sort
				const merged = [...prevResults, ...newUniqueResults];
				const sorted = merged.sort((a, b) => {
					const aAvailable = a.rdAvailable || a.adAvailable;
					const bAvailable = b.rdAvailable || b.adAvailable;
					if (aAvailable !== bAvailable) {
						return aAvailable ? -1 : 1;
					}
					return b.fileSize - a.fileSize;
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
							sortByBiggest
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
							toast(
								`Found ${totalAvailableCount} available torrents in RD`,
								searchToastOptions
							);
						}
					})();
				}

				// Check if all sources completed
				if (completedSources === totalSources) {
					allSourcesCompleted = true;
					// Show completion toast
					const finalResults = sorted.length;
					if (finalResults === 0) {
						toast('No results found', searchToastOptions);
					} else {
						toast(`Found ${finalResults} unique results`, searchToastOptions);
					}
					setSearchState('loaded');

					// If no pending availability checks, show the RD count now
					if (pendingAvailabilityChecks === 0 && rdKey && totalAvailableCount > 0) {
						toast(
							`Found ${totalAvailableCount} available torrents in RD`,
							searchToastOptions
						);
					}
				}

				return sorted;
			});
		};

		try {
			// Start DMM fetch
			const dmmPromise = (async () => {
				let path = `api/torrents/movie?imdbId=${imdbId}&dmmProblemKey=${tokenWithTimestamp}&solution=${tokenHash}&onlyTrusted=${onlyTrustedTorrents}&maxSize=${movieMaxSize}&page=${page}`;
				if (config.externalSearchApiHostname) {
					path = encodeURIComponent(path);
				}
				let endpoint = `${config.externalSearchApiHostname || ''}/${path}`;
				const response = await axios.get<SearchApiResponse>(endpoint);

				if (response.status !== 200) {
					setSearchState(response.headers.status ?? 'loaded');
					return [];
				}

				return response.data.results || [];
			})();

			// Check enabled sources and start external fetches
			if (page === 0) {
				const enableTorrentio =
					window.localStorage.getItem('settings:enableTorrentio') !== 'false';
				const enableComet = window.localStorage.getItem('settings:enableComet') !== 'false';
				const enableMediaFusion =
					window.localStorage.getItem('settings:enableMediaFusion') !== 'false';
				const enablePeerflix =
					window.localStorage.getItem('settings:enablePeerflix') !== 'false';
				const enableTorrentsDB =
					window.localStorage.getItem('settings:enableTorrentsDB') !== 'false';

				// Count total sources
				if (enableTorrentio) totalSources++;
				if (enableComet) totalSources++;
				if (enableMediaFusion) totalSources++;
				if (enablePeerflix) totalSources++;
				if (enableTorrentsDB) totalSources++;

				// Start all external fetches simultaneously
				if (enableTorrentio) {
					fetchTorrentioData(imdbId)
						.then((results) => processSourceResults(results, 'Torrentio'))
						.catch((err) => {
							console.error('Torrentio error:', err);
							completedSources++;
							// Check if all sources completed after error
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchResults((prevResults) => {
									const finalResults = prevResults.length;
									if (finalResults === 0) {
										toast('No results found', searchToastOptions);
									} else {
										toast(
											`Found ${finalResults} unique results`,
											searchToastOptions
										);
									}
									setSearchState('loaded');
									// If no pending availability checks, show the RD count now
									if (
										pendingAvailabilityChecks === 0 &&
										rdKey &&
										totalAvailableCount > 0
									) {
										toast(
											`Found ${totalAvailableCount} available torrents in RD`,
											searchToastOptions
										);
									}
									return prevResults;
								});
							}
						});
				}

				if (enableComet) {
					fetchCometData(imdbId)
						.then((results) => processSourceResults(results, 'Comet'))
						.catch((err) => {
							console.error('Comet error:', err);
							completedSources++;
							// Check if all sources completed after error
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchResults((prevResults) => {
									const finalResults = prevResults.length;
									if (finalResults === 0) {
										toast('No results found', searchToastOptions);
									} else {
										toast(
											`Found ${finalResults} unique results`,
											searchToastOptions
										);
									}
									setSearchState('loaded');
									// If no pending availability checks, show the RD count now
									if (
										pendingAvailabilityChecks === 0 &&
										rdKey &&
										totalAvailableCount > 0
									) {
										toast(
											`Found ${totalAvailableCount} available torrents in RD`,
											searchToastOptions
										);
									}
									return prevResults;
								});
							}
						});
				}

				if (enableMediaFusion) {
					fetchMediaFusionData(imdbId)
						.then((results) => processSourceResults(results, 'MediaFusion'))
						.catch((err) => {
							console.error('MediaFusion error:', err);
							completedSources++;
							// Check if all sources completed after error
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchResults((prevResults) => {
									const finalResults = prevResults.length;
									if (finalResults === 0) {
										toast('No results found', searchToastOptions);
									} else {
										toast(
											`Found ${finalResults} unique results`,
											searchToastOptions
										);
									}
									setSearchState('loaded');
									// If no pending availability checks, show the RD count now
									if (
										pendingAvailabilityChecks === 0 &&
										rdKey &&
										totalAvailableCount > 0
									) {
										toast(
											`Found ${totalAvailableCount} available torrents in RD`,
											searchToastOptions
										);
									}
									return prevResults;
								});
							}
						});
				}

				if (enablePeerflix) {
					fetchPeerflixData(imdbId)
						.then((results) => processSourceResults(results, 'Peerflix'))
						.catch((err) => {
							console.error('Peerflix error:', err);
							completedSources++;
							// Check if all sources completed after error
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchResults((prevResults) => {
									const finalResults = prevResults.length;
									if (finalResults === 0) {
										toast('No results found', searchToastOptions);
									} else {
										toast(
											`Found ${finalResults} unique results`,
											searchToastOptions
										);
									}
									setSearchState('loaded');
									// If no pending availability checks, show the RD count now
									if (
										pendingAvailabilityChecks === 0 &&
										rdKey &&
										totalAvailableCount > 0
									) {
										toast(
											`Found ${totalAvailableCount} available torrents in RD`,
											searchToastOptions
										);
									}
									return prevResults;
								});
							}
						});
				}

				if (enableTorrentsDB) {
					fetchTorrentsDBData(imdbId)
						.then((results) => processSourceResults(results, 'TorrentsDB'))
						.catch((err) => {
							console.error('TorrentsDB error:', err);
							completedSources++;
							// Check if all sources completed after error
							if (completedSources === totalSources) {
								allSourcesCompleted = true;
								setSearchResults((prevResults) => {
									const finalResults = prevResults.length;
									if (finalResults === 0) {
										toast('No results found', searchToastOptions);
									} else {
										toast(
											`Found ${finalResults} unique results`,
											searchToastOptions
										);
									}
									setSearchState('loaded');
									// If no pending availability checks, show the RD count now
									if (
										pendingAvailabilityChecks === 0 &&
										rdKey &&
										totalAvailableCount > 0
									) {
										toast(
											`Found ${totalAvailableCount} available torrents in RD`,
											searchToastOptions
										);
									}
									return prevResults;
								});
							}
						});
				}
			}

			// Process DMM results
			const dmmResults = await dmmPromise;
			setHasMoreResults(dmmResults.length > 0);

			// Always process DMM results through processSourceResults for consistency
			const formattedDmmResults = dmmResults.map((r) => ({
				...r,
				rdAvailable: false,
				adAvailable: false,
				noVideos: false,
				files: r.files || [],
			}));
			await processSourceResults(formattedDmmResults, 'DMM');
		} catch (error) {
			console.error(
				'Error fetching torrents:',
				error instanceof Error ? error.message : 'Unknown error'
			);
			if ((error as any).response?.status === 403) {
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

	useEffect(() => {
		if (searchResults.length === 0) return;
		const filteredResults = quickSearch(query, searchResults);
		setFilteredResults(filteredResults);
	}, [query, searchResults]);

	async function fetchTorrentioData(imdbId: string): Promise<SearchResult[]> {
		if (!rdKey) return [];

		try {
			const torrentioUrl = `https://torrentio.strem.fun/realdebrid=real-debrid-key/stream/movie/${imdbId}.json`;
			const response = await axios.get(torrentioUrl);

			if (response.data?.streams && response.data.streams.length > 0) {
				// Transform Torrentio streams to SearchResult format
				const transformedResults: SearchResult[] = response.data.streams
					.map((stream: any) => {
						// Parse clean title - remove the metadata line (👤 💾 ⚙️)
						let cleanTitle = stream.title || stream.name || '';
						const titleParts = cleanTitle.split('\n');
						if (titleParts.length > 1) {
							// First line is the actual title
							cleanTitle = titleParts[0].trim();
						}

						// Extract file info from the metadata
						const filename = stream.behaviorHints?.filename || cleanTitle;
						const sizeMatch = stream.title?.match(/💾\s*([\d.]+)\s*(GB|MB|TB)/i);
						let fileSize = 0;
						if (sizeMatch) {
							const size = parseFloat(sizeMatch[1]);
							if (sizeMatch[2].toUpperCase() === 'TB') {
								fileSize = size * 1024 * 1024; // TB to MB
							} else if (sizeMatch[2].toUpperCase() === 'GB') {
								fileSize = size * 1024; // GB to MB
							} else {
								fileSize = size; // Already in MB
							}
						}

						// Extract hash from URL if available
						const hashMatch = stream.url?.match(/\/([a-f0-9]{40})\//);
						const hash = hashMatch ? hashMatch[1] : '';

						// Create a file entry for the main file
						const files: FileData[] = [];
						if (filename) {
							files.push({
								fileId: 0,
								filename: filename,
								filesize: fileSize * 1024 * 1024, // Convert MB to bytes
							});
						}

						return {
							title: cleanTitle,
							fileSize: fileSize,
							hash: hash,
							rdAvailable: false,
							adAvailable: false,
							tbAvailable: false,
							files: files,
							noVideos: false,
							medianFileSize: fileSize,
							biggestFileSize: fileSize,
							videoCount: 1,
							imdbId: imdbId,
						};
					})
					.filter((r: SearchResult) => r.hash); // Only include results with valid hash

				return transformedResults;
			}
			return [];
		} catch (error) {
			console.error('Error fetching Torrentio data:', error);
			// Silently fail - Torrentio is supplementary
			return [];
		}
	}

	async function getMediaFusionHash(): Promise<string> {
		// Check if we have a cached hash in localStorage
		const cacheKey = 'mediafusion_hash';
		const cachedData = localStorage.getItem(cacheKey);

		if (cachedData) {
			// Handle old format (JSON object) and new format (plain string)
			try {
				const parsed = JSON.parse(cachedData);
				if (parsed.hash) {
					// Old format - extract hash and update storage
					localStorage.setItem(cacheKey, parsed.hash);
					return parsed.hash;
				}
			} catch (e) {
				// Not JSON, assume it's already a plain string
				return cachedData;
			}
		}

		// Generate new hash
		try {
			const config = {
				streaming_provider: null,
				selected_catalogs: [],
				selected_resolutions: [
					'4k',
					'2160p',
					'1440p',
					'1080p',
					'720p',
					'576p',
					'480p',
					'360p',
					'240p',
					null,
				],
				enable_catalogs: true,
				enable_imdb_metadata: false,
				max_size: 'inf',
				max_streams_per_resolution: '10',
				torrent_sorting_priority: [
					{ key: 'language', direction: 'desc' },
					{ key: 'cached', direction: 'desc' },
					{ key: 'resolution', direction: 'desc' },
					{ key: 'quality', direction: 'desc' },
					{ key: 'size', direction: 'desc' },
					{ key: 'seeders', direction: 'desc' },
					{ key: 'created_at', direction: 'desc' },
				],
				show_full_torrent_name: true,
				show_language_country_flag: false,
				nudity_filter: ['Disable'],
				certification_filter: ['Disable'],
				language_sorting: [
					'English',
					'Tamil',
					'Hindi',
					'Malayalam',
					'Kannada',
					'Telugu',
					'Chinese',
					'Russian',
					'Arabic',
					'Japanese',
					'Korean',
					'Taiwanese',
					'Latino',
					'French',
					'Spanish',
					'Portuguese',
					'Italian',
					'German',
					'Ukrainian',
					'Polish',
					'Czech',
					'Thai',
					'Indonesian',
					'Vietnamese',
					'Dutch',
					'Bengali',
					'Turkish',
					'Greek',
					'Swedish',
					'Romanian',
					'Hungarian',
					'Finnish',
					'Norwegian',
					'Danish',
					'Hebrew',
					'Lithuanian',
					'Punjabi',
					'Marathi',
					'Gujarati',
					'Bhojpuri',
					'Nepali',
					'Urdu',
					'Tagalog',
					'Filipino',
					'Malay',
					'Mongolian',
					'Armenian',
					'Georgian',
					null,
				],
				quality_filter: ['BluRay/UHD', 'WEB/HD', 'DVD/TV/SAT', 'CAM/Screener', 'Unknown'],
				api_password: null,
				mediaflow_config: null,
				rpdb_config: null,
				live_search_streams: false,
				contribution_streams: false,
				mdblist_config: null,
			};

			const response = await axios.post(
				'https://mediafusion.elfhosted.com/encrypt-user-data',
				config,
				{
					headers: { 'content-type': 'application/json' },
				}
			);

			if (response.data?.encrypted_str) {
				// Cache the hash permanently
				localStorage.setItem(cacheKey, response.data.encrypted_str);
				return response.data.encrypted_str;
			}
		} catch (error) {
			console.error('Error generating MediaFusion hash:', error);
		}

		return ''; // Return empty string if generation fails
	}

	async function fetchMediaFusionData(imdbId: string): Promise<SearchResult[]> {
		if (!rdKey) return [];

		try {
			const specialHash = await getMediaFusionHash();
			if (!specialHash) return [];

			const mediaFusionUrl = `https://mediafusion.elfhosted.com/${specialHash}/stream/movie/${imdbId}.json`;
			const response = await axios.get(mediaFusionUrl);

			if (response.data?.streams && response.data.streams.length > 0) {
				// Transform MediaFusion streams to SearchResult format
				const transformedResults: SearchResult[] = response.data.streams
					.map((stream: any) => {
						// Extract title from description (first line after 📂)
						let cleanTitle = '';
						if (stream.description) {
							const lines = stream.description.split('\n');
							if (lines.length > 0) {
								// First line typically has the title after 📂
								cleanTitle = lines[0].replace(/^📂\s*/, '').trim();
							}
						}
						// Fallback to filename or name
						if (!cleanTitle) {
							cleanTitle = stream.behaviorHints?.filename || stream.name || '';
						}

						// Extract file size from description or behaviorHints
						let fileSize = 0;
						if (stream.behaviorHints?.videoSize) {
							// Convert bytes to MB
							fileSize = stream.behaviorHints.videoSize / (1024 * 1024);
						} else if (stream.description) {
							// Try to extract from description (💾 25.35 GB format)
							const sizeMatch = stream.description.match(
								/💾\s*([\d.]+)\s*(GB|MB|TB)/i
							);
							if (sizeMatch) {
								const size = parseFloat(sizeMatch[1]);
								if (sizeMatch[2].toUpperCase() === 'TB') {
									fileSize = size * 1024 * 1024; // TB to MB
								} else if (sizeMatch[2].toUpperCase() === 'GB') {
									fileSize = size * 1024; // GB to MB
								} else {
									fileSize = size; // Already in MB
								}
							}
						}

						// Use infoHash directly from the stream
						const hash = stream.infoHash || '';

						// Create a file entry for the main file
						const files: FileData[] = [];
						const filename = stream.behaviorHints?.filename || cleanTitle;
						if (filename) {
							files.push({
								fileId: stream.fileIdx || 0,
								filename: filename,
								filesize: stream.behaviorHints?.videoSize || fileSize * 1024 * 1024,
							});
						}

						return {
							title: cleanTitle,
							fileSize: fileSize,
							hash: hash,
							rdAvailable: false,
							adAvailable: false,
							tbAvailable: false,
							files: files,
							noVideos: false,
							medianFileSize: fileSize,
							biggestFileSize: fileSize,
							videoCount: 1,
							imdbId: imdbId,
						};
					})
					.filter((r: SearchResult) => r.hash); // Only include results with valid hash

				return transformedResults;
			}
			return [];
		} catch (error) {
			console.error('Error fetching MediaFusion data:', error);
			// Silently fail - MediaFusion is supplementary
			return [];
		}
	}

	async function fetchTorrentsDBData(imdbId: string): Promise<SearchResult[]> {
		if (!rdKey) return [];

		try {
			const torrentsDBUrl = `https://torrentsdb.com/${rdKey}/stream/movie/${imdbId}.json`;
			const response = await axios.get(torrentsDBUrl);

			if (response.data?.streams && response.data.streams.length > 0) {
				// Transform TorrentsDB streams to SearchResult format
				const transformedResults: SearchResult[] = response.data.streams
					.map((stream: any) => {
						// Parse title - TorrentsDB has title in multiline format
						let cleanTitle = '';
						if (stream.title) {
							const lines = stream.title.split('\n');
							if (lines.length > 0) {
								// First line is the actual title
								cleanTitle = lines[0].trim();
							}
						}
						// Fallback to name
						if (!cleanTitle && stream.name) {
							const nameParts = stream.name.split('\n');
							cleanTitle = nameParts[nameParts.length - 1].trim(); // Last part of name
						}

						// Extract file size from title
						let fileSize = 0;
						const sizeMatch = stream.title?.match(/💾\s*([\d.]+)\s*(GB|MB|TB)/i);
						if (sizeMatch) {
							const size = parseFloat(sizeMatch[1]);
							if (sizeMatch[2].toUpperCase() === 'TB') {
								fileSize = size * 1024 * 1024; // TB to MB
							} else if (sizeMatch[2].toUpperCase() === 'GB') {
								fileSize = size * 1024; // GB to MB
							} else {
								fileSize = size; // Already in MB
							}
						}

						// Use infoHash directly from the stream
						const hash = stream.infoHash || '';

						// Extract filename from behaviorHints or use title
						const filename = stream.behaviorHints?.filename || cleanTitle;

						// Create a file entry for the main file
						const files: FileData[] = [];
						if (filename) {
							files.push({
								fileId: stream.fileIdx || 0,
								filename: filename,
								filesize: fileSize * 1024 * 1024, // Convert MB to bytes
							});
						}

						return {
							title: cleanTitle,
							fileSize: fileSize,
							hash: hash,
							rdAvailable: false,
							adAvailable: false,
							tbAvailable: false,
							files: files,
							noVideos: false,
							medianFileSize: fileSize,
							biggestFileSize: fileSize,
							videoCount: 1,
							imdbId: imdbId,
						};
					})
					.filter((r: SearchResult) => r.hash); // Only include results with valid hash

				return transformedResults;
			}
			return [];
		} catch (error) {
			console.error('Error fetching TorrentsDB data:', error);
			// Silently fail - TorrentsDB is supplementary
			return [];
		}
	}

	async function fetchPeerflixData(imdbId: string): Promise<SearchResult[]> {
		if (!rdKey) return [];

		try {
			const peerflixUrl = `https://addon.peerflix.mov/realdebrid=real-debrid-key/stream/movie/${imdbId}.json`;
			const response = await axios.get(peerflixUrl);

			if (response.data?.streams && response.data.streams.length > 0) {
				// Transform Peerflix streams to SearchResult format
				const transformedResults: SearchResult[] = response.data.streams
					.map((stream: any) => {
						// Parse title from the multiline format
						let cleanTitle = '';
						if (stream.title) {
							const lines = stream.title.split('\n');
							if (lines.length > 0) {
								// First line is the actual title
								cleanTitle = lines[0].trim();
							}
						}
						// Fallback to name
						if (!cleanTitle) {
							cleanTitle = stream.name || '';
						}

						// Extract file size from title
						let fileSize = 0;
						const sizeMatch = stream.title?.match(/💾\s*([\d.]+)\s*(GB|MB|TB)/i);
						if (sizeMatch) {
							const size = parseFloat(sizeMatch[1]);
							if (sizeMatch[2].toUpperCase() === 'TB') {
								fileSize = size * 1024 * 1024; // TB to MB
							} else if (sizeMatch[2].toUpperCase() === 'GB') {
								fileSize = size * 1024; // GB to MB
							} else {
								fileSize = size; // Already in MB
							}
						}

						// Extract hash from URL
						const hashMatch = stream.url?.match(/\/([a-f0-9]{40})\//);
						const hash = hashMatch ? hashMatch[1] : '';

						// Extract filename from URL or title
						let filename = '';
						if (stream.url) {
							const filenameMatch = stream.url.match(/\/([^\/]+)$/);
							if (filenameMatch) {
								filename = decodeURIComponent(filenameMatch[1]);
							}
						}
						if (!filename && stream.title) {
							const lines = stream.title.split('\n');
							if (lines.length > 1) {
								filename = lines[1].trim();
							}
						}
						if (!filename) {
							filename = cleanTitle;
						}

						// Create a file entry for the main file
						const files: FileData[] = [];
						if (filename) {
							files.push({
								fileId: 0,
								filename: filename,
								filesize: fileSize * 1024 * 1024, // Convert MB to bytes
							});
						}

						return {
							title: cleanTitle,
							fileSize: fileSize,
							hash: hash,
							rdAvailable: false,
							adAvailable: false,
							tbAvailable: false,
							files: files,
							noVideos: false,
							medianFileSize: fileSize,
							biggestFileSize: fileSize,
							videoCount: 1,
							imdbId: imdbId,
						};
					})
					.filter((r: SearchResult) => r.hash); // Only include results with valid hash

				return transformedResults;
			}
			return [];
		} catch (error) {
			console.error('Error fetching Peerflix data:', error);
			// Silently fail - Peerflix is supplementary
			return [];
		}
	}

	async function fetchCometData(imdbId: string): Promise<SearchResult[]> {
		if (!rdKey) return [];

		try {
			const cometUrl = `https://comet.elfhosted.com/realdebrid=real-debrid-key/stream/movie/${imdbId}.json`;
			const response = await axios.get(cometUrl);

			if (response.data?.streams && response.data.streams.length > 0) {
				// Transform Comet streams to SearchResult format
				const transformedResults: SearchResult[] = response.data.streams
					.map((stream: any) => {
						// Extract title from description (first line after removing [TORRENT🧲] prefix)
						let cleanTitle = '';
						if (stream.description) {
							const lines = stream.description.split('\n');
							if (lines.length > 0) {
								// First line typically has the title after 📄
								cleanTitle = lines[0]
									.replace(/^\[TORRENT🧲\]\s*/, '')
									.replace(/^📄\s*/, '')
									.trim();
							}
						}
						// Fallback to filename or name
						if (!cleanTitle) {
							cleanTitle = stream.behaviorHints?.filename || stream.name || '';
						}

						// Extract file size from description or behaviorHints
						let fileSize = 0;
						if (stream.behaviorHints?.videoSize) {
							// Convert bytes to MB
							fileSize = stream.behaviorHints.videoSize / (1024 * 1024);
						} else if (stream.description) {
							// Try to extract from description (💾 24.91 GB format)
							const sizeMatch = stream.description.match(
								/💾\s*([\d.]+)\s*(GB|MB|TB)/i
							);
							if (sizeMatch) {
								const size = parseFloat(sizeMatch[1]);
								if (sizeMatch[2].toUpperCase() === 'TB') {
									fileSize = size * 1024 * 1024; // TB to MB
								} else if (sizeMatch[2].toUpperCase() === 'GB') {
									fileSize = size * 1024; // GB to MB
								} else {
									fileSize = size; // Already in MB
								}
							}
						}

						// Use infoHash directly from the stream
						const hash = stream.infoHash || '';

						// Create a file entry for the main file
						const files: FileData[] = [];
						const filename = stream.behaviorHints?.filename || cleanTitle;
						if (filename) {
							files.push({
								fileId: stream.fileIdx || 0,
								filename: filename,
								filesize: stream.behaviorHints?.videoSize || fileSize * 1024 * 1024,
							});
						}

						return {
							title: cleanTitle,
							fileSize: fileSize,
							hash: hash,
							rdAvailable: false,
							adAvailable: false,
							tbAvailable: false,
							files: files,
							noVideos: false,
							medianFileSize: fileSize,
							biggestFileSize: fileSize,
							videoCount: 1,
							imdbId: imdbId,
						};
					})
					.filter((r: SearchResult) => r.hash); // Only include results with valid hash

				return transformedResults;
			}
			return [];
		} catch (error) {
			console.error('Error fetching Comet data:', error);
			// Silently fail - Comet is supplementary
			return [];
		}
	}

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

	async function addTb(hash: string) {
		await handleAddAsMagnetInTb(torboxKey!, hash, async (userTorrent: UserTorrent) => {
			await torrentDB.add(userTorrent);
			await fetchHashAndProgress();
		});
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

	async function deleteTb(hash: string) {
		const torrents = await torrentDB.getAllByHash(hash);
		for (const t of torrents) {
			if (!t.id.startsWith('tb:')) continue;
			await handleDeleteTbTorrent(torboxKey!, t.id);
			await torrentDB.deleteByHash('tb', hash);
			setHashAndProgress((prev) => {
				const newHashAndProgress = { ...prev };
				delete newHashAndProgress[`tb:${hash}`];
				return newHashAndProgress;
			});
		}
	}

	const backdropStyle = {
		backgroundImage: `linear-gradient(to bottom, hsl(0, 0%, 12%,0.5) 0%, hsl(0, 0%, 12%,0) 50%, hsl(0, 0%, 12%,0.5) 100%), url(${movieInfo.backdrop})`,
		backgroundPosition: 'center',
		backgroundSize: 'screen',
	};

	const handleShowInfo = (result: SearchResult) => {
		let files = result.files
			.filter((file) => isVideo({ path: file.filename }))
			.map((file) => ({
				id: file.fileId,
				path: file.filename,
				bytes: file.filesize,
				selected: 1,
			}));
		files.sort();
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
		rdKey &&
			showInfoForRD(player, rdKey, info, imdbid as string, 'movie', shouldDownloadMagnets);
	};

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
					sortByBiggest
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

	async function handleCast(hash: string) {
		await toast.promise(
			handleCastMovie(imdbid as string, rdKey!, hash),
			{
				loading: 'Casting...',
				success: 'Casting successful',
				error: 'Casting failed',
			},
			castToastOptions
		);
		// open stremio after casting
		window.open(`stremio://detail/movie/${imdbid}/${imdbid}`);
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
						onlyShowCached ? r.rdAvailable || r.adAvailable || r.tbAvailable : true
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
					sortByBiggest
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

	const getFirstAvailableRdTorrent = () => {
		return filteredResults.find((r) => r.rdAvailable && !r.noVideos);
	};

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
			// Use the RD key as userId, same as individual ReportButton
			const userId = rdKey || adKey || torboxKey || '';

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

	const getBiggestFileId = (result: SearchResult) => {
		if (!result.files || !result.files.length) return '';
		const biggestFile = result.files
			.filter((f) => isVideo({ path: f.filename }))
			.sort((a, b) => b.filesize - a.filesize)[0];
		return biggestFile?.fileId ?? '';
	};

	if (!movieInfo.title) {
		return <div>Loading...</div>;
	}

	return (
		<div className="min-h-screen max-w-full bg-gray-900 text-gray-100">
			<Head>
				<title>
					Debrid Media Manager - Movie - {movieInfo.title} ({movieInfo.year})
				</title>
			</Head>
			<Toaster position="bottom-right" />
			{/* Display basic movie info */}
			<div
				className="grid auto-cols-auto grid-flow-col auto-rows-auto gap-2"
				style={backdropStyle}
			>
				{(movieInfo.poster && (
					<Image
						width={200}
						height={300}
						src={movieInfo.poster}
						alt="Movie poster"
						className="row-span-5 shadow-lg"
					/>
				)) || <Poster imdbId={imdbid as string} title={movieInfo.title} />}
				<div className="flex justify-end p-2">
					<Link
						href="/"
						className="h-fit w-fit rounded border-2 border-cyan-500 bg-cyan-900/30 px-2 py-1 text-sm text-cyan-100 transition-colors hover:bg-cyan-800/50"
					>
						Go Home
					</Link>
				</div>
				<h2 className="text-xl font-bold [text-shadow:_0_2px_0_rgb(0_0_0_/_80%)]">
					{movieInfo.title} ({movieInfo.year})
				</h2>
				<div className="h-fit w-fit bg-slate-900/75" onClick={() => setDescLimit(0)}>
					{descLimit > 0
						? movieInfo.description.substring(0, descLimit) + '..'
						: movieInfo.description}{' '}
					{movieInfo.imdb_score > 0 && (
						<div className="inline text-yellow-100">
							<Link href={`https://www.imdb.com/title/${imdbid}/`} target="_blank">
								IMDB Score:{' '}
								{movieInfo.imdb_score < 10
									? movieInfo.imdb_score
									: movieInfo.imdb_score / 10}
							</Link>
						</div>
					)}
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
							{getFirstAvailableRdTorrent() && (
								<>
									<button
										className="mb-1 mr-2 mt-0 rounded border-2 border-green-500 bg-green-900/30 p-1 text-xs text-green-100 transition-colors hover:bg-green-800/50"
										onClick={() => {
											const firstAvailable = getFirstAvailableRdTorrent()!;
											// Check if torrent is already in library
											if (`rd:${firstAvailable.hash}` in hashAndProgress) {
												toast.success(
													'This torrent is already in your Real-Debrid library'
												);
												return;
											}
											addRd(firstAvailable.hash);
										}}
									>
										<b>⚡Instant RD</b>
									</button>
									<button
										className="mb-1 mr-2 mt-0 rounded border-2 border-teal-500 bg-teal-900/30 p-1 text-xs text-teal-100 transition-colors hover:bg-teal-800/50"
										onClick={() =>
											window.open(
												`/api/watch/instant/${player}?token=${rdKey}&hash=${getFirstAvailableRdTorrent()!.hash}&fileId=${getBiggestFileId(getFirstAvailableRdTorrent()!)}`
											)
										}
									>
										<b>🧐Watch</b>
									</button>
									<button
										className="mb-1 mr-2 mt-0 rounded border-2 border-gray-500 bg-gray-900/30 p-1 text-xs text-gray-100 transition-colors hover:bg-gray-800/50"
										onClick={() =>
											handleCast(getFirstAvailableRdTorrent()!.hash)
										}
									>
										<b>Cast✨</b>
									</button>
								</>
							)}
						</>
					)}
					<button
						className="mb-1 mr-2 mt-0 rounded border-2 border-purple-500 bg-purple-900/30 p-1 text-xs text-purple-100 transition-colors hover:bg-purple-800/50"
						onClick={() => window.open(`stremio://detail/movie/${imdbid}/${imdbid}`)}
					>
						<b>🔮Stremio</b>
					</button>
					{onlyShowCached && totalUncachedCount > 0 && (
						<button
							className="mb-1 mr-2 mt-0 rounded border-2 border-blue-500 bg-blue-900/30 p-1 text-xs text-blue-100 transition-colors hover:bg-blue-800/50"
							onClick={() => {
								setOnlyShowCached(false);
							}}
						>
							Show {totalUncachedCount} uncached
						</button>
					)}
					<RelatedMedia imdbId={imdbid as string} mediaType="movie" />
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
					</div>
				)}
			</div>
			<div className="mb-2 flex items-center gap-2 overflow-x-auto p-2">
				<SearchTokens
					title={movieInfo.title}
					year={movieInfo.year}
					onTokenClick={(token) =>
						setQuery((prev) => (prev ? `${prev} ${token}` : token))
					}
				/>
				{getColorScale().map((scale, idx) => (
					<span
						key={idx}
						className={`bg-${scale.color} cursor-pointer whitespace-nowrap rounded px-2 py-1 text-xs text-white`}
						onClick={() => {
							const queryText = getQueryForMovieCount(scale.threshold);
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

			{searchResults.length > 0 && (
				<>
					<MovieSearchResults
						filteredResults={filteredResults}
						onlyShowCached={onlyShowCached}
						movieMaxSize={movieMaxSize}
						rdKey={rdKey}
						adKey={adKey}
						torboxKey={torboxKey}
						player={player}
						hashAndProgress={hashAndProgress}
						handleShowInfo={handleShowInfo}
						handleCast={handleCast}
						handleCopyMagnet={(hash) =>
							handleCopyOrDownloadMagnet(hash, shouldDownloadMagnets)
						}
						handleCheckAvailability={handleCheckAvailability}
						addRd={addRd}
						addAd={addAd}
						addTb={addTb}
						deleteRd={deleteRd}
						deleteAd={deleteAd}
						deleteTb={deleteTb}
						imdbId={imdbid as string}
					/>

					{searchResults.length > 0 && searchState === 'loaded' && hasMoreResults && (
						<button
							className="my-4 w-full rounded border-2 border-gray-500 bg-gray-800/30 px-4 py-2 font-medium text-gray-100 shadow-md transition-colors duration-200 hover:bg-gray-700/50 hover:shadow-lg"
							onClick={() => {
								setCurrentPage((prev) => prev + 1);
								fetchData(imdbid as string, currentPage + 1);
							}}
						>
							Show More Results
						</button>
					)}
				</>
			)}
		</div>
	);
};

export default withAuth(MovieSearch);
