import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock('axios', () => ({
	default: axiosMock,
}));

const meetsTitleConditions = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/utils/checks', () => ({
	meetsTitleConditions,
}));

import { scrapeApiBay2 } from './apibay2';

beforeEach(() => {
	axiosMock.get.mockReset();
	meetsTitleConditions.mockClear();
});

describe('scrapeApiBay2', () => {
	it('parses ApiBay results and filters by title conditions', async () => {
		axiosMock.get.mockResolvedValue({
			data: [
				{
					name: 'Keep Movie 2024',
					size: `${1024 * 1024}`,
					info_hash: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12',
				},
				{
					name: 'Drop Movie 2023',
					size: `${2048}`,
					info_hash: '1111111111111111111111111111111111111111',
				},
			],
		});
		meetsTitleConditions.mockReturnValueOnce(true).mockReturnValueOnce(false);

		const results = await scrapeApiBay2('query', 'Target', ['2024'], '2024-01-01');

		expect(results).toEqual([
			{
				title: 'Keep Movie 2024',
				fileSize: 1,
				hash: 'abcdef1234567890abcdef1234567890abcdef12',
			},
		]);
		expect(meetsTitleConditions).toHaveBeenCalledWith('Target', ['2024'], 'Keep Movie 2024');
	});

	it('returns an empty array when ApiBay keeps failing', async () => {
		const timerSpy = vi
			.spyOn(globalThis, 'setTimeout')
			.mockImplementation((fn: Parameters<typeof setTimeout>[0]) => {
				fn();
				return 0 as any;
			});
		axiosMock.get.mockRejectedValue(new Error('network down'));

		const results = await scrapeApiBay2('query', 'Target', ['2024'], '2024-01-01');

		expect(results).toEqual([]);
		expect(axiosMock.get).toHaveBeenCalledTimes(5);
		timerSpy.mockRestore();
	});
});
