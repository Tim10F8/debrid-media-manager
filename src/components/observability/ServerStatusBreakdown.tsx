import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	Server,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type {
	StreamServersResponse,
	StreamServerStatusResponse,
} from '@/pages/api/observability/stream-servers';

const FIXED_LOCALE = 'en-US';

function formatDateTime(dateStr: string): string {
	return new Date(dateStr).toLocaleString(FIXED_LOCALE, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatLatency(latencyMs: number | null): string {
	if (latencyMs === null) return '—';
	return `${Math.round(latencyMs)}ms`;
}

interface ServerListProps {
	servers: StreamServerStatusResponse[];
	type: 'working' | 'failed';
}

function ServerList({ servers, type }: ServerListProps) {
	if (servers.length === 0) {
		return (
			<div className="py-4 text-center text-sm text-slate-500">
				No {type === 'working' ? 'working' : 'failed'} servers
			</div>
		);
	}

	return (
		<div className="max-h-80 overflow-y-auto">
			<table className="w-full text-left text-xs">
				<thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
					<tr className="border-b border-slate-700 text-slate-400">
						<th className="pb-2 pr-2 font-medium">Server</th>
						{type === 'working' ? (
							<th className="pb-2 pr-2 text-right font-medium">Latency</th>
						) : (
							<th className="pb-2 pr-2 text-right font-medium">Error</th>
						)}
						<th className="pb-2 text-right font-medium">Status</th>
					</tr>
				</thead>
				<tbody>
					{servers.map((server) => (
						<tr
							key={server.host}
							className="border-b border-slate-800/50 text-slate-300"
						>
							<td className="py-1.5 pr-2 font-mono text-[11px]">{server.host}</td>
							{type === 'working' ? (
								<td className="py-1.5 pr-2 text-right text-emerald-400">
									{formatLatency(server.latencyMs)}
								</td>
							) : (
								<td
									className="max-w-[150px] truncate py-1.5 pr-2 text-right text-rose-400"
									title={server.error ?? undefined}
								>
									{server.error || 'Unknown error'}
								</td>
							)}
							<td className="py-1.5 text-right text-slate-500">
								{server.status ? `HTTP ${server.status}` : '—'}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

interface ExpandableSectionProps {
	title: string;
	count: number;
	type: 'working' | 'failed';
	children: React.ReactNode;
	defaultExpanded?: boolean;
}

function ExpandableSection({
	title,
	count,
	type,
	children,
	defaultExpanded = false,
}: ExpandableSectionProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	const Icon = type === 'working' ? CheckCircle2 : AlertTriangle;
	const iconColor = type === 'working' ? 'text-emerald-400' : 'text-rose-400';
	const countColor = type === 'working' ? 'text-emerald-400' : 'text-rose-400';
	const borderColor = type === 'working' ? 'border-emerald-500/20' : 'border-rose-500/20';
	const bgColor = type === 'working' ? 'bg-emerald-500/5' : 'bg-rose-500/5';

	return (
		<div className={`rounded-lg border ${borderColor} ${bgColor}`}>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-white/5"
			>
				<div className="flex items-center gap-2">
					<Icon className={`h-4 w-4 ${iconColor}`} />
					<span className="text-sm font-medium text-slate-200">{title}</span>
					<span className={`text-sm font-semibold ${countColor}`}>({count})</span>
				</div>
				<div className="flex items-center gap-2 text-slate-400">
					{isExpanded ? (
						<ChevronDown className="h-4 w-4" />
					) : (
						<ChevronRight className="h-4 w-4" />
					)}
				</div>
			</button>
			{isExpanded && <div className="border-t border-white/5 px-3 pb-3">{children}</div>}
		</div>
	);
}

export function ServerStatusBreakdown() {
	const [data, setData] = useState<StreamServersResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const origin =
				typeof window !== 'undefined' && window.location?.origin
					? window.location.origin
					: 'http://localhost:3000';

			const response = await fetch(`${origin}/api/observability/stream-servers`);

			if (!response.ok) {
				throw new Error('Failed to fetch server statuses');
			}

			const json = (await response.json()) as StreamServersResponse;
			setData(json);
		} catch (err) {
			console.error('Failed to fetch server statuses:', err);
			setError(err instanceof Error ? err.message : 'Failed to load server statuses');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	if (loading) {
		return (
			<section className="space-y-4 rounded-xl border border-white/10 bg-black/25 p-5">
				<div className="flex items-center gap-3">
					<Server className="h-5 w-5 text-slate-400" />
					<h2 className="text-lg font-semibold text-white">Stream Server Breakdown</h2>
				</div>
				<div className="flex h-32 items-center justify-center">
					<div className="flex items-center gap-2 text-slate-400">
						<Clock className="h-5 w-5 animate-pulse" />
						<span>Loading server statuses...</span>
					</div>
				</div>
			</section>
		);
	}

	if (error || !data) {
		return (
			<section className="space-y-4 rounded-xl border border-white/10 bg-black/25 p-5">
				<div className="flex items-center gap-3">
					<Server className="h-5 w-5 text-slate-400" />
					<h2 className="text-lg font-semibold text-white">Stream Server Breakdown</h2>
				</div>
				<div className="flex h-32 items-center justify-center">
					<div className="text-center text-slate-400">
						<p>Unable to load server statuses</p>
						<p className="mt-1 text-xs text-slate-500">{error}</p>
						<button
							onClick={fetchData}
							className="mt-3 rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
						>
							Retry
						</button>
					</div>
				</div>
			</section>
		);
	}

	if (data.total === 0) {
		return (
			<section className="space-y-4 rounded-xl border border-white/10 bg-black/25 p-5">
				<div className="flex items-center gap-3">
					<Server className="h-5 w-5 text-slate-400" />
					<h2 className="text-lg font-semibold text-white">Stream Server Breakdown</h2>
				</div>
				<div className="flex h-32 items-center justify-center">
					<div className="text-center text-slate-400">
						<Server className="mx-auto h-10 w-10 text-slate-600" />
						<p className="mt-3">No server data available yet</p>
						<p className="mt-1 text-xs text-slate-500">
							Server health data will appear after the first check completes
						</p>
					</div>
				</div>
			</section>
		);
	}

	const workingPct = Math.round((data.working / data.total) * 100);

	return (
		<section className="space-y-4 rounded-xl border border-white/10 bg-black/25 p-5">
			<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-3">
					<Server className="h-5 w-5 text-slate-400" />
					<div>
						<h2 className="text-lg font-semibold text-white">
							Stream Server Breakdown
						</h2>
						<p className="text-xs text-slate-400">
							{data.working} working, {data.failed} failed of {data.total} servers (
							{workingPct}% healthy)
						</p>
					</div>
				</div>
				{data.lastChecked && (
					<div className="text-xs text-slate-500">
						Last check: {formatDateTime(data.lastChecked)}
					</div>
				)}
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<ExpandableSection
					title="Working Servers"
					count={data.working}
					type="working"
					defaultExpanded={false}
				>
					<ServerList servers={data.workingServers} type="working" />
				</ExpandableSection>

				<ExpandableSection
					title="Failed Servers"
					count={data.failed}
					type="failed"
					defaultExpanded={false}
				>
					<ServerList servers={data.failedServers} type="failed" />
				</ExpandableSection>
			</div>
		</section>
	);
}
