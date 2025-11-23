import Poster from '@/components/poster';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

type CalendarEvent = {
	title: string;
	season: number | null;
	episode: number | null;
	firstAired: string;
	isPremiere: boolean;
	ids: Record<string, string | number>;
	network?: string;
};

type CalendarDay = {
	date: string;
	items: CalendarEvent[];
};

type TmdbShow = {
	id: number;
	name: string;
	first_air_date?: string;
	poster_path?: string;
	next_episode_to_air?: {
		season_number?: number;
		episode_number?: number;
		air_date?: string;
	};
};

type CalendarResponse = {
	range: { start: string; days: number };
	days: CalendarDay[];
	tmdb: {
		airingToday: TmdbShow[];
		onTheAir: TmdbShow[];
	};
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const isoDaysAgo = (days: number) => {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return toIsoDate(d);
};

const formatDayLabel = (isoDate: string) =>
	new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(
		new Date(isoDate)
	);

const formatEpisodeCode = (season: number | null, episode: number | null) => {
	if (season == null || episode == null) return 'Ep TBD';
	const paddedSeason = String(season).padStart(2, '0');
	const paddedEpisode = String(episode).padStart(2, '0');
	return `S${paddedSeason}E${paddedEpisode}`;
};

const badgeClasses = 'rounded px-2 py-0.5 text-xs font-semibold';

function CalendarPage() {
	const [startDate] = useState<string>(isoDaysAgo(7));
	const dayCount = 14;
	const todayIso = useMemo(() => toIsoDate(new Date()), []);
	const [data, setData] = useState<CalendarResponse | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const dayRefs = useRef<Record<string, HTMLElement | null>>({});

	useEffect(() => {
		let isMounted = true;
		setLoading(true);
		setError(null);

		const controller = new AbortController();

		(async () => {
			try {
				const query = new URLSearchParams({
					start: startDate,
					days: String(dayCount),
				}).toString();
				const resp = await fetch(`/api/calendar?${query}`, { signal: controller.signal });
				if (!resp.ok) {
					throw new Error('Calendar fetch failed');
				}
				const payload: CalendarResponse = await resp.json();
				if (!isMounted) return;
				setData(payload);
			} catch (err: any) {
				if (err.name === 'AbortError') return;
				console.error('Failed to load calendar', err);
				if (!isMounted) return;
				setError('Could not load calendar data.');
			} finally {
				if (isMounted) setLoading(false);
			}
		})();

		return () => {
			isMounted = false;
			controller.abort();
		};
	}, [startDate, dayCount]);

	const dayColumns = useMemo(() => {
		if (!data) return [];
		return data.days;
	}, [data]);

	const totalLinkableEpisodes = useMemo(() => {
		if (!data) return 0;
		return data.days.reduce((sum, day) => {
			const linkable = day.items.filter(
				(item) => typeof item.ids?.imdb === 'string' && !!item.ids.imdb
			).length;
			return sum + linkable;
		}, 0);
	}, [data]);

	const calendarWindow = useMemo(() => {
		if (!data) return null;
		const endDate = new Date(data.range.start);
		endDate.setDate(endDate.getDate() + data.range.days - 1);
		return `${formatDayLabel(data.range.start)} - ${formatDayLabel(toIsoDate(endDate))}`;
	}, [data]);

	const handleScrollToToday = () => {
		const node = dayRefs.current[todayIso];
		const container = containerRef.current;
		if (node && container) {
			const offset = node.offsetLeft - (container.clientWidth - node.clientWidth) / 2;
			const clampedOffset = Math.min(
				Math.max(0, offset),
				container.scrollWidth - container.clientWidth
			);
			container.scrollTo({ left: clampedOffset, behavior: 'smooth' });
			return;
		}
		if (node) {
			node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
		}
	};

	return (
		<div className="flex min-h-screen flex-col bg-gray-900 px-3 pb-16 pt-5 text-gray-100 sm:px-4 lg:px-6">
			<Head>
				<title>Debrid Media Manager - Episode Calendar</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>

			<main className="mx-auto flex w-full flex-col gap-4">
				<section className="rounded-2xl border border-gray-800/80 bg-gray-900/80 p-4 shadow-lg shadow-black/25 sm:p-5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="space-y-1">
							<h1 className="text-2xl font-bold text-white">Episode Calendar</h1>
							<p className="text-sm text-gray-300">
								Trakt calendar: past 7 days and next 7 days for quick planning.
							</p>
							<p className="text-xs text-gray-500">
								{calendarWindow
									? `Window: ${calendarWindow}`
									: 'Loading calendar window...'}
							</p>
						</div>
						<div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center">
							<button
								onClick={handleScrollToToday}
								className="haptic-sm inline-flex w-full items-center justify-center rounded-full border-2 border-cyan-500/70 bg-cyan-900/40 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-auto"
							>
								Jump to Today
							</button>
							<Link
								href="/"
								className="haptic-sm inline-flex w-full items-center justify-center rounded-full border-2 border-gray-700 bg-gray-800/70 px-4 py-2 text-sm font-semibold text-gray-100 transition-colors hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-auto"
							>
								Go Home
							</Link>
						</div>
					</div>
					<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
						<span className={`${badgeClasses} bg-cyan-900/50 text-cyan-200`}>
							Trakt
						</span>
						<span className={`${badgeClasses} bg-amber-900/60 text-amber-200`}>
							Premiere
						</span>
					</div>
				</section>

				{loading && (
					<div className="flex items-center justify-center">
						<div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-cyan-400"></div>
					</div>
				)}

				{error && <p className="text-sm text-red-300">{error}</p>}

				{!loading && !error && dayColumns.length === 0 && (
					<p className="text-sm text-gray-300">No episodes scheduled in this window.</p>
				)}

				<div className="relative">
					<div
						ref={containerRef}
						className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 pr-1 [-webkit-overflow-scrolling:touch]"
					>
						{dayColumns.map((day) => (
							<section
								key={day.date}
								ref={(node) => {
									dayRefs.current[day.date] = node;
								}}
								className={`min-w-[240px] max-w-xs flex-shrink-0 snap-start rounded-2xl border border-gray-800/80 p-3 shadow-sm transition-colors sm:min-w-[280px] ${
									day.date === todayIso ? 'bg-cyan-950/50' : 'bg-gray-800/75'
								}`}
							>
								{(() => {
									const linkableItems = day.items
										.filter(
											(item) =>
												typeof item.ids?.imdb === 'string' &&
												!!item.ids.imdb
										)
										.sort((a, b) => {
											const timeA = new Date(a.firstAired).getTime();
											const timeB = new Date(b.firstAired).getTime();
											if (timeA !== timeB) return timeA - timeB;
											return (a.title || '').localeCompare(b.title || '');
										});

									return (
										<>
											<div className="flex items-center justify-between gap-3">
												<div className="flex items-center gap-2">
													<h3 className="text-lg font-semibold text-white">
														{formatDayLabel(day.date)}
													</h3>
													{day.date === todayIso && (
														<span className="rounded bg-cyan-900/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-cyan-100">
															Today
														</span>
													)}
												</div>
												<span className="text-xs text-gray-400">
													{linkableItems.length} episodes
												</span>
											</div>
											<div className="mt-3 space-y-2">
												{linkableItems.length === 0 && (
													<p className="text-xs text-gray-500">
														No linkable episodes for this day.
													</p>
												)}
												{linkableItems.map((item, idx) =>
													(() => {
														const imdbId = item.ids?.imdb as string;
														const seasonPath = item.season
															? item.season
															: 1;
														const content = (
															<div className="rounded-xl border border-gray-800 bg-gray-900/80 px-2 py-2 hover:border-cyan-500/60">
																<div className="flex gap-3">
																	<div className="w-16 flex-shrink-0 sm:w-20">
																		<Poster
																			imdbId={imdbId}
																			title={item.title || ''}
																		/>
																	</div>
																	<div className="flex flex-1 flex-col justify-between gap-1">
																		<div className="flex items-start justify-between gap-2">
																			<div className="flex flex-col">
																				<span className="text-sm font-semibold text-white">
																					{item.title}
																				</span>
																				<span className="text-xs text-gray-400">
																					{formatEpisodeCode(
																						item.season,
																						item.episode
																					)}
																					{item.network
																						? ` • ${item.network}`
																						: ''}
																				</span>
																			</div>
																			{item.isPremiere && (
																				<span
																					className={`${badgeClasses} bg-amber-900/70 text-amber-100`}
																				>
																					Premiere
																				</span>
																			)}
																		</div>
																		<p className="text-xs text-gray-500">
																			{new Date(
																				item.firstAired
																			).toLocaleTimeString(
																				[],
																				{
																					hour: '2-digit',
																					minute: '2-digit',
																				}
																			)}{' '}
																			(local)
																		</p>
																	</div>
																</div>
															</div>
														);

														return (
															<Link
																key={`${item.title}-${item.firstAired}-${idx}`}
																href={`/show/${imdbId}/${seasonPath}`}
																className="block"
															>
																{content}
															</Link>
														);
													})()
												)}
											</div>
										</>
									);
								})()}
							</section>
						))}
					</div>
				</div>
			</main>

			<button
				onClick={handleScrollToToday}
				className="haptic-sm fixed bottom-4 right-4 z-30 inline-flex items-center justify-center rounded-full border-2 border-cyan-500/80 bg-cyan-900/80 px-4 py-2 text-sm font-semibold text-cyan-50 shadow-lg shadow-black/40 backdrop-blur transition hover:bg-cyan-800/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 md:hidden"
			>
				Today
			</button>
		</div>
	);
}

export default CalendarPage;
