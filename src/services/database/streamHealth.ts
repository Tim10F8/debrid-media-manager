import { DatabaseClient } from './client';

export interface StreamServerStatus {
	host: string;
	status: number | null;
	latencyMs: number | null;
	ok: boolean;
	error: string | null;
	checkedAt: Date;
}

export interface StreamHealthMetrics {
	total: number;
	working: number;
	rate: number;
	lastChecked: number | null;
	avgLatencyMs: number | null;
	fastestServer: string | null;
	failedServers: string[];
}

export interface StreamCheckResultData {
	ok: boolean;
	latencyMs: number | null;
	server: string | null;
	error: string | null;
	checkedAt: Date;
}

export interface TorrentioUrlCheckResult {
	url: string;
	ok: boolean;
	status: number | null;
	hasLocation: boolean;
	locationValid: boolean;
	latencyMs: number | null;
	error: string | null;
}

export interface TorrentioCheckResultData {
	ok: boolean;
	latencyMs: number | null;
	error: string | null;
	urls: TorrentioUrlCheckResult[];
	checkedAt: Date;
}

export class StreamHealthService extends DatabaseClient {
	/**
	 * Upserts a batch of stream server health results.
	 */
	public async upsertHealthResults(results: StreamServerStatus[]): Promise<void> {
		if (results.length === 0) return;

		try {
			// Use a transaction for batch upsert
			await this.prisma.$transaction(
				results.map((result) =>
					this.prisma.streamServerHealth.upsert({
						where: { host: result.host },
						update: {
							status: result.status,
							latencyMs: result.latencyMs,
							ok: result.ok,
							error: result.error,
							checkedAt: result.checkedAt,
						},
						create: {
							host: result.host,
							status: result.status,
							latencyMs: result.latencyMs,
							ok: result.ok,
							error: result.error,
							checkedAt: result.checkedAt,
						},
					})
				)
			);
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('StreamServerHealth table does not exist - cannot store results');
				return;
			}
			console.error('Failed to upsert stream health results:', error);
		}
	}

	/**
	 * Gets all stream server health statuses.
	 */
	public async getAllStatuses(): Promise<StreamServerStatus[]> {
		try {
			const results = await this.prisma.streamServerHealth.findMany({
				orderBy: [{ ok: 'desc' }, { latencyMs: 'asc' }],
			});

			return results.map((r) => ({
				host: r.host,
				status: r.status,
				latencyMs: r.latencyMs,
				ok: r.ok,
				error: r.error,
				checkedAt: r.checkedAt,
			}));
		} catch (error: any) {
			// Handle database errors gracefully - return empty array for any Prisma error
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getAllStatuses: Database error, returning empty array:',
					error?.code || error?.name
				);
				return [];
			}
			throw error;
		}
	}

	/**
	 * Deletes stream server health entries for excluded hosts.
	 */
	public async deleteHosts(hosts: string[]): Promise<number> {
		if (hosts.length === 0) {
			return 0;
		}

		try {
			const result = await this.prisma.streamServerHealth.deleteMany({
				where: {
					host: { in: hosts },
				},
			});
			return result.count;
		} catch (error: any) {
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'deleteHosts: Database error, returning 0:',
					error?.code || error?.name
				);
				return 0;
			}
			throw error;
		}
	}

	/**
	 * Deletes all stream server health entries for hosts not in the valid list.
	 * @param validHosts - Array of valid host strings that should be kept
	 */
	public async deleteDeprecatedHosts(validHosts: string[]): Promise<number> {
		try {
			// Get all hosts in the database
			const allHosts = await this.prisma.streamServerHealth.findMany({
				select: { host: true },
			});

			// Find hosts that are not in the valid list
			const validHostSet = new Set(validHosts);
			const deprecatedHosts = allHosts
				.map((h) => h.host)
				.filter((host) => !validHostSet.has(host));

			if (deprecatedHosts.length === 0) {
				return 0;
			}

			const result = await this.prisma.streamServerHealth.deleteMany({
				where: {
					host: { in: deprecatedHosts },
				},
			});

			if (result.count > 0) {
				console.log(
					`[StreamHealth] Deleted ${result.count} deprecated host entries:`,
					deprecatedHosts
				);
			}
			return result.count;
		} catch (error: any) {
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'deleteDeprecatedHosts: Database error, returning 0:',
					error?.code || error?.name
				);
				return 0;
			}
			throw error;
		}
	}

	/**
	 * Gets aggregated stream health metrics.
	 */
	public async getMetrics(): Promise<StreamHealthMetrics> {
		try {
			const [total, working, workingServers, lastCheckedResult] = await Promise.all([
				this.prisma.streamServerHealth.count(),
				this.prisma.streamServerHealth.count({ where: { ok: true } }),
				this.prisma.streamServerHealth.findMany({
					where: { ok: true },
					orderBy: { latencyMs: 'asc' },
					select: { host: true, latencyMs: true },
				}),
				this.prisma.streamServerHealth.findFirst({
					orderBy: { checkedAt: 'desc' },
					select: { checkedAt: true },
				}),
			]);

			const failedServers = await this.prisma.streamServerHealth.findMany({
				where: { ok: false },
				select: { host: true },
			});

			// Calculate average latency
			let avgLatencyMs: number | null = null;
			if (workingServers.length > 0) {
				const totalLatency = workingServers.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0);
				avgLatencyMs = totalLatency / workingServers.length;
			}

			// Get fastest server
			const fastestServer = workingServers[0]?.host ?? null;

			return {
				total,
				working,
				rate: total > 0 ? working / total : 0,
				lastChecked: lastCheckedResult?.checkedAt.getTime() ?? null,
				avgLatencyMs,
				fastestServer,
				failedServers: failedServers.map((s) => s.host),
			};
		} catch (error: any) {
			// Handle database errors gracefully - return empty metrics for any Prisma error
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn(
					'getMetrics: Database error, returning empty metrics:',
					error?.code || error?.name
				);
				return {
					total: 0,
					working: 0,
					rate: 0,
					lastChecked: null,
					avgLatencyMs: null,
					fastestServer: null,
					failedServers: [],
				};
			}
			throw error;
		}
	}

	/**
	 * Cleans up old health check entries that haven't been updated recently.
	 */
	public async cleanupOldEntries(olderThanHours: number = 24): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

			const result = await this.prisma.streamServerHealth.deleteMany({
				where: {
					checkedAt: { lt: cutoffDate },
				},
			});

			return result.count;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return 0;
			}
			throw error;
		}
	}

	/**
	 * Gets the count of health check entries.
	 */
	public async getCount(): Promise<number> {
		try {
			return await this.prisma.streamServerHealth.count();
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return 0;
			}
			throw error;
		}
	}

	/**
	 * Records an individual stream check result.
	 */
	public async recordCheckResult(result: {
		ok: boolean;
		latencyMs: number | null;
		server: string | null;
		error: string | null;
	}): Promise<void> {
		try {
			await this.prisma.streamCheckResult.create({
				data: {
					ok: result.ok,
					latencyMs: result.latencyMs,
					server: result.server,
					error: result.error,
				},
			});

			// Keep only last 50 results
			const count = await this.prisma.streamCheckResult.count();
			if (count > 50) {
				const toDelete = count - 50;
				const oldestRecords = await this.prisma.streamCheckResult.findMany({
					orderBy: { checkedAt: 'asc' },
					take: toDelete,
					select: { id: true },
				});
				await this.prisma.streamCheckResult.deleteMany({
					where: { id: { in: oldestRecords.map((r) => r.id) } },
				});
			}
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('StreamCheckResult table does not exist - cannot record result');
				return;
			}
			console.error('Failed to record stream check result:', error);
		}
	}

	/**
	 * Gets the most recent N stream check results.
	 */
	public async getRecentChecks(limit: number = 5): Promise<StreamCheckResultData[]> {
		try {
			const results = await this.prisma.streamCheckResult.findMany({
				orderBy: { checkedAt: 'desc' },
				take: limit,
			});

			return results.map((r) => ({
				ok: r.ok,
				latencyMs: r.latencyMs,
				server: r.server,
				error: r.error,
				checkedAt: r.checkedAt,
			}));
		} catch (error: any) {
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn('getRecentChecks: Database error, returning empty array');
				return [];
			}
			throw error;
		}
	}

	/**
	 * Records an individual Torrentio check result.
	 */
	public async recordTorrentioCheckResult(result: {
		ok: boolean;
		latencyMs: number | null;
		error: string | null;
		urls: TorrentioUrlCheckResult[];
	}): Promise<void> {
		try {
			await this.prisma.torrentioCheckResult.create({
				data: {
					ok: result.ok,
					latencyMs: result.latencyMs,
					error: result.error,
					urls: result.urls as unknown as object[],
				},
			});

			// Keep only last 50 results
			const count = await this.prisma.torrentioCheckResult.count();
			if (count > 50) {
				const toDelete = count - 50;
				const oldestRecords = await this.prisma.torrentioCheckResult.findMany({
					orderBy: { checkedAt: 'asc' },
					take: toDelete,
					select: { id: true },
				});
				await this.prisma.torrentioCheckResult.deleteMany({
					where: { id: { in: oldestRecords.map((r) => r.id) } },
				});
			}
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('TorrentioCheckResult table does not exist - cannot record result');
				return;
			}
			console.error('Failed to record Torrentio check result:', error);
		}
	}

	/**
	 * Gets the most recent N Torrentio check results.
	 */
	public async getRecentTorrentioChecks(limit: number = 5): Promise<TorrentioCheckResultData[]> {
		try {
			const results = await this.prisma.torrentioCheckResult.findMany({
				orderBy: { checkedAt: 'desc' },
				take: limit,
			});

			return results.map((r) => ({
				ok: r.ok,
				latencyMs: r.latencyMs,
				error: r.error,
				urls: r.urls as unknown as TorrentioUrlCheckResult[],
				checkedAt: r.checkedAt,
			}));
		} catch (error: any) {
			if (
				error?.code?.startsWith?.('P') ||
				error?.name?.includes?.('Prisma') ||
				error?.message?.includes('does not exist') ||
				error?.message?.includes('Authentication failed')
			) {
				console.warn('getRecentTorrentioChecks: Database error, returning empty array');
				return [];
			}
			throw error;
		}
	}
}
