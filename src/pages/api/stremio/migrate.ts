import { Repository } from '@/services/repository';
import {
	generateLegacyUserId,
	generateUserId,
	validateMethod,
	validateToken,
} from '@/utils/castApiHelpers';
import { NextApiRequest, NextApiResponse } from 'next';

const db = new Repository();

// Migrates user data from legacy 5-character token to new 12-character token
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!validateMethod(req, res, ['POST'])) return;

	const token = validateToken(req, res);
	if (!token) return;

	try {
		// Generate both old and new tokens for the same user
		const [newUserId, legacyUserId] = await Promise.all([
			generateUserId(token), // 12 characters
			generateLegacyUserId(token), // 5 characters
		]);

		// Check if legacy profile exists
		const legacyProfile = await db.getCastProfile(legacyUserId);
		if (!legacyProfile) {
			res.status(200).json({
				message: 'No legacy profile found, no migration needed',
				newUserId,
			});
			return;
		}

		// Check if new profile already exists
		const existingNewProfile = await db.getCastProfile(newUserId);
		if (existingNewProfile) {
			res.status(200).json({
				message: 'Migration already completed',
				newUserId,
			});
			return;
		}

		// Create new profile with same credentials
		await db.saveCastProfile(
			newUserId,
			legacyProfile.clientId,
			legacyProfile.clientSecret,
			legacyProfile.refreshToken
		);

		// Migrate all cast entries
		const legacyCasts = await db.getAllUserCasts(legacyUserId);
		let migratedCount = 0;
		for (const cast of legacyCasts) {
			// Only migrate entries with links (valid casts)
			if (cast.link) {
				await db.saveCast(
					cast.imdbId,
					newUserId,
					cast.hash,
					cast.url,
					cast.link,
					cast.size
				);
				migratedCount++;
			}
		}

		res.status(200).json({
			message: 'Migration completed successfully',
			newUserId,
			migratedCasts: migratedCount,
			totalCasts: legacyCasts.length,
		});
	} catch (error) {
		res.status(500).json({
			status: 'error',
			errorMessage: error instanceof Error ? error.message : 'Migration failed',
		});
	}
}
