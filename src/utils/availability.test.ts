import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	checkAvailability,
	checkAvailabilityByHashes,
	removeAvailability,
	submitAvailability,
} from './availability';

const ok = (data: any) => ({ ok: true, json: vi.fn(async () => data) }) as any;
const fail = (data: any) => ({ ok: false, json: vi.fn(async () => data) }) as any;

describe('availability client utils', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('checkAvailability filters invalid hashes and short-circuits', async () => {
		const res = await checkAvailability('k', 's', 'tt123', ['bad', 'also-bad']);
		expect(res).toEqual({ available: [] });
	});

	it('checkAvailability posts valid hashes and returns JSON', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch' as any)
			.mockResolvedValue(ok({ available: ['hash'] }));
		const res = await checkAvailability('k', 's', 'tt123', [
			'abcdef0123456789abcdef0123456789abcdef01',
		]);
		expect(fetchMock).toHaveBeenCalled();
		expect(res).toEqual({ available: ['hash'] });
	});

	it('checkAvailability surfaces error details from server', async () => {
		vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
			fail({ error: 'Bad request', hash: 'deadbeef' })
		);
		await expect(
			checkAvailability('k', 's', 'tt123', ['abcdef0123456789abcdef0123456789abcdef01'])
		).rejects.toThrow(/Bad request|Failed to check availability/);
	});

	it('checkAvailabilityByHashes posts to alternative route', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch' as any)
			.mockResolvedValue(ok({ available: ['hash2'] }));
		const res = await checkAvailabilityByHashes('k', 's', [
			'abcdef0123456789abcdef0123456789abcdef01',
		]);
		expect(fetchMock).toHaveBeenCalled();
		expect(res).toEqual({ available: ['hash2'] });
	});

	it('submitAvailability posts when status is downloaded', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch' as any)
			.mockResolvedValue(ok({ success: true }));
		const resp = await submitAvailability(
			'k',
			's',
			{
				id: '1',
				status: 'downloaded',
				progress: 100,
				files: [{ id: 1, path: 'v.mkv', selected: 1, bytes: 1 }],
				links: ['l'],
			} as any,
			'tt123'
		);
		expect(fetchMock).toHaveBeenCalled();
		expect(resp).toEqual({ success: true });
	});

	it('removeAvailability posts and returns JSON', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch' as any)
			.mockResolvedValue(ok({ removed: true }));
		const resp = await removeAvailability(
			'k',
			's',
			'abcdef0123456789abcdef0123456789abcdef01',
			'reason'
		);
		expect(fetchMock).toHaveBeenCalled();
		expect(resp).toEqual({ removed: true });
	});
});
