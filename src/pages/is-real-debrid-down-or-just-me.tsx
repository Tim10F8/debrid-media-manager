import {
	getRealDebridObservabilityStatsFromDb,
	type RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import type { OperationStats } from '@/lib/observability/rdOperationalStats';
import type { LucideIcon } from 'lucide-react';
import { Activity, AlertTriangle, CheckCircle2, Clock, History } from 'lucide-react';
import type { GetServerSideProps, NextPage } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect, useState } from 'react';

// Dynamic imports with ssr: false to avoid Recharts SSR compatibility issues
const HistoryCharts = dynamic(
	() => import('@/components/observability/HistoryCharts').then((mod) => mod.HistoryCharts),
	{ ssr: false }
);
const ServerStatusBreakdown = dynamic(
	() =>
		import('@/components/observability/ServerStatusBreakdown').then(
			(mod) => mod.ServerStatusBreakdown
		),
	{ ssr: false }
);

// Use fixed locale to avoid hydration mismatches between server and client
const FIXED_LOCALE = 'en-US';

function formatNumber(value: number): string {
	return value.toLocaleString(FIXED_LOCALE);
}

function formatDateTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString(FIXED_LOCALE, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

type Props = {
	stats: RealDebridObservabilityStats;
};

type StatusState = 'idle' | 'up' | 'down';

function isRealDebridObservabilityPayload(value: unknown): value is RealDebridObservabilityStats {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (!Array.isArray(candidate.monitoredOperations)) {
		return false;
	}
	if (!candidate.monitoredOperations.every((entry) => typeof entry === 'string')) {
		return false;
	}
	if (typeof candidate.considered !== 'number') {
		return false;
	}
	if (typeof candidate.windowSize !== 'number') {
		return false;
	}
	if (!candidate.byOperation || typeof candidate.byOperation !== 'object') {
		return false;
	}
	return true;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ res }) => {
	res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
	res.setHeader('CDN-Cache-Control', 'no-store');
	res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');

	// Use DB-backed stats for cross-replica consistency
	const stats = await getRealDebridObservabilityStatsFromDb();
	return { props: { stats } };
};

const RealDebridStatusPage: NextPage<Props> & { disableLibraryProvider?: boolean } = ({
	stats: initialStats,
}) => {
	const [stats, setStats] = useState(initialStats);

	useEffect(() => {
		let cancelled = false;

		const loadFreshStats = async () => {
			try {
				const fetchImpl = globalThis.fetch;
				if (typeof fetchImpl !== 'function') {
					console.error('Fetch API unavailable for Real-Debrid stats refresh');
					return;
				}
				const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
				const params = new URLSearchParams({ _t: cacheBuster, verbose: 'true' });
				const origin =
					typeof window !== 'undefined' && window.location?.origin
						? window.location.origin
						: (process.env.DMM_ORIGIN ?? 'http://localhost:3000');
				const requestUrl = new URL('/api/observability/real-debrid', origin);
				requestUrl.search = params.toString();
				const response = await fetchImpl(requestUrl.toString(), {
					cache: 'no-store',
				});
				if (!response.ok) {
					console.error('Real-Debrid stats refresh failed with status', response.status);
					return;
				}
				const payload: unknown = await response.json();
				if (!isRealDebridObservabilityPayload(payload)) {
					console.error('Received invalid Real-Debrid stats payload', payload);
					return;
				}
				if (!cancelled) {
					setStats(payload);
				}
			} catch (error) {
				console.error('Failed to refresh Real-Debrid stats', error);
			}
		};

		loadFreshStats();

		return () => {
			cancelled = true;
		};
	}, []);

	const state: StatusState = !stats.considered ? 'idle' : stats.isDown ? 'down' : 'up';
	const successPct = Math.round(stats.successRate * 100);
	const lastUpdated = stats.lastTs ? new Date(stats.lastTs) : null;
	const lastUpdatedIso = lastUpdated ? lastUpdated.toISOString() : null;
	const operationStats = stats.monitoredOperations
		.map((operation) => stats.byOperation[operation])
		.filter((entry): entry is OperationStats => Boolean(entry));
	const trackingWindowLabel = formatNumber(stats.windowSize);
	const pageTitle = 'Is Real-Debrid Down Or Just Me?';
	const canonicalUrl = 'https://debridmediamanager.com/is-real-debrid-down-or-just-me';
	const monitoredSummary = 'Real-Debrid account and torrent management endpoints';
	const description = stats.considered
		? `Live Real-Debrid availability across account and torrent endpoints based on the last ${trackingWindowLabel} proxy responses.`
		: 'Live Real-Debrid availability dashboard covering account and torrent endpoints.';
	const structuredData: Record<string, unknown> = {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		name: pageTitle,
		description,
		url: canonicalUrl,
		isPartOf: {
			'@type': 'WebSite',
			name: 'Debrid Media Manager',
			url: 'https://debridmediamanager.com',
		},
		about: {
			'@type': 'Service',
			name: 'Real-Debrid',
			sameAs: 'https://real-debrid.com',
		},
	};
	if (lastUpdatedIso) {
		structuredData.dateModified = lastUpdatedIso;
	}

	const statusMeta: Record<
		StatusState,
		{
			label: string;
			description: string;
			badge: string;
			meter: string;
			icon: LucideIcon;
		}
	> = {
		idle: {
			label: 'Waiting for data',
			description:
				'Waiting for the first 2xx or 5xx response across the monitored Real-Debrid endpoints before we report availability.',
			badge: 'border border-slate-500/40 bg-slate-500/20 text-slate-200',
			meter: 'bg-slate-400',
			icon: Clock,
		},
		up: {
			label: 'All clear',
			description:
				'Latest proxy responses across the monitored Real-Debrid endpoints look healthy.',
			badge: 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-200',
			meter: 'bg-emerald-400',
			icon: CheckCircle2,
		},
		down: {
			label: 'Service disruption',
			description:
				'We are seeing sustained 5xx failures across the monitored Real-Debrid endpoints. Expect degraded service.',
			badge: 'border border-rose-500/50 bg-rose-500/20 text-rose-200',
			meter: 'bg-rose-500',
			icon: AlertTriangle,
		},
	};

	const statusTextClass: Record<StatusState, string> = {
		idle: 'text-slate-200',
		up: 'text-emerald-300',
		down: 'text-rose-300',
	};

	const StatusIcon = statusMeta[state].icon;
	const successCopy = stats.considered
		? successPct >= 90
			? 'Healthy response rate across the monitored endpoints.'
			: 'Elevated failure rate detected across the tracked operations.'
		: 'Collecting the first sample of Real-Debrid requests.';

	const summaryMetrics: Array<{
		label: string;
		value: string;
		helper: string;
		icon: LucideIcon;
	}> = [
		{
			label: 'Tracked Real-Debrid responses',
			value: formatNumber(stats.totalTracked),
			helper: `Last ${trackingWindowLabel} recorded calls across monitored endpoints.`,
			icon: History,
		},
		{
			label: 'Considered (2xx + 5xx)',
			value: formatNumber(stats.considered),
			helper: 'Responses counted toward the availability calculation.',
			icon: Activity,
		},
		{
			label: '2xx responses',
			value: formatNumber(stats.successCount),
			helper: 'Successful proxy calls to Real-Debrid.',
			icon: CheckCircle2,
		},
		{
			label: '5xx responses',
			value: formatNumber(stats.failureCount),
			helper: 'Upstream failures or proxy errors surfaced recently.',
			icon: AlertTriangle,
		},
	];

	const operationHealthMeta = (
		successRate: number,
		considered: number
	): { label: string; badge: string; meter: string } => {
		if (!considered) {
			return {
				label: 'Waiting on data',
				badge: 'border border-slate-500/40 bg-slate-500/10 text-slate-300',
				meter: 'bg-slate-400',
			};
		}
		if (successRate >= 0.9) {
			return {
				label: 'Healthy',
				badge: 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200',
				meter: 'bg-emerald-400',
			};
		}
		if (successRate >= 0.6) {
			return {
				label: 'Watchlist',
				badge: 'border border-amber-400/40 bg-amber-400/15 text-amber-200',
				meter: 'bg-amber-400',
			};
		}
		return {
			label: 'Failing',
			badge: 'border border-rose-500/50 bg-rose-500/20 text-rose-200',
			meter: 'bg-rose-500',
		};
	};

	const workingStream = stats.workingStream;
	const workingStreamPct = workingStream ? Math.round(workingStream.rate * 100) : null;
	const workingStreamHealth =
		workingStream && workingStream.lastChecked
			? operationHealthMeta(workingStream.rate, workingStream.total)
			: null;
	const workingStreamValue =
		workingStream && workingStream.lastChecked ? `${workingStreamPct}%` : '—';
	const workingStreamCounts = workingStream?.lastChecked
		? `${workingStream.working}/${workingStream.total}`
		: workingStream?.inProgress
			? 'Checking…'
			: '—';
	const workingStreamAvgLatency =
		workingStream?.avgLatencyMs != null ? Math.round(workingStream.avgLatencyMs) : null;
	const workingStreamFastest = workingStream?.fastestServer ?? null;
	const workingStreamHelper = workingStream
		? workingStream.lastError
			? workingStream.lastError
			: workingStream.lastChecked
				? workingStreamAvgLatency != null
					? `Avg latency: ${workingStreamAvgLatency}ms across ${workingStream.working} servers.`
					: 'Servers responding with HTTP 200 and Content-Length > 0.'
				: 'Testing 360 servers (1-120 on both RD domains)…'
		: 'Stream availability monitor unavailable.';
	const workingStreamLastCheckedLabel = workingStream?.lastChecked
		? formatDateTime(workingStream.lastChecked)
		: null;
	const workingStreamMeterWidth =
		workingStream && workingStream.lastChecked
			? `${Math.max(workingStreamPct ?? 0, 4)}%`
			: workingStream?.inProgress
				? '24%'
				: '10%';
	const workingStreamMeterClass = workingStream?.lastError
		? 'bg-rose-500'
		: (workingStreamHealth?.meter ?? 'bg-slate-500');
	const formattedLastUpdated = stats.lastTs ? formatDateTime(stats.lastTs) : null;
	const statusAsOfCopy = formattedLastUpdated ? `As of ${formattedLastUpdated}` : 'As of —';

	return (
		<>
			<Head>
				<title>{pageTitle}</title>
				<link rel="canonical" href={canonicalUrl} />
				<meta name="description" content={description} />
				<meta property="og:type" content="website" />
				<meta property="og:site_name" content="Debrid Media Manager" />
				<meta property="og:title" content={pageTitle} />
				<meta property="og:description" content={description} />
				<meta property="og:url" content={canonicalUrl} />
				{lastUpdatedIso ? (
					<meta property="og:updated_time" content={lastUpdatedIso} />
				) : null}
				<meta name="twitter:card" content="summary" />
				<meta name="twitter:title" content={pageTitle} />
				<meta name="twitter:description" content={description} />
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
				/>
			</Head>
			<main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
				<div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
					<header className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
						<div className="flex-1 space-y-4">
							<div className="flex flex-col gap-3">
								<h1 className="text-3xl font-semibold text-white md:text-4xl">
									Is Real-Debrid Down Or Just Me?
								</h1>
								<div className="md:hidden">
									<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
										Current status
									</p>
									<p
										data-testid="status-answer-mobile"
										className={`mt-2 text-3xl font-semibold ${statusTextClass[state]}`}
									>
										{statusMeta[state].label}
									</p>
								</div>
								<span
									className={`hidden items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider md:inline-flex ${statusMeta[state].badge}`}
								>
									<StatusIcon className="h-4 w-4" />
									{statusMeta[state].label}
								</span>
								<p
									className="text-xs text-slate-500"
									data-testid="status-freshness"
								>
									{statusAsOfCopy}
								</p>
								<p className="max-w-xl text-sm text-slate-300 md:text-base">
									We track the last {trackingWindowLabel} Real-Debrid proxy
									responses across {monitoredSummary}. Only 2xx and 5xx status
									codes count toward the availability score.
								</p>
								<p className="text-sm text-slate-400">
									{statusMeta[state].description}
								</p>
							</div>
							<div className="h-px w-full bg-slate-800/40 md:hidden" />
							<div className="flex max-w-xl flex-col gap-4">
								<div
									className="h-px w-full bg-slate-800/40"
									data-testid="dmm-marketing-separator"
								/>
								<p
									className="text-xs text-slate-400 md:text-sm"
									data-testid="dmm-marketing-copy"
								>
									Debrid Media Manager is a free, open source dashboard for
									Real-Debrid, AllDebrid, and TorBox. Visit{' '}
									<a
										className="font-semibold text-sky-300 hover:text-white"
										href="https://debridmediamanager.com/"
										rel="noreferrer noopener"
										target="_blank"
										data-testid="dmm-marketing-link"
									>
										debridmediamanager.com
									</a>{' '}
									to search, download, and manage your library.
								</p>
							</div>
						</div>
						<div className="grid w-full max-w-sm gap-4 md:pl-8">
							<div
								data-testid="success-rate-card"
								className="rounded-xl border border-white/15 bg-black/30 p-4"
							>
								<div className="text-xs font-medium uppercase tracking-wider text-slate-400">
									Success rate
								</div>
								<div className="mt-2 flex items-baseline gap-2">
									<span className="text-4xl font-semibold text-white">
										{stats.considered ? `${successPct}%` : '—'}
									</span>
									{stats.considered ? (
										<span className="text-sm text-slate-400">
											{stats.successCount}/{stats.considered}
										</span>
									) : (
										<span className="text-xs text-slate-500">
											Waiting on data
										</span>
									)}
								</div>
								<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
									<div
										className={`h-full rounded-full ${statusMeta[state].meter}`}
										style={{
											width: stats.considered ? `${successPct}%` : '12%',
										}}
									/>
								</div>
								<div className="mt-3 text-xs text-slate-400">{successCopy}</div>
							</div>
							<div
								data-testid="working-stream-card"
								className="rounded-xl border border-white/15 bg-black/30 p-4"
							>
								<div className="flex items-center justify-between">
									<div className="text-xs font-medium uppercase tracking-wider text-slate-400">
										Working Stream
									</div>
									{workingStreamHealth && !workingStream?.lastError ? (
										<span
											className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${workingStreamHealth.badge}`}
										>
											{workingStreamHealth.label}
										</span>
									) : null}
								</div>
								<div className="mt-2 flex items-baseline justify-between gap-2">
									<span className="text-3xl font-semibold text-white">
										{workingStreamValue}
									</span>
									<span className="text-xs text-slate-400">
										{workingStreamCounts}
									</span>
								</div>
								<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800/60">
									<div
										className={`h-full rounded-full ${workingStreamMeterClass}`}
										style={{ width: workingStreamMeterWidth }}
									/>
								</div>
								<div
									className={`mt-3 text-xs ${workingStream?.lastError ? 'text-rose-300' : 'text-slate-400'}`}
								>
									{workingStreamHelper}
								</div>
								{workingStreamFastest ? (
									<div className="mt-1 text-[11px] text-emerald-400/80">
										Fastest: {workingStreamFastest}
									</div>
								) : null}
								{workingStreamLastCheckedLabel ? (
									<div className="mt-1 text-[11px] text-slate-500">
										Last check {workingStreamLastCheckedLabel}
									</div>
								) : null}
							</div>
						</div>
					</header>

					<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{summaryMetrics.map(({ label, value, helper, icon: Icon }) => (
							<div
								key={label}
								className="rounded-xl border border-white/10 bg-black/20 p-4"
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-slate-200">
										{label}
									</span>
									<Icon className="h-5 w-5 text-slate-500" />
								</div>
								<div className="mt-2 text-2xl font-semibold text-white">
									{value}
								</div>
								<div className="mt-2 text-xs text-slate-400">{helper}</div>
							</div>
						))}
					</section>

					<section className="space-y-6 rounded-xl border border-white/10 bg-black/25 p-5">
						<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
							<div>
								<h2 className="text-lg font-semibold text-white">
									Operation breakdown
								</h2>
								<p className="text-xs text-slate-400">
									{stats.monitoredOperations.length} endpoints monitored via this
									proxy instance.
								</p>
							</div>
							<div className="text-xs text-slate-400">
								Success rate thresholds · Healthy ≥ 90% · Watchlist ≥ 60%
							</div>
						</div>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{operationStats.map((operationStat) => {
								const successRatePct = operationStat.considered
									? Math.round(operationStat.successRate * 100)
									: null;
								const health = operationHealthMeta(
									operationStat.successRate,
									operationStat.considered
								);
								return (
									<div
										key={operationStat.operation}
										className="rounded-2xl border border-white/10 bg-black/40 p-5"
									>
										<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
											<div>
												<p className="text-xs font-medium uppercase tracking-wide text-slate-500">
													Operation
												</p>
												<h3 className="mt-1 break-words text-sm font-semibold text-white">
													{operationStat.operation}
												</h3>
											</div>
											<span
												className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${health.badge}`}
											>
												{health.label}
											</span>
										</div>
										<div className="mt-4 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
											<span className="text-slate-300">
												{successRatePct !== null
													? `${successRatePct}% success`
													: 'No samples yet'}
											</span>
											<span className="text-slate-400">
												{successRatePct !== null
													? `${formatNumber(operationStat.successCount)} / ${formatNumber(operationStat.considered)} (2xx)`
													: `${formatNumber(operationStat.totalTracked)} tracked`}
											</span>
										</div>
										<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
											<div
												className={`h-full rounded-full ${health.meter}`}
												style={{
													width:
														successRatePct !== null
															? `${successRatePct}%`
															: '12%',
												}}
											/>
										</div>
										<div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
											<span>
												2xx: {formatNumber(operationStat.successCount)}
											</span>
											<span>
												5xx: {formatNumber(operationStat.failureCount)}
											</span>
											<span>
												Total tracked:{' '}
												{formatNumber(operationStat.totalTracked)}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</section>

					<HistoryCharts />

					<ServerStatusBreakdown />

					<section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
						<div className="flex items-center gap-2 text-slate-200">
							<Clock className="h-4 w-4 text-slate-400" />
							<span>
								{stats.lastTs
									? `Last event captured ${formatDateTime(stats.lastTs)}`
									: 'No events captured yet'}
							</span>
						</div>
						<div className="text-xs text-slate-400">
							Sliding window scoped to the most recent {trackingWindowLabel} tracked
							Real-Debrid requests handled by this pod.
						</div>
					</section>
				</div>
			</main>
		</>
	);
};

RealDebridStatusPage.disableLibraryProvider = true;

export default RealDebridStatusPage;
