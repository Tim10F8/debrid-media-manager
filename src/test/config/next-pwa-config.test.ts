import { describe, expect, it } from 'vitest';

describe('next-pwa configuration', () => {
	it('excludes dynamic css manifest from precache', async () => {
		const configModule = await import('../../../pwa.config.js');
		const pwaConfig = (configModule as any).default ?? configModule;
		const buildExcludes = (pwaConfig.buildExcludes ?? []) as string[];
		expect(buildExcludes).toContain('**/dynamic-css-manifest.json');
	});
});
