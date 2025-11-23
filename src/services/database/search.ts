import { DatabaseClient } from './client';

export class SearchService extends DatabaseClient {
	public async saveSearchResults<T>(key: string, value: T) {
		await this.prisma.search.upsert({
			where: { key },
			update: { value } as any,
			create: { key, value } as any,
		});
	}

	public async getSearchResults<T>(key: string): Promise<T | undefined> {
		const cacheEntry = await this.prisma.search.findUnique({ where: { key } });

		if (cacheEntry) {
			const updatedAt = cacheEntry.updatedAt.getTime();
			const now = Date.now();
			const ageMs = now - updatedAt;
			const maxAgeMs = 48 * 60 * 60 * 1000;
			const allowedBoundaryDriftMs = 1000; // Allow tiny timing drift right at the cutoff

			if (ageMs > maxAgeMs + allowedBoundaryDriftMs) {
				return undefined;
			}

			return cacheEntry.value as T;
		}

		return undefined;
	}
}
