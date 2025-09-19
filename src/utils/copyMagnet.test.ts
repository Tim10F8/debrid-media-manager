import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCopyOrDownloadMagnet } from './copyMagnet';
import { downloadMagnetFile } from './downloadMagnet';

vi.mock('react-hot-toast', () => {
	const fn: any = vi.fn();
	fn.success = vi.fn();
	fn.error = vi.fn();
	return { default: fn };
});

// Mock downloadMagnetFile to avoid DOM operations here
vi.mock('./downloadMagnet', () => ({ downloadMagnetFile: vi.fn() }));

describe('copyMagnet', () => {
	beforeEach(() => {
		vi.mocked(downloadMagnetFile).mockReset();
		Object.assign(navigator, {
			clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
		});
	});

	it('downloads magnet file when shouldDownloadMagnets is true', async () => {
		await handleCopyOrDownloadMagnet('abc', true);
		expect(downloadMagnetFile).toHaveBeenCalledWith('abc');
	});

	it('copies magnet link to clipboard when clipboard API is available', async () => {
		const write = vi.spyOn(navigator.clipboard!, 'writeText');
		await handleCopyOrDownloadMagnet('abcdef');
		expect(write).toHaveBeenCalledWith('magnet:?xt=urn:btih:abcdef');
	});

	it('uses magnet override when provided', async () => {
		const write = vi.spyOn(navigator.clipboard!, 'writeText');
		await handleCopyOrDownloadMagnet('hash', false, 'magnet:?xt=urn:btih:override');
		expect(write).toHaveBeenCalledWith('magnet:?xt=urn:btih:override');
	});

	it('falls back to execCommand when clipboard API is unavailable', async () => {
		Object.assign(navigator, { clipboard: undefined });
		const originalExec = document.execCommand;
		const execSpy = vi.fn().mockReturnValue(true);
		Object.assign(document, { execCommand: execSpy });
		await handleCopyOrDownloadMagnet('fallback');
		expect(execSpy).toHaveBeenCalledWith('copy');
		Object.assign(document, { execCommand: originalExec });
	});

	it('prompts user when clipboard access is fully unavailable', async () => {
		Object.assign(navigator, { clipboard: undefined });
		const originalExec = document.execCommand;
		const execSpy = vi.fn().mockReturnValue(false);
		Object.assign(document, { execCommand: execSpy });
		const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('manual');
		await handleCopyOrDownloadMagnet('prompt-test');
		expect(promptSpy).toHaveBeenCalledWith(
			'Copy magnet link',
			'magnet:?xt=urn:btih:prompt-test'
		);
		expect(toast).toHaveBeenCalledWith(
			'Copy the magnet link shown in the prompt.',
			expect.any(Object)
		);
		promptSpy.mockRestore();
		Object.assign(document, { execCommand: originalExec });
	});
});
