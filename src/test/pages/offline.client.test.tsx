import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OfflinePage from '@/pages/_offline';

describe('offline fallback page', () => {
	it('renders messaging and navigation link', () => {
		render(<OfflinePage />);
		expect(screen.getByRole('heading', { name: /offline/i })).toBeInTheDocument();
		const startLink = screen.getByRole('link', { name: /start page/i });
		expect(startLink).toBeInTheDocument();
		expect(startLink).toHaveAttribute('href', '/');
	});
});
