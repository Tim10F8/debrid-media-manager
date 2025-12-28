import { BarChart3, Clock, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

type HistoryRange = '24h' | '7d' | '30d' | '90d';

interface RdRawData {
	timestamp: string;
	operation: string;
	status: number;
	success: boolean;
}

interface RdHourlyData {
	hour: string;
	operation: string;
	totalCount: number;
	successCount: number;
	failureCount: number;
	successRate: number;
}

interface RdDailyData {
	date: string;
	operation: string;
	totalCount: number;
	successCount: number;
	failureCount: number;
	avgSuccessRate: number;
	minSuccessRate: number;
	maxSuccessRate: number;
}

interface StreamHourlyData {
	hour: string;
	totalServers: number;
	workingServers: number;
	workingRate: number;
	avgLatencyMs: number | null;
}

interface StreamDailyData {
	date: string;
	avgWorkingRate: number;
	minWorkingRate: number;
	maxWorkingRate: number;
	avgLatencyMs: number | null;
	checksCount: number;
}

interface HistoryResponse<T> {
	type: string;
	granularity?: string;
	range: string;
	data: T[];
}

const FIXED_LOCALE = 'en-US';

// Ensure UTC timestamps are parsed correctly (append Z if missing timezone)
function parseUtcDate(dateStr: string): Date {
	// If already has timezone info (Z or +/-), parse as-is
	if (/[Z+-]\d{0,4}$/.test(dateStr)) {
		return new Date(dateStr);
	}
	// Otherwise treat as UTC by appending Z
	return new Date(dateStr + 'Z');
}

function formatShortDate(dateStr: string): string {
	const date = parseUtcDate(dateStr);
	return date.toLocaleDateString(FIXED_LOCALE, {
		month: 'short',
		day: 'numeric',
	});
}

function formatShortTime(dateStr: string): string {
	const date = parseUtcDate(dateStr);
	return date.toLocaleTimeString(FIXED_LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

function formatTimeWithSeconds(dateStr: string): string {
	const date = parseUtcDate(dateStr);
	return date.toLocaleTimeString(FIXED_LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

export function HistoryCharts() {
	const [range, setRange] = useState<HistoryRange>('24h');
	const [rdData, setRdData] = useState<(RdRawData | RdHourlyData | RdDailyData)[]>([]);
	const [streamData, setStreamData] = useState<(StreamHourlyData | StreamDailyData)[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [granularity, setGranularity] = useState<'raw' | 'hourly' | 'daily'>('hourly');

	const fetchHistory = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const origin =
				typeof window !== 'undefined' && window.location?.origin
					? window.location.origin
					: 'http://localhost:3000';

			const [rdResponse, streamResponse] = await Promise.all([
				fetch(`${origin}/api/observability/history?type=rd&range=${range}`),
				fetch(`${origin}/api/observability/history?type=stream&range=${range}`),
			]);

			if (!rdResponse.ok || !streamResponse.ok) {
				throw new Error('Failed to fetch history data');
			}

			const rdJson = (await rdResponse.json()) as HistoryResponse<
				RdRawData | RdHourlyData | RdDailyData
			>;
			const streamJson = (await streamResponse.json()) as HistoryResponse<
				StreamHourlyData | StreamDailyData
			>;

			setRdData(rdJson.data ?? []);
			setStreamData(streamJson.data ?? []);
			setGranularity((rdJson.granularity as 'raw' | 'hourly' | 'daily') ?? 'hourly');
		} catch (err) {
			console.error('Failed to fetch history:', err);
			setError(err instanceof Error ? err.message : 'Failed to load history');
		} finally {
			setLoading(false);
		}
	}, [range]);

	useEffect(() => {
		fetchHistory();
	}, [fetchHistory]);

	// Aggregate RD data for the chart (combine all operations)
	const aggregatedRdData = (rdData ?? []).reduce(
		(acc, item) => {
			let key: string;
			let successRate: number;
			let totalCount = 1;
			let successCount = 0;
			let failureCount = 0;

			if ('timestamp' in item) {
				key = item.timestamp;
				successRate = item.success ? 1 : 0;
				successCount = item.success ? 1 : 0;
				failureCount = item.success ? 0 : 1;
			} else if ('hour' in item) {
				key = item.hour;
				successRate = item.successRate;
				totalCount = item.totalCount;
				successCount = item.successCount;
				failureCount = item.failureCount;
			} else {
				key = item.date;
				successRate = 'avgSuccessRate' in item ? item.avgSuccessRate : 0;
				totalCount = item.totalCount;
				successCount = item.successCount;
				failureCount = item.failureCount;
			}

			if (!acc[key]) {
				acc[key] = {
					time: key,
					successRate: 0,
					totalCount: 0,
					successCount: 0,
					failureCount: 0,
					operationCount: 0,
				};
			}

			if ('timestamp' in item) {
				// For raw data, we average the success rates if they happen at the exact same timestamp
				// But more importantly, we just want to accumulate the counts
				acc[key].totalCount += totalCount;
				acc[key].successCount += successCount;
				acc[key].failureCount += failureCount;
				// For raw, successRate is 0 or 1.
				// We sum them up and divide by count later?
				// Actually, `successRate` in acc is sum of rates.
				acc[key].successRate += successRate;
			} else {
				// For aggregated data
				acc[key].totalCount += totalCount;
				acc[key].successCount += successCount;
				acc[key].failureCount += failureCount;
				acc[key].successRate += successRate;
			}

			acc[key].operationCount += 1;
			return acc;
		},
		{} as Record<
			string,
			{
				time: string;
				successRate: number;
				totalCount: number;
				successCount: number;
				failureCount: number;
				operationCount: number;
			}
		>
	);

	const rdChartData = Object.values(aggregatedRdData)
		.map((item) => {
			// Determine format based on granularity
			// If granularity is raw, we might have many points.
			// But we also want to support 'hourly'/'daily' formatting correctly.
			let label: string;
			// Detect type by checking if the time string looks like a date or time,
			// or just rely on the granularity state (or range).
			if (granularity === 'raw') {
				label = formatTimeWithSeconds(item.time);
			} else if (granularity === 'hourly') {
				label = formatShortTime(item.time);
			} else {
				label = formatShortDate(item.time);
			}

			return {
				time: item.time,
				// For raw: successRate sum / operationCount.
				// For hourly: successRate sum / operationCount (avg of rates).
				successRate: item.operationCount > 0 ? item.successRate / item.operationCount : 0,
				totalCount: item.totalCount,
				label,
			};
		})
		.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

	// Format stream data for chart
	const streamChartData = (streamData ?? [])
		.map((item) => {
			const isHourly = 'hour' in item;
			const time = isHourly ? item.hour : item.date;
			const label = isHourly ? formatShortTime(time) : formatShortDate(time);

			return {
				time,
				workingRate: 'avgWorkingRate' in item ? item.avgWorkingRate : item.workingRate,
				avgLatencyMs: item.avgLatencyMs,
				label,
			};
		})
		.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

	const rangeOptions: { value: HistoryRange; label: string }[] = [
		{ value: '24h', label: '24 Hours' },
		{ value: '7d', label: '7 Days' },
		{ value: '30d', label: '30 Days' },
		{ value: '90d', label: '90 Days' },
	];

	const granularityLabel =
		granularity === 'raw' ? 'Every check' : granularity === 'hourly' ? 'Hourly' : 'Daily';

	if (loading) {
		return (
			<section className="space-y-6 rounded-xl border border-white/10 bg-black/25 p-5">
				<div className="flex items-center gap-3">
					<TrendingUp className="h-5 w-5 text-slate-400" />
					<h2 className="text-lg font-semibold text-white">Historical Data</h2>
				</div>
				<div className="flex h-64 items-center justify-center">
					<div className="flex items-center gap-2 text-slate-400">
						<Clock className="h-5 w-5 animate-pulse" />
						<span>Loading history...</span>
					</div>
				</div>
			</section>
		);
	}

	if (error) {
		return (
			<section className="space-y-6 rounded-xl border border-white/10 bg-black/25 p-5">
				<div className="flex items-center gap-3">
					<TrendingUp className="h-5 w-5 text-slate-400" />
					<h2 className="text-lg font-semibold text-white">Historical Data</h2>
				</div>
				<div className="flex h-64 items-center justify-center">
					<div className="text-center text-slate-400">
						<p>Unable to load historical data</p>
						<p className="mt-1 text-xs text-slate-500">{error}</p>
						<button
							onClick={fetchHistory}
							className="mt-3 rounded-lg bg-slate-700 px-4 py-2 text-sm hover:bg-slate-600"
						>
							Retry
						</button>
					</div>
				</div>
			</section>
		);
	}

	const hasData = rdChartData.length > 0 || streamChartData.length > 0;

	return (
		<section className="space-y-6 rounded-xl border border-white/10 bg-black/25 p-5">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-3">
					<TrendingUp className="h-5 w-5 text-slate-400" />
					<div>
						<h2 className="text-lg font-semibold text-white">Historical Data</h2>
						<p className="text-xs text-slate-400">
							{granularityLabel} aggregates for the past {range}
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					{rangeOptions.map((option) => (
						<button
							key={option.value}
							onClick={() => setRange(option.value)}
							className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
								range === option.value
									? 'bg-sky-600 text-white'
									: 'bg-slate-800 text-slate-300 hover:bg-slate-700'
							}`}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			{!hasData ? (
				<div className="flex h-64 items-center justify-center">
					<div className="text-center text-slate-400">
						<BarChart3 className="mx-auto h-12 w-12 text-slate-600" />
						<p className="mt-3">No historical data available yet</p>
						<p className="mt-1 text-xs text-slate-500">
							Data will appear after the first aggregation runs
						</p>
					</div>
				</div>
			) : (
				<div className="grid gap-6 lg:grid-cols-2">
					{/* API Success Rate Chart */}
					<div className="rounded-xl border border-white/10 bg-black/20 p-4">
						<h3 className="mb-4 text-sm font-medium text-slate-200">
							API Success Rate
						</h3>
						{rdChartData.length > 0 ? (
							<ResponsiveContainer width="100%" height={200}>
								<AreaChart data={rdChartData}>
									<defs>
										<linearGradient
											id="successGradient"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												offset="5%"
												stopColor="#10b981"
												stopOpacity={0.3}
											/>
											<stop
												offset="95%"
												stopColor="#10b981"
												stopOpacity={0}
											/>
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
									<XAxis
										dataKey="label"
										tick={{ fill: '#94a3b8', fontSize: 10 }}
										tickLine={false}
										axisLine={{ stroke: '#475569' }}
										interval="preserveStartEnd"
										minTickGap={20}
									/>
									<YAxis
										tick={{ fill: '#94a3b8', fontSize: 10 }}
										tickLine={false}
										axisLine={{ stroke: '#475569' }}
										tickFormatter={(v) => formatPercent(v)}
										domain={[0, 1]}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: '#1e293b',
											border: '1px solid #334155',
											borderRadius: '8px',
										}}
										labelStyle={{ color: '#f1f5f9' }}
										formatter={(value) => [
											formatPercent(value as number),
											'Success Rate',
										]}
									/>
									<Area
										type="monotone" // Use 'monotone' or 'step' for raw data? 'step' is better for 0/1 but monotone looks nicer.
										// 'monotone' with 0/1 data might overshoot.
										// For raw data, if it's high frequency, it looks like a line.
										// Let's stick to monotone for consistency.
										dataKey="successRate"
										stroke="#10b981"
										fill="url(#successGradient)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
								No API data available
							</div>
						)}
					</div>

					{/* Stream Health Chart */}
					<div className="rounded-xl border border-white/10 bg-black/20 p-4">
						<h3 className="mb-4 text-sm font-medium text-slate-200">
							Stream Server Health
						</h3>
						{streamChartData.length > 0 ? (
							<ResponsiveContainer width="100%" height={200}>
								<AreaChart data={streamChartData}>
									<defs>
										<linearGradient
											id="streamGradient"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												offset="5%"
												stopColor="#10b981"
												stopOpacity={0.3}
											/>
											<stop
												offset="95%"
												stopColor="#10b981"
												stopOpacity={0}
											/>
										</linearGradient>
									</defs>
									<CartesianGrid strokeDasharray="3 3" stroke="#334155" />
									<XAxis
										dataKey="label"
										tick={{ fill: '#94a3b8', fontSize: 10 }}
										tickLine={false}
										axisLine={{ stroke: '#475569' }}
										interval="preserveStartEnd"
										minTickGap={20}
									/>
									<YAxis
										tick={{ fill: '#94a3b8', fontSize: 10 }}
										tickLine={false}
										axisLine={{ stroke: '#475569' }}
										tickFormatter={(v) => formatPercent(v)}
										domain={[0, 1]}
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: '#1e293b',
											border: '1px solid #334155',
											borderRadius: '8px',
										}}
										labelStyle={{ color: '#f1f5f9' }}
										formatter={(value) => [
											formatPercent(value as number),
											'Working Rate',
										]}
									/>
									<Area
										type="monotone"
										dataKey="workingRate"
										stroke="#10b981"
										fill="url(#streamGradient)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-[200px] items-center justify-center text-sm text-slate-500">
								No stream data available
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
