import { describe, expect, it } from 'vitest';

import { renderButton } from './components';

describe('renderButton sizing', () => {
	it('uses compact classes for per-file download actions', () => {
		const html = renderButton('download', {
			link: 'https://example.com',
			linkParam: { name: 'links', value: 'test' },
		});

		expect(html).toContain('px-1 py-0.5 text-xs');
		expect(html).not.toContain('m-1');
	});

	it('uses compact classes for per-file watch actions', () => {
		const html = renderButton('watch', {
			link: 'https://example.com/watch',
			text: 'Watch',
		});

		expect(html).toContain('px-1 py-0.5 text-xs');
		expect(html).not.toContain('m-1');
	});

	it('keeps larger sizing for library actions', () => {
		const html = renderButton('share', {
			link: 'https://example.com/share',
		});

		expect(html).toContain('px-3 py-1.5 text-sm');
		expect(html).toContain('m-1');
	});
});
