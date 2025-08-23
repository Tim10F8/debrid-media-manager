import Swal, { SweetAlertIcon, SweetAlertResult } from 'sweetalert2';

const baseConfig = {
	background: '#111827',
	color: '#f3f4f6',
	customClass: {
		popup: 'bg-gray-900',
		htmlContainer: 'text-gray-100',
		input: 'bg-gray-800 text-gray-100 border border-gray-700 rounded p-2 placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500',
	},
};

const buttonColors = {
	confirmButtonColor: '#0891b2',
	cancelButtonColor: '#374151',
	denyButtonColor: '#059669',
};

interface ConfirmDialogOptions {
	title: string;
	text: string;
	icon?: SweetAlertIcon;
	confirmButtonText?: string;
}

export const showConfirmDialog = async ({
	title,
	text,
	icon = 'warning',
	confirmButtonText = 'Yes, proceed!',
}: ConfirmDialogOptions): Promise<boolean> => {
	const result = await Swal.fire({
		...baseConfig,
		...buttonColors,
		title,
		text,
		icon,
		showCancelButton: true,
		confirmButtonText,
	});
	return result.isConfirmed;
};

interface ChoiceDialogOptions {
	title: string;
	text: string;
	confirmButtonText: string;
	denyButtonText: string;
	cancelButtonText?: string;
}

export const showChoiceDialog = async ({
	title,
	text,
	confirmButtonText,
	denyButtonText,
	cancelButtonText = 'Cancel',
}: ChoiceDialogOptions): Promise<'confirm' | 'deny' | 'cancel'> => {
	const result = await Swal.fire({
		...baseConfig,
		...buttonColors,
		title,
		text,
		icon: 'question',
		showCancelButton: true,
		showDenyButton: true,
		confirmButtonText,
		denyButtonText,
		cancelButtonText,
	});

	if (result.isConfirmed) return 'confirm';
	if (result.isDenied) return 'deny';
	return 'cancel';
};

interface InputDialogOptions {
	title: string;
	inputPlaceholder?: string;
}

export const showInputDialog = async ({
	title,
	inputPlaceholder = 'Enter a value',
}: InputDialogOptions): Promise<string | null> => {
	const result = await Swal.fire({
		...baseConfig,
		...buttonColors,
		title,
		input: 'text',
		inputPlaceholder,
		inputAttributes: {
			autocapitalize: 'off',
		},
		showCancelButton: true,
	});

	return result.value || null;
};

interface CustomHtmlDialogOptions {
	title: string;
	html: string;
	preConfirm?: () => Promise<any> | any;
}

export const showCustomHtmlDialog = async ({
	title,
	html,
	preConfirm,
}: CustomHtmlDialogOptions): Promise<SweetAlertResult> => {
	return await Swal.fire({
		...baseConfig,
		...buttonColors,
		title,
		html,
		showCancelButton: true,
		preConfirm,
	});
};
