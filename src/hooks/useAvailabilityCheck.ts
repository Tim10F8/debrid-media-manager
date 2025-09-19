import { SearchResult } from '@/services/mediasearch';
import { instantCheckInRd, instantCheckInTb } from '@/utils/instantChecks';
import { processWithConcurrency } from '@/utils/parallelProcessor';
import { generateTokenAndHash } from '@/utils/token';
import { getCachedTrackerStats, shouldIncludeTrackerStats } from '@/utils/trackerStats';
import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export function useAvailabilityCheck(
	rdKey: string | null,
	torboxKey: string | null,
	imdbId: string,
	searchResults: SearchResult[],
	setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
	hashAndProgress: Record<string, number>,
	addRd: (hash: string, isCheckingAvailability: boolean) => Promise<any>,
	addTb: (hash: string, isCheckingAvailability: boolean) => Promise<any>,
	deleteRd: (hash: string) => Promise<void>,
	deleteTb: (hash: string) => Promise<void>,
	sortFunction: (searchResults: SearchResult[]) => SearchResult[]
) {
	const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
	const isMounted = useRef(true);

	const handleCheckAvailability = useCallback(
		async (result: SearchResult) => {
			if (result.rdAvailable || result.tbAvailable) {
				const service = result.rdAvailable ? 'Real Debrid' : 'TorBox';
				toast.success(`Already cached in ${service}.`);
				return;
			}

			const toastId = toast.loading('Checking cached availability...');

			try {
				// Run checks in parallel for both RD and TorBox
				const [rdCheckResult, tbCheckResult, trackerStatsResult] = await Promise.allSettled(
					[
						// RD availability check
						rdKey
							? (async () => {
									let addRdResponse: any;
									// Check if torrent is in progress
									if (`rd:${result.hash}` in hashAndProgress) {
										await deleteRd(result.hash);
										addRdResponse = await addRd(result.hash, true);
									} else {
										addRdResponse = await addRd(result.hash, true);
										await deleteRd(result.hash);
									}

									// Check if addRd found it cached (returns response with ID)
									const isCachedInRD =
										addRdResponse &&
										addRdResponse.id &&
										addRdResponse.status === 'downloaded' &&
										addRdResponse.progress === 100;

									return { addRdResponse, isCachedInRD };
								})()
							: Promise.resolve({ addRdResponse: null, isCachedInRD: false }),

						// TorBox availability check
						torboxKey
							? (async () => {
									let addTbResponse: any;
									// Check if torrent is in progress
									if (`tb:${result.hash}` in hashAndProgress) {
										await deleteTb(result.hash);
										addTbResponse = await addTb(result.hash, true);
									} else {
										addTbResponse = await addTb(result.hash, true);
										await deleteTb(result.hash);
									}

									// Check if addTb found it cached
									const isCachedInTB =
										addTbResponse &&
										addTbResponse.id &&
										addTbResponse.download_finished;

									return { addTbResponse, isCachedInTB };
								})()
							: Promise.resolve({ addTbResponse: null, isCachedInTB: false }),

						// Tracker stats check (only if enabled and not already available)
						(async () => {
							if (
								!shouldIncludeTrackerStats() ||
								result.rdAvailable ||
								result.tbAvailable
							) {
								return null;
							}

							// For single torrent checks, force refresh if it was previously dead
							const currentStats = result.trackerStats;
							const forceRefresh = currentStats && currentStats.seeders === 0;

							// Use cached stats if fresh, otherwise scrape new ones
							return await getCachedTrackerStats(result.hash, 24, forceRefresh);
						})(),
					]
				);

				// Process RD check result
				let isCachedInRD = false;
				if (rdCheckResult.status === 'fulfilled') {
					isCachedInRD = rdCheckResult.value.isCachedInRD;
				} else if (rdKey) {
					console.error('RD availability check failed:', rdCheckResult.reason);
				}

				// Process TorBox check result
				let isCachedInTB = false;
				if (tbCheckResult.status === 'fulfilled') {
					isCachedInTB = tbCheckResult.value.isCachedInTB;
				} else if (torboxKey) {
					console.error('TorBox availability check failed:', tbCheckResult.reason);
				}

				// Process tracker stats result (only if not cached in either service)
				if (
					trackerStatsResult.status === 'fulfilled' &&
					trackerStatsResult.value &&
					!isCachedInRD &&
					!isCachedInTB
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
				} else if (
					trackerStatsResult.status === 'rejected' &&
					!isCachedInRD &&
					!isCachedInTB
				) {
					console.error('Failed to get tracker stats:', trackerStatsResult.reason);
				}

				toast.success('Availability check done.', { id: toastId });

				// Refetch data instead of reloading
				if (isMounted.current) {
					const hashArr = [result.hash];

					// Check RD if available
					if (rdKey) {
						const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
						await instantCheckInRd(
							tokenWithTimestamp,
							tokenHash,
							imdbId,
							hashArr,
							setSearchResults,
							sortFunction
						);
					}

					// Check TorBox if available
					if (torboxKey) {
						await instantCheckInTb(torboxKey, hashArr, setSearchResults, sortFunction);
					}
				}

				// Reload the page after a short delay to show the result
				setTimeout(() => {
					if (isMounted.current) {
						window.location.reload();
					}
				}, 1500);
			} catch (error) {
				toast.error('Cached availability check failed.', { id: toastId });
				console.error('Availability check error:', error);

				// Reload the page after a short delay even on error
				setTimeout(() => {
					if (isMounted.current) {
						window.location.reload();
					}
				}, 1500);
			}
		},
		[
			imdbId,
			rdKey,
			torboxKey,
			searchResults,
			setSearchResults,
			hashAndProgress,
			addRd,
			addTb,
			deleteRd,
			deleteTb,
			sortFunction,
		]
	);

	const handleAvailabilityTest = useCallback(
		async (filteredResults: SearchResult[]) => {
			if (isCheckingAvailability) return;

			const nonAvailableResults = filteredResults.filter(
				(r) => !r.rdAvailable && !r.tbAvailable
			);
			let progressToast: string | null = null;
			let realtimeAvailableCount = 0;

			// Show initial toast immediately
			if (nonAvailableResults.length === 0) {
				toast.error('No torrents left to check.');
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
					`Checking first ${availabilityCheckLimit} of ${nonAvailableResults.length} (per settings).`,
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
				// Run RD, TorBox checks and tracker stats completely in parallel
				const [rdCheckResults, tbCheckResults, trackerStatsResults] = await Promise.all([
					// RD availability checks with concurrency limit
					rdKey
						? processWithConcurrency(
								torrentsToCheck,
								async (result: SearchResult) => {
									try {
										let addRdResponse: any;
										if (`rd:${result.hash}` in hashAndProgress) {
											await deleteRd(result.hash);
											addRdResponse = await addRd(result.hash, true);
										} else {
											addRdResponse = await addRd(result.hash, true);
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
										console.error(
											`Failed RD check for ${result.title}:`,
											error
										);
										throw error;
									}
								},
								3,
								(completed: number, total: number) => {
									rdProgress = { completed, total };
									updateProgressMessage();
								}
							)
						: Promise.resolve([]),

					// TorBox availability checks with concurrency limit
					torboxKey
						? processWithConcurrency(
								torrentsToCheck,
								async (result: SearchResult) => {
									try {
										let addTbResponse: any;
										if (`tb:${result.hash}` in hashAndProgress) {
											await deleteTb(result.hash);
											addTbResponse = await addTb(result.hash, true);
										} else {
											addTbResponse = await addTb(result.hash, true);
											await deleteTb(result.hash);
										}

										// Check if addTb returned a response and is cached
										const isCachedInTB =
											addTbResponse &&
											addTbResponse.id &&
											addTbResponse.download_finished;

										if (isCachedInTB) {
											realtimeAvailableCount++;
										}

										return { result, isCachedInTB };
									} catch (error) {
										console.error(
											`Failed TorBox check for ${result.title}:`,
											error
										);
										throw error;
									}
								},
								3,
								(completed: number, total: number) => {
									rdProgress = { completed, total };
									updateProgressMessage();
								}
							)
						: Promise.resolve([]),

					// Tracker stats checks (only for non-available torrents)
					(async () => {
						if (!shouldIncludeTrackerStats()) {
							return [];
						}

						// Filter out torrents that are already available in any service
						const torrentsNeedingStats = torrentsToCheck.filter(
							(t) => !t.rdAvailable && !t.tbAvailable
						);

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

				// Filter out tracker stats for torrents that turned out to be cached
				const cachedHashes = new Set([
					...rdCheckResults
						.filter((r) => r.success && r.result?.isCachedInRD)
						.map((r) => r.item.hash),
					...tbCheckResults
						.filter((r) => r.success && r.result?.isCachedInTB)
						.map((r) => r.item.hash),
				]);

				// Apply tracker stats only to non-cached torrents
				trackerStatsResults.forEach((statsResult: any) => {
					if (
						statsResult.success &&
						statsResult.result?.trackerStats &&
						!cachedHashes.has(statsResult.item.hash)
					) {
						// Stats will already be set on the result object
					} else if (statsResult.success && cachedHashes.has(statsResult.item.hash)) {
						// Clear tracker stats for cached torrents
						delete statsResult.item.trackerStats;
					}
				});

				const allResults = [...rdCheckResults, ...tbCheckResults];
				const succeeded = allResults.filter((r) => r.success);
				const failed = allResults.filter((r) => !r.success);

				if (progressToast && isMounted.current) {
					toast.dismiss(progressToast);
				}

				// Get the final accurate count with instant checks for both services
				let availableCount = 0;
				if (succeeded.length > 0 && isMounted.current) {
					const successfulHashes = succeeded.map((r) => r.item.hash);

					// Check RD if available
					if (rdKey) {
						const [tokenWithTimestamp, tokenHash] = await generateTokenAndHash();
						availableCount += await instantCheckInRd(
							tokenWithTimestamp,
							tokenHash,
							imdbId,
							successfulHashes,
							setSearchResults,
							sortFunction
						);
					}

					// Check TorBox if available
					if (torboxKey) {
						availableCount += await instantCheckInTb(
							torboxKey,
							successfulHashes,
							setSearchResults,
							sortFunction
						);
					}
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
						`Failed to check ${failed.length}/${totalCount}; ${availableCount} available.`,
						{ duration: 5000 }
					);
				} else {
					toast.success(`Checked all ${totalCount}; ${availableCount} available.`, {
						duration: 3000,
					});
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
					toast.error('Availability test failed.');
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
		},
		[
			imdbId,
			rdKey,
			torboxKey,
			setSearchResults,
			hashAndProgress,
			addRd,
			addTb,
			deleteRd,
			deleteTb,
			sortFunction,
			isCheckingAvailability,
		]
	);

	return {
		isCheckingAvailability,
		handleCheckAvailability,
		handleAvailabilityTest,
	};
}
