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

afterEach(() => {
	document.body.innerHTML = '';
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

	it('wires file selection buttons and saves the chosen files', async () => {
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
			links: ['https://rd/link-1', 'https://rd/link-2'],
			files: [
				{ id: '1', selected: 1, path: 'movie.mkv', bytes: 1024 },
				{ id: '2', selected: 1, path: 'readme.txt', bytes: 512 },
				{ id: '3', selected: 0, path: 'clip.mkv', bytes: 256 },
			],
			added: new Date().toISOString(),
		};

		const onReinsertRd = vi.fn().mockResolvedValue(undefined);

		await showInfoForRD('app', 'rd-key', rdInfo, 'tt1234567', 'movie', false, {
			onReinsertRd,
		});

		const options = mocks.modalFireMock.mock.calls[0][0];
		document.body.innerHTML = options.html as string;

		const tbody = document.querySelector('tbody');
		expect(tbody).toBeTruthy();
		if (tbody) {
			tbody.innerHTML = rdInfo.files
				.map(
					(f) => `<tr>
						<td>
							<input type="checkbox" class="file-selector" data-file-id="${f.id}" data-file-path="${f.path}" ${f.selected ? 'checked' : ''}/>
						</td>
					</tr>`
				)
				.join('');
		}

		options.didOpen?.(document.body as any);

		const getCheckedIds = () =>
			Array.from(document.querySelectorAll<HTMLInputElement>('.file-selector'))
				.filter((cb) => cb.checked)
				.map((cb) => cb.dataset.fileId);
		const saveBtn = document.getElementById('btn-save-selection') as HTMLButtonElement;
		const resetBtn = document.getElementById('btn-reset-selection') as HTMLButtonElement;

		expect(document.getElementById('selection-count')?.textContent).toContain('2/3');
		expect(
			(document.getElementById('btn-toggle-selection') as HTMLButtonElement).textContent
		).toContain('Select All');
		expect(saveBtn.hidden).toBe(true);
		expect(resetBtn.hidden).toBe(true);

		(document.getElementById('btn-only-videos') as HTMLButtonElement).click();
		expect(getCheckedIds()).toEqual(['1', '3']);
		expect(document.getElementById('selection-count')?.textContent).toContain('2/3');
		expect(saveBtn.hidden).toBe(false);
		expect(resetBtn.hidden).toBe(false);

		(document.getElementById('btn-toggle-selection') as HTMLButtonElement).click();
		expect(getCheckedIds()).toEqual(['1', '2', '3']);
		expect(document.getElementById('selection-count')?.textContent).toContain('3/3');
		expect(
			(document.getElementById('btn-toggle-selection') as HTMLButtonElement).textContent
		).toContain('Unselect All');
		expect(saveBtn.hidden).toBe(false);
		expect(resetBtn.hidden).toBe(false);

		(document.getElementById('btn-toggle-selection') as HTMLButtonElement).click();
		expect(getCheckedIds()).toEqual([]);
		expect(document.getElementById('selection-count')?.textContent).toContain('0/3');
		expect(
			(document.getElementById('btn-toggle-selection') as HTMLButtonElement).textContent
		).toContain('Select All');
		expect(saveBtn.hidden).toBe(true);
		expect(resetBtn.hidden).toBe(false);

		(document.getElementById('btn-reset-selection') as HTMLButtonElement).click();
		expect(getCheckedIds()).toEqual(['1', '2']);
		expect(document.getElementById('selection-count')?.textContent).toContain('2/3');
		expect(
			(document.getElementById('btn-toggle-selection') as HTMLButtonElement).textContent
		).toContain('Select All');
		expect(saveBtn.hidden).toBe(true);
		expect(resetBtn.hidden).toBe(true);

		const file1 = document.querySelector<HTMLInputElement>('input[data-file-id="1"]')!;
		const file2 = document.querySelector<HTMLInputElement>('input[data-file-id="2"]')!;
		const file3 = document.querySelector<HTMLInputElement>('input[data-file-id="3"]')!;
		file1.checked = false;
		file1.dispatchEvent(new Event('change'));
		file2.checked = false;
		file2.dispatchEvent(new Event('change'));
		file3.checked = true;
		file3.dispatchEvent(new Event('change'));

		(document.getElementById('btn-save-selection') as HTMLButtonElement).click();

		await vi.waitFor(() => {
			expect(onReinsertRd).toHaveBeenCalledWith(
				'rd-key',
				{ id: 'rd:1', hash: 'hash-1' },
				true,
				['3']
			);
		});
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

	it('includes cast all button for library torrents', async () => {
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
		expect(options.html).toContain('id="btn-cast-all"');
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
