import { AlertTriangle, CheckCircle, HelpCircle, Info, Loader2, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

interface ConfirmDialogOptions {
	title: string;
	text: string;
	icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
	confirmButtonText?: string;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
	showCancelButton?: boolean;
}

interface ChoiceDialogOptions {
	title: string;
	text: string;
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

interface InputDialogOptions {
	title: string;
	input?: 'text';
	inputPlaceholder?: string;
	inputAttributes?: any;
	showCancelButton?: boolean;
	confirmButtonColor?: string;
	cancelButtonColor?: string;
}

interface CustomHtmlDialogOptions {
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

interface FireOptions
	extends ConfirmDialogOptions,
		Partial<ChoiceDialogOptions>,
		Partial<InputDialogOptions>,
		Partial<CustomHtmlDialogOptions> {}

class ModalManager {
	private root: ReactDOM.Root | null = null;
	private container: HTMLDivElement | null = null;
	private currentModal: any = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.container = document.createElement('div');
			this.container.id = 'modal-root';
			document.body.appendChild(this.container);
			this.root = ReactDOM.createRoot(this.container);
		}
	}

	private renderModal(Component: React.FC<any>, props: any): Promise<any> {
		return new Promise((resolve) => {
			const handleClose = (result: any) => {
				this.close();
				resolve(result);
			};

			this.currentModal = <Component {...props} onClose={handleClose} />;
			this.root?.render(this.currentModal);
		});
	}

	close() {
		if (this.root) {
			this.root.render(null);
		}
		this.currentModal = null;
		if (typeof window !== 'undefined' && window.closePopup) {
			delete (window as any).closePopup;
		}
	}

	async fire(options: FireOptions): Promise<any> {
		if (typeof window !== 'undefined') {
			(window as any).closePopup = () => this.close();
		}

		if (options.willOpen) {
			options.willOpen();
		}

		let result;

		if (options.input === 'text') {
			result = await this.renderModal(InputModal, options);
		} else if (options.showDenyButton) {
			result = await this.renderModal(ChoiceModal, options);
		} else if (options.html) {
			result = await this.renderModal(CustomHtmlModal, options);
		} else {
			result = await this.renderModal(ConfirmModal, options);
		}

		if (options.didOpen) {
			setTimeout(options.didOpen, 0);
		}

		return result;
	}

	showLoading() {
		this.root?.render(
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
				<div className="rounded-lg bg-gray-900 p-6 shadow-xl">
					<div className="flex items-center space-x-3">
						<Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
						<span className="text-gray-100">Loading...</span>
					</div>
				</div>
			</div>
		);
	}
}

const ConfirmModal: React.FC<ConfirmDialogOptions & { onClose: (result: any) => void }> = ({
	title,
	text,
	icon = 'warning',
	confirmButtonText = 'OK',
	showCancelButton = true,
	onClose,
}) => {
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose({ isConfirmed: false, isDismissed: true, dismiss: 'backdrop' });
			}
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
			onClick={() => onClose({ isConfirmed: false, isDismissed: true, dismiss: 'backdrop' })}
		>
			<div
				className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{icon && (
					<div className="mb-4 flex items-center justify-center">
						{icon === 'warning' && (
							<AlertTriangle className="h-12 w-12 text-yellow-500" />
						)}
						{icon === 'error' && <XCircle className="h-12 w-12 text-red-500" />}
						{icon === 'success' && <CheckCircle className="h-12 w-12 text-green-500" />}
						{icon === 'info' && <Info className="h-12 w-12 text-blue-500" />}
						{icon === 'question' && <HelpCircle className="h-12 w-12 text-gray-400" />}
					</div>
				)}
				<h2 className="mb-2 text-center text-xl font-bold text-gray-100">{title}</h2>
				{text && <p className="mb-6 text-center text-gray-300">{text}</p>}
				<div className="flex justify-center space-x-3">
					<button
						onClick={() => onClose({ isConfirmed: true })}
						className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
					>
						{confirmButtonText}
					</button>
					{showCancelButton && (
						<button
							onClick={() =>
								onClose({
									isConfirmed: false,
									isDismissed: true,
									dismiss: 'cancel',
								})
							}
							className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
						>
							Cancel
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

const ChoiceModal: React.FC<ChoiceDialogOptions & { onClose: (result: any) => void }> = ({
	title,
	text,
	icon = 'question',
	confirmButtonText,
	denyButtonText,
	cancelButtonText = 'Cancel',
	showCancelButton = true,
	onClose,
}) => {
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose({ isConfirmed: false, isDenied: false, isDismissed: true });
			}
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
			onClick={() => onClose({ isConfirmed: false, isDenied: false, isDismissed: true })}
		>
			<div
				className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{icon && (
					<div className="mb-4 flex items-center justify-center">
						{icon === 'warning' && (
							<AlertTriangle className="h-12 w-12 text-yellow-500" />
						)}
						{icon === 'error' && <XCircle className="h-12 w-12 text-red-500" />}
						{icon === 'success' && <CheckCircle className="h-12 w-12 text-green-500" />}
						{icon === 'info' && <Info className="h-12 w-12 text-blue-500" />}
						{icon === 'question' && <HelpCircle className="h-12 w-12 text-gray-400" />}
					</div>
				)}
				<h2 className="mb-2 text-center text-xl font-bold text-gray-100">{title}</h2>
				<p className="mb-6 text-center text-gray-300">{text}</p>
				<div className="flex justify-center space-x-3">
					<button
						onClick={() => onClose({ isConfirmed: true, isDenied: false })}
						className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
					>
						{confirmButtonText}
					</button>
					<button
						onClick={() => onClose({ isConfirmed: false, isDenied: true })}
						className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
					>
						{denyButtonText}
					</button>
					{showCancelButton && (
						<button
							onClick={() =>
								onClose({ isConfirmed: false, isDenied: false, isDismissed: true })
							}
							className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
						>
							{cancelButtonText}
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

const InputModal: React.FC<InputDialogOptions & { onClose: (result: any) => void }> = ({
	title,
	inputPlaceholder = 'Enter a value',
	showCancelButton = true,
	onClose,
}) => {
	const [inputValue, setInputValue] = useState('');

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose({ value: null, isConfirmed: false, isDismissed: true });
			}
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onClose({ value: inputValue || null, isConfirmed: true });
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
			onClick={() => onClose({ value: null, isConfirmed: false, isDismissed: true })}
		>
			<div
				className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="mb-4 text-center text-xl font-bold text-gray-100">{title}</h2>
				<form onSubmit={handleSubmit}>
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						placeholder={inputPlaceholder}
						className="mb-6 w-full rounded border border-gray-700 bg-gray-800 p-2 text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
						autoFocus
					/>
					<div className="flex justify-center space-x-3">
						<button
							type="submit"
							className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
						>
							OK
						</button>
						{showCancelButton && (
							<button
								type="button"
								onClick={() =>
									onClose({
										value: null,
										isConfirmed: false,
										isDismissed: true,
										dismiss: 'cancel',
									})
								}
								className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
							>
								Cancel
							</button>
						)}
					</div>
				</form>
			</div>
		</div>
	);
};

const CustomHtmlModal: React.FC<CustomHtmlDialogOptions & { onClose: (result: any) => void }> = ({
	title,
	html,
	preConfirm,
	showCancelButton = true,
	confirmButtonText = 'OK',
	cancelButtonText = 'Cancel',
	showConfirmButton = true,
	allowOutsideClick = true,
	allowEscapeKey = true,
	onClose,
}) => {
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && allowEscapeKey) {
				onClose({ isConfirmed: false, isDismissed: true });
			}
		};
		window.addEventListener('keydown', handleEscape);
		return () => window.removeEventListener('keydown', handleEscape);
	}, [onClose, allowEscapeKey]);

	const handleConfirm = async () => {
		if (preConfirm) {
			const result = await preConfirm();
			onClose({ isConfirmed: true, value: result });
		} else {
			onClose({ isConfirmed: true });
		}
	};

	const handleBackdropClick = () => {
		if (allowOutsideClick) {
			onClose({ isConfirmed: false, isDismissed: true });
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
			onClick={handleBackdropClick}
		>
			<div
				className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-gray-900 p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{title && (
					<h2 className="mb-4 text-center text-xl font-bold text-gray-100">{title}</h2>
				)}
				<div className="mb-6 text-gray-100" dangerouslySetInnerHTML={{ __html: html }} />
				{(showConfirmButton || showCancelButton) && (
					<div className="flex justify-center space-x-3">
						{showConfirmButton && (
							<button
								onClick={handleConfirm}
								className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
							>
								{confirmButtonText}
							</button>
						)}
						{showCancelButton && (
							<button
								onClick={() => onClose({ isConfirmed: false, isDismissed: true })}
								className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
							>
								{cancelButtonText}
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

const modalManager = new ModalManager();

export const Swal = {
	fire: (options: FireOptions) => modalManager.fire(options),
	close: () => modalManager.close(),
	showLoading: () => modalManager.showLoading(),
	DismissReason: {
		cancel: 'cancel',
		backdrop: 'backdrop',
		close: 'close',
		esc: 'esc',
		timer: 'timer',
	},
};

export default Swal;
