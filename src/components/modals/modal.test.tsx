import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './modal';
import { ModalProvider } from './ModalContext';

const setupModalProvider = () => {
	render(
		<ModalProvider>
			<div>test content</div>
		</ModalProvider>
	);
};

describe('Modal', () => {
	beforeEach(() => {
		setupModalProvider();
	});

	afterEach(() => {
		(window as any).closePopup = undefined;
	});

	it('fire method opens modal and returns result on confirm', async () => {
		const resultPromise = Modal.fire({
			title: 'Test Modal',
			text: 'Test content',
		});

		const confirmButton = await screen.findByRole('button', { name: 'OK' });
		await userEvent.click(confirmButton);

		const result = await resultPromise;
		expect(result.isConfirmed).toBe(true);
	});

	it('fire method returns dismissed result when modal instance is not available', async () => {
		const { unmount } = render(
			<ModalProvider>
				<div>temp</div>
			</ModalProvider>
		);
		unmount();

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await Modal.fire({ title: 'Test' });

		expect(result.isConfirmed).toBe(false);
		expect(result.isDismissed).toBe(true);
		expect(consoleSpy).toHaveBeenCalledWith(
			'Modal system not initialized. Make sure ModalProvider is mounted in your app.'
		);

		consoleSpy.mockRestore();
	});

	it('close method closes the modal', async () => {
		Modal.fire({ title: 'Test Modal' });
		await screen.findByText('Test Modal');

		Modal.close();

		await waitFor(() => expect(screen.queryByText('Test Modal')).not.toBeInTheDocument());
	});

	it('showLoading method displays loading modal', async () => {
		Modal.showLoading();

		expect(await screen.findByText('Loading...')).toBeInTheDocument();
	});

	it('showValidationMessage logs error message', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		Modal.showValidationMessage('Validation error');

		expect(consoleSpy).toHaveBeenCalledWith('Validation error');

		consoleSpy.mockRestore();
	});

	it('DismissReason contains all expected reasons', () => {
		expect(Modal.DismissReason.cancel).toBe('cancel');
		expect(Modal.DismissReason.backdrop).toBe('backdrop');
		expect(Modal.DismissReason.close).toBe('close');
		expect(Modal.DismissReason.esc).toBe('esc');
		expect(Modal.DismissReason.timer).toBe('timer');
	});

	it('handles modal with deny button', async () => {
		const resultPromise = Modal.fire({
			title: 'Confirm',
			showDenyButton: true,
			denyButtonText: 'No',
		});

		const denyButton = await screen.findByRole('button', { name: 'No' });
		await userEvent.click(denyButton);

		const result = await resultPromise;
		expect(result.isDenied).toBe(true);
		expect(result.isConfirmed).toBe(false);
	});

	it('handles modal with custom HTML content', async () => {
		Modal.fire({
			title: 'Custom',
			html: '<div id="custom-content">Custom HTML</div>',
		});

		expect(await screen.findByText('Custom HTML')).toBeInTheDocument();
	});

	it('handles preConfirm callback', async () => {
		const resultPromise = Modal.fire({
			title: 'Test',
			html: '<p>Test content</p>',
			preConfirm: () => Promise.resolve('custom-value'),
		});

		const confirmButton = await screen.findByRole('button', { name: 'OK' });
		await userEvent.click(confirmButton);

		const result = await resultPromise;
		expect(result.isConfirmed).toBe(true);
		expect(result.value).toBe('custom-value');
	});
});
