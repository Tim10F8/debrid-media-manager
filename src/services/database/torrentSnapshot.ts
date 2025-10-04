import { Prisma } from '@prisma/client';
import { DatabaseClient } from './client';

export interface SnapshotPayload {
	hash: string;
	addedDate: Date;
	id: string;
	payload: Prisma.InputJsonValue;
}

export class TorrentSnapshotService extends DatabaseClient {
	public async upsertSnapshot({ id, hash, addedDate, payload }: SnapshotPayload) {
		return this.prisma.torrentSnapshot.upsert({
			where: { id },
			update: {
				hash,
				addedDate,
				payload,
			},
			create: {
				id,
				hash,
				addedDate,
				payload,
			},
		});
	}

	public async getLatestSnapshot(hash: string) {
		return this.prisma.torrentSnapshot.findFirst({
			where: { hash },
			orderBy: { addedDate: 'desc' },
		});
	}
}
