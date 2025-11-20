import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RelatedMedia from './RelatedMedia';

const { pushMock } = vi.hoisted(() => ({
	pushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/router', () => ({
	__esModule: true,
	useRouter: () => ({
		push: pushMock,
	}),
}));

describe('RelatedMedia', () => {
	beforeEach(() => {
		pushMock.mockClear();
		window.open = vi.fn();
	});

	it('navigates to the related movie page on click', async () => {
		render(<RelatedMedia imdbId="tt1234567" mediaType="movie" />);
		await userEvent.click(screen.getByRole('button', { name: /show related media/i }));

		expect(pushMock).toHaveBeenCalledWith('/movie/tt1234567/related');
	});

	it('opens a new tab when modifier keys are pressed', async () => {
		render(<RelatedMedia imdbId="tt7654321" mediaType="show" />);
		fireEvent.click(screen.getByRole('button', { name: /show related media/i }), {
			metaKey: true,
		});

		expect(window.open).toHaveBeenCalledWith('/show/tt7654321/related', '_blank');
		expect(pushMock).not.toHaveBeenCalled();
	});
});
