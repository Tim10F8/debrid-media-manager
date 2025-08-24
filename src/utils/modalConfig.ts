interface ConfirmDialogOptions {
	title: string;
	text: string;
	icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
	confirmButtonText?: string;
}

interface ChoiceDialogOptions {
	title: string;
	text: string;
	confirmButtonText: string;
	denyButtonText: string;
	cancelButtonText?: string;
}

interface InputDialogOptions {
	title: string;
	inputPlaceholder?: string;
}

interface CustomHtmlDialogOptions {
	title: string;
	html: string;
	preConfirm?: () => Promise<any> | any;
}

let modalContext: any = null;

export const setModalContext = (context: any) => {
	modalContext = context;
};

export const showConfirmDialog = async ({
	title,
	text,
	icon = 'warning',
	confirmButtonText = 'Yes, proceed!',
}: ConfirmDialogOptions): Promise<boolean> => {
	if (!modalContext) {
		console.error('Modal context not initialized');
		return false;
	}
	return modalContext.showConfirmDialog({ title, text, icon, confirmButtonText });
};

export const showChoiceDialog = async ({
	title,
	text,
	confirmButtonText,
	denyButtonText,
	cancelButtonText = 'Cancel',
}: ChoiceDialogOptions): Promise<'confirm' | 'deny' | 'cancel'> => {
	if (!modalContext) {
		console.error('Modal context not initialized');
		return 'cancel';
	}
	return modalContext.showChoiceDialog({
		title,
		text,
		confirmButtonText,
		denyButtonText,
		cancelButtonText,
	});
};

export const showInputDialog = async ({
	title,
	inputPlaceholder = 'Enter a value',
}: InputDialogOptions): Promise<string | null> => {
	if (!modalContext) {
		console.error('Modal context not initialized');
		return null;
	}
	return modalContext.showInputDialog({ title, inputPlaceholder });
};

export const showCustomHtmlDialog = async ({
	title,
	html,
	preConfirm,
}: CustomHtmlDialogOptions): Promise<any> => {
	if (!modalContext) {
		console.error('Modal context not initialized');
		return { isConfirmed: false };
	}
	return modalContext.showCustomHtmlDialog({ title, html, preConfirm });
};
