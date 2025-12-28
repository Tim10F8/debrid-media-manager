import { useConnectivity } from '@/hooks/useConnectivity';
import type { RealDebridObservabilityStats } from '@/lib/observability/getRealDebridObservabilityStats';
import type { LucideIcon } from 'lucide-react';
import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Clock,
	DownloadCloud,
	Link2,
	List,
	Loader2,
	RefreshCw,
	Wifi,
	WifiOff,
} from 'lucide-react';
import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useEffect, useState } from 'react';

// Dynamic imports with ssr: false to avoid Recharts SSR compatibility issues
const HistoryCharts = dynamic(
	() => import('@/components/observability/HistoryCharts').then((mod) => mod.HistoryCharts),
	{ ssr: false }
);

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
		second: '2-digit',
	});
}

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

const RealDebridStatusPage: NextPage & { disableLibraryProvider?: boolean } = () => {
	const [stats, setStats] = useState<RealDebridObservabilityStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [lastChecked, setLastChecked] = useState<number>(Date.now());
	const isOnline = useConnectivity();

	const loadStats = async () => {
		try {
			const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const params = new URLSearchParams({ _t: cacheBuster, verbose: 'true' });
			const origin = window.location.origin;
			const requestUrl = new URL('/api/observability/real-debrid', origin);
			requestUrl.search = params.toString();
			const response = await fetch(requestUrl.toString(), {
				cache: 'no-store',
			});
			if (!response.ok) {
				console.error('Real-Debrid stats fetch failed with status', response.status);
				return;
			}
			const payload: unknown = await response.json();
			if (!isRealDebridObservabilityPayload(payload)) {
				console.error('Received invalid Real-Debrid stats payload', payload);
				return;
			}
			setStats(payload);
			setLastChecked(Date.now());
		} catch (error) {
			console.error('Failed to fetch Real-Debrid stats', error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadStats();
		const interval = setInterval(loadStats, 60000); // Auto-refresh every 60s
		return () => clearInterval(interval);
	}, []);

	const pageTitle = 'Is Real-Debrid Down Or Just Me?';
	const canonicalUrl = 'https://debridmediamanager.com/is-real-debrid-down-or-just-me';
	const defaultDescription =
		'Live Real-Debrid availability dashboard covering account, torrent, and unrestrict endpoints.';

	// Loading State
	if (loading || !stats) {
		return (
			<>
				<Head>
					<title>{pageTitle}</title>
					<link rel="canonical" href={canonicalUrl} />
					<meta name="description" content={defaultDescription} />
				</Head>
				<main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
					<div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-4 py-32">
						<Loader2 className="h-8 w-8 animate-spin text-slate-400" />
						<p className="text-slate-400">Checking Real-Debrid status...</p>
					</div>
				</main>
			</>
		);
	}

	const state: StatusState = !stats.considered ? 'idle' : stats.isDown ? 'down' : 'up';
	const successPct = Math.round(stats.successRate * 100);
	const lastUpdated = stats.lastTs ? new Date(stats.lastTs) : null;
	const lastUpdatedIso = lastUpdated ? lastUpdated.toISOString() : null;
	const trackingWindowLabel = formatNumber(stats.windowSize);

	const statusMeta: Record<
		StatusState,
		{
			label: string;
			description: string;
			colorClass: string;
			bgColorClass: string;
			borderColorClass: string;
			icon: LucideIcon;
		}
	> = {
		idle: {
			label: 'Waiting for data',
			description: 'Collecting initial samples...',
			colorClass: 'text-slate-400',
			bgColorClass: 'bg-slate-500/10',
			borderColorClass: 'border-slate-500/20',
			icon: Clock,
		},
		up: {
			label: 'Real-Debrid is Operational',
			description: 'All systems operational',
			colorClass: 'text-emerald-400',
			bgColorClass: 'bg-emerald-500/10',
			borderColorClass: 'border-emerald-500/20',
			icon: CheckCircle2,
		},
		down: {
			label: 'Real-Debrid is Down',
			description: 'Major outage detected',
			colorClass: 'text-rose-500',
			bgColorClass: 'bg-rose-500/10',
			borderColorClass: 'border-rose-500/20',
			icon: AlertTriangle,
		},
	};

	const currentStatus = statusMeta[state];
	const StatusIcon = currentStatus.icon;

	const summaryMetrics: Array<{
		label: string;
		value: string;
		helper: string;
		icon: LucideIcon;
		color?: string;
	}> = [
		{
			label: 'API Success Rate',
			value: stats.considered ? `${successPct}%` : '—',
			helper: `${formatNumber(stats.successCount)}/${formatNumber(stats.considered)} requests`,
			icon: Activity,
			color:
				successPct >= 90
					? 'text-emerald-400'
					: successPct >= 60
						? 'text-amber-400'
						: 'text-rose-500',
		},
		{
			label: 'Unrestrict',
			value: stats.byOperation['POST /unrestrict/link']?.considered
				? `${Math.round(stats.byOperation['POST /unrestrict/link'].successRate * 100)}%`
				: '—',
			helper: 'Link generation',
			icon: Link2,
		},
		{
			label: 'Torrents',
			value: stats.byOperation['GET /torrents']?.considered
				? `${Math.round(stats.byOperation['GET /torrents'].successRate * 100)}%`
				: '—',
			helper: 'List retrieval',
			icon: List,
		},
		{
			label: 'Add Magnet',
			value: stats.byOperation['POST /torrents/addMagnet']?.considered
				? `${Math.round(stats.byOperation['POST /torrents/addMagnet'].successRate * 100)}%`
				: '—',
			helper: 'Submission',
			icon: DownloadCloud,
		},
	];

	// Stream Health Logic
	const workingStream = stats.workingStream;
	const workingStreamPct = workingStream ? Math.round(workingStream.rate * 100) : null;
	const workingStreamColor = !workingStream
		? 'text-slate-400'
		: workingStream.rate >= 0.9
			? 'text-emerald-400'
			: workingStream.rate >= 0.6
				? 'text-amber-400'
				: 'text-rose-500';

	return (
		<>
			<Head>
				<title>{pageTitle}</title>
				<link rel="canonical" href={canonicalUrl} />
				<meta name="description" content={defaultDescription} />
				{lastUpdatedIso && <meta property="og:updated_time" content={lastUpdatedIso} />}
			</Head>

			<main className="min-h-screen bg-slate-950 text-slate-100">
				{/* Connectivity Banner */}
				{!isOnline && (
					<div className="bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-amber-500">
						<div className="mx-auto flex max-w-5xl items-center justify-center gap-2">
							<WifiOff className="h-4 w-4" />
							<span>You are offline. This status might not be up to date.</span>
						</div>
					</div>
				)}

				<div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
					{/* Header / Hero */}
					<header className="flex flex-col items-center gap-6 py-8 text-center">
						<div
							className={`flex items-center gap-3 rounded-full border px-6 py-2 ${currentStatus.bgColorClass} ${currentStatus.borderColorClass}`}
						>
							<div className={`relative flex h-3 w-3`}>
								<span
									className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${state === 'up' ? 'bg-emerald-400' : state === 'down' ? 'bg-rose-500' : 'bg-slate-400'}`}
								></span>
								<span
									className={`relative inline-flex h-3 w-3 rounded-full ${state === 'up' ? 'bg-emerald-500' : state === 'down' ? 'bg-rose-600' : 'bg-slate-500'}`}
								></span>
							</div>
							<span className={`font-semibold ${currentStatus.colorClass}`}>
								<span data-testid="status-answer-mobile">
									{state === 'up'
										? 'Operational'
										: state === 'down'
											? 'Major Outage'
											: ' collecting data'}
								</span>
							</span>
						</div>

						<h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
							{currentStatus.label}
						</h1>

						<p className="max-w-2xl text-lg text-slate-400">
							Live monitoring of Real-Debrid services based on the last{' '}
							<span className="font-medium text-slate-200">
								{trackingWindowLabel}
							</span>{' '}
							requests.
						</p>

						<div className="flex items-center gap-4 text-xs font-medium text-slate-500">
							<div className="flex items-center gap-1.5">
								<Clock className="h-3.5 w-3.5" />
								<span data-testid="status-freshness">
									Last updated: {formatDateTime(lastChecked)}
								</span>
							</div>
							<button
								onClick={() => loadStats()}
								className="flex items-center gap-1.5 transition-colors hover:text-slate-300"
								title="Refresh status"
							>
								<RefreshCw className="h-3.5 w-3.5" />
								<span>Refresh</span>
							</button>
						</div>

						<div className="mt-4 flex max-w-xl flex-col gap-4">
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
					</header>

					{/* Primary Metrics Grid */}
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{summaryMetrics.map((metric) => (
							<div
								key={metric.label}
								data-testid={
									metric.label === 'API Success Rate'
										? 'success-rate-card'
										: undefined
								}
								className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20 hover:bg-white/10"
							>
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium text-slate-400">
										{metric.label}
									</p>
									<metric.icon className="h-5 w-5 text-slate-500 opacity-50 transition-opacity group-hover:opacity-100" />
								</div>
								<div className="mt-2 flex items-baseline gap-2">
									<span
										className={`text-2xl font-bold ${metric.color || 'text-slate-200'}`}
									>
										{metric.value}
									</span>
								</div>
								<p className="mt-1 text-xs text-slate-500">{metric.helper}</p>
							</div>
						))}
					</div>

					{/* Stream Health & Info */}
					<div className="grid gap-6 lg:grid-cols-3">
						<div
							data-testid="working-stream-card"
							className="rounded-xl border border-white/10 bg-white/5 p-6 lg:col-span-1"
						>
							<h3 className="flex items-center gap-2 text-sm font-medium text-slate-300">
								<Wifi className="h-4 w-4" />
								Working Stream
							</h3>{' '}
							<div className="mt-4">
								<div className="flex items-baseline gap-2">
									<span className={`text-3xl font-bold ${workingStreamColor}`}>
										{workingStreamPct !== null ? `${workingStreamPct}%` : '—'}
									</span>
									<span className="text-sm text-slate-500">
										servers operational
									</span>
								</div>
								<div className="mt-4 space-y-2 text-sm text-slate-400">
									<div className="flex justify-between">
										<span>Working</span>
										<span className="text-slate-200">
											{workingStream?.working ?? 0}
										</span>
									</div>
									<div className="flex justify-between">
										<span>Total Scanned</span>
										<span className="text-slate-200">
											{workingStream?.total ?? 0}
										</span>
									</div>
									{workingStream?.avgLatencyMs && (
										<div className="flex justify-between">
											<span>Avg Latency</span>
											<span className="text-slate-200">
												{Math.round(workingStream.avgLatencyMs)}ms
											</span>
										</div>
									)}
								</div>
							</div>
						</div>

						<div className="rounded-xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
							<div className="flex h-full flex-col justify-center gap-4">
								<div>
									<h3 className="text-lg font-medium text-white">
										About this data
									</h3>
									<p className="mt-2 text-sm text-slate-400">
										This dashboard aggregates data from the Debrid Media Manager
										community. It tracks success rates for API calls and direct
										stream checks to Real-Debrid servers.
									</p>
								</div>

								<div className="flex flex-col gap-2 rounded-lg bg-black/20 p-4 text-sm">
									<div className="flex items-center gap-2 text-slate-300">
										<span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
										<span>
											<strong>Is it just you?</strong> Check your internet
											connection first.
										</span>
									</div>
									<p className="pl-4 text-xs text-slate-500">
										If Real-Debrid is down for everyone, you will see the
										failure rates spike here. If this page says
										&quot;Operational&quot; but you can&apos;t connect, the
										issue might be your ISP or local network.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* Charts */}
					<HistoryCharts />

					{/* Footer */}
					<footer className="mt-8 border-t border-white/10 pt-8 text-center">
						<p className="text-sm text-slate-500">
							Debrid Media Manager is an open-source project.
							<a
								href="https://debridmediamanager.com"
								className="ml-1 text-emerald-400 hover:underline"
							>
								Visit Homepage
							</a>
						</p>
					</footer>
				</div>
			</main>
		</>
	);
};

RealDebridStatusPage.disableLibraryProvider = true;

export default RealDebridStatusPage;
