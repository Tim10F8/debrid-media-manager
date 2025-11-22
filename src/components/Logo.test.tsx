import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
	it('renders the logo SVG component', () => {
		const { container } = render(<Logo />);
		const svg = container.querySelector('svg');
		expect(svg).toBeInTheDocument();
		expect(svg).toHaveClass('h-24', 'w-24');
	});

	it('contains all expected SVG elements', () => {
		const { container } = render(<Logo />);
		expect(container.querySelector('rect')).toBeInTheDocument();
		expect(container.querySelector('circle')).toBeInTheDocument();
		expect(container.querySelectorAll('path')).toHaveLength(3);
	});

	it('has correct SVG viewBox dimensions', () => {
		const { container } = render(<Logo />);
		const svg = container.querySelector('svg');
		expect(svg).toHaveAttribute('viewBox', '0 0 200 200');
	});
});
