import Poster from '@/components/poster';
import Head from 'next/head';
import Link from 'next/link';
import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

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

const getEpisodeCode = (season: number | null, episode: number | null) =>
	season == null || episode == null ? '' : formatEpisodeCode(season, episode);

const DMM_BASE_URL = 'https://debridmediamanager.com';

const formatIcsDate = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

const escapeIcsText = (text: string) =>
	text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const buildEventTitle = (event: CalendarEvent) => {
	const episodeCode = getEpisodeCode(event.season, event.episode);
	const base = episodeCode ? `${event.title} (${episodeCode})` : event.title;
	return `DMM: ${base}`;
};

const buildGoogleCalendarUrl = (
	title: string,
	start: Date,
	end: Date,
	timeZone: string,
	details?: string
) => {
	const dates = `${formatIcsDate(start)}/${formatIcsDate(end)}`;
	const params = new URLSearchParams({
		action: 'TEMPLATE',
		text: title,
		dates,
		ctz: timeZone || 'UTC',
	});
	if (details) params.set('details', details);
	return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const matchesCalendarEvent = (event: CalendarEvent, terms: string[]) => {
	if (terms.length === 0) return true;

	const episodeCode = getEpisodeCode(event.season, event.episode);
	const imdbId = typeof event.ids?.imdb === 'string' ? String(event.ids.imdb) : '';

	return terms.every((term) => {
		if (!term) return true;
		const q = term.toLowerCase();

		try {
			const regex = new RegExp(q, 'i');
			return (
				regex.test(event.title || '') ||
				(!!event.network && regex.test(event.network)) ||
				(!!episodeCode && regex.test(episodeCode)) ||
				(!!imdbId && regex.test(imdbId))
			);
		} catch (err) {
			return (
				(event.title || '').toLowerCase().includes(q) ||
				(event.network || '').toLowerCase().includes(q) ||
				(!!episodeCode && episodeCode.toLowerCase().includes(q)) ||
				(!!imdbId && imdbId.toLowerCase().includes(q))
			);
		}
	});
};

const badgeClasses = 'rounded px-2 py-0.5 text-xs font-semibold';

function CalendarPage() {
	const [startDate] = useState<string>(isoDaysAgo(7));
	const dayCount = 14;
	const todayIso = useMemo(() => toIsoDate(new Date()), []);
	const [data, setData] = useState<CalendarResponse | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [showGoogleAdd, setShowGoogleAdd] = useState(false);
	const [showAppleAdd, setShowAppleAdd] = useState(false);
	const timeZone = useMemo(
		() =>
			typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
				? Intl.DateTimeFormat().resolvedOptions().timeZone
				: 'UTC',
		[]
	);
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

	useEffect(() => {
		if (typeof window === 'undefined') return;

		const refreshSetting = () => {
			try {
				const g = window.localStorage.getItem('settings:showCalendarAddButtonsGoogle');
				const a = window.localStorage.getItem('settings:showCalendarAddButtonsApple');
				setShowGoogleAdd(g === 'true');
				setShowAppleAdd(a === 'true');
			} catch {
				setShowGoogleAdd(false);
				setShowAppleAdd(false);
			}
		};

		refreshSetting();

		const handleStorage = (event: StorageEvent) => {
			if (
				event.key === 'settings:showCalendarAddButtonsGoogle' ||
				event.key === 'settings:showCalendarAddButtonsApple'
			) {
				refreshSetting();
			}
		};

		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	}, []);

	const queryTerms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

	const dayColumns = useMemo(() => {
		if (!data) return [];
		if (queryTerms.length === 0) return data.days;

		return data.days
			.map((day) => {
				const matchingItems = day.items.filter((item) =>
					matchesCalendarEvent(item, queryTerms)
				);
				return { ...day, items: matchingItems };
			})
			.filter((day) => day.items.length > 0);
	}, [data, queryTerms]);

	const filteredEvents = useMemo(() => {
		return dayColumns.flatMap((day) =>
			day.items
				.filter((item) => typeof item.ids?.imdb === 'string' && !!item.ids.imdb)
				.map((item) => ({ item, showPath: `/show/${item.ids?.imdb}/${item.season || 1}` }))
		);
	}, [dayColumns]);

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

	const hasSearch = queryTerms.length > 0;

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

	const handleExportFilteredIcs = () => {
		if (filteredEvents.length === 0 || typeof window === 'undefined') return;

		const now = new Date();
		const icsLines = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Debrid Media Manager//Calendar//EN',
		];

		for (const { item, showPath } of filteredEvents) {
			const { start, end } = (() => {
				const startDate = new Date(item.firstAired);
				const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
				return { start: startDate, end: endDate };
			})();

			const showUrl = new URL(showPath, DMM_BASE_URL).toString();
			const description = [
				item.network ? `Network: ${item.network}` : '',
				showUrl ? `Link: ${showUrl}` : '',
			]
				.filter(Boolean)
				.join('\n');

			icsLines.push(
				'BEGIN:VEVENT',
				`UID:${escapeIcsText(`${item.ids?.imdb || item.title}-${formatIcsDate(start)}`)}`,
				`DTSTAMP:${formatIcsDate(now)}`,
				`DTSTART:${formatIcsDate(start)}`,
				`DTEND:${formatIcsDate(end)}`,
				`SUMMARY:${escapeIcsText(buildEventTitle(item))}`,
				description ? `DESCRIPTION:${escapeIcsText(description)}` : '',
				showUrl ? `URL:${escapeIcsText(showUrl)}` : '',
				'END:VEVENT'
			);
		}

		icsLines.push('END:VCALENDAR');

		const icsBlob = new Blob([icsLines.filter(Boolean).join('\r\n')], {
			type: 'text/calendar;charset=utf-8',
		});
		const url = URL.createObjectURL(icsBlob);
		const link = document.createElement('a');
		link.href = url;
		const filenameParts = ['dmm-calendar-filtered'];
		if (calendarWindow) filenameParts.push(calendarWindow.replace(/[^a-z0-9]+/gi, '-'));
		link.download = `${filenameParts.join('-').replace(/-+/g, '-').toLowerCase()}.ics`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="flex min-h-screen flex-col bg-gray-900 px-3 pb-12 pt-4 text-gray-100 sm:px-4 lg:px-6">
			<Head>
				<title>Debrid Media Manager - Episode Calendar</title>
				<meta name="robots" content="noindex, nofollow" />
			</Head>

			<main className="mx-auto flex w-full flex-col gap-3">
				<section className="rounded-2xl border border-gray-800/80 bg-gray-900/80 p-3 shadow-lg shadow-black/25 sm:p-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div className="space-y-0.5">
							<h1 className="text-xl font-semibold text-white">Episode Calendar</h1>
							<p className="text-xs text-gray-300 sm:text-sm">
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
								className="haptic-sm inline-flex w-full items-center justify-center rounded-full border-2 border-cyan-500/70 bg-cyan-900/40 px-3 py-1.5 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-auto"
							>
								Jump to Today
							</button>
							<Link
								href="/"
								className="haptic-sm inline-flex w-full items-center justify-center rounded-full border-2 border-gray-700 bg-gray-800/70 px-3 py-1.5 text-sm font-semibold text-gray-100 transition-colors hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-auto"
							>
								Go Home
							</Link>
						</div>
					</div>
					<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
						<div className="relative w-full sm:max-w-md">
							<svg
								className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle cx="11" cy="11" r="7" />
								<line x1="16.65" y1="16.65" x2="21" y2="21" />
							</svg>
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Search title, network, S01E01, or IMDB id (regex ok)"
								className="w-full rounded-full border border-gray-700 bg-gray-800/70 px-3 py-2 pl-9 text-sm text-gray-100 placeholder-gray-500 shadow-inner focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 sm:py-1.5"
							/>
						</div>
						<div className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-gray-400 sm:max-w-xs">
								Filters the 14-day window like the library quick search; supports
								multiple terms and regex.
							</p>
							{hasSearch && filteredEvents.length > 0 && (
								<button
									onClick={handleExportFilteredIcs}
									className="haptic-sm inline-flex items-center justify-center rounded-full border border-cyan-600/70 bg-cyan-900/40 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
								>
									Export filtered (.ics)
								</button>
							)}
						</div>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-300">
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
					<p className="text-sm text-gray-300">
						{hasSearch
							? 'No episodes match your search.'
							: 'No episodes scheduled in this window.'}
					</p>
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
														const showPath = `/show/${imdbId}/${seasonPath}`;
														const eventTitle = buildEventTitle(item);

														const buildTimes = () => {
															const start = new Date(item.firstAired);
															const end = new Date(
																start.getTime() + 60 * 60 * 1000
															);
															return { start, end };
														};

														const handleGoogleCalendar = (
															e: MouseEvent<HTMLButtonElement>
														) => {
															e.preventDefault();
															e.stopPropagation();
															const { start, end } = buildTimes();
															const showUrl = new URL(
																showPath,
																DMM_BASE_URL
															).toString();
															const details = [
																item.network
																	? `Network: ${item.network}`
																	: '',
																showUrl ? `Link: ${showUrl}` : '',
															]
																.filter(Boolean)
																.join('\n');
															const url = buildGoogleCalendarUrl(
																eventTitle,
																start,
																end,
																timeZone,
																details
															);
															if (typeof window !== 'undefined') {
																window.open(
																	url,
																	'_blank',
																	'noopener,noreferrer'
																);
															}
														};

														const handleAppleCalendar = (
															e: MouseEvent<HTMLButtonElement>
														) => {
															e.preventDefault();
															e.stopPropagation();
															const { start, end } = buildTimes();
															const now = new Date();
															const showUrl = new URL(
																showPath,
																DMM_BASE_URL
															).toString();
															const description = [
																item.network
																	? `Network: ${item.network}`
																	: '',
																showUrl ? `Link: ${showUrl}` : '',
															]
																.filter(Boolean)
																.join('\n');

															const icsLines = [
																'BEGIN:VCALENDAR',
																'VERSION:2.0',
																'PRODID:-//Debrid Media Manager//Calendar//EN',
																'BEGIN:VEVENT',
																`UID:${escapeIcsText(
																	`${imdbId || item.title}-${formatIcsDate(start)}`
																)}`,
																`DTSTAMP:${formatIcsDate(now)}`,
																`DTSTART:${formatIcsDate(start)}`,
																`DTEND:${formatIcsDate(end)}`,
																`SUMMARY:${escapeIcsText(eventTitle || 'Episode')}`,
																description
																	? `DESCRIPTION:${escapeIcsText(description)}`
																	: '',
																showUrl
																	? `URL:${escapeIcsText(showUrl)}`
																	: '',
																'END:VEVENT',
																'END:VCALENDAR',
															].filter(Boolean);

															const icsBlob = new Blob(
																[icsLines.join('\r\n')],
																{
																	type: 'text/calendar;charset=utf-8',
																}
															);
															const url =
																URL.createObjectURL(icsBlob);

															const filename =
																(eventTitle || 'episode')
																	.replace(/[^a-z0-9-_ ]/gi, '')
																	.trim() || 'episode';

															const link =
																document.createElement('a');
															link.href = url;
															link.download = `${filename}.ics`;
															link.click();
															URL.revokeObjectURL(url);
														};

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
																		{(showGoogleAdd ||
																			showAppleAdd) && (
																			<div className="flex flex-wrap items-center gap-2 text-[11px]">
																				{showGoogleAdd && (
																					<button
																						onClick={
																							handleGoogleCalendar
																						}
																						className="haptic-sm rounded-full border border-cyan-700/60 bg-cyan-900/30 px-2.5 py-1 font-semibold text-cyan-100 transition hover:border-cyan-400/80 hover:bg-cyan-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
																					>
																						Add to
																						Google
																					</button>
																				)}
																				{showAppleAdd && (
																					<button
																						onClick={
																							handleAppleCalendar
																						}
																						className="haptic-sm rounded-full border border-gray-700 bg-gray-800/70 px-2.5 py-1 font-semibold text-gray-100 transition hover:border-cyan-400/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
																					>
																						Apple / .ics
																					</button>
																				)}
																			</div>
																		)}
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
																href={showPath}
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
