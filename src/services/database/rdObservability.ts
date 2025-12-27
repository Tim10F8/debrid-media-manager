import { DatabaseClient } from './client';

export type RealDebridOperation =
	| 'GET /user'
	| 'GET /torrents'
	| 'GET /torrents/info/{id}'
	| 'POST /torrents/addMagnet'
	| 'POST /torrents/selectFiles/{id}'
	| 'DELETE /torrents/delete/{id}';

export interface OperationStats {
	operation: RealDebridOperation;
	totalTracked: number;
	successCount: number;
	failureCount: number;
	considered: number;
	successRate: number;
	lastTs: number | null;
}

export interface RdObservabilityStats {
	totalTracked: number;
	successCount: number;
	failureCount: number;
	considered: number;
	successRate: number;
	lastTs: number | null;
	isDown: boolean;
	monitoredOperations: RealDebridOperation[];
	byOperation: Record<RealDebridOperation, OperationStats>;
	windowSize: number;
}

const MONITORED_OPERATIONS: RealDebridOperation[] = [
	'GET /user',
	'GET /torrents',
	'GET /torrents/info/{id}',
	'POST /torrents/addMagnet',
	'POST /torrents/selectFiles/{id}',
	'DELETE /torrents/delete/{id}',
];

const MAX_EVENTS = 10_000;
const CLEANUP_BATCH_SIZE = 1000;

export class RdObservabilityService extends DatabaseClient {
	/**
	 * Records a Real-Debrid operational event.
	 */
	public async recordEvent(operation: RealDebridOperation, status: number): Promise<void> {
		try {
			await this.prisma.rdOperationalEvent.create({
				data: {
					operation,
					status,
				},
			});
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('RdOperationalEvent table does not exist - cannot record event');
				return;
			}
			console.error('Failed to record RD operational event:', error);
		}
	}

	/**
	 * Cleans up old events to maintain the sliding window.
	 * Keeps only the most recent MAX_EVENTS events.
	 */
	public async cleanupOldEvents(): Promise<number> {
		try {
			const count = await this.prisma.rdOperationalEvent.count();
			if (count <= MAX_EVENTS) {
				return 0;
			}

			const toDelete = count - MAX_EVENTS;

			// Find the cutoff ID
			const cutoffEvent = await this.prisma.rdOperationalEvent.findFirst({
				orderBy: { id: 'asc' },
				skip: toDelete - 1,
				select: { id: true },
			});

			if (!cutoffEvent) {
				return 0;
			}

			// Delete in batches to avoid locking
			let deleted = 0;
			while (deleted < toDelete) {
				const result = await this.prisma.rdOperationalEvent.deleteMany({
					where: {
						id: { lt: cutoffEvent.id + 1 },
					},
					// Prisma doesn't support LIMIT in deleteMany, so we delete all at once
				});
				deleted = result.count;
				break;
			}

			return deleted;
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return 0;
			}
			console.error('Failed to cleanup old RD events:', error);
			return 0;
		}
	}

	/**
	 * Gets aggregated stats from the database.
	 */
	public async getStats(): Promise<RdObservabilityStats> {
		const emptyStats = this.buildEmptyStats();

		try {
			// Get all events (limited to MAX_EVENTS)
			const events = await this.prisma.rdOperationalEvent.findMany({
				orderBy: { id: 'desc' },
				take: MAX_EVENTS,
				select: {
					operation: true,
					status: true,
					createdAt: true,
				},
			});

			if (events.length === 0) {
				return emptyStats;
			}

			// Build stats from events
			const byOperation: Record<RealDebridOperation, OperationStats> = {} as any;
			for (const op of MONITORED_OPERATIONS) {
				byOperation[op] = {
					operation: op,
					totalTracked: 0,
					successCount: 0,
					failureCount: 0,
					considered: 0,
					successRate: 0,
					lastTs: null,
				};
			}

			let totalSuccess = 0;
			let totalFailure = 0;
			let lastTs: number | null = null;

			for (const event of events) {
				const operation = event.operation as RealDebridOperation;
				const opStats = byOperation[operation];
				if (!opStats) continue;

				opStats.totalTracked += 1;
				const isSuccess = event.status >= 200 && event.status < 300;
				const isFailure = event.status >= 500 && event.status < 600;

				if (isSuccess) {
					opStats.successCount += 1;
					totalSuccess += 1;
				}
				if (isFailure) {
					opStats.failureCount += 1;
					totalFailure += 1;
				}

				opStats.considered = opStats.successCount + opStats.failureCount;
				opStats.successRate =
					opStats.considered > 0 ? opStats.successCount / opStats.considered : 0;

				const eventTs = event.createdAt.getTime();
				if (opStats.lastTs === null || eventTs > opStats.lastTs) {
					opStats.lastTs = eventTs;
				}
				if (lastTs === null || eventTs > lastTs) {
					lastTs = eventTs;
				}
			}

			const considered = totalSuccess + totalFailure;
			const successRate = considered > 0 ? totalSuccess / considered : 0;
			const isDown = considered > 0 ? successRate < 0.5 : false;

			return {
				totalTracked: events.length,
				successCount: totalSuccess,
				failureCount: totalFailure,
				considered,
				successRate,
				lastTs,
				isDown,
				monitoredOperations: MONITORED_OPERATIONS,
				byOperation,
				windowSize: MAX_EVENTS,
			};
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				console.warn('RdOperationalEvent table does not exist - returning empty stats');
				return emptyStats;
			}
			console.error('Failed to get RD observability stats:', error);
			return emptyStats;
		}
	}

	/**
	 * Gets the count of events in the database.
	 */
	public async getEventCount(): Promise<number> {
		try {
			return await this.prisma.rdOperationalEvent.count();
		} catch (error: any) {
			if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
				return 0;
			}
			throw error;
		}
	}

	private buildEmptyStats(): RdObservabilityStats {
		const byOperation: Record<RealDebridOperation, OperationStats> = {} as any;
		for (const op of MONITORED_OPERATIONS) {
			byOperation[op] = {
				operation: op,
				totalTracked: 0,
				successCount: 0,
				failureCount: 0,
				considered: 0,
				successRate: 0,
				lastTs: null,
			};
		}

		return {
			totalTracked: 0,
			successCount: 0,
			failureCount: 0,
			considered: 0,
			successRate: 0,
			lastTs: null,
			isDown: false,
			monitoredOperations: MONITORED_OPERATIONS,
			byOperation,
			windowSize: MAX_EVENTS,
		};
	}
}
