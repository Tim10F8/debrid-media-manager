import toast from 'react-hot-toast';
import { downloadMagnetFile } from './downloadMagnet';
import { magnetToastOptions } from './toastOptions';

const copyWithFallback = (text: string): boolean => {
	if (typeof document === 'undefined') return false;
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.opacity = '0';
	textarea.style.pointerEvents = 'none';
	textarea.style.top = '0';
	textarea.style.left = '0';
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);
	let success = false;
	try {
		success = document.execCommand('copy');
	} catch (err) {
		success = false;
	}
	document.body.removeChild(textarea);
	return success;
};

export const handleCopyOrDownloadMagnet = async (
	hash: string,
	shouldDownloadMagnets?: boolean,
	magnetOverride?: string
): Promise<void> => {
	console.log('[copyMagnet] invoked', {
		hash,
		shouldDownloadMagnets: Boolean(shouldDownloadMagnets),
		hasOverride: Boolean(magnetOverride),
	});

	if (shouldDownloadMagnets) {
		console.log('[copyMagnet] downloading .magnet file');
		downloadMagnetFile(hash);
		toast.success('Magnet file downloaded.', magnetToastOptions);
		return;
	}

	const magnetLink = magnetOverride || `magnet:?xt=urn:btih:${hash}`;

	try {
		if (!navigator?.clipboard?.writeText) {
			throw new Error('Clipboard API unavailable');
		}
		await navigator.clipboard.writeText(magnetLink);
		console.log('[copyMagnet] copied via Clipboard API');
		toast.success('Magnet link copied.', magnetToastOptions);
		return;
	} catch (error) {
		console.warn('[copyMagnet] clipboard API failed, falling back', error);
		const copied = copyWithFallback(magnetLink);
		if (copied) {
			console.log('[copyMagnet] copied via execCommand fallback');
			toast.success('Magnet link copied.', magnetToastOptions);
			return;
		}
		if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
			window.prompt('Copy magnet link', magnetLink);
			console.log('[copyMagnet] displayed manual copy prompt');
			toast('Copy the link from the prompt.', magnetToastOptions);
			return;
		}
	}

	console.error('[copyMagnet] unable to copy magnet link');
	toast.error('Failed to copy magnet link.', magnetToastOptions);
};
