import { describe, expect, it } from 'vitest';

import { renderTorrentInfo } from './render';

const baseFile = {
	id: 1,
	path: 'Example.mkv',
	bytes: 1024,
	selected: 1,
};

const rdInfo = {
	id: '1',
	hash: 'hash-123',
	status: 'downloaded',
	fake: false,
	files: [baseFile],
	links: ['https://real-debrid.com/link'],
	progress: 100,
	bytes: 1024,
	filename: 'Example.mkv',
};

describe('renderTorrentInfo', () => {
	it('adds hidden inputs for watch and cast actions', () => {
		const html = renderTorrentInfo(
			{ ...rdInfo },
			true,
			'rd-token',
			'mac2',
			'tt1234567',
			'movie'
		);

		expect(html).toContain('action="/api/watch/mac2"');
		expect(html).toContain('name="token" value="rd-token"');
		expect(html).toContain('name="hash" value="hash-123"');
		expect(html).toContain('name="link" value="https://real-debrid.com/link"');
		expect(html).toContain('action="/api/stremio/cast/tt1234567"');
		expect(html).toContain('name="fileId" value="1"');
		expect(html).toContain('name="mediaType" value="movie"');
	});

	it('adds hidden inputs for instant watch when torrent is fake', () => {
		const fakeInfo = {
			...rdInfo,
			fake: true,
			links: [],
		};
		const html = renderTorrentInfo(fakeInfo, true, 'rd-token', 'mac2', 'tt1234567', 'movie');

		expect(html).toContain('action="/api/watch/instant/mac2"');
		expect(html).toContain('name="fileId" value="1"');
	});
});
