import { describe, expect, it } from 'vitest';
import { quickSearch, quickSearchLibrary } from './quickSearch';

describe('quickSearchLibrary', () => {
	const data: any[] = [
		{ id: 'rd:123', filename: 'Some Movie.mkv', hash: 'h1', serviceStatus: 'downloaded' },
		{ id: 'ad:456', filename: 'Show S01E01', hash: 'h2', serviceStatus: 'downloading' },
		{ id: 'tb:789', filename: 'Another.Thing', hash: 'h3', serviceStatus: 'queued' },
	];

	it('filters by filename regex or id/hash/status terms', () => {
		expect(quickSearchLibrary('Movie', data).length).toBe(1);
		expect(quickSearchLibrary('rd:', data).length).toBe(1);
		expect(quickSearchLibrary('123', data).length).toBe(1);
		expect(quickSearchLibrary('h2', data).length).toBe(1);
		expect(quickSearchLibrary('queued', data).length).toBe(1);
	});

	it('returns empty for invalid regex that matches nothing', () => {
		expect(quickSearchLibrary('(', data).length).toBe(0);
	});
});

describe('quickSearch', () => {
	const data: any[] = [
		{ title: 'Some Movie', hash: 'h1', videoCount: 2 },
		{ title: 'Show S01', hash: 'h2', videoCount: 10 },
		{ title: 'Another', hash: 'h3', videoCount: 0 },
	];

	it('supports videos:N, videos:<N, videos:>N filters', () => {
		expect(quickSearch('videos:2', data).length).toBe(1);
		expect(quickSearch('videos:<3', data).length).toBe(2);
		expect(quickSearch('videos:>3', data).length).toBe(1);
	});

	it('handles exclusion tokens and regex errors', () => {
		expect(quickSearch('Movie -Another', data).length).toBe(1);
		expect(quickSearch('(', data).length).toBe(0);
	});
});
