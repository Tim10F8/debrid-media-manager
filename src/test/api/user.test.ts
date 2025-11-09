import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaInstance = vi.hoisted(() => ({
	user: {
		findUnique: vi.fn(),
	},
}));

vi.mock('@prisma/client', () => ({
	PrismaClient: vi.fn(() => prismaInstance),
}));

import handler from '@/pages/api/user/[id]';

const createRes = () => {
	const res: any = {
		status: vi.fn().mockReturnThis(),
		json: vi.fn(),
	};
	return res;
};

beforeEach(() => {
	vi.clearAllMocks();
	prismaInstance.user.findUnique.mockReset();
});

describe('API /api/user/[id]', () => {
	it('rejects non-GET methods', async () => {
		const res = createRes();
		await handler({ method: 'POST' } as any, res);
		expect(res.status).toHaveBeenCalledWith(405);
	});

	it('validates the id parameter', async () => {
		const res = createRes();
		await handler({ method: 'GET', query: {} } as any, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns a 404 when the user is missing', async () => {
		prismaInstance.user.findUnique.mockResolvedValue(null);
		const res = createRes();
		await handler({ method: 'GET', query: { id: '1' } } as any, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns the user payload when found', async () => {
		const user = { id: 1, patreonId: 'p1' };
		prismaInstance.user.findUnique.mockResolvedValue(user);
		const res = createRes();
		await handler({ method: 'GET', query: { id: '2' } } as any, res);

		expect(prismaInstance.user.findUnique).toHaveBeenCalledWith({
			where: { id: 2 },
			select: expect.any(Object),
		});
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(user);
	});
});
