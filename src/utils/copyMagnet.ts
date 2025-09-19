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
	document.body.appendChild(textarea);
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
	shouldDownloadMagnets?: boolean
): Promise<void> => {
	if (shouldDownloadMagnets) {
		downloadMagnetFile(hash);
		toast.success('Magnet file downloaded', magnetToastOptions);
		return;
	}

	const magnetLink = `magnet:?xt=urn:btih:${hash}`;

	try {
		if (!navigator?.clipboard?.writeText) {
			throw new Error('Clipboard API unavailable');
		}
		await navigator.clipboard.writeText(magnetLink);
		toast.success('Magnet link copied to clipboard', magnetToastOptions);
		return;
	} catch (error) {
		const copied = copyWithFallback(magnetLink);
		if (copied) {
			toast.success('Magnet link copied to clipboard', magnetToastOptions);
			return;
		}
	}

	toast.error('Unable to copy magnet link', magnetToastOptions);
};
