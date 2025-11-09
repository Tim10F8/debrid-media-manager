import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({
	get: vi.fn(),
}));

vi.mock('axios', () => ({
	default: axiosMock,
}));

const meetsTitleConditions = vi.hoisted(() =>
	vi.fn((_targetTitle: string, _years: string[], _title: string) => true)
);

vi.mock('@/utils/checks', () => ({
	meetsTitleConditions,
}));

import { scrapeTorrentGalaxy } from './tgx';

beforeEach(() => {
	axiosMock.get.mockReset();
	meetsTitleConditions.mockClear();
});

describe('scrapeTorrentGalaxy', () => {
	it('extracts torrent metadata from HTML', async () => {
		const html = `
      <span src='torrent'><b>Keep Release</b></span>
      <span src='torrent'><b>Drop Release</b></span>
      magnet:?xt=urn:btih:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
      magnet:?xt=urn:btih:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
      <span class='badge badge-secondary txlight' style='border-radius:4px;'>1.50 GB</span>
      <span class='badge badge-secondary txlight' style='border-radius:4px;'>700 MB</span>
    `;
		axiosMock.get.mockResolvedValue({ data: html });
		meetsTitleConditions.mockImplementation(
			(_targetTitle: string, _years: string[], title: string) => title === 'Keep Release'
		);

		const results = await scrapeTorrentGalaxy('query', 'Target', ['2024'], '2024-01-01');

		expect(results).toEqual([
			{
				title: 'Keep Release',
				fileSize: 1536,
				hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			},
		]);
		expect(meetsTitleConditions).toHaveBeenCalledTimes(2);
	});

	it('bubbles up errors as empty results after retries', async () => {
		const timerSpy = vi
			.spyOn(globalThis, 'setTimeout')
			.mockImplementation((fn: Parameters<typeof setTimeout>[0]) => {
				fn();
				return 0 as any;
			});
		axiosMock.get.mockRejectedValue(new Error('offline'));

		const results = await scrapeTorrentGalaxy('query', 'Target', ['2024'], '2024-01-01');

		expect(results).toEqual([]);
		expect(axiosMock.get).toHaveBeenCalledTimes(5);
		timerSpy.mockRestore();
	});
});
