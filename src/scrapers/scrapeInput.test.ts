import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientMock = vi.hoisted(() => ({
	getListItems: vi.fn(),
	searchLists: vi.fn(),
}));

vi.mock('@/services/mdblistClient', () => ({
	getMdblistClient: () => clientMock,
}));

import { ScrapeInput } from './scrapeInput';

beforeEach(() => {
	clientMock.getListItems.mockReset();
	clientMock.searchLists.mockReset();
});

describe('ScrapeInput', () => {
	it('yields IMDb ids from a list id', async () => {
		clientMock.getListItems.mockResolvedValue([
			{ imdb_id: 'tt001', rank: 1, title: 'A' },
			{ imdb_id: null, rank: 2, title: 'B' },
			{ imdb_id: 'tt002', rank: 3, title: 'C' },
		]);

		const input = new ScrapeInput();
		const collected: string[] = [];
		for await (const imdbId of input.byListId('best')) {
			collected.push(imdbId);
		}

		expect(collected).toEqual(['tt001', 'tt002']);
		expect(clientMock.getListItems).toHaveBeenCalledWith('best');
	});

	it('yields list ids when searching by keyword', async () => {
		clientMock.searchLists.mockResolvedValue([
			{ id: 'list-1', slug: 'alpha' },
			{ id: 'list-2', slug: 'beta' },
		]);

		const input = new ScrapeInput();
		const collected: string[] = [];
		for await (const listId of input.byLists('ninjas')) {
			collected.push(listId);
		}

		expect(collected).toEqual(['list-1', 'list-2']);
		expect(clientMock.searchLists).toHaveBeenCalledWith('ninjas');
	});
});
