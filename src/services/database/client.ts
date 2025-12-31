import { PrismaClient } from '@prisma/client';

// Prevent multiple instances in development due to hot reloading
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export class DatabaseClient {
	private static instance: PrismaClient;
	protected prisma: PrismaClient;

	constructor() {
		this.prisma = DatabaseClient.getInstance();
	}

	private static getInstance(): PrismaClient {
		if (!DatabaseClient.instance) {
			// Use global instance in development to survive hot reloads
			if (globalForPrisma.prisma) {
				DatabaseClient.instance = globalForPrisma.prisma;
			} else {
				DatabaseClient.instance = new PrismaClient({
					log: ['warn', 'error'],
				});

				// Store in global in development mode
				if (process.env.NODE_ENV !== 'production') {
					globalForPrisma.prisma = DatabaseClient.instance;
				}

				// Handle cleanup on process termination (skip in test environment)
				if (process.env.NODE_ENV !== 'test') {
					['SIGINT', 'SIGTERM'].forEach((signal) => {
						process.on(signal, async () => {
							await DatabaseClient.instance?.$disconnect();
						});
					});

					// Handle connection cleanup
					process.on('beforeExit', async () => {
						await DatabaseClient.instance?.$disconnect();
					});
				}
			}
		}
		return DatabaseClient.instance;
	}

	// Ensure connection is properly closed when client is no longer needed
	public async disconnect(): Promise<void> {
		if (DatabaseClient.instance) {
			await DatabaseClient.instance.$disconnect();
		}
	}
}
