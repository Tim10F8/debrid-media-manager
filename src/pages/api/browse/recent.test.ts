import { repository } from '@/services/repository';
import { createMockRequest, createMockResponse } from '@/test/utils/api';
import { describe, expect, it, vi } from 'vitest';
import handler from './recent';

vi.mock('@/services/repository');
const mockRepository = vi.mocked(repository);

describe('/api/browse/recent', () => {
	it('returns deduplicated updates list', async () => {
		mockRepository.getRecentlyUpdatedContent = vi
			.fn()
			.mockResolvedValue(['tt1', 'tt2', 'tt1', 'tt3']);
		const req = createMockRequest();
		const res = createMockResponse();

		await handler(req, res);

		expect(mockRepository.getRecentlyUpdatedContent).toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(['tt1', 'tt2', 'tt3']);
	});
});
