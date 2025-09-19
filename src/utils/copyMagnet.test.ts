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

	it('falls back to execCommand when clipboard API is unavailable', async () => {
		Object.assign(navigator, { clipboard: undefined });
		const execSpy = vi.fn().mockReturnValue(true);
		Object.assign(document, { execCommand: execSpy });
		await handleCopyOrDownloadMagnet('fallback');
		expect(execSpy).toHaveBeenCalledWith('copy');
	});
});
