import crypto from 'crypto';
import { DatabaseClient } from './client';

export class ZurgKeysService extends DatabaseClient {
	/**
	 * Generate a new API key
	 */
	public generateApiKey(): string {
		return crypto.randomBytes(32).toString('hex');
	}

	/**
	 * Create a new API key with expiration
	 */
	public async createApiKey(validUntilDate: Date): Promise<string> {
		const apiKey = this.generateApiKey();

		await this.prisma.zurgKeys.create({
			data: {
				apiKey,
				validUntil: validUntilDate,
			},
		});

		return apiKey;
	}

	/**
	 * Validate an API key
	 * Returns true if the key exists and is not expired
	 */
	public async validateApiKey(apiKey: string): Promise<boolean> {
		const key = await this.prisma.zurgKeys.findUnique({
			where: { apiKey },
		});

		if (!key) {
			return false;
		}

		// Check if the key is still valid
		const now = new Date();
		return key.validUntil > now;
	}

	/**
	 * Get API key details
	 */
	public async getApiKey(apiKey: string): Promise<{
		apiKey: string;
		validUntil: Date;
		createdAt: Date;
	} | null> {
		const key = await this.prisma.zurgKeys.findUnique({
			where: { apiKey },
		});

		if (!key) {
			return null;
		}

		return {
			apiKey: key.apiKey,
			validUntil: key.validUntil,
			createdAt: key.createdAt,
		};
	}

	/**
	 * Delete an API key
	 */
	public async deleteApiKey(apiKey: string): Promise<void> {
		await this.prisma.zurgKeys.delete({
			where: { apiKey },
		});
	}

	/**
	 * Delete expired API keys (cleanup operation)
	 */
	public async deleteExpiredKeys(): Promise<number> {
		const result = await this.prisma.zurgKeys.deleteMany({
			where: {
				validUntil: {
					lt: new Date(),
				},
			},
		});

		return result.count;
	}

	/**
	 * List all API keys (for admin purposes)
	 */
	public async listApiKeys(): Promise<
		Array<{
			apiKey: string;
			validUntil: Date;
			createdAt: Date;
			isExpired: boolean;
		}>
	> {
		const keys = await this.prisma.zurgKeys.findMany({
			orderBy: { createdAt: 'desc' },
		});

		const now = new Date();

		return keys.map((key) => ({
			apiKey: key.apiKey,
			validUntil: key.validUntil,
			createdAt: key.createdAt,
			isExpired: key.validUntil <= now,
		}));
	}
}
