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

import { scrapeRuTor } from './rutor';

beforeEach(() => {
	axiosMock.get.mockReset();
	meetsTitleConditions.mockClear();
});

describe('scrapeRuTor', () => {
	it('returns parsed torrents that satisfy title checks', async () => {
		const html = `
      Результатов поиска 2
      <a href="/torrent/1/foo">Ignored / Keep Title (2024) | extra</a>
      <td align="right">1.25&nbsp;GB</td>
      magnet:?xt=urn:btih:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
      <a href="/torrent/2/bar">Another / Skip Title (2023)</a>
      <td align="right">800&nbsp;MB</td>
      magnet:?xt=urn:btih:DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD
    `;
		axiosMock.get.mockResolvedValue({ data: html });
		meetsTitleConditions.mockReturnValueOnce(true).mockReturnValueOnce(false);

		const results = await scrapeRuTor('query', 'Target', ['2024'], '2024-01-01');

		expect(results).toEqual([
			{
				title: 'Keep Title (2024)',
				fileSize: 1280,
				hash: 'cccccccccccccccccccccccccccccccccccccccc',
			},
		]);
		expect(meetsTitleConditions).toHaveBeenCalledWith('Target', ['2024'], 'Keep Title (2024)');
	});
});
