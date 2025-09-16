import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: './src/test/setup.ts',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json-summary'],
			reportsDirectory: './coverage',
			all: true,
			include: ['src/utils/**/*.{ts,tsx}'],
			exclude: [
				'**/*.test.*',
				'src/test/**',
				'src/utils/__tests__/**',
			],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
