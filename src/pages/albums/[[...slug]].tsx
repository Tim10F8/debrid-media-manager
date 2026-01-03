import { useRealDebridAccessToken } from '@/hooks/auth';
import useLocalStorage from '@/hooks/localStorage';
import { MusicAlbum, MusicLibraryResponse, MusicTrack } from '@/pages/api/music/library';
import { UnrestrictTrackResponse } from '@/pages/api/music/unrestrict';
import {
	ChevronLeft,
	Disc3,
	Library,
	Loader2,
	Music2,
	Pause,
	Play,
	Repeat,
	Repeat1,
	Shuffle,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
} from 'lucide-react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';

// Types for player state
interface PlayerState {
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	isMuted: boolean;
	isLoading: boolean;
	repeatMode: 'off' | 'all' | 'one';
	isShuffled: boolean;
}

interface QueuedTrack {
	track: MusicTrack;
	album: MusicAlbum;
	streamUrl?: string;
}

// Format duration from seconds
function formatDuration(seconds: number): string {
	if (!seconds || !isFinite(seconds)) return '0:00';
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format file size
function formatSize(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Remove file extension from filename
function removeExtension(filename: string): string {
	return filename.replace(/\.[^/.]+$/, '');
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export default function AlbumsPage() {
	const router = useRouter();
	const [accessToken, isLoading] = useRealDebridAccessToken();

	// Library state
	const [library, setLibrary] = useState<MusicLibraryResponse | null>(null);
	const [libraryLoading, setLibraryLoading] = useState(true);
	const [libraryError, setLibraryError] = useState<string | null>(null);

	// View state
	const [searchQuery, setSearchQuery] = useState('');

	// Get selected album from URL path param
	const slug = router.query.slug as string[] | undefined;
	const albumHash = slug?.[0];
	const selectedAlbum = library?.albums.find((a) => a.hash === albumHash) ?? null;

	// Track previous album to detect album changes
	const prevAlbumHash = useRef<string | undefined>(undefined);

	// Navigate to album (updates URL)
	const selectAlbum = (album: MusicAlbum | null) => {
		if (album) {
			// Save scroll position before navigating to album
			if (mainRef.current) {
				savedScrollPosition.current = mainRef.current.scrollTop;
			}
			router.push(`/albums/${album.hash}`, undefined, { shallow: true });
		} else {
			router.push('/albums', undefined, { shallow: true });
		}
	};

	// Scroll to top when switching to a different album
	useEffect(() => {
		if (albumHash && albumHash !== prevAlbumHash.current && mainRef.current) {
			mainRef.current.scrollTop = 0;
		}
		prevAlbumHash.current = albumHash;
	}, [albumHash]);

	// Restore scroll position when navigating back from album to list
	useEffect(() => {
		if (!albumHash && prevAlbumHash.current && mainRef.current) {
			// Use setTimeout to ensure DOM has updated
			setTimeout(() => {
				if (mainRef.current) {
					mainRef.current.scrollTop = savedScrollPosition.current;
				}
			}, 0);
		}
	}, [albumHash]);

	// Queue and playback state
	const [queue, setQueue] = useState<QueuedTrack[]>([]);
	const [originalQueue, setOriginalQueue] = useState<QueuedTrack[]>([]);
	const [currentIndex, setCurrentIndex] = useState<number>(-1);
	const [playerState, setPlayerState] = useState<PlayerState>({
		isPlaying: false,
		currentTime: 0,
		duration: 0,
		volume: 1,
		isMuted: false,
		isLoading: false,
		repeatMode: 'off',
		isShuffled: false,
	});

	// Persist volume
	const [savedVolume, setSavedVolume] = useLocalStorage<number>('music:volume', 1);

	// Audio element ref
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Scroll container ref and saved scroll position
	const mainRef = useRef<HTMLElement | null>(null);
	const savedScrollPosition = useRef<number>(0);

	// Current track being played
	const currentTrack =
		currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

	// Fetch library on mount
	useEffect(() => {
		async function fetchLibrary() {
			try {
				setLibraryLoading(true);
				const response = await fetch('/api/music/library');
				if (!response.ok) throw new Error('Failed to fetch library');
				const data: MusicLibraryResponse = await response.json();
				setLibrary(data);
			} catch (err) {
				setLibraryError(err instanceof Error ? err.message : 'Failed to load library');
			} finally {
				setLibraryLoading(false);
			}
		}
		fetchLibrary();
	}, []);

	// Fetch album covers for albums without cover URLs
	useEffect(() => {
		if (!library || library.albums.length === 0) return;

		const albumsWithoutCovers = library.albums.filter((a) => !a.coverUrl);
		if (albumsWithoutCovers.length === 0) return;

		let isCancelled = false;

		async function fetchCovers() {
			for (const album of albumsWithoutCovers) {
				if (isCancelled) break;

				try {
					const response = await fetch('/api/music/cover', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							mbid: album.mbid,
							artist: album.artist,
							album: album.album,
						}),
					});

					if (response.ok) {
						const data = await response.json();
						if (data.coverUrl) {
							// Update the library state with the new cover URL
							setLibrary((prev) => {
								if (!prev) return prev;
								return {
									...prev,
									albums: prev.albums.map((a) =>
										a.mbid === album.mbid
											? { ...a, coverUrl: data.coverUrl }
											: a
									),
								};
							});
						}
					}
				} catch (err) {
					console.error(`Failed to fetch cover for ${album.album}:`, err);
				}

				// Small delay between requests to avoid rate limiting
				await new Promise((r) => setTimeout(r, 200));
			}
		}

		fetchCovers();

		return () => {
			isCancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [library?.albums.length]);

	// Initialize audio element
	useEffect(() => {
		const audio = new Audio();
		audio.volume = savedVolume ?? 1;
		audioRef.current = audio;

		// Update player state on audio events
		audio.addEventListener('timeupdate', () => {
			setPlayerState((prev) => ({ ...prev, currentTime: audio.currentTime }));
		});

		audio.addEventListener('durationchange', () => {
			setPlayerState((prev) => ({ ...prev, duration: audio.duration }));
		});

		audio.addEventListener('ended', () => {
			handleTrackEnded();
		});

		audio.addEventListener('play', () => {
			setPlayerState((prev) => ({ ...prev, isPlaying: true }));
		});

		audio.addEventListener('pause', () => {
			setPlayerState((prev) => ({ ...prev, isPlaying: false }));
		});

		audio.addEventListener('waiting', () => {
			setPlayerState((prev) => ({ ...prev, isLoading: true }));
		});

		audio.addEventListener('canplay', () => {
			setPlayerState((prev) => ({ ...prev, isLoading: false }));
		});

		audio.addEventListener('error', () => {
			setPlayerState((prev) => ({ ...prev, isLoading: false, isPlaying: false }));
		});

		return () => {
			audio.pause();
			audio.src = '';
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Handle track ended
	const handleTrackEnded = useCallback(() => {
		if (playerState.repeatMode === 'one') {
			// Repeat single track
			if (audioRef.current) {
				audioRef.current.currentTime = 0;
				audioRef.current.play();
			}
		} else if (currentIndex < queue.length - 1) {
			// Play next track
			playTrackAtIndex(currentIndex + 1);
		} else if (playerState.repeatMode === 'all' && queue.length > 0) {
			// Loop back to start
			playTrackAtIndex(0);
		} else {
			// End of queue
			setPlayerState((prev) => ({ ...prev, isPlaying: false }));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentIndex, queue.length, playerState.repeatMode]);

	// Unrestrict and play a track
	const unrestrictAndPlay = async (track: MusicTrack): Promise<string | undefined> => {
		if (!accessToken) return undefined;

		try {
			const response = await fetch('/api/music/unrestrict', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					link: track.link,
					hash: track.hash,
					fileId: track.fileId,
					accessToken,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error('Unrestrict failed:', {
					status: response.status,
					error: errorData.error,
					errorCode: errorData.errorCode,
					hash: track.hash,
					fileId: track.fileId,
				});
				throw new Error(errorData.error || 'Failed to unrestrict');
			}

			const data: UnrestrictTrackResponse = await response.json();
			return data.streamUrl;
		} catch (err) {
			console.error('Failed to unrestrict track:', err);
			return undefined;
		}
	};

	// Play a track at a specific queue index
	const playTrackAtIndex = async (index: number, retryCount = 0) => {
		if (index < 0 || index >= queue.length) return;
		if (retryCount > 5) {
			console.error('Too many failed attempts to play tracks');
			setPlayerState((prev) => ({ ...prev, isLoading: false, isPlaying: false }));
			return;
		}

		const queuedTrack = queue[index];
		setCurrentIndex(index);
		setPlayerState((prev) => ({ ...prev, isLoading: true }));

		let streamUrl = queuedTrack.streamUrl;

		// Unrestrict if we don't have a stream URL
		if (!streamUrl) {
			streamUrl = await unrestrictAndPlay(queuedTrack.track);
			if (!streamUrl) {
				console.error(`Failed to load track: ${queuedTrack.track.filename}, skipping...`);
				// Try next track
				playTrackAtIndex(index + 1, retryCount + 1);
				return;
			}

			// Cache the stream URL
			setQueue((prev) =>
				prev.map((item, i) => (i === index ? { ...item, streamUrl } : item))
			);
		}

		// Play the track
		if (audioRef.current) {
			audioRef.current.src = streamUrl;
			audioRef.current.play().catch(console.error);
		}
	};

	// Play an album
	const playAlbum = (album: MusicAlbum, startTrackIndex: number = 0) => {
		const newQueue: QueuedTrack[] = album.tracks.map((track) => ({
			track,
			album,
		}));

		setQueue(newQueue);
		setOriginalQueue(newQueue);
		setPlayerState((prev) => ({ ...prev, isShuffled: false }));
		playTrackAtIndex(startTrackIndex);
	};

	// Add album to queue
	const addAlbumToQueue = (album: MusicAlbum) => {
		const newTracks: QueuedTrack[] = album.tracks.map((track) => ({
			track,
			album,
		}));

		setQueue((prev) => [...prev, ...newTracks]);
		setOriginalQueue((prev) => [...prev, ...newTracks]);
	};

	// Toggle play/pause
	const togglePlay = () => {
		if (!audioRef.current) return;

		if (playerState.isPlaying) {
			audioRef.current.pause();
		} else {
			audioRef.current.play().catch(console.error);
		}
	};

	// Skip to next track
	const skipNext = () => {
		if (currentIndex < queue.length - 1) {
			playTrackAtIndex(currentIndex + 1);
		} else if (playerState.repeatMode === 'all') {
			playTrackAtIndex(0);
		}
	};

	// Skip to previous track
	const skipPrev = () => {
		if (audioRef.current && audioRef.current.currentTime > 3) {
			audioRef.current.currentTime = 0;
		} else if (currentIndex > 0) {
			playTrackAtIndex(currentIndex - 1);
		}
	};

	// Toggle shuffle
	const toggleShuffle = () => {
		if (playerState.isShuffled) {
			// Unshuffle - restore original order
			const currentTrackId = currentTrack?.track.id;
			const newIndex = originalQueue.findIndex((t) => t.track.id === currentTrackId);
			setQueue(originalQueue);
			setCurrentIndex(newIndex >= 0 ? newIndex : 0);
		} else {
			// Shuffle
			const currentTrackItem = currentTrack;
			const otherTracks = queue.filter((_, i) => i !== currentIndex);
			const shuffled = shuffleArray(otherTracks);
			const newQueue = currentTrackItem ? [currentTrackItem, ...shuffled] : shuffled;
			setQueue(newQueue);
			setCurrentIndex(0);
		}
		setPlayerState((prev) => ({ ...prev, isShuffled: !prev.isShuffled }));
	};

	// Toggle repeat mode
	const toggleRepeat = () => {
		setPlayerState((prev) => ({
			...prev,
			repeatMode:
				prev.repeatMode === 'off' ? 'all' : prev.repeatMode === 'all' ? 'one' : 'off',
		}));
	};

	// Seek
	const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
		const time = parseFloat(e.target.value);
		if (audioRef.current) {
			audioRef.current.currentTime = time;
		}
	};

	// Volume
	const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
		const volume = parseFloat(e.target.value);
		if (audioRef.current) {
			audioRef.current.volume = volume;
			audioRef.current.muted = false;
		}
		setPlayerState((prev) => ({ ...prev, volume, isMuted: false }));
		setSavedVolume(volume);
	};

	// Toggle mute
	const toggleMute = () => {
		if (audioRef.current) {
			audioRef.current.muted = !playerState.isMuted;
		}
		setPlayerState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
	};

	// Filter albums by search
	const filteredAlbums =
		library?.albums.filter((album) => {
			const query = searchQuery.toLowerCase();
			return (
				album.artist.toLowerCase().includes(query) ||
				album.album.toLowerCase().includes(query)
			);
		}) ?? [];

	// Redirect if not authenticated
	if (!isLoading && !accessToken) {
		router.push('/realdebrid/login?redirect=/albums');
		return null;
	}

	return (
		<>
			<Head>
				<title>
					{selectedAlbum ? `${selectedAlbum.album} - ${selectedAlbum.artist}` : 'Albums'}{' '}
					- DMM
				</title>
			</Head>

			<div className="flex h-screen flex-col bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white">
				{/* Header */}
				<header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
					<div className="flex items-center gap-4">
						<button
							onClick={() => (selectedAlbum ? selectAlbum(null) : router.push('/'))}
							className="rounded-full p-2 transition hover:bg-gray-800"
						>
							<ChevronLeft className="h-5 w-5" />
						</button>
						<div className="flex items-center gap-2">
							<Music2 className="h-6 w-6 text-green-500" />
							<h1 className="text-xl font-bold">Albums</h1>
						</div>
					</div>

					{/* Search */}
					<div className="w-96">
						<input
							type="text"
							placeholder="Search artists or albums..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full rounded-full bg-gray-800 px-4 py-2 text-sm placeholder-gray-400 outline-none focus:ring-2 focus:ring-green-500"
						/>
					</div>

					{/* Stats */}
					{library && (
						<div className="flex items-center gap-2 text-sm text-gray-400">
							<Library className="h-4 w-4" />
							<span>
								{library.totalAlbums} albums · {library.totalTracks} tracks
							</span>
						</div>
					)}
				</header>

				{/* Main content */}
				<main ref={mainRef} className="flex-1 overflow-y-auto pb-32">
					{libraryLoading ? (
						<div className="flex h-full items-center justify-center">
							<Loader2 className="h-8 w-8 animate-spin text-green-500" />
						</div>
					) : libraryError ? (
						<div className="flex h-full items-center justify-center text-red-400">
							{libraryError}
						</div>
					) : selectedAlbum ? (
						/* Album detail view */
						<div className="relative min-h-full">
							{/* Ambient background gradient */}
							<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-green-900/20 via-gray-900 to-gray-900" />

							<div className="relative z-10 p-8 pb-32">
								{/* Back button */}
								<button
									onClick={() => selectAlbum(null)}
									className="mb-6 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
								>
									<ChevronLeft className="h-4 w-4" />
									Back to Library
								</button>

								{/* Album header */}
								<div className="flex flex-col gap-8 md:flex-row md:items-end">
									<div className="relative h-64 w-64 flex-shrink-0 overflow-hidden rounded-xl bg-gray-800 shadow-2xl transition hover:scale-[1.02]">
										{/* Fallback icon */}
										<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
											<Disc3 className="h-24 w-24 text-gray-500" />
										</div>
										{/* Album cover (on top) */}
										{selectedAlbum.coverUrl && (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={selectedAlbum.coverUrl}
												alt={selectedAlbum.album}
												className="absolute inset-0 z-10 h-full w-full object-cover"
												onError={(e) => {
													(e.target as HTMLImageElement).style.display =
														'none';
												}}
											/>
										)}
									</div>

									<div className="flex flex-col justify-end gap-4">
										<div>
											<span className="text-xs font-bold uppercase tracking-wider text-green-500">
												Album
											</span>
											<h2 className="mt-2 text-4xl font-black tracking-tight text-white md:text-6xl md:leading-tight">
												{selectedAlbum.album}
											</h2>
										</div>

										<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium text-gray-300">
											<div className="flex items-center gap-2">
												<div className="h-6 w-6 rounded-full bg-gray-600" />{' '}
												{/* Artist Placeholder Avatar */}
												<span className="text-white hover:underline">
													{selectedAlbum.artist}
												</span>
											</div>
											{selectedAlbum.year && (
												<>
													<span className="text-gray-500">•</span>
													<span>{selectedAlbum.year}</span>
												</>
											)}
											<span className="text-gray-500">•</span>
											<span>{selectedAlbum.trackCount} songs</span>
											<span className="text-gray-500">•</span>
											<span className="opacity-80">
												{formatSize(selectedAlbum.totalBytes)}
											</span>
										</div>

										<div className="mt-4 flex flex-wrap gap-4">
											<button
												onClick={() => playAlbum(selectedAlbum)}
												className="flex items-center gap-2 rounded-full bg-green-500 px-8 py-3.5 font-bold text-black shadow-lg shadow-green-500/20 transition hover:scale-105 hover:bg-green-400 active:scale-95"
											>
												<Play className="h-5 w-5" fill="currentColor" />
												Play
											</button>
											<button
												onClick={() => addAlbumToQueue(selectedAlbum)}
												className="flex items-center gap-2 rounded-full border border-gray-600 bg-black/20 px-6 py-3.5 font-bold text-white transition hover:border-white hover:bg-white/10 active:scale-95"
											>
												Add to Queue
											</button>
										</div>
									</div>
								</div>

								{/* Track list */}
								<div className="mt-12">
									<div className="mb-4 grid grid-cols-[auto_1fr_auto] gap-4 border-b border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-400">
										<span className="w-8 text-center">#</span>
										<span>Title</span>
										<span className="text-right">Size</span>
									</div>

									<div className="flex flex-col gap-1">
										{selectedAlbum.tracks.map((track, index) => {
											const isCurrentTrack =
												currentTrack?.track.id === track.id;

											return (
												<button
													key={track.id}
													onClick={() => playAlbum(selectedAlbum, index)}
													className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg px-4 py-3 text-left transition ${
														isCurrentTrack
															? 'bg-white/10 text-green-500'
															: 'text-gray-300 hover:bg-white/5 hover:text-white'
													}`}
												>
													<span className="flex w-8 items-center justify-center text-sm">
														{isCurrentTrack && playerState.isPlaying ? (
															<span className="flex h-4 items-end gap-0.5">
																<span className="h-3 w-0.5 animate-pulse bg-green-500" />
																<span
																	className="h-4 w-0.5 animate-pulse bg-green-500"
																	style={{
																		animationDelay: '0.15s',
																	}}
																/>
																<span
																	className="h-2 w-0.5 animate-pulse bg-green-500"
																	style={{
																		animationDelay: '0.3s',
																	}}
																/>
															</span>
														) : (
															<>
																<span
																	className={`block font-mono text-gray-500 group-hover:hidden ${isCurrentTrack ? 'text-green-500' : ''}`}
																>
																	{track.trackNumber ?? index + 1}
																</span>
																<Play
																	className="hidden h-4 w-4 group-hover:block"
																	fill="currentColor"
																/>
															</>
														)}
													</span>

													<div className="flex flex-col overflow-hidden">
														<span
															className={`truncate font-medium ${isCurrentTrack ? 'text-green-500' : 'text-white'}`}
														>
															{removeExtension(track.filename)}
														</span>
														<span className="truncate text-xs text-gray-500 group-hover:text-gray-400">
															{selectedAlbum.artist}
														</span>
													</div>

													<span className="font-mono text-sm text-gray-500 group-hover:text-gray-400">
														{formatSize(track.bytes)}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							</div>
						</div>
					) : (
						/* Album grid view */
						<div className="p-6">
							<h2 className="mb-6 text-2xl font-bold">Your Library</h2>

							{filteredAlbums.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-20 text-gray-400">
									<Music2 className="mb-4 h-16 w-16" />
									<p className="text-lg">
										{searchQuery
											? 'No albums match your search'
											: 'No music in your library'}
									</p>
									<p className="mt-2 text-sm">
										Add music torrents from your debrid service to see them here
									</p>
								</div>
							) : (
								<div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
									{filteredAlbums.map((album) => (
										<button
											key={album.hash}
											onClick={() => selectAlbum(album)}
											className="group flex flex-col rounded-lg bg-gray-800/30 p-4 transition hover:bg-gray-800/60"
										>
											<div className="relative mb-4 aspect-square w-full overflow-hidden rounded-md bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg">
												{/* Fallback icon */}
												<div className="flex h-full w-full items-center justify-center">
													<Disc3 className="h-16 w-16 text-gray-500" />
												</div>
												{/* Album cover (on top) */}
												{album.coverUrl && (
													// eslint-disable-next-line @next/next/no-img-element
													<img
														src={album.coverUrl}
														alt={album.album}
														className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
														onError={(e) => {
															(
																e.target as HTMLImageElement
															).style.display = 'none';
														}}
													/>
												)}

												{/* Play button overlay */}
												<div className="absolute bottom-2 right-2 z-10 translate-y-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
													<button
														onClick={(e) => {
															e.stopPropagation();
															playAlbum(album);
														}}
														className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 shadow-lg transition hover:scale-105 hover:bg-green-400"
													>
														<Play
															className="h-6 w-6 text-black"
															fill="currentColor"
														/>
													</button>
												</div>
											</div>

											<h3 className="truncate font-medium">{album.album}</h3>
											<p className="truncate text-sm text-gray-400">
												{album.artist}
												{album.year && ` · ${album.year}`}
											</p>
											<p className="mt-1 text-xs text-gray-500">
												{album.trackCount}{' '}
												{album.trackCount === 1 ? 'track' : 'tracks'}
											</p>
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</main>

				{/* Now Playing Bar */}
				{currentTrack && (
					<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/80 px-4 py-3 backdrop-blur-xl">
						<div className="mx-auto flex max-w-screen-2xl items-center gap-4">
							{/* Track info */}
							<div className="flex w-80 items-center gap-4">
								<div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-gray-800 shadow-lg">
									{/* Fallback icon */}
									<div className="flex h-full w-full items-center justify-center">
										<Disc3 className="h-8 w-8 text-gray-500" />
									</div>
									{/* Album cover (on top) */}
									{currentTrack.album.coverUrl && (
										// eslint-disable-next-line @next/next/no-img-element
										<img
											src={currentTrack.album.coverUrl}
											alt={currentTrack.album.album}
											className="absolute inset-0 h-full w-full object-cover"
											onError={(e) => {
												(e.target as HTMLImageElement).style.display =
													'none';
											}}
										/>
									)}
								</div>
								<div className="min-w-0">
									<p className="truncate font-medium text-white">
										{removeExtension(currentTrack.track.filename)}
									</p>
									<p className="truncate text-sm text-gray-400">
										{currentTrack.album.artist}
									</p>
								</div>
							</div>

							{/* Player controls */}
							<div className="flex flex-1 flex-col items-center gap-2">
								<div className="flex items-center gap-6">
									<button
										onClick={toggleShuffle}
										className={`transition hover:scale-110 ${
											playerState.isShuffled
												? 'text-green-500'
												: 'text-gray-400 hover:text-white'
										}`}
										title="Shuffle"
									>
										<Shuffle className="h-4 w-4" />
									</button>

									<button
										onClick={skipPrev}
										className="text-gray-400 transition hover:scale-110 hover:text-white"
										title="Previous"
									>
										<SkipBack className="h-5 w-5" fill="currentColor" />
									</button>

									<button
										onClick={togglePlay}
										disabled={playerState.isLoading}
										className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-50"
									>
										{playerState.isLoading ? (
											<Loader2 className="h-5 w-5 animate-spin" />
										) : playerState.isPlaying ? (
											<Pause className="h-5 w-5" fill="currentColor" />
										) : (
											<Play className="h-5 w-5 pl-0.5" fill="currentColor" />
										)}
									</button>

									<button
										onClick={skipNext}
										className="text-gray-400 transition hover:scale-110 hover:text-white"
										title="Next"
									>
										<SkipForward className="h-5 w-5" fill="currentColor" />
									</button>

									<button
										onClick={toggleRepeat}
										className={`transition hover:scale-110 ${
											playerState.repeatMode !== 'off'
												? 'text-green-500'
												: 'text-gray-400 hover:text-white'
										}`}
										title="Repeat"
									>
										{playerState.repeatMode === 'one' ? (
											<Repeat1 className="h-4 w-4" />
										) : (
											<Repeat className="h-4 w-4" />
										)}
									</button>
								</div>

								{/* Progress bar */}
								<div className="group flex w-full max-w-xl items-center gap-2">
									<span className="w-10 text-right font-mono text-xs text-gray-400">
										{formatDuration(playerState.currentTime)}
									</span>
									<input
										type="range"
										min={0}
										max={playerState.duration || 100}
										value={playerState.currentTime}
										onChange={handleSeek}
										className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 transition-all hover:h-1.5 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:transition-all group-hover:[&::-webkit-slider-thumb]:h-4 group-hover:[&::-webkit-slider-thumb]:w-4"
									/>
									<span className="w-10 font-mono text-xs text-gray-400">
										{formatDuration(playerState.duration)}
									</span>
								</div>
							</div>

							{/* Volume */}
							<div className="flex w-40 items-center justify-end gap-2">
								<button
									onClick={toggleMute}
									className="text-gray-400 transition hover:text-white"
								>
									{playerState.isMuted || playerState.volume === 0 ? (
										<VolumeX className="h-5 w-5" />
									) : (
										<Volume2 className="h-5 w-5" />
									)}
								</button>
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={playerState.isMuted ? 0 : playerState.volume}
									onChange={handleVolume}
									className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-gray-600 accent-green-500 hover:h-1.5 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

AlbumsPage.disableLibraryProvider = true;
