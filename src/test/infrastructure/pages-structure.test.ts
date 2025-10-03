import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const collectPaths = (dir: string): string[] => {
	const entries = readdirSync(dir);
	return entries.flatMap((entry) => {
		const fullPath = path.join(dir, entry);
		if (statSync(fullPath).isDirectory()) {
			return collectPaths(fullPath);
		}
		return [fullPath];
	});
};

describe('pages directory hygiene', () => {
	it('does not contain test files picked up by Next.js', () => {
		const pagesDir = path.join(process.cwd(), 'src', 'pages');
		const allFiles = collectPaths(pagesDir);
		const offending = allFiles
			.filter((filePath) => {
				if (filePath.includes(`${path.sep}api${path.sep}`)) {
					return false;
				}
				return /\.test\.[jt]sx$/.test(filePath);
			})
			.map((filePath) => path.relative(process.cwd(), filePath));
		expect(offending).toEqual([]);
	});
});
