// Re-export types from the unified types file
export type {
	ChoiceDialogOptions,
	ConfirmDialogOptions,
	CustomHtmlDialogOptions,
	FireOptions,
	InputDialogOptions,
	SwalResult,
} from '@/components/modals/types';

// Helper functions that use the unified modal system
import Swal from '@/components/modals/modal';
import type {
	ChoiceDialogOptions,
	ConfirmDialogOptions,
	CustomHtmlDialogOptions,
	InputDialogOptions,
} from '@/components/modals/types';

export const showConfirmDialog = async ({
	title,
	text,
	icon = 'warning',
	confirmButtonText = 'Yes, proceed!',
}: ConfirmDialogOptions): Promise<boolean> => {
	const result = await Swal.fire({
		title,
		text,
		icon,
		confirmButtonText,
		showCancelButton: true,
	});
	return result.isConfirmed;
};

export const showChoiceDialog = async ({
	title,
	text,
	confirmButtonText,
	denyButtonText,
	cancelButtonText = 'Cancel',
}: ChoiceDialogOptions): Promise<'confirm' | 'deny' | 'cancel'> => {
	const result = await Swal.fire({
		title,
		text,
		confirmButtonText,
		denyButtonText,
		cancelButtonText,
		showDenyButton: true,
		showCancelButton: true,
	});
	if (result.isConfirmed) return 'confirm';
	if (result.isDenied) return 'deny';
	return 'cancel';
};

export const showInputDialog = async ({
	title,
	inputPlaceholder = 'Enter a value',
}: InputDialogOptions): Promise<string | null> => {
	const result = await Swal.fire({
		title,
		input: 'text',
		inputPlaceholder,
		showCancelButton: true,
	});
	return result.isConfirmed ? result.value : null;
};

export const showCustomHtmlDialog = async ({
	title,
	html,
	preConfirm,
}: CustomHtmlDialogOptions): Promise<any> => {
	return Swal.fire({
		title,
		html,
		preConfirm,
		showCancelButton: true,
	});
};
