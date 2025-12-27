import { DatabaseClient } from './client';
import { RealDebridOperation } from './rdObservability';

const MONITORED_OPERATIONS: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
	'POST /unrestrict/link',
];

// Retention periods
const HOURLY_RETENTION_DAYS = 7;
const DAILY_RETENTION_DAYS = 90;

export interface RdHourlyData {
	hour: Date;
	operation: string;
	totalCount: number;
	successCount: number;
	failureCount: number;
	otherCount: number;
	successRate: number;
}

export interface RdDailyData {
	date: Date;
	operation: string;
	totalCount: number;
	successCount: number;
	failureCount: number;
	avgSuccessRate: number;
	minSuccessRate: number;
	maxSuccessRate: number;
	peakHour: number | null;
}

export interface StreamHourlyData {
	hour: Date;
	totalServers: number;
	workingServers: number;
	workingRate: number;
	avgLatencyMs: number | null;
	minLatencyMs: number | null;
	maxLatencyMs: number | null;
	fastestServer: string | null;
	checksInHour: number;
	failedServers: string[];
}

export interface StreamDailyData {
	date: Date;
	avgWorkingRate: number;
	minWorkingRate: number;
	maxWorkingRate: number;
	avgLatencyMs: number | null;
	checksCount: number;
	alwaysWorking: number;
	neverWorking: number;
	flaky: number;
}

export interface ServerReliabilityData {
	date: Date;
	host: string;
	checksCount: number;
	successCount: number;
	avgLatencyMs: number | null;
	reliability: number;
}

export class HistoryAggregationService extends DatabaseClient {
	/**
	 * Aggregates RD operational events into hourly buckets.
	 * Should be called every hour (or more frequently for catch-up).
	 * Defaults to the PREVIOUS hour to ensure all events have arrived.
	 */
	public async aggregateRdHourly(targetHour?: Date): Promise<number> {
		// Default to previous hour to ensure all events have arrived
		const now = new Date();
		const previousHour = new Date(now.getTime() - 60 * 60 * 1000);
		const hour = targetHour ? this.startOfHour(targetHour) : this.startOfHour(previousHour);
		const nextHour = new Date(hour.getTime() + 60 * 60 * 1000);

		try {
			// Get events for this hour grouped by operation
			const events = await this.prisma.rdOperationalEvent.findMany({
				where: {
					createdAt: {
						gte: hour,
						lt: nextHour,
					},
				},
				select: {
					operation: true,
					status: true,
				},
			});

			if (events.length === 0) {
				return 0;
			}

			// Aggregate by operation
			const byOperation: Record<
				string,
				{ total: number; success: number; failure: number; other: number }
			> = {};

			for (const op of MONITORED_OPERATIONS) {
				byOperation[op] = { total: 0, success: 0, failure: 0, other: 0 };
			}

			for (const event of events) {
				const stats = byOperation[event.operation];
				if (!stats) continue;

				stats.total++;
				if (event.status >= 200 && event.status < 300) {
					stats.success++;
				} else if (event.status >= 500 && event.status < 600) {
					stats.failure++;
				} else {
					stats.other++;
				}
			}

			// Upsert hourly records
			let upserted = 0;
			for (const [operation, stats] of Object.entries(byOperation)) {
				if (stats.total === 0) continue;

				const considered = stats.success + stats.failure;
				const successRate = considered > 0 ? stats.success / considered : 0;

				await this.prisma.rdOperationalHourly.upsert({
					where: {
						hour_operation: { hour, operation },
					},
					update: {
						totalCount: stats.total,
						successCount: stats.success,
						failureCount: stats.failure,
						otherCount: stats.other,
						successRate,
					},
					create: {
						hour,
						operation,
						totalCount: stats.total,
						successCount: stats.success,
						failureCount: stats.failure,
						otherCount: stats.other,
						successRate,
					},
				});
				upserted++;
			}

			return upserted;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('History tables do not exist - cannot aggregate');
				return 0;
			}
			console.error('Failed to aggregate RD hourly data:', error);
			return 0;
		}
	}

	/**
	 * Rolls up hourly RD data into daily aggregates.
	 * Should be called once per day (after midnight UTC).
	 */
	public async rollupRdDaily(targetDate?: Date): Promise<number> {
		const date = targetDate ? this.startOfDay(targetDate) : this.startOfDay(new Date());
		const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

		try {
			// Get hourly data for this day
			const hourlyData = await this.prisma.rdOperationalHourly.findMany({
				where: {
					hour: {
						gte: date,
						lt: nextDate,
					},
				},
			});

			if (hourlyData.length === 0) {
				return 0;
			}

			// Group by operation
			const byOperation: Record<
				string,
				{
					totalCount: number;
					successCount: number;
					failureCount: number;
					successRates: number[];
					hourlyTotals: { hour: number; count: number }[];
				}
			> = {};

			for (const record of hourlyData) {
				if (!byOperation[record.operation]) {
					byOperation[record.operation] = {
						totalCount: 0,
						successCount: 0,
						failureCount: 0,
						successRates: [],
						hourlyTotals: [],
					};
				}

				const stats = byOperation[record.operation];
				stats.totalCount += record.totalCount;
				stats.successCount += record.successCount;
				stats.failureCount += record.failureCount;
				stats.successRates.push(record.successRate);
				stats.hourlyTotals.push({
					hour: record.hour.getUTCHours(),
					count: record.totalCount,
				});
			}

			// Upsert daily records
			let upserted = 0;
			for (const [operation, stats] of Object.entries(byOperation)) {
				const avgSuccessRate =
					stats.successRates.length > 0
						? stats.successRates.reduce((a, b) => a + b, 0) / stats.successRates.length
						: 0;
				const minSuccessRate =
					stats.successRates.length > 0 ? Math.min(...stats.successRates) : 0;
				const maxSuccessRate =
					stats.successRates.length > 0 ? Math.max(...stats.successRates) : 0;
				const peakHour =
					stats.hourlyTotals.length > 0
						? stats.hourlyTotals.reduce((a, b) => (b.count > a.count ? b : a)).hour
						: null;

				await this.prisma.rdOperationalDaily.upsert({
					where: {
						date_operation: { date, operation },
					},
					update: {
						totalCount: stats.totalCount,
						successCount: stats.successCount,
						failureCount: stats.failureCount,
						avgSuccessRate,
						minSuccessRate,
						maxSuccessRate,
						peakHour,
					},
					create: {
						date,
						operation,
						totalCount: stats.totalCount,
						successCount: stats.successCount,
						failureCount: stats.failureCount,
						avgSuccessRate,
						minSuccessRate,
						maxSuccessRate,
						peakHour,
					},
				});
				upserted++;
			}

			return upserted;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return 0;
			}
			console.error('Failed to rollup RD daily data:', error);
			return 0;
		}
	}

	/**
	 * Records a stream health snapshot for aggregation.
	 * Called after each health check run.
	 */
	public async recordStreamHealthSnapshot(data: {
		totalServers: number;
		workingServers: number;
		avgLatencyMs: number | null;
		minLatencyMs: number | null;
		maxLatencyMs: number | null;
		fastestServer: string | null;
		failedServers: string[];
	}): Promise<void> {
		const hour = this.startOfHour(new Date());
		const workingRate = data.totalServers > 0 ? data.workingServers / data.totalServers : 0;

		try {
			// Try to update existing record for this hour
			const existing = await this.prisma.streamHealthHourly.findUnique({
				where: { hour },
			});

			if (existing) {
				// Merge with existing data (average the metrics)
				const newChecksInHour = existing.checksInHour + 1;
				const newWorkingRate =
					(existing.workingRate * existing.checksInHour + workingRate) / newChecksInHour;
				const newAvgLatency =
					data.avgLatencyMs !== null && existing.avgLatencyMs !== null
						? (existing.avgLatencyMs * existing.checksInHour + data.avgLatencyMs) /
							newChecksInHour
						: (data.avgLatencyMs ?? existing.avgLatencyMs);

				// Merge failed servers (union)
				const existingFailed = existing.failedServers as string[];
				const allFailed = [...new Set([...existingFailed, ...data.failedServers])];

				await this.prisma.streamHealthHourly.update({
					where: { hour },
					data: {
						workingServers: Math.round(
							(existing.workingServers * existing.checksInHour +
								data.workingServers) /
								newChecksInHour
						),
						workingRate: newWorkingRate,
						avgLatencyMs: newAvgLatency,
						minLatencyMs:
							data.minLatencyMs !== null
								? Math.min(existing.minLatencyMs ?? Infinity, data.minLatencyMs)
								: existing.minLatencyMs,
						maxLatencyMs:
							data.maxLatencyMs !== null
								? Math.max(existing.maxLatencyMs ?? 0, data.maxLatencyMs)
								: existing.maxLatencyMs,
						fastestServer: data.fastestServer ?? existing.fastestServer,
						checksInHour: newChecksInHour,
						failedServers: allFailed,
					},
				});
			} else {
				// Create new record
				await this.prisma.streamHealthHourly.create({
					data: {
						hour,
						totalServers: data.totalServers,
						workingServers: data.workingServers,
						workingRate,
						avgLatencyMs: data.avgLatencyMs,
						minLatencyMs: data.minLatencyMs,
						maxLatencyMs: data.maxLatencyMs,
						fastestServer: data.fastestServer,
						checksInHour: 1,
						failedServers: data.failedServers,
					},
				});
			}
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('StreamHealthHourly table does not exist');
				return;
			}
			console.error('Failed to record stream health snapshot:', error);
		}
	}

	/**
	 * Records per-server reliability data for the current day.
	 */
	public async recordServerReliability(
		statuses: Array<{ host: string; ok: boolean; latencyMs: number | null }>
	): Promise<void> {
		const date = this.startOfDay(new Date());

		try {
			for (const status of statuses) {
				const existing = await this.prisma.serverReliabilityDaily.findUnique({
					where: {
						date_host: { date, host: status.host },
					},
				});

				if (existing) {
					const newChecksCount = existing.checksCount + 1;
					const newSuccessCount = existing.successCount + (status.ok ? 1 : 0);
					const newAvgLatency =
						status.ok && status.latencyMs !== null
							? existing.avgLatencyMs !== null
								? (existing.avgLatencyMs * existing.successCount +
										status.latencyMs) /
									newSuccessCount
								: status.latencyMs
							: existing.avgLatencyMs;

					await this.prisma.serverReliabilityDaily.update({
						where: { id: existing.id },
						data: {
							checksCount: newChecksCount,
							successCount: newSuccessCount,
							avgLatencyMs: newAvgLatency,
							reliability: newSuccessCount / newChecksCount,
						},
					});
				} else {
					await this.prisma.serverReliabilityDaily.create({
						data: {
							date,
							host: status.host,
							checksCount: 1,
							successCount: status.ok ? 1 : 0,
							avgLatencyMs: status.ok ? status.latencyMs : null,
							reliability: status.ok ? 1 : 0,
						},
					});
				}
			}
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return;
			}
			console.error('Failed to record server reliability:', error);
		}
	}

	/**
	 * Rolls up hourly stream health data into daily aggregates.
	 */
	public async rollupStreamDaily(targetDate?: Date): Promise<boolean> {
		const date = targetDate ? this.startOfDay(targetDate) : this.startOfDay(new Date());
		const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

		try {
			// Get hourly data for this day
			const hourlyData = await this.prisma.streamHealthHourly.findMany({
				where: {
					hour: {
						gte: date,
						lt: nextDate,
					},
				},
			});

			if (hourlyData.length === 0) {
				return false;
			}

			// Calculate weighted aggregates (weighted by checks per hour)
			const totalChecks = hourlyData.reduce((sum, h) => sum + h.checksInHour, 0);

			// Weighted average of working rates
			const weightedWorkingRateSum = hourlyData.reduce(
				(sum, h) => sum + h.workingRate * h.checksInHour,
				0
			);
			const avgWorkingRate = totalChecks > 0 ? weightedWorkingRateSum / totalChecks : 0;

			// Weighted average of latencies (only for hours with latency data)
			const hourlyWithLatency = hourlyData.filter((h) => h.avgLatencyMs !== null);
			const totalChecksWithLatency = hourlyWithLatency.reduce(
				(sum, h) => sum + h.checksInHour,
				0
			);
			const weightedLatencySum = hourlyWithLatency.reduce(
				(sum, h) => sum + (h.avgLatencyMs as number) * h.checksInHour,
				0
			);
			const avgLatencyMs =
				totalChecksWithLatency > 0 ? weightedLatencySum / totalChecksWithLatency : null;

			// Min/max are still the extremes across all hourly records
			const workingRates = hourlyData.map((h) => h.workingRate);

			// Get server reliability for this day
			const serverReliability = await this.prisma.serverReliabilityDaily.findMany({
				where: { date },
			});

			const alwaysWorking = serverReliability.filter((s) => s.reliability === 1).length;
			const neverWorking = serverReliability.filter((s) => s.reliability === 0).length;
			const flaky = serverReliability.filter(
				(s) => s.reliability > 0 && s.reliability < 1
			).length;

			await this.prisma.streamHealthDaily.upsert({
				where: { date },
				update: {
					avgWorkingRate,
					minWorkingRate: Math.min(...workingRates),
					maxWorkingRate: Math.max(...workingRates),
					avgLatencyMs,
					checksCount: totalChecks,
					alwaysWorking,
					neverWorking,
					flaky,
				},
				create: {
					date,
					avgWorkingRate,
					minWorkingRate: Math.min(...workingRates),
					maxWorkingRate: Math.max(...workingRates),
					avgLatencyMs,
					checksCount: totalChecks,
					alwaysWorking,
					neverWorking,
					flaky,
				},
			});

			return true;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return false;
			}
			console.error('Failed to rollup stream daily data:', error);
			return false;
		}
	}

	/**
	 * Cleans up old historical data beyond retention periods.
	 */
	public async cleanupOldData(): Promise<{
		rdHourlyDeleted: number;
		rdDailyDeleted: number;
		streamHourlyDeleted: number;
		streamDailyDeleted: number;
		serverReliabilityDeleted: number;
	}> {
		const now = new Date();
		const hourlyRetentionDate = new Date(
			now.getTime() - HOURLY_RETENTION_DAYS * 24 * 60 * 60 * 1000
		);
		const dailyRetentionDate = new Date(
			now.getTime() - DAILY_RETENTION_DAYS * 24 * 60 * 60 * 1000
		);

		const results = {
			rdHourlyDeleted: 0,
			rdDailyDeleted: 0,
			streamHourlyDeleted: 0,
			streamDailyDeleted: 0,
			serverReliabilityDeleted: 0,
		};

		try {
			// Clean RD hourly (7 days)
			const rdHourly = await this.prisma.rdOperationalHourly.deleteMany({
				where: { hour: { lt: hourlyRetentionDate } },
			});
			results.rdHourlyDeleted = rdHourly.count;

			// Clean RD daily (90 days)
			const rdDaily = await this.prisma.rdOperationalDaily.deleteMany({
				where: { date: { lt: dailyRetentionDate } },
			});
			results.rdDailyDeleted = rdDaily.count;

			// Clean stream hourly (7 days)
			const streamHourly = await this.prisma.streamHealthHourly.deleteMany({
				where: { hour: { lt: hourlyRetentionDate } },
			});
			results.streamHourlyDeleted = streamHourly.count;

			// Clean stream daily (90 days)
			const streamDaily = await this.prisma.streamHealthDaily.deleteMany({
				where: { date: { lt: dailyRetentionDate } },
			});
			results.streamDailyDeleted = streamDaily.count;

			// Clean server reliability (90 days)
			const serverReliability = await this.prisma.serverReliabilityDaily.deleteMany({
				where: { date: { lt: dailyRetentionDate } },
			});
			results.serverReliabilityDeleted = serverReliability.count;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return results;
			}
			console.error('Failed to cleanup old history data:', error);
		}

		return results;
	}

	/**
	 * Gets RD hourly history for a time range.
	 */
	public async getRdHourlyHistory(
		hoursBack: number = 24,
		operation?: string
	): Promise<RdHourlyData[]> {
		const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

		try {
			const data = await this.prisma.rdOperationalHourly.findMany({
				where: {
					hour: { gte: since },
					...(operation ? { operation } : {}),
				},
				orderBy: { hour: 'asc' },
			});

			return data.map((d) => ({
				hour: d.hour,
				operation: d.operation,
				totalCount: d.totalCount,
				successCount: d.successCount,
				failureCount: d.failureCount,
				otherCount: d.otherCount,
				successRate: d.successRate,
			}));
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			// Catches: P2021 (table not exist), P1000 (auth failed), PrismaClientInitializationError, etc.
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getRdHourlyHistory: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Gets RD daily history for a time range.
	 */
	public async getRdDailyHistory(
		daysBack: number = 90,
		operation?: string
	): Promise<RdDailyData[]> {
		const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

		try {
			const data = await this.prisma.rdOperationalDaily.findMany({
				where: {
					date: { gte: since },
					...(operation ? { operation } : {}),
				},
				orderBy: { date: 'asc' },
			});

			return data.map((d) => ({
				date: d.date,
				operation: d.operation,
				totalCount: d.totalCount,
				successCount: d.successCount,
				failureCount: d.failureCount,
				avgSuccessRate: d.avgSuccessRate,
				minSuccessRate: d.minSuccessRate,
				maxSuccessRate: d.maxSuccessRate,
				peakHour: d.peakHour,
			}));
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			// Catches: P2021 (table not exist), P1000 (auth failed), PrismaClientInitializationError, etc.
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getRdDailyHistory: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Gets stream hourly history for a time range.
	 */
	public async getStreamHourlyHistory(hoursBack: number = 24): Promise<StreamHourlyData[]> {
		const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

		try {
			const data = await this.prisma.streamHealthHourly.findMany({
				where: { hour: { gte: since } },
				orderBy: { hour: 'asc' },
			});

			return data.map((d) => ({
				hour: d.hour,
				totalServers: d.totalServers,
				workingServers: d.workingServers,
				workingRate: d.workingRate,
				avgLatencyMs: d.avgLatencyMs,
				minLatencyMs: d.minLatencyMs,
				maxLatencyMs: d.maxLatencyMs,
				fastestServer: d.fastestServer,
				checksInHour: d.checksInHour,
				failedServers: d.failedServers as string[],
			}));
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			// Catches: P2021 (table not exist), P1000 (auth failed), PrismaClientInitializationError, etc.
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getStreamHourlyHistory: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Gets stream daily history for a time range.
	 */
	public async getStreamDailyHistory(daysBack: number = 90): Promise<StreamDailyData[]> {
		const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

		try {
			const data = await this.prisma.streamHealthDaily.findMany({
				where: { date: { gte: since } },
				orderBy: { date: 'asc' },
			});

			return data.map((d) => ({
				date: d.date,
				avgWorkingRate: d.avgWorkingRate,
				minWorkingRate: d.minWorkingRate,
				maxWorkingRate: d.maxWorkingRate,
				avgLatencyMs: d.avgLatencyMs,
				checksCount: d.checksCount,
				alwaysWorking: d.alwaysWorking,
				neverWorking: d.neverWorking,
				flaky: d.flaky,
			}));
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			// Catches: P2021 (table not exist), P1000 (auth failed), PrismaClientInitializationError, etc.
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getStreamDailyHistory: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Gets server reliability data for a time range.
	 */
	public async getServerReliability(
		daysBack: number = 7,
		sortBy: 'reliability' | 'latency' = 'reliability',
		limit: number = 50
	): Promise<ServerReliabilityData[]> {
		const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

		try {
			// Get aggregated reliability per server
			const data = await this.prisma.serverReliabilityDaily.groupBy({
				by: ['host'],
				where: { date: { gte: since } },
				_sum: {
					checksCount: true,
					successCount: true,
				},
				_avg: {
					avgLatencyMs: true,
				},
			});

			const results: ServerReliabilityData[] = data.map((d) => ({
				date: since, // Aggregate date
				host: d.host,
				checksCount: d._sum.checksCount ?? 0,
				successCount: d._sum.successCount ?? 0,
				avgLatencyMs: d._avg.avgLatencyMs,
				reliability:
					d._sum.checksCount && d._sum.checksCount > 0
						? (d._sum.successCount ?? 0) / d._sum.checksCount
						: 0,
			}));

			// Sort
			if (sortBy === 'reliability') {
				results.sort((a, b) => b.reliability - a.reliability);
			} else {
				results.sort((a, b) => (a.avgLatencyMs ?? Infinity) - (b.avgLatencyMs ?? Infinity));
			}

			return results.slice(0, limit);
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			// Catches: P2021 (table not exist), P1000 (auth failed), PrismaClientInitializationError, etc.
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getServerReliability: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Runs all aggregation tasks. Call this periodically (e.g., every hour).
	 */
	public async runAggregation(): Promise<{
		rdHourlyAggregated: number;
		streamHealthRecorded: boolean;
	}> {
		const rdHourlyAggregated = await this.aggregateRdHourly();

		// For stream health, we record snapshots directly from the health check module
		// This method is mainly for RD event aggregation

		return {
			rdHourlyAggregated,
			streamHealthRecorded: false,
		};
	}

	/**
	 * Runs daily rollup tasks. Call this once per day (after midnight UTC).
	 */
	public async runDailyRollup(targetDate?: Date): Promise<{
		rdDailyRolled: number;
		streamDailyRolled: boolean;
	}> {
		// Roll up yesterday's data by default
		const date = targetDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

		const rdDailyRolled = await this.rollupRdDaily(date);
		const streamDailyRolled = await this.rollupStreamDaily(date);

		return {
			rdDailyRolled,
			streamDailyRolled,
		};
	}

	private startOfHour(date: Date): Date {
		const d = new Date(date);
		d.setUTCMinutes(0, 0, 0);
		return d;
	}

	private startOfDay(date: Date): Date {
		const d = new Date(date);
		d.setUTCHours(0, 0, 0, 0);
		return d;
	}
}
