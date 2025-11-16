import { DatabaseClient } from './client';

interface LatestCast {
	url: string;
	link: string;
}

export class CastService extends DatabaseClient {
	public async saveCastProfile(
		userId: string,
		clientId: string,
		clientSecret: string,
		refreshToken: string | null = null
	) {
		return this.prisma.castProfile.upsert({
			where: {
				userId: userId,
			},
			update: {
				clientId,
				clientSecret,
				refreshToken: refreshToken ?? undefined,
				updatedAt: new Date(),
			},
			create: {
				userId: userId,
				clientId,
				clientSecret,
				refreshToken: refreshToken ?? '',
				updatedAt: new Date(),
			},
		});
	}

	public async getLatestCast(imdbId: string, userId: string): Promise<LatestCast | null> {
		const castItem = await this.prisma.cast.findFirst({
			where: {
				imdbId: imdbId,
				userId: userId,
			},
			orderBy: {
				updatedAt: 'desc',
			},
			select: {
				url: true,
				link: true,
			},
		});
		return castItem && castItem.url && castItem.link
			? { url: castItem.url, link: castItem.link }
			: null;
	}

	public async getCastURLs(
		imdbId: string,
		userId: string
	): Promise<{ url: string; link: string | null; size: number }[]> {
		const castItems = await this.prisma.cast.findMany({
			where: {
				imdbId: imdbId,
				userId: userId,
				updatedAt: {
					gt: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
			select: {
				url: true,
				size: true,
				link: true,
			},
		});
		return castItems
			.filter(
				(item): item is { url: string; link: string; size: bigint } => item.link !== null
			)
			.map((item) => ({
				url: item.url,
				link: item.link,
				size: Number(item.size),
			}));
	}

	public async getOtherCastURLs(
		imdbId: string,
		userId: string
	): Promise<{ url: string; link: string; size: number }[]> {
		const castItems = await this.prisma.cast.findMany({
			where: {
				imdbId: imdbId,
				link: {
					not: null,
				},
				size: {
					gt: 10,
				},
				userId: {
					not: userId,
				},
			},
			distinct: ['size'],
			orderBy: {
				updatedAt: 'desc',
			},
			take: 2,
			select: {
				url: true,
				link: true,
				size: true,
			},
		});

		return castItems
			.filter((item): item is { url: string; link: string; size: bigint } => !!item.link)
			.map((item) => ({
				url: item.url,
				link: item.link,
				size: Number(item.size),
			}));
	}

	public async getCastProfile(userId: string): Promise<{
		clientId: string;
		clientSecret: string;
		refreshToken: string;
	} | null> {
		const profile = await this.prisma.castProfile.findUnique({
			where: { userId },
			select: {
				clientId: true,
				clientSecret: true,
				refreshToken: true,
			},
		});
		return profile;
	}

	public async saveCast(
		imdbId: string,
		userId: string,
		hash: string,
		url: string,
		rdLink: string,
		fileSize: number
	): Promise<void> {
		await this.prisma.cast.upsert({
			where: {
				imdbId_userId_hash: {
					imdbId: imdbId,
					userId: userId,
					hash: hash,
				},
			},
			update: {
				imdbId: imdbId,
				link: rdLink,
				url: url,
				size: BigInt(fileSize),
			},
			create: {
				imdbId: imdbId,
				userId: userId,
				hash: hash,
				link: rdLink,
				url: url,
				size: BigInt(fileSize),
			},
		});
	}

	public async fetchCastedMovies(userId: string): Promise<string[]> {
		const movies = await this.prisma.cast.findMany({
			where: {
				userId: userId,
				imdbId: {
					not: {
						contains: ':', // Excludes shows
					},
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
			distinct: ['imdbId'],
			select: {
				imdbId: true,
			},
		});

		return movies.map((movie) => movie.imdbId);
	}

	public async fetchCastedShows(userId: string): Promise<string[]> {
		const showsWithDuplicates = await this.prisma.cast.findMany({
			where: {
				userId: userId,
				imdbId: {
					contains: ':', // Includes only shows
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
			select: {
				imdbId: true,
			},
		});

		const uniqueShows = showsWithDuplicates
			.map((show) => show.imdbId.split(':')[0]) // Extracts the base imdbId of the show
			.filter((value, index, self) => self.indexOf(value) === index); // Ensures uniqueness

		return uniqueShows;
	}

	public async fetchAllCastedLinks(userId: string): Promise<
		{
			imdbId: string;
			url: string;
			hash: string;
			size: number;
			updatedAt: Date;
		}[]
	> {
		const castItems = await this.prisma.cast.findMany({
			where: {
				userId: userId,
			},
			select: {
				imdbId: true,
				url: true,
				hash: true,
				size: true,
				updatedAt: true,
			},
			orderBy: {
				updatedAt: 'desc',
			},
		});

		return castItems.map((item) => ({
			...item,
			size: Number(item.size),
		}));
	}

	public async deleteCastedLink(imdbId: string, userId: string, hash: string): Promise<void> {
		try {
			await this.prisma.cast.delete({
				where: {
					imdbId_userId_hash: {
						imdbId,
						userId,
						hash,
					},
				},
			});
		} catch (error: any) {
			throw new Error(`Failed to delete casted link: ${error.message}`);
		}
	}

	public async getAllUserCasts(userId: string): Promise<
		{
			imdbId: string;
			hash: string;
			url: string;
			link: string | null;
			size: number;
		}[]
	> {
		const casts = await this.prisma.cast.findMany({
			where: {
				userId: userId,
			},
			select: {
				imdbId: true,
				hash: true,
				url: true,
				link: true,
				size: true,
			},
		});
		return casts.map((cast) => ({
			imdbId: cast.imdbId,
			hash: cast.hash,
			url: cast.url,
			link: cast.link,
			size: Number(cast.size),
		}));
	}

	public async getUserCastStreams(
		imdbId: string,
		userId: string,
		limit: number = 5
	): Promise<
		{
			url: string;
			link: string;
			size: number;
			filename: string;
		}[]
	> {
		const castItems = await this.prisma.cast.findMany({
			where: {
				imdbId: imdbId,
				userId: userId,
				link: {
					not: null,
				},
				updatedAt: {
					gt: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000),
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
			select: {
				url: true,
				link: true,
				size: true,
			},
			take: limit,
		});

		return castItems
			.filter(
				(item): item is { url: string; link: string; size: bigint } => item.link !== null
			)
			.map((item) => ({
				url: item.url,
				link: item.link,
				size: Number(item.size),
				filename: item.url.split('/').pop() || 'Unknown',
			}));
	}

	public async getOtherStreams(
		imdbId: string,
		userId: string,
		limit: number = 5
	): Promise<
		{
			url: string;
			link: string;
			size: number;
			filename: string;
		}[]
	> {
		const availableItems = await this.prisma.available.findMany({
			where: {
				imdbId: imdbId.split(':')[0],
				status: 'downloaded',
			},
			include: {
				files: {
					select: {
						link: true,
						path: true,
						bytes: true,
					},
					orderBy: {
						bytes: 'desc',
					},
					take: 1,
				},
			},
			orderBy: {
				updatedAt: 'desc',
			},
			take: limit,
		});

		const availableResults = availableItems
			.filter((item) => item.files.length > 0 && item.files[0].link)
			.map((item) => ({
				url: item.files[0].link,
				link: item.files[0].link,
				size: Number(item.files[0].bytes) / 1024 / 1024,
				filename: item.files[0].path.split('/').pop() || item.filename,
				updatedAt: item.updatedAt,
			}));

		if (availableResults.length >= limit) {
			return availableResults.slice(0, limit).map(({ updatedAt, ...item }) => item);
		}

		const remainingLimit = limit - availableResults.length;
		const otherCastItems = await this.prisma.cast.findMany({
			where: {
				imdbId: imdbId,
				link: {
					not: null,
				},
				size: {
					gt: 10,
				},
				userId: {
					not: userId,
				},
			},
			distinct: ['size'],
			orderBy: {
				updatedAt: 'desc',
			},
			select: {
				url: true,
				link: true,
				size: true,
				updatedAt: true,
			},
			take: remainingLimit,
		});

		const otherCastResults = otherCastItems
			.filter(
				(item): item is { url: string; link: string; size: bigint; updatedAt: Date } =>
					item.link !== null
			)
			.map((item) => ({
				url: item.url,
				link: item.link,
				size: Number(item.size),
				filename: item.url.split('/').pop() || 'Unknown',
				updatedAt: item.updatedAt,
			}));

		const combined = [...availableResults, ...otherCastResults]
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
			.slice(0, limit);

		return combined.map(({ updatedAt, ...item }) => item);
	}
}
