import { DatabaseClient } from './client';

// Retention periods
const HOURLY_RETENTION_DAYS = 7;
const DAILY_RETENTION_DAYS = 90;

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
			streamHourlyDeleted: 0,
			streamDailyDeleted: 0,
			serverReliabilityDeleted: 0,
		};

		try {
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
	 * Stream health snapshots are recorded directly from the health check module.
	 */
	public async runAggregation(): Promise<{
		streamHealthRecorded: boolean;
	}> {
		// Stream health snapshots are recorded directly from the health check module
		return {
			streamHealthRecorded: false,
		};
	}

	/**
	 * Runs daily rollup tasks. Call this once per day (after midnight UTC).
	 */
	public async runDailyRollup(targetDate?: Date): Promise<{
		streamDailyRolled: boolean;
	}> {
		// Roll up yesterday's data by default
		const date = targetDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

		const streamDailyRolled = await this.rollupStreamDaily(date);

		return {
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
