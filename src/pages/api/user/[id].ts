import { DatabaseClient } from '@/services/database/client';
import type { NextApiRequest, NextApiResponse } from 'next';

class UserService extends DatabaseClient {
	async findById(id: number) {
		return this.prisma.user.findUnique({
			where: { id },
			select: {
				id: true,
				patreonId: true,
				githubId: true,
				discordId: true,
				patreonSubscription: {
					select: {
						tier: true,
						subscriptionDate: true,
					},
				},
			},
		});
	}
}

const userService = new UserService();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		return res.status(405).json({ error: 'Method not allowed' });
	}

	const { id } = req.query;

	if (!id || Array.isArray(id)) {
		return res.status(400).json({ error: 'Invalid user ID' });
	}

	const numericId = parseInt(id, 10);
	if (isNaN(numericId)) {
		return res.status(400).json({ error: 'Invalid user ID' });
	}

	try {
		const user = await userService.findById(numericId);

		if (!user) {
			return res.status(404).json({ error: 'User not found' });
		}

		return res.status(200).json(user);
	} catch (error) {
		console.error('Error fetching user:', error);
		return res.status(500).json({ error: 'Failed to fetch user details' });
	}
}
