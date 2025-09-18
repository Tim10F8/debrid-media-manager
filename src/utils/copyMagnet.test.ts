import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCopyOrDownloadMagnet } from './copyMagnet';
import { downloadMagnetFile } from './downloadMagnet';

vi.mock('react-hot-toast', () => {
	const fn: any = vi.fn();
	fn.success = vi.fn();
	return { default: fn };
});

// Mock downloadMagnetFile to avoid DOM operations here
vi.mock('./downloadMagnet', () => ({ downloadMagnetFile: vi.fn() }));

describe('copyMagnet', () => {
	beforeEach(() => {
		vi.mocked(downloadMagnetFile).mockReset();
		// Ensure clipboard exists
		Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
	});

	it('downloads magnet file when shouldDownloadMagnets is true', () => {
		handleCopyOrDownloadMagnet('abc', true);
		expect(downloadMagnetFile).toHaveBeenCalledWith('abc');
	});

	it('copies magnet link to clipboard when not downloading', () => {
		const write = vi.spyOn(navigator.clipboard!, 'writeText');
		handleCopyOrDownloadMagnet('abcdef');
		expect(write).toHaveBeenCalledWith('magnet:?xt=urn:btih:abcdef');
	});
});
