import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	modalFireMock: vi.fn(),
	modalShowLoadingMock: vi.fn(),
	axiosGetMock: vi.fn(),
	handleShareMock: vi.fn(),
}));

vi.mock('../modals/modal', () => ({
	__esModule: true,
	default: {
		fire: mocks.modalFireMock,
		showLoading: mocks.modalShowLoadingMock,
		close: vi.fn(),
		showValidationMessage: vi.fn(),
		DismissReason: {},
	},
}));

vi.mock('axios', () => {
	const axiosMock: any = {
		get: mocks.axiosGetMock,
		post: vi.fn(),
		delete: vi.fn(),
	};
	axiosMock.create = vi.fn(() => axiosMock);
	axiosMock.interceptors = {
		request: { use: vi.fn(), eject: vi.fn() },
		response: { use: vi.fn(), eject: vi.fn() },
	};
	return {
		__esModule: true,
		default: axiosMock,
		get: axiosMock.get,
		post: axiosMock.post,
		delete: axiosMock.delete,
		create: axiosMock.create,
		interceptors: axiosMock.interceptors,
	};
});

vi.mock('../../utils/hashList', () => ({
	__esModule: true,
	handleShare: mocks.handleShareMock,
}));

vi.mock('./render', () => ({
	__esModule: true,
	renderTorrentInfo: vi.fn(() => '<tr></tr>'),
}));

vi.mock('./utils', async () => {
	const actual = await vi.importActual<typeof import('./utils')>('./utils');
	return {
		__esModule: true,
		...actual,
		fetchMediaInfo: vi.fn(async () => null),
		generatePasswordHash: vi.fn(async () => 'hashed'),
		getStreamInfo: vi.fn(() => []),
	};
});

import Modal from '../modals/modal';
import { showInfoForAD, showInfoForRD } from './index';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.modalFireMock.mockResolvedValue({ isConfirmed: false });
	mocks.axiosGetMock.mockResolvedValue({ data: {} });
	mocks.handleShareMock.mockResolvedValue('https://share');
});

describe('torrent info modal buttons', () => {
	it('omits cancel button for Real-Debrid torrents', async () => {
		const rdInfo = {
			id: 1,
			hash: 'hash-1',
			filename: 'Example.mkv',
			bytes: 1024,
			original_filename: 'ExampleOriginal.mkv',
			original_bytes: 2048,
			progress: 100,
			speed: 0,
			seeders: 0,
			status: 'downloaded',
			fake: false,
			links: ['https://rd/link'],
			files: [{ id: 'file1', selected: 1, path: 'Example.mkv', bytes: 1024 }],
			added: new Date().toISOString(),
		};

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false);

		expect(Modal.showLoading).toHaveBeenCalled();
		expect(mocks.modalShowLoadingMock).toHaveBeenCalled();
		expect(mocks.modalFireMock).toHaveBeenCalledTimes(1);
		const options = mocks.modalFireMock.mock.calls[0][0];
		expect(options.showCancelButton).toBe(false);
		expect(options.showConfirmButton).toBe(false);
	});

	it('includes a search button for the original filename', async () => {
		const rdInfo = {
			id: 1,
			hash: 'hash-1',
			filename: 'Example.mkv',
			bytes: 1024,
			original_filename: 'ExampleOriginal.mkv',
			original_bytes: 2048,
			progress: 100,
			speed: 0,
			seeders: 0,
			status: 'downloaded',
			fake: false,
			links: ['https://rd/link'],
			files: [{ id: 'file1', selected: 1, path: 'Example.mkv', bytes: 1024 }],
			added: new Date().toISOString(),
		};

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false);

		const html = mocks.modalFireMock.mock.calls[0][0].html as string;
		expect(html).toContain('action="/search"');
		expect(html).toContain('name="query" value="ExampleOriginal.mkv"');
		expect(html).toContain('Search again');
		expect(html).toMatch(
			/Original filename<\/td>\s*<td><span class="mr-2">ExampleOriginal\.mkv<\/span>\s*<form/
		);
	});

	it('hides search button when torrent info is fake', async () => {
		const rdInfo = {
			id: 1,
			hash: 'hash-1',
			filename: 'Example.mkv',
			bytes: 1024,
			original_filename: 'ExampleOriginal.mkv',
			original_bytes: 2048,
			progress: 100,
			speed: 0,
			seeders: 0,
			status: 'downloaded',
			fake: true,
			links: [],
			files: [{ id: 'file1', selected: 1, path: 'Example.mkv', bytes: 1024 }],
			added: new Date().toISOString(),
		};

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false);

		const html = mocks.modalFireMock.mock.calls[0][0].html as string;
		expect(html).not.toContain('Search again');
		const matches = html.match(/Original filename<\/td>\s*<td>(.*?)<\/td>/);
		expect(matches?.[1]).not.toContain('<form');
	});

	it('normalizes complex filenames for search queries', async () => {
		const rdInfo = {
			id: 1,
			hash: 'hash-1',
			filename: 'The.Grifters.1990.BDREMUX.2160p.HDR.DV.seleZen.mkv',
			bytes: 1024,
			original_filename: 'The.Grifters.1990.BDREMUX.2160p.HDR.DV.seleZen.mkv',
			original_bytes: 2048,
			progress: 100,
			speed: 0,
			seeders: 0,
			status: 'downloaded',
			fake: false,
			links: ['https://rd/link'],
			files: [{ id: 'file1', selected: 1, path: 'Example.mkv', bytes: 1024 }],
			added: new Date().toISOString(),
		};

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false);

		const options = mocks.modalFireMock.mock.calls[0][0];
		expect(options.html).toContain('name="query" value="The Grifters 1990"');
	});

	it('includes rdToken hidden input for library cast button', async () => {
		const rdInfo = {
			id: 1,
			hash: 'hash-1',
			filename: 'Example.mkv',
			bytes: 1024,
			original_filename: 'ExampleOriginal.mkv',
			original_bytes: 2048,
			progress: 100,
			speed: 0,
			seeders: 0,
			status: 'downloaded',
			fake: false,
			links: ['https://rd/link'],
			files: [{ id: 'file1', selected: 1, path: 'Example.mkv', bytes: 1024 }],
			added: new Date().toISOString(),
		};

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false);

		const options = mocks.modalFireMock.mock.calls[0][0];
		expect(options.html).toContain('name="rdToken" value="rd-key"');
	});

	it('omits cancel button for AllDebrid torrents', async () => {
		const adInfo = {
			id: 2,
			hash: 'hash-2',
			filename: 'Example AD.mkv',
			size: 4096,
			status: 'ready',
			statusCode: 4,
			uploadDate: Date.now() / 1000,
			links: [{ link: 'https://ad/link', filename: 'Example AD.mkv', size: 4096 }],
		};

		await showInfoForAD('app', 'ad-key', adInfo, 'tt7654321', false);

		expect(mocks.modalFireMock).toHaveBeenCalledTimes(1);
		const options = mocks.modalFireMock.mock.calls[0][0];
		expect(options.showCancelButton).toBe(false);
		expect(options.showConfirmButton).toBe(false);
	});
});
