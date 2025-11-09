import { render, screen } from '@testing-library/react';
import React from 'react';

const castTokenMock = vi.fn();

vi.mock('@/hooks/castToken', () => ({
	__esModule: true,
	useCastToken: () => castTokenMock(),
}));

vi.mock('@/utils/withAuth', () => ({
	__esModule: true,
	withAuth: (component: any) => component,
}));

vi.mock('next/link', () => ({
	__esModule: true,
	default: ({ href, children, ...rest }: any) => (
		<a href={typeof href === 'string' ? href : String(href)} {...rest}>
			{children}
		</a>
	),
}));

vi.mock('next/head', () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/image', () => ({
	__esModule: true,
	default: ({ alt }: { alt: string }) => <img alt={alt} data-testid="stremio-image" />,
}));

import { StremioPage } from '@/pages/stremio';

describe('StremioPage', () => {
	beforeEach(() => {
		castTokenMock.mockReset();
	});

	it('shows a loading state until the cast token is ready', () => {
		castTokenMock.mockReturnValue(undefined);
		render(<StremioPage />);
		expect(screen.getByText(/Debrid Media Manager is loading/i)).toBeInTheDocument();
	});

	it('renders install links when a cast token is available', () => {
		castTokenMock.mockReturnValue('token123');
		render(<StremioPage />);

		const installLink = screen.getByRole('link', { name: /install$/i });
		const installHref = installLink.getAttribute('href') || '';
		expect(installHref).toContain('stremio://localhost');
		expect(installHref).toContain('/api/stremio/token123/manifest.json');

		const webLink = screen.getByRole('link', { name: /install \(web\)/i });
		const webHref = webLink.getAttribute('href') || '';
		expect(decodeURIComponent(webHref)).toContain('/api/stremio/token123/manifest.json');

		expect(screen.getByText(/Warning: Never share this install URL/i)).toBeInTheDocument();
		expect(screen.getByText(/api\/stremio\/token123\/manifest\.json/i)).toBeInTheDocument();
	});
});
