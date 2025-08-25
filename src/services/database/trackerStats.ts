import { DatabaseClient } from './client';

export class TrackerStatsService extends DatabaseClient {
	public async upsertTrackerStats({
		hash,
		seeders,
		leechers,
		downloads,
		successfulTrackers,
		totalTrackers,
	}: {
		hash: string;
		seeders: number;
		leechers: number;
		downloads: number;
		successfulTrackers: number;
		totalTrackers: number;
	}): Promise<void> {
		try {
			await this.prisma.trackerStats.upsert({
				where: { hash },
				update: {
					seeders,
					leechers,
					downloads,
					successfulTrackers,
					totalTrackers,
					lastChecked: new Date(),
				},
				create: {
					hash,
					seeders,
					leechers,
					downloads,
					successfulTrackers,
					totalTrackers,
					lastChecked: new Date(),
				},
			});
		} catch (error: any) {
			// If table doesn't exist, log warning but don't throw
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('TrackerStats table does not exist in database - cannot store stats');
				return;
			}
			throw error;
		}
	}

	public async getTrackerStats(hash: string): Promise<any | null> {
		try {
			const stats = await this.prisma.trackerStats.findUnique({
				where: { hash },
			});

			if (!stats) return null;

			return {
				hash: stats.hash,
				seeders: stats.seeders,
				leechers: stats.leechers,
				downloads: stats.downloads,
				successfulTrackers: stats.successfulTrackers,
				totalTrackers: stats.totalTrackers,
				lastChecked: stats.lastChecked,
			};
		} catch (error: any) {
			// If table doesn't exist or other DB errors, return null
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('TrackerStats table does not exist in database');
				return null;
			}
			throw error;
		}
	}

	public async getTrackerStatsByHashes(hashes: string[]): Promise<any[]> {
		try {
			const stats = await this.prisma.trackerStats.findMany({
				where: {
					hash: { in: hashes },
				},
			});

			return stats.map((stat) => ({
				hash: stat.hash,
				seeders: stat.seeders,
				leechers: stat.leechers,
				downloads: stat.downloads,
				successfulTrackers: stat.successfulTrackers,
				totalTrackers: stat.totalTrackers,
				lastChecked: stat.lastChecked,
			}));
		} catch (error: any) {
			// If table doesn't exist or other DB errors, return empty array
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('TrackerStats table does not exist in database');
				return [];
			}
			throw error;
		}
	}

	public async removeTrackerStats(hash: string): Promise<void> {
		await this.prisma.trackerStats.delete({
			where: { hash },
		});
	}

	public async getStaleTrackerStats(olderThanHours: number = 24): Promise<string[]> {
		const cutoffDate = new Date();
		cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

		const staleStats = await this.prisma.trackerStats.findMany({
			where: {
				lastChecked: {
					lt: cutoffDate,
				},
			},
			select: {
				hash: true,
			},
		});

		return staleStats.map((stat) => stat.hash);
	}

	public async cleanupOldTrackerStats(olderThanDays: number = 30): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		const result = await this.prisma.trackerStats.deleteMany({
			where: {
				lastChecked: {
					lt: cutoffDate,
				},
			},
		});

		return result.count;
	}

	public async getTrackerStatsCount(): Promise<number> {
		return this.prisma.trackerStats.count();
	}

	public async getRecentTrackerStats(limit: number = 100): Promise<any[]> {
		const stats = await this.prisma.trackerStats.findMany({
			orderBy: {
				lastChecked: 'desc',
			},
			take: limit,
		});

		return stats.map((stat) => ({
			hash: stat.hash,
			seeders: stat.seeders,
			leechers: stat.leechers,
			downloads: stat.downloads,
			successfulTrackers: stat.successfulTrackers,
			totalTrackers: stat.totalTrackers,
			lastChecked: stat.lastChecked,
		}));
	}
}
