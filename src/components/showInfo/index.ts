import { addHashAsMagnet, proxyUnrestrictLink, selectFiles } from '@/services/realDebrid';
import { handleRestartTorrent } from '@/utils/addMagnet';
import { handleCopyOrDownloadMagnet } from '@/utils/copyMagnet';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import { magnetToastOptions } from '@/utils/toastOptions';
import axios from 'axios';
import toast from 'react-hot-toast';
import { handleShare } from '../../utils/hashList';
import { isVideo } from '../../utils/selectable';
import Modal from '../modals/modal';
import { renderButton, renderInfoTable } from './components';
import { renderTorrentInfo } from './render';
import { icons } from './styles';
import { ApiTorrentFile, MagnetLink, MediaInfoResponse } from './types';
import { generatePasswordHash, getStreamInfo } from './utils';

type ShowInfoHandlers = {
	onDeleteRd?: (rdKey: string, id: string) => Promise<void>;
	onReinsertRd?: (
		rdKey: string,
		torrent: { id: string; hash: string } | any,
		reload: boolean,
		selectedFileIds?: string[]
	) => Promise<void>;
	onDeleteAd?: (adKey: string, id: string) => Promise<void>;
	onRestartAd?: (adKey: string, id: string) => Promise<void>;
	onRefreshRd?: (limit?: number) => Promise<void>; // optional refresh hook
};

export const showInfoForRD = async (
	app: string,
	rdKey: string,
	info: any,
	imdbId: string = '',
	mediaType: 'movie' | 'tv' = 'movie',
	shouldDownloadMagnets?: boolean,
	handlers: ShowInfoHandlers = {}
): Promise<void> => {
	let warning = '';
	let mediaInfo: MediaInfoResponse | null = null;

	try {
		const password = await generatePasswordHash(info.hash);
		const response = await axios.get<MediaInfoResponse>(
			`https://debridmediamanager.com/mediainfo?hash=${info.hash}&password=${password}`
		);
		mediaInfo = response.data;
	} catch (error) {
		console.error('MediaInfo error:', error);
		// Silently fail as media info is optional
	}
	const isIntact =
		info.fake ||
		info.files.filter((f: ApiTorrentFile) => f.selected === 1).length === info.links.length;

	if (info.progress === 100 && !isIntact) {
		if (info.links.length === 1) {
			warning = `<div class="text-sm text-red-400">Warning: This torrent appears to have been rar'ed by Real-Debrid<br/></div>`;
		} else {
			warning = `<div class="text-sm text-red-400">Warning: Some files have expired</div>`;
		}
	}

	const torrent = {
		id: `rd:${info.id}`,
		hash: info.hash,
		filename: info.filename,
		bytes: info.bytes,
		title: info.filename,
		mediaType,
	};

	const downloadAllLinksParam = info.links.slice(0, 553).join('\n');
	const libraryActions = !info.fake
		? `
    <div class="mb-4 flex justify-center items-center flex-wrap">
        ${renderButton('share', { link: `${await handleShare(torrent)}` })}
        ${renderButton('delete', { id: 'btn-delete-rd' })}
        ${renderButton('magnet', { id: 'btn-magnet-copy', text: shouldDownloadMagnets ? 'Download' : 'Copy' })}
        ${renderButton('reinsert', { id: 'btn-reinsert-rd' })}
        ${rdKey ? renderButton('castAll', { link: `/api/stremio/cast/library/${info.id}:${info.hash}?rdToken=${rdKey}` }) : ''}
		${
			info.links.length > 0
				? renderButton('downloadAll', {
						link: 'https://real-debrid.com/downloader',
						linkParam: { name: 'links', value: downloadAllLinksParam },
					})
				: ''
		}
        ${info.links.length > 0 ? renderButton('exportLinks', { id: 'btn-export-links' }) : ''}
        ${info.links.length > 0 ? renderButton('generateStrm', { id: 'btn-generate-strm' }) : ''}
    </div>`
		: '';

	let html = `<h1 class="text-lg font-bold mt-6 mb-4 text-gray-100">${info.filename}</h1>
    ${libraryActions}
    <hr class="border-gray-600"/>
    <div class="text-sm max-h-60 mb-4 text-left p-1 bg-gray-900">
        <div class="overflow-x-auto" style="max-width: 100%;">
            <table class="table-auto">
                <tbody>
                    ${renderTorrentInfo(info, true, rdKey, app, imdbId, mediaType)}
                </tbody>
            </table>
        </div>
    </div>`;

	const saveButton = !info.fake
		? (() => {
				return `
                <div class="m-2 text-center">
                    <div id="selection-count" class="text-sm text-cyan-400 mb-2">${info.files.filter((f: ApiTorrentFile) => f.selected === 1).length}/${info.files.length} files selected</div>
                    <div class="flex gap-1 sm:gap-2 justify-center flex-wrap">
                        <button id="btn-select-all-videos"
                            class="px-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                            title="Select All Videos"
                        >
                            <span class="inline-flex items-center">${icons.selectVideos}<span class="hidden sm:inline ml-1">Select All Videos</span></span>
                        </button>
                        <button id="btn-unselect-all"
                            class="px-2 bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-500 hover:to-gray-400 text-white font-medium rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                            title="Unselect All"
                        >
                            <span class="inline-flex items-center">${icons.unselectAll}<span class="hidden sm:inline ml-1">Unselect All</span></span>
                        </button>
                        <button id="btn-reset-selection"
                            class="px-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-medium rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]"
                            title="Reset Selection"
                        >
                            ${icons.reset}
                        </button>
                    <button id="btn-save-selection"
                        class="px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                        title="Save File Selection"
                    >
                        <span class="inline-flex items-center">${icons.saveSelection}<span class="hidden sm:inline ml-1">Save Selection</span></span>
                    </button>
                    </div>
                </div>
            `;
			})()
		: '';

	const infoRows = info.fake
		? [
				{ label: 'Size', value: (info.bytes / 1024 ** 3).toFixed(2) + ' GB' },
				...getStreamInfo(mediaInfo),
			]
		: [
				{ label: 'Size', value: (info.bytes / 1024 ** 3).toFixed(2) + ' GB' },
				{ label: 'ID', value: info.id },
				{ label: 'Original filename', value: info.original_filename },
				{
					label: 'Original size',
					value: (info.original_bytes / 1024 ** 3).toFixed(2) + ' GB',
				},
				{ label: 'Status', value: info.status },
				...(info.status === 'downloading'
					? [
							{ label: 'Progress', value: info.progress.toFixed(2) + '%' },
							{ label: 'Speed', value: (info.speed / 1024).toFixed(2) + ' KB/s' },
							{ label: 'Seeders', value: info.seeders },
						]
					: []),
				{ label: 'Added', value: new Date(info.added).toLocaleString() },
				{ label: 'Progress', value: info.progress + '%' },
				...getStreamInfo(mediaInfo),
			];

	html = html.replace(
		'<hr class="border-gray-600"/>',
		`<div class="text-sm text-gray-200">
		${renderInfoTable(infoRows)}
		${warning}
		${saveButton}
	</div>`
	);

	await Modal.fire({
		html,
		showConfirmButton: false,
		customClass: {
			htmlContainer: '!mx-1',
			popup: '!bg-gray-900 !text-gray-100',
			confirmButton: 'haptic',
			cancelButton: 'haptic',
		},
		width: '800px',
		showCloseButton: true,
		inputAutoFocus: true,
		didOpen: () => {
			// Selection helpers
			const checkboxes = () =>
				Array.from(document.querySelectorAll<HTMLInputElement>('.file-selector'));
			const updateSelectionCount = () => {
				const total = checkboxes().length;
				const checked = checkboxes().filter((cb) => cb.checked).length;
				const el = document.getElementById('selection-count');
				if (el) el.textContent = `${checked}/${total} files selected`;
			};
			checkboxes().forEach((cb) => cb.addEventListener('change', updateSelectionCount));

			const selectAllVideosBtn = document.getElementById('btn-select-all-videos');
			selectAllVideosBtn?.addEventListener('click', () => {
				checkboxes().forEach((cb) => {
					const filePath = cb.dataset.filePath;
					if (filePath && isVideo({ path: filePath })) cb.checked = true;
				});
				updateSelectionCount();
			});

			const unselectAllBtn = document.getElementById('btn-unselect-all');
			unselectAllBtn?.addEventListener('click', () => {
				checkboxes().forEach((cb) => (cb.checked = false));
				updateSelectionCount();
			});

			const initialSelection: Record<string, boolean> = {};
			info.files.forEach((f: ApiTorrentFile) => (initialSelection[f.id] = f.selected === 1));
			const resetSelectionBtn = document.getElementById('btn-reset-selection');
			resetSelectionBtn?.addEventListener('click', () => {
				checkboxes().forEach((cb) => {
					const fileId = cb.dataset.fileId;
					cb.checked = fileId ? !!initialSelection[fileId] : false;
				});
				updateSelectionCount();
			});

			const magnetBtn = document.getElementById('btn-magnet-copy');
			magnetBtn?.addEventListener('click', () => {
				void handleCopyOrDownloadMagnet(info.hash, shouldDownloadMagnets);
			});

			const deleteBtn = document.getElementById('btn-delete-rd');
			deleteBtn?.addEventListener('click', async () => {
				if (handlers.onDeleteRd) {
					await handlers.onDeleteRd(rdKey, `rd:${info.id}`);
				} else {
					await handleDeleteRdTorrent(rdKey, `rd:${info.id}`);
				}
				Modal.close();
			});

			const reinsertBtn = document.getElementById('btn-reinsert-rd');
			reinsertBtn?.addEventListener('click', async () => {
				const selectedIds = checkboxes()
					.filter((cb) => cb.checked)
					.map((cb) => cb.dataset.fileId!)
					.filter(Boolean);
				try {
					if (handlers.onReinsertRd) {
						await handlers.onReinsertRd(
							rdKey,
							{ id: `rd:${info.id}`, hash: info.hash },
							true,
							selectedIds
						);
					} else {
						const oldId = `rd:${info.id}`;
						const newId = await addHashAsMagnet(rdKey, info.hash);
						await selectFiles(rdKey, newId, selectedIds);
						await handleDeleteRdTorrent(rdKey, oldId, true);
						toast.success('Selection saved and torrent reinserted', magnetToastOptions);
					}
					if (handlers.onRefreshRd) await handlers.onRefreshRd(2);
					Modal.close();
				} catch (error: any) {
					toast.error(
						'Error saving selection: ' + (error?.message || error),
						magnetToastOptions
					);
				}
			});

			const exportBtn = document.getElementById('btn-export-links');
			exportBtn?.addEventListener('click', async () => {
				try {
					let textContent = '';
					for (const link of info.links as string[]) {
						try {
							const resp = await proxyUnrestrictLink(rdKey, link);
							textContent += resp.download + '\n';
						} catch (e) {
							console.error(e);
						}
					}
					const blob = new Blob([textContent], { type: 'text/plain' });
					const a = document.createElement('a');
					a.href = URL.createObjectURL(blob);
					a.download = `${info.original_filename}.txt`;
					a.click();
					URL.revokeObjectURL(a.href);
				} catch (e) {
					console.error(e);
				}
			});

			const generateStrmBtn = document.getElementById('btn-generate-strm');
			generateStrmBtn?.addEventListener('click', async () => {
				for (const link of info.links as string[]) {
					try {
						const resp = await proxyUnrestrictLink(rdKey, link);
						const nameWithoutExt = resp.filename.substring(
							0,
							resp.filename.lastIndexOf('.')
						);
						const strmName = resp.streamable
							? `${nameWithoutExt}.strm`
							: `${resp.filename}.strm`;
						const blob = new Blob([resp.download], { type: 'text/plain' });
						const a = document.createElement('a');
						a.href = URL.createObjectURL(blob);
						a.download = strmName;
						a.click();
						URL.revokeObjectURL(a.href);
					} catch (e) {
						console.error(e);
					}
				}
			});
		},
	});
};

export const showInfoForAD = async (
	app: string,
	adKey: string,
	info: any,
	imdbId: string = '',
	shouldDownloadMagnets?: boolean,
	handlers: ShowInfoHandlers = {}
): Promise<void> => {
	let mediaInfo: MediaInfoResponse | null = null;

	try {
		const password = await generatePasswordHash(info.hash);
		const response = await axios.get<MediaInfoResponse>(
			`https://debridmediamanager.com/mediainfo?hash=${info.hash}&password=${password}`
		);
		mediaInfo = response.data;
	} catch (error) {
		console.error('MediaInfo error:', error);
		// Silently fail as media info is optional
	}
	const torrent = {
		id: `ad:${info.id}`,
		hash: info.hash,
		filename: info.filename,
		bytes: info.size,
		title: info.filename,
		mediaType: 'other',
	};

	const downloadAllLink = `https://alldebrid.com/service/?url=${info.links.map((l: MagnetLink) => encodeURIComponent(l.link)).join('%0D%0A')}`;
	const libraryActions = `
        <div class="mb-4 flex justify-center items-center flex-wrap">
            ${renderButton('share', { link: `${await handleShare(torrent)}` })}
            ${renderButton('delete', { id: 'btn-delete-ad' })}
            ${renderButton('magnet', { id: 'btn-magnet-copy', text: shouldDownloadMagnets ? 'Download' : 'Copy' })}
            ${renderButton('reinsert', { id: 'btn-restart-ad' })}
            ${info.links.length > 1 ? renderButton('downloadAll', { link: `${downloadAllLink}` }) : ''}
            ${info.links.length > 0 ? renderButton('exportLinks', { id: 'btn-export-links' }) : ''}
            ${info.links.length > 0 ? renderButton('generateStrm', { id: 'btn-generate-strm' }) : ''}
        </div>`;

	const allInfoRows = [
		{ label: 'Size', value: (info.size / 1024 ** 3).toFixed(2) + ' GB' },
		{ label: 'ID', value: info.id },
		{ label: 'Status', value: `${info.status} (code: ${info.statusCode})` },
		{ label: 'Added', value: new Date(info.uploadDate * 1000).toLocaleString() },
		...getStreamInfo(mediaInfo),
	];

	const html = `<h1 class="text-lg font-bold mt-6 mb-4 text-gray-100">${info.filename}</h1>
    ${libraryActions}
    <div class="text-sm text-gray-200">
        ${renderInfoTable(allInfoRows)}
    </div>
    <div class="text-sm max-h-60 mb-4 text-left p-1 bg-gray-900">
        <div class="overflow-x-auto" style="max-width: 100%;">
            <table class="table-auto">
                <tbody>
                    ${renderTorrentInfo(info, false, '', app, imdbId)}
                </tbody>
            </table>
        </div>
    </div>`;

	await Modal.fire({
		html,
		showConfirmButton: false,
		customClass: {
			htmlContainer: '!mx-1',
			popup: '!bg-gray-900 !text-gray-100',
			confirmButton: 'haptic',
			cancelButton: 'haptic',
		},
		width: '800px',
		showCloseButton: true,
		inputAutoFocus: true,
		didOpen: () => {
			const magnetBtn = document.getElementById('btn-magnet-copy');
			magnetBtn?.addEventListener('click', () => {
				void handleCopyOrDownloadMagnet(info.hash, shouldDownloadMagnets);
			});

			const deleteBtn = document.getElementById('btn-delete-ad');
			deleteBtn?.addEventListener('click', async () => {
				if (handlers.onDeleteAd) {
					await handlers.onDeleteAd(adKey, `ad:${info.id}`);
				} else {
					await handleDeleteAdTorrent(adKey, `ad:${info.id}`);
				}
				Modal.close();
			});

			const restartBtn = document.getElementById('btn-restart-ad');
			restartBtn?.addEventListener('click', async () => {
				if (handlers.onRestartAd) {
					await handlers.onRestartAd(adKey, `${info.id}`);
				} else {
					await handleRestartTorrent(adKey, `${info.id}`);
				}
				Modal.close();
			});

			const exportBtn = document.getElementById('btn-export-links');
			exportBtn?.addEventListener('click', async () => {
				try {
					// For AD, assume links are direct
					const textContent = (info.links as MagnetLink[]).map((l) => l.link).join('\n');
					const blob = new Blob([textContent], { type: 'text/plain' });
					const a = document.createElement('a');
					a.href = URL.createObjectURL(blob);
					a.download = `${info.filename}.txt`;
					a.click();
					URL.revokeObjectURL(a.href);
				} catch (e) {
					console.error(e);
				}
			});

			const generateStrmBtn = document.getElementById('btn-generate-strm');
			generateStrmBtn?.addEventListener('click', async () => {
				for (const file of info.links as MagnetLink[]) {
					try {
						const blob = new Blob([file.link], { type: 'text/plain' });
						const a = document.createElement('a');
						// Use the link filename if available, else fallback
						const base = file.filename?.replace(/\.[^/.]+$/, '') || info.filename;
						a.href = URL.createObjectURL(blob);
						a.download = `${base}.strm`;
						a.click();
						URL.revokeObjectURL(a.href);
					} catch (e) {
						console.error(e);
					}
				}
			});
		},
	});
};
