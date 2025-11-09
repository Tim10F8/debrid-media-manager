import { createMockRequest, createMockResponse } from '@/test/utils/api';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './[link]';

const { mockUnrestrictLink } = vi.hoisted(() => ({
	mockUnrestrictLink: vi.fn(),
}));

vi.mock('@/services/realDebrid', () => ({
	unrestrictLink: mockUnrestrictLink,
}));

describe('/api/stremio/[userid]/play/[link]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUnrestrictLink.mockResolvedValue({ download: 'https://rd/download' });
	});

	it('validates required query params', async () => {
		const req = createMockRequest({ query: { userid: 'user', token: 'tok' } });
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			status: 'error',
			errorMessage: 'Invalid "userid", "link" or "token" query parameter',
		});
	});

	it('unrestricts the link and redirects to the download URL', async () => {
		const req = createMockRequest({
			query: { userid: 'user', link: 'abcdef1234567890', token: 'tok' },
			headers: { 'cf-connecting-ip': '127.0.0.1' },
		});
		const res = createMockResponse();
		(res.redirect as Mock).mockReturnValue(res);

		await handler(req, res);

		expect(mockUnrestrictLink).toHaveBeenCalledWith(
			'tok',
			expect.stringContaining('https://real-debrid.com/d/abcdef123456'),
			'127.0.0.1',
			false
		);
		expect(res.redirect).toHaveBeenCalledWith('https://rd/download');
	});

	it('returns 500 when the link cannot be unrestricted', async () => {
		mockUnrestrictLink.mockResolvedValue(null);
		const req = createMockRequest({
			query: { userid: 'user', link: 'abcdef1234567890', token: 'tok' },
			headers: { 'cf-connecting-ip': '127.0.0.1' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ error: 'Failed to unrestrict link' });
	});

	it('handles unexpected errors', async () => {
		mockUnrestrictLink.mockRejectedValue(new Error('rd down'));
		const req = createMockRequest({
			query: { userid: 'user', link: 'abcdef1234567890', token: 'tok' },
		});
		const res = createMockResponse();

		await handler(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ error: 'Failed to play link' });
	});
});
