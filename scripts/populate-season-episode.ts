import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type ParsedEpisodeInfo = {
	season?: number;
	episode?: number;
	isSeasonPack?: boolean;
};

const EPISODE_PATTERNS: Array<{
	regex: RegExp;
	seasonIndex: number;
	episodeIndex: number;
}> = [
	{ regex: /s(\d{1,2})e(\d{1,2})/i, seasonIndex: 1, episodeIndex: 2 },
	{ regex: /(\d{1,2})x(\d{1,2})/i, seasonIndex: 1, episodeIndex: 2 },
	{
		regex: /season[^\d]{0,6}(\d{1,2}).*episode[^\d]{0,6}(\d{1,2})/i,
		seasonIndex: 1,
		episodeIndex: 2,
	},
	{
		regex: /episode[^\d]{0,6}(\d{1,2}).*season[^\d]{0,6}(\d{1,2})/i,
		seasonIndex: 2,
		episodeIndex: 1,
	},
];

const SEASON_ONLY_PATTERNS: Array<{ regex: RegExp; captureIndex?: number }> = [
	{ regex: /season[^\d]{0,6}(\d{1,2})/i, captureIndex: 1 },
	{ regex: /(^|[^a-z0-9])s(\d{1,2})(?![a-z0-9])/i, captureIndex: 2 },
];

function extractEpisodeInfo(text: string): ParsedEpisodeInfo | null {
	for (const pattern of EPISODE_PATTERNS) {
		const match = pattern.regex.exec(text);
		if (match) {
			const season = parseInt(match[pattern.seasonIndex], 10);
			const episode = parseInt(match[pattern.episodeIndex], 10);
			if (!Number.isNaN(season) && !Number.isNaN(episode)) {
				return { season, episode };
			}
		}
	}

	for (const pattern of SEASON_ONLY_PATTERNS) {
		const match = pattern.regex.exec(text);
		if (match) {
			const captureIndex = pattern.captureIndex ?? 1;
			const season = parseInt(match[captureIndex], 10);
			if (!Number.isNaN(season)) {
				return { season, isSeasonPack: true };
			}
		}
	}

	return null;
}

async function populateSeasonEpisode() {
	console.log('Starting to populate season/episode data for AvailableFile table...');

	const batchSize = 1000;
	let totalProcessed = 0;
	let totalUpdated = 0;

	while (true) {
		const files = await prisma.availableFile.findMany({
			where: {
				season: null,
			},
			select: {
				link: true,
				path: true,
			},
			take: batchSize,
		});

		if (files.length === 0) {
			break;
		}

		console.log(
			`Processing batch of ${files.length} files (total processed: ${totalProcessed})`
		);

		for (const file of files) {
			totalProcessed++;

			const parsed = extractEpisodeInfo(file.path);

			if (parsed && parsed.season !== undefined) {
				await prisma.availableFile.update({
					where: { link: file.link },
					data: {
						season: parsed.season,
						episode: parsed.episode,
					},
				});
				totalUpdated++;

				if (totalUpdated % 100 === 0) {
					console.log(`Updated ${totalUpdated} files so far...`);
				}
			}
		}
	}

	console.log(`\nCompleted!`);
	console.log(`Total files processed: ${totalProcessed}`);
	console.log(`Total files updated: ${totalUpdated}`);
	console.log(`Not updated (no episode info found): ${totalProcessed - totalUpdated}`);

	console.log('\n---\n');
	console.log(
		'Now populating season/episode data for Available table (for backward compatibility)...'
	);

	totalProcessed = 0;
	totalUpdated = 0;

	while (true) {
		const items = await prisma.available.findMany({
			where: {
				imdbId: {
					contains: 'tt',
				},
				season: null,
			},
			select: {
				hash: true,
				filename: true,
				files: {
					select: {
						path: true,
					},
					take: 1,
				},
			},
			take: batchSize,
		});

		if (items.length === 0) {
			break;
		}

		console.log(
			`Processing batch of ${items.length} torrents (total processed: ${totalProcessed})`
		);

		for (const item of items) {
			totalProcessed++;

			const candidates = [item.filename];
			if (item.files.length > 0 && item.files[0].path) {
				candidates.push(item.files[0].path);
			}

			let parsed: ParsedEpisodeInfo | null = null;
			for (const candidate of candidates) {
				parsed = extractEpisodeInfo(candidate);
				if (parsed) {
					break;
				}
			}

			if (parsed && parsed.season !== undefined) {
				await prisma.available.update({
					where: { hash: item.hash },
					data: {
						season: parsed.season,
						episode: parsed.episode,
					},
				});
				totalUpdated++;

				if (totalUpdated % 100 === 0) {
					console.log(`Updated ${totalUpdated} torrents so far...`);
				}
			}
		}
	}

	console.log(`\nCompleted!`);
	console.log(`Total torrents processed: ${totalProcessed}`);
	console.log(`Total torrents updated: ${totalUpdated}`);
	console.log(`Not updated (no episode info found): ${totalProcessed - totalUpdated}`);
}

populateSeasonEpisode()
	.catch((error) => {
		console.error('Error:', error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
