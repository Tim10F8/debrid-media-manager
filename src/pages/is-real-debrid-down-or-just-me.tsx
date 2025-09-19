import type { LucideIcon } from 'lucide-react';
import { Activity, AlertTriangle, CheckCircle2, Clock, History } from 'lucide-react';
import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';

import { getStats, type OperationStats } from '@/lib/observability/rdOperationalStats';

type Props = {
	stats: ReturnType<typeof getStats>;
};

type StatusState = 'idle' | 'up' | 'down';

export const getServerSideProps: GetServerSideProps<Props> = async () => {
	const stats = getStats();
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
				const response = await fetch('/api/observability/real-debrid', {
					cache: 'no-store',
				});
				if (!response.ok) {
					return;
				}
				const payload: Props['stats'] = await response.json();
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
	const trackingWindowLabel = stats.windowSize.toLocaleString();
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
			value: stats.totalTracked.toLocaleString(),
			helper: `Last ${trackingWindowLabel} recorded calls across monitored endpoints.`,
			icon: History,
		},
		{
			label: 'Considered (2xx + 5xx)',
			value: stats.considered.toLocaleString(),
			helper: 'Responses counted toward the availability calculation.',
			icon: Activity,
		},
		{
			label: '2xx responses',
			value: stats.successCount.toLocaleString(),
			helper: 'Successful proxy calls to Real-Debrid.',
			icon: CheckCircle2,
		},
		{
			label: '5xx responses',
			value: stats.failureCount.toLocaleString(),
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
			<div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
					<div className="absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
					<div className="absolute inset-x-0 bottom-[-240px] mx-auto h-96 w-[600px] rounded-full bg-purple-500/10 blur-3xl" />
				</div>
				<main className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
					<section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_60px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
						<div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
							<div>
								<span
									className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${statusMeta[state].badge}`}
								>
									<StatusIcon className="h-4 w-4" />
									{statusMeta[state].label}
								</span>
								<h1 className="mt-5 text-3xl font-semibold text-white md:text-4xl">
									Is Real-Debrid Down Or Just Me?
								</h1>
								<p className="mt-3 max-w-xl text-sm text-slate-300 md:text-base">
									We track the last {trackingWindowLabel} Real-Debrid proxy
									responses across {monitoredSummary}. Only 2xx and 5xx status
									codes count toward the availability score.
								</p>
								<p className="mt-4 text-sm text-slate-400">
									{statusMeta[state].description}
								</p>
							</div>
							<div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/40 p-5 shadow-inner">
								<div className="text-xs font-medium uppercase tracking-wider text-slate-400">
									Success rate
								</div>
								<div className="mt-3 flex items-baseline gap-2">
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
								<div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
									<div
										className={`h-full rounded-full ${statusMeta[state].meter}`}
										style={{
											width: stats.considered ? `${successPct}%` : '10%',
										}}
									/>
								</div>
								<div className="mt-3 text-xs text-slate-400">{successCopy}</div>
							</div>
						</div>

						<div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
							{summaryMetrics.map(({ label, value, helper, icon: Icon }) => (
								<div
									key={label}
									className="group rounded-2xl border border-white/10 bg-black/40 p-5 transition hover:border-white/25 hover:shadow-lg"
								>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium text-slate-300">
											{label}
										</span>
										<Icon className="h-5 w-5 text-slate-500 transition group-hover:text-white" />
									</div>
									<div className="mt-3 text-2xl font-semibold text-white">
										{value}
									</div>
									<div className="mt-2 text-xs text-slate-400">{helper}</div>
								</div>
							))}
						</div>

						<div className="mt-12 rounded-2xl border border-white/5 bg-white/5 p-6">
							<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
								<div>
									<h2 className="text-lg font-semibold text-white">
										Operation breakdown
									</h2>
									<p className="mt-1 text-xs text-slate-400">
										{stats.monitoredOperations.length} endpoints monitored via
										this proxy instance.
									</p>
								</div>
								<div className="text-xs text-slate-400">
									Success rate thresholds · Healthy ≥ 90% · Watchlist ≥ 60%
								</div>
							</div>

							<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
											<div className="flex items-start justify-between">
												<div>
													<p className="text-xs font-medium uppercase tracking-wide text-slate-500">
														Operation
													</p>
													<h3 className="mt-1 text-sm font-semibold text-white">
														{operationStat.operation}
													</h3>
												</div>
												<span
													className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${health.badge}`}
												>
													{health.label}
												</span>
											</div>
											<div className="mt-4 flex items-center justify-between text-xs text-slate-400">
												<span>
													{successRatePct !== null
														? `${successRatePct}% success`
														: 'No samples yet'}
												</span>
												{successRatePct !== null ? (
													<span>
														{operationStat.successCount.toLocaleString()}{' '}
														/{' '}
														{operationStat.considered.toLocaleString()}{' '}
														(2xx)
													</span>
												) : (
													<span>
														{operationStat.totalTracked.toLocaleString()}{' '}
														tracked
													</span>
												)}
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
											<div className="mt-3 text-xs text-slate-400">
												2xx: {operationStat.successCount.toLocaleString()} ·
												5xx: {operationStat.failureCount.toLocaleString()} ·
												Total tracked:{' '}
												{operationStat.totalTracked.toLocaleString()}
											</div>
										</div>
									);
								})}
							</div>
						</div>

						<div className="mt-10 flex flex-col gap-4 rounded-2xl border border-white/5 bg-white/5 p-5 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-slate-400" />
								<span>
									{lastUpdated
										? `Last event captured ${lastUpdated.toLocaleString(
												undefined,
												{
													month: 'short',
													day: 'numeric',
													hour: '2-digit',
													minute: '2-digit',
												}
											)}`
										: 'No events captured yet'}
								</span>
							</div>
							<div className="text-xs text-slate-400">
								Sliding window scoped to the most recent {trackingWindowLabel}{' '}
								tracked Real-Debrid requests handled by this pod.
							</div>
						</div>
					</section>
				</main>
			</div>
		</>
	);
};

RealDebridStatusPage.disableLibraryProvider = true;

export default RealDebridStatusPage;
