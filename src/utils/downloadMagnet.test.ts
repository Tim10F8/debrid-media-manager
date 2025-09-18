import { describe, expect, it, vi } from 'vitest';
import { downloadMagnetFile } from './downloadMagnet';

describe('downloadMagnetFile', () => {
	it('creates a blob URL and clicks an anchor', () => {
		// Ensure URL methods exist for spying
		if (!(URL as any).createObjectURL) {
			(URL as any).createObjectURL = () => 'blob:temp';
		}
		if (!(URL as any).revokeObjectURL) {
			(URL as any).revokeObjectURL = () => {};
		}

		const createObjectURL = vi.spyOn(URL as any, 'createObjectURL').mockReturnValue('blob:foo');
		const revokeObjectURL = vi
			.spyOn(URL as any, 'revokeObjectURL')
			.mockImplementation(() => {});

		const anchor = document.createElement('a');
		const clickSpy = vi.spyOn(anchor, 'click');
		const createEl = vi
			.spyOn(document, 'createElement')
			.mockReturnValue(anchor as unknown as HTMLAnchorElement);

		const append = vi.spyOn(document.body, 'appendChild');
		const remove = vi.spyOn(document.body, 'removeChild');

		downloadMagnetFile('abc');

		expect(createObjectURL).toHaveBeenCalled();
		expect(append).toHaveBeenCalled();
		expect(clickSpy).toHaveBeenCalled();
		expect(remove).toHaveBeenCalled();
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:foo');

		// Restore
		createEl.mockRestore();
	});
});
