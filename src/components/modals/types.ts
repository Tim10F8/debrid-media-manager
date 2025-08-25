export interface ConfirmDialogOptions {
	title: string;
	text?: string;
	icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
	confirmButtonText?: string;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
	showCancelButton?: boolean;
}

export interface ChoiceDialogOptions {
	title: string;
	text?: string;
	icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
	confirmButtonText: string;
	denyButtonText: string;
	cancelButtonText?: string;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
	denyButtonColor?: string;
	showDenyButton?: boolean;
	showCancelButton?: boolean;
}

export interface InputDialogOptions {
	title: string;
	input?: 'text';
	inputPlaceholder?: string;
	inputAttributes?: any;
	showCancelButton?: boolean;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
}

export interface CustomHtmlDialogOptions {
	title?: string;
	html: string;
	preConfirm?: () => Promise<any> | any;
	showCancelButton?: boolean;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
	background?: string;
	color?: string;
	customClass?: any;
	willOpen?: () => void;
	didOpen?: () => void;
	confirmButtonText?: string;
	cancelButtonText?: string;
	showConfirmButton?: boolean;
	allowOutsideClick?: boolean;
	allowEscapeKey?: boolean;
}

export interface FireOptions {
	title?: string;
	text?: string;
	html?: string;
	icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
	confirmButtonText?: string;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
	denyButtonColor?: string;
	denyButtonText?: string;
	cancelButtonText?: string;
	showCancelButton?: boolean;
	showDenyButton?: boolean;
	showConfirmButton?: boolean;
	input?: 'text';
	inputPlaceholder?: string;
	inputAttributes?: any;
	preConfirm?: () => Promise<any> | any;
	background?: string;
	color?: string;
	customClass?: any;
	willOpen?: () => void;
	didOpen?: () => void;
	allowOutsideClick?: boolean;
	allowEscapeKey?: boolean;
	width?: string;
	showCloseButton?: boolean;
	inputAutoFocus?: boolean;
}

export interface SwalResult {
	isConfirmed: boolean;
	isDenied?: boolean;
	isDismissed?: boolean;
	value?: any;
	dismiss?: string;
}
