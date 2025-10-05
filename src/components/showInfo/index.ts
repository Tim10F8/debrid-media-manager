import { addHashAsMagnet, proxyUnrestrictLink, selectFiles } from '@/services/realDebrid';
import { handleRestartTorrent } from '@/utils/addMagnet';
import { handleCopyOrDownloadMagnet } from '@/utils/copyMagnet';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import { magnetToastOptions } from '@/utils/toastOptions';
import toast from 'react-hot-toast';
import { handleShare } from '../../utils/hashList';
import { isVideo } from '../../utils/selectable';
import Modal from '../modals/modal';
import { renderButton, renderInfoTable } from './components';
import { renderTorrentInfo } from './render';
import { icons } from './styles';
import { ApiTorrentFile, MagnetLink } from './types';
import { fetchMediaInfo, getStreamInfo } from './utils';

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
	Modal.showLoading();
	let warning = '';
	const mediaInfo = await fetchMediaInfo(info.hash);
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
    <div class="mb-3 flex justify-center items-center flex-wrap">
        ${renderButton('share', { link: `${await handleShare(torrent)}` })}
        ${renderButton('delete', { id: 'btn-delete-rd' })}
        ${renderButton('magnet', { id: 'btn-magnet-copy', text: shouldDownloadMagnets ? 'Download' : 'Copy' })}
        ${renderButton('reinsert', { id: 'btn-reinsert-rd' })}
		${
			rdKey
				? renderButton('castAll', {
						link: `/api/stremio/cast/library/${info.id}:${info.hash}`,
						linkParams: [{ name: 'rdToken', value: rdKey }],
					})
				: ''
		}
		${
			info.links.length > 0
				? renderButton('downloadAll', {
						link: 'https://real-debrid.com/downloader',
						linkParam: { name: 'links', value: downloadAllLinksParam },
						id: 'btn-download-all',
					})
				: ''
		}
        ${info.links.length > 0 ? renderButton('exportLinks', { id: 'btn-export-links' }) : ''}
        ${info.links.length > 0 ? renderButton('generateStrm', { id: 'btn-generate-strm' }) : ''}
    </div>`
		: '';

	let html = `<h1 class="text-lg font-bold mt-3 mb-2 text-gray-100">${info.filename}</h1>
    ${libraryActions}
    <hr class="border-gray-600"/>
    <div class="text-sm max-h-60 mb-2 text-left p-1 bg-gray-900">
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
                    <div id="selection-count" class="mb-2 inline-flex items-center justify-center rounded border border-cyan-500/40 bg-gray-900 px-2 py-1 text-sm font-semibold text-cyan-200">
                        ${info.files.filter((f: ApiTorrentFile) => f.selected === 1).length}/${info.files.length} files selected
                    </div>
                    <div class="flex flex-wrap justify-center gap-1 sm:gap-2">
                        <button id="btn-only-videos"
                            class="px-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                            title="Only Videos"
                        >
                            <span class="inline-flex items-center">${icons.selectVideos}<span class="hidden sm:inline ml-1">Only Videos</span></span>
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
                            <span class="inline-flex items-center">${icons.reset}<span class="hidden sm:inline ml-1">Reset</span></span>
                        </button>
                        <button id="btn-save-selection"
                            class="px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-sm shadow-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
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
				{
					label: 'Added',
					value: new Date(info.added).toLocaleString(undefined, { timeZone: 'UTC' }),
				},
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
		showCancelButton: false,
		customClass: {
			htmlContainer: '!mx-1',
			popup: '!bg-gray-900 !text-gray-100 !px-4 !py-3',
			confirmButton: 'haptic',
			cancelButton: 'haptic',
		},
		width: '800px',
		showCloseButton: true,
		inputAutoFocus: true,
		didOpen: () => {
			const logAction = (event: string, data: Record<string, unknown> = {}) => {
				console.log('[torrentModal]', event, data);
			};
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
			const unselectAll = () => {
				checkboxes().forEach((cb) => (cb.checked = false));
			};

			const onlyVideosBtn = document.getElementById('btn-only-videos');
			logAction('binding only-videos button (RD)', {
				exists: Boolean(onlyVideosBtn),
				hash: info.hash,
			});
			onlyVideosBtn?.addEventListener('click', () => {
				logAction('only-videos clicked (RD)', {
					hash: info.hash,
				});
				unselectAll();
				checkboxes().forEach((cb) => {
					const filePath = cb.dataset.filePath;
					if (filePath && isVideo({ path: filePath })) cb.checked = true;
				});
				updateSelectionCount();
			});

			const unselectAllBtn = document.getElementById('btn-unselect-all');
			logAction('binding unselect-all button (RD)', {
				exists: Boolean(unselectAllBtn),
				hash: info.hash,
			});
			unselectAllBtn?.addEventListener('click', () => {
				logAction('unselect-all clicked (RD)', {
					hash: info.hash,
				});
				unselectAll();
				updateSelectionCount();
			});

			const initialSelection: Record<string, boolean> = {};
			info.files.forEach((f: ApiTorrentFile) => (initialSelection[f.id] = f.selected === 1));
			const resetSelectionBtn = document.getElementById('btn-reset-selection');
			logAction('binding reset-selection button (RD)', {
				exists: Boolean(resetSelectionBtn),
				hash: info.hash,
			});
			resetSelectionBtn?.addEventListener('click', () => {
				logAction('reset-selection clicked (RD)', {
					hash: info.hash,
				});
				checkboxes().forEach((cb) => {
					const fileId = cb.dataset.fileId;
					cb.checked = fileId ? !!initialSelection[fileId] : false;
				});
				updateSelectionCount();
			});

			const saveSelectionBtn = document.getElementById('btn-save-selection');
			logAction('binding save-selection button (RD)', {
				exists: Boolean(saveSelectionBtn),
				hash: info.hash,
			});
			saveSelectionBtn?.addEventListener('click', async () => {
				const selectedIds = checkboxes()
					.filter((cb) => cb.checked)
					.map((cb) => cb.dataset.fileId!)
					.filter(Boolean);
				logAction('save-selection clicked (RD)', {
					hash: info.hash,
					selectedIds,
				});
				const usedHandler = Boolean(handlers.onReinsertRd);
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
						toast.success('Selection saved and reinserted.', magnetToastOptions);
					}
					logAction('save-selection completed (RD)', {
						hash: info.hash,
						selectedIdsCount: selectedIds.length,
						usedHandler,
					});
					if (!usedHandler && handlers.onRefreshRd) await handlers.onRefreshRd(2);
					Modal.close();
				} catch (error) {
					logAction('save-selection failed (RD)', {
						hash: info.hash,
						error: error instanceof Error ? error.message : String(error),
					});
					toast.error(
						'Failed to save selection: ' +
							(error instanceof Error ? error.message : String(error)),
						magnetToastOptions
					);
				}
			});

			const magnetBtn = document.getElementById('btn-magnet-copy');
			logAction('binding magnet button (RD)', {
				exists: Boolean(magnetBtn),
				hash: info.hash,
				shouldDownloadMagnets,
			});
			magnetBtn?.addEventListener('click', () => {
				logAction('magnet button clicked (RD)', {
					hash: info.hash,
					shouldDownloadMagnets,
				});
				void handleCopyOrDownloadMagnet(info.hash, shouldDownloadMagnets);
			});

			const downloadAllBtn = document.getElementById('btn-download-all');
			logAction('binding download-all button (RD)', {
				exists: Boolean(downloadAllBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			downloadAllBtn?.addEventListener('click', () => {
				logAction('download-all submitted (RD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
			});

			const deleteBtn = document.getElementById('btn-delete-rd');
			logAction('binding delete button (RD)', {
				exists: Boolean(deleteBtn),
				hash: info.hash,
			});
			deleteBtn?.addEventListener('click', async () => {
				logAction('delete clicked (RD)', {
					usingHandler: Boolean(handlers.onDeleteRd),
					id: `rd:${info.id}`,
				});
				try {
					if (handlers.onDeleteRd) {
						await handlers.onDeleteRd(rdKey, `rd:${info.id}`);
					} else {
						await handleDeleteRdTorrent(rdKey, `rd:${info.id}`);
					}
					logAction('delete completed (RD)', {
						id: `rd:${info.id}`,
					});
					Modal.close();
				} catch (error) {
					logAction('delete failed (RD)', {
						id: `rd:${info.id}`,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			});

			const reinsertBtn = document.getElementById('btn-reinsert-rd');
			logAction('binding reinsert button (RD)', {
				exists: Boolean(reinsertBtn),
				hash: info.hash,
			});
			reinsertBtn?.addEventListener('click', async () => {
				const selectedIds = checkboxes()
					.filter((cb) => cb.checked)
					.map((cb) => cb.dataset.fileId!)
					.filter(Boolean);
				logAction('reinsert clicked (RD)', {
					hash: info.hash,
					selectedIds,
				});
				const usedHandler = Boolean(handlers.onReinsertRd);
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
						toast.success('Selection saved and reinserted.', magnetToastOptions);
					}
					logAction('reinsert completed (RD)', {
						hash: info.hash,
						selectedIdsCount: selectedIds.length,
						newSelection: selectedIds,
						usedHandler,
					});
					if (!usedHandler && handlers.onRefreshRd) await handlers.onRefreshRd(2);
					Modal.close();
				} catch (error: any) {
					logAction('reinsert failed (RD)', {
						hash: info.hash,
						error: error?.message || error,
					});
					toast.error(
						'Failed to save selection: ' + (error?.message || error),
						magnetToastOptions
					);
				}
			});

			const exportBtn = document.getElementById('btn-export-links');
			logAction('binding export-links button (RD)', {
				exists: Boolean(exportBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			exportBtn?.addEventListener('click', async () => {
				logAction('export-links clicked (RD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
				if (!info.links?.length) {
					toast.error('No links to export.', magnetToastOptions);
					return;
				}
				const toastId = toast.loading('Preparing download links...', magnetToastOptions);
				try {
					const lines: string[] = [];
					for (const link of info.links as string[]) {
						try {
							const resp = await proxyUnrestrictLink(rdKey, link);
							lines.push(resp.download);
						} catch (e) {
							console.error(e);
						}
					}
					if (!lines.length) {
						toast.error('Failed to fetch unrestricted links.', magnetToastOptions);
						return;
					}
					const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
					const a = document.createElement('a');
					a.href = URL.createObjectURL(blob);
					a.download = `${info.original_filename}.txt`;
					a.click();
					URL.revokeObjectURL(a.href);
					toast.success('Download links exported.', magnetToastOptions);
					logAction('export-links completed (RD)', {
						hash: info.hash,
						linesCount: lines.length,
					});
				} catch (e) {
					console.error(e);
					logAction('export-links failed (RD)', {
						hash: info.hash,
						error: e instanceof Error ? e.message : String(e),
					});
					toast.error('Failed to export download links.', magnetToastOptions);
				} finally {
					toast.dismiss(toastId);
				}
			});

			const generateStrmBtn = document.getElementById('btn-generate-strm');
			logAction('binding generate-strm button (RD)', {
				exists: Boolean(generateStrmBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			generateStrmBtn?.addEventListener('click', async () => {
				logAction('generate-strm clicked (RD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
				if (!info.links?.length) {
					toast.error('No links for STRM files.', magnetToastOptions);
					return;
				}
				const toastId = toast.loading('Generating STRM files...', magnetToastOptions);
				let generated = 0;
				try {
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
							generated += 1;
						} catch (e) {
							console.error(e);
						}
					}
					if (generated) {
						toast.success(
							`Generated ${generated} STRM file${generated === 1 ? '' : 's'}.`,
							magnetToastOptions
						);
					} else {
						toast.error('Failed to generate STRM files.', magnetToastOptions);
					}
					logAction('generate-strm completed (RD)', {
						hash: info.hash,
						generated,
					});
				} catch (e) {
					console.error(e);
					logAction('generate-strm failed (RD)', {
						hash: info.hash,
						error: e instanceof Error ? e.message : String(e),
					});
					toast.error('Failed to generate STRM files.', magnetToastOptions);
				} finally {
					toast.dismiss(toastId);
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
	Modal.showLoading();
	const mediaInfo = await fetchMediaInfo(info.hash);
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
        <div class="mb-3 flex justify-center items-center flex-wrap">
            ${renderButton('share', { link: `${await handleShare(torrent)}` })}
            ${renderButton('delete', { id: 'btn-delete-ad' })}
            ${renderButton('magnet', { id: 'btn-magnet-copy', text: shouldDownloadMagnets ? 'Download' : 'Copy' })}
            ${renderButton('reinsert', { id: 'btn-restart-ad' })}
	            ${info.links.length > 1 ? renderButton('downloadAll', { link: `${downloadAllLink}`, id: 'btn-download-all-ad' }) : ''}
            ${info.links.length > 0 ? renderButton('exportLinks', { id: 'btn-export-links' }) : ''}
            ${info.links.length > 0 ? renderButton('generateStrm', { id: 'btn-generate-strm' }) : ''}
        </div>`;

	const allInfoRows = [
		{ label: 'Size', value: (info.size / 1024 ** 3).toFixed(2) + ' GB' },
		{ label: 'ID', value: info.id },
		{ label: 'Status', value: `${info.status} (code: ${info.statusCode})` },
		{
			label: 'Added',
			value: new Date(info.uploadDate * 1000).toLocaleString(undefined, { timeZone: 'UTC' }),
		},
		...getStreamInfo(mediaInfo),
	];

	const html = `<h1 class="text-lg font-bold mt-3 mb-2 text-gray-100">${info.filename}</h1>
    ${libraryActions}
    <div class="text-sm text-gray-200">
        ${renderInfoTable(allInfoRows)}
    </div>
    <div class="text-sm max-h-60 mb-2 text-left p-1 bg-gray-900">
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
		showCancelButton: false,
		customClass: {
			htmlContainer: '!mx-1',
			popup: '!bg-gray-900 !text-gray-100 !px-4 !py-3',
			confirmButton: 'haptic',
			cancelButton: 'haptic',
		},
		width: '800px',
		showCloseButton: true,
		inputAutoFocus: true,
		didOpen: () => {
			const logAction = (event: string, data: Record<string, unknown> = {}) => {
				console.log('[torrentModal]', event, data);
			};
			const magnetBtn = document.getElementById('btn-magnet-copy');
			logAction('binding magnet button (AD)', {
				exists: Boolean(magnetBtn),
				hash: info.hash,
				shouldDownloadMagnets,
			});
			magnetBtn?.addEventListener('click', () => {
				logAction('magnet button clicked (AD)', {
					hash: info.hash,
					shouldDownloadMagnets,
				});
				void handleCopyOrDownloadMagnet(info.hash, shouldDownloadMagnets);
			});

			const downloadAllBtn = document.getElementById('btn-download-all-ad');
			logAction('binding download-all button (AD)', {
				exists: Boolean(downloadAllBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			downloadAllBtn?.addEventListener('click', () => {
				logAction('download-all submitted (AD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
			});

			const deleteBtn = document.getElementById('btn-delete-ad');
			logAction('binding delete button (AD)', {
				exists: Boolean(deleteBtn),
				hash: info.hash,
			});
			deleteBtn?.addEventListener('click', async () => {
				logAction('delete clicked (AD)', {
					usingHandler: Boolean(handlers.onDeleteAd),
					id: `ad:${info.id}`,
				});
				try {
					if (handlers.onDeleteAd) {
						await handlers.onDeleteAd(adKey, `ad:${info.id}`);
					} else {
						await handleDeleteAdTorrent(adKey, `ad:${info.id}`);
					}
					logAction('delete completed (AD)', {
						id: `ad:${info.id}`,
					});
					Modal.close();
				} catch (error) {
					logAction('delete failed (AD)', {
						id: `ad:${info.id}`,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			});

			const restartBtn = document.getElementById('btn-restart-ad');
			logAction('binding restart button (AD)', {
				exists: Boolean(restartBtn),
				hash: info.hash,
			});
			restartBtn?.addEventListener('click', async () => {
				logAction('restart clicked (AD)', {
					hash: info.hash,
				});
				if (handlers.onRestartAd) {
					await handlers.onRestartAd(adKey, `${info.id}`);
				} else {
					await handleRestartTorrent(adKey, `${info.id}`);
				}
				logAction('restart completed (AD)', {
					hash: info.hash,
				});
				Modal.close();
			});

			const exportBtn = document.getElementById('btn-export-links');
			logAction('binding export-links button (AD)', {
				exists: Boolean(exportBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			exportBtn?.addEventListener('click', async () => {
				logAction('export-links clicked (AD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
				if (!info.links?.length) {
					toast.error('No links to export.', magnetToastOptions);
					return;
				}
				try {
					const textContent = (info.links as MagnetLink[]).map((l) => l.link).join('\n');
					const blob = new Blob([textContent], { type: 'text/plain' });
					const a = document.createElement('a');
					a.href = URL.createObjectURL(blob);
					a.download = `${info.filename}.txt`;
					a.click();
					URL.revokeObjectURL(a.href);
					toast.success('Links exported.', magnetToastOptions);
					logAction('export-links completed (AD)', {
						hash: info.hash,
						linesCount: info.links.length,
					});
				} catch (e) {
					console.error(e);
					logAction('export-links failed (AD)', {
						hash: info.hash,
						error: e instanceof Error ? e.message : String(e),
					});
					toast.error('Failed to export links.', magnetToastOptions);
				}
			});

			const generateStrmBtn = document.getElementById('btn-generate-strm');
			logAction('binding generate-strm button (AD)', {
				exists: Boolean(generateStrmBtn),
				hash: info.hash,
				linkCount: info.links.length,
			});
			generateStrmBtn?.addEventListener('click', async () => {
				logAction('generate-strm clicked (AD)', {
					hash: info.hash,
					linkCount: info.links.length,
				});
				if (!info.links?.length) {
					toast.error('No files for STRM generation.', magnetToastOptions);
					return;
				}
				let generated = 0;
				try {
					for (const file of info.links as MagnetLink[]) {
						const blob = new Blob([file.link], { type: 'text/plain' });
						const a = document.createElement('a');
						const base = file.filename?.replace(/\.[^/.]+$/, '') || info.filename;
						a.href = URL.createObjectURL(blob);
						a.download = `${base}.strm`;
						a.click();
						URL.revokeObjectURL(a.href);
						generated += 1;
					}
					toast.success(
						`Generated ${generated} STRM file${generated === 1 ? '' : 's'}.`,
						magnetToastOptions
					);
					logAction('generate-strm completed (AD)', {
						hash: info.hash,
						generated,
					});
				} catch (e) {
					console.error(e);
					logAction('generate-strm failed (AD)', {
						hash: info.hash,
						error: e instanceof Error ? e.message : String(e),
					});
					toast.error('Failed to generate STRM files.', magnetToastOptions);
				}
			});
		},
	});
};
