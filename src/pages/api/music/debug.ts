import { prisma } from '@/utils/prisma';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	try {
		// Get counts
		const totalAlbums = await prisma.availableMusic.count();
		const downloadedAlbums = await prisma.availableMusic.count({
			where: { status: 'downloaded', progress: 100 },
		});
		const totalFiles = await prisma.availableMusicFile.count();

		// Get a sample album with all its files
		const sampleAlbum = await prisma.availableMusic.findFirst({
			include: { files: true },
		});

		// Get unique statuses
		const statuses = await prisma.availableMusic.groupBy({
			by: ['status'],
			_count: true,
		});

		// Get file extensions distribution
		const allFiles = await prisma.availableMusicFile.findMany({
			select: { path: true },
			take: 100,
		});

		const extensions = allFiles.map((f) => {
			const lastDot = f.path.lastIndexOf('.');
			return lastDot >= 0 ? f.path.slice(lastDot).toLowerCase() : '(no extension)';
		});

		const extCounts: Record<string, number> = {};
		extensions.forEach((ext) => {
			extCounts[ext] = (extCounts[ext] || 0) + 1;
		});

		res.status(200).json({
			totalAlbums,
			downloadedAlbums,
			totalFiles,
			statuses,
			sampleAlbum: sampleAlbum
				? {
						hash: sampleAlbum.hash,
						mbid: sampleAlbum.mbid,
						filename: sampleAlbum.filename,
						status: sampleAlbum.status,
						progress: sampleAlbum.progress,
						fileCount: sampleAlbum.files.length,
						files: sampleAlbum.files.map((f) => ({
							path: f.path,
							bytes: Number(f.bytes),
							trackNumber: f.trackNumber,
						})),
					}
				: null,
			extensionDistribution: extCounts,
		});
	} catch (error) {
		console.error('Debug error:', error);
		res.status(500).json({ error: String(error) });
	}
}
