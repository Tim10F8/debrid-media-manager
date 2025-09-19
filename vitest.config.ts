import react from '@vitejs/plugin-react';
import path from 'path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [react()],
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: './src/test/setup.ts',
		exclude: [...configDefaults.exclude, '**/.next/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json-summary'],
			reportsDirectory: './coverage',
			all: true,
			include: ['src/**/*.{ts,tsx}'],
			exclude: ['**/*.test.*', 'src/test/**', 'src/utils/__tests__/**', '**/*.d.ts'],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
