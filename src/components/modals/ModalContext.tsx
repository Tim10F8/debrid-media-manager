import { AlertTriangle, CheckCircle, HelpCircle, Info, XCircle } from 'lucide-react';
import React, { createContext, ReactNode, useContext, useState } from 'react';

interface ModalContextType {
	showConfirmDialog: (options: ConfirmDialogOptions) => Promise<boolean>;
	showChoiceDialog: (options: ChoiceDialogOptions) => Promise<'confirm' | 'deny' | 'cancel'>;
	showInputDialog: (options: InputDialogOptions) => Promise<string | null>;
	showCustomHtmlDialog: (options: CustomHtmlDialogOptions) => Promise<any>;
}

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

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error('useModal must be used within a ModalProvider');
	}
	return context;
};

interface ModalState {
	type: 'confirm' | 'choice' | 'input' | 'custom' | null;
	options: any;
	resolve: (value: any) => void;
}

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [modalState, setModalState] = useState<ModalState>({
		type: null,
		options: {},
		resolve: () => {},
	});

	const showConfirmDialog = (options: ConfirmDialogOptions): Promise<boolean> => {
		return new Promise((resolve) => {
			setModalState({
				type: 'confirm',
				options,
				resolve,
			});
		});
	};

	const showChoiceDialog = (
		options: ChoiceDialogOptions
	): Promise<'confirm' | 'deny' | 'cancel'> => {
		return new Promise((resolve) => {
			setModalState({
				type: 'choice',
				options,
				resolve,
			});
		});
	};

	const showInputDialog = (options: InputDialogOptions): Promise<string | null> => {
		return new Promise((resolve) => {
			setModalState({
				type: 'input',
				options,
				resolve,
			});
		});
	};

	const showCustomHtmlDialog = (options: CustomHtmlDialogOptions): Promise<any> => {
		return new Promise((resolve) => {
			setModalState({
				type: 'custom',
				options,
				resolve,
			});
		});
	};

	const closeModal = (result?: any) => {
		modalState.resolve(result);
		setModalState({
			type: null,
			options: {},
			resolve: () => {},
		});
	};

	return (
		<ModalContext.Provider
			value={{
				showConfirmDialog,
				showChoiceDialog,
				showInputDialog,
				showCustomHtmlDialog,
			}}
		>
			{children}
			{modalState.type === 'confirm' && (
				<ConfirmDialog {...modalState.options} onClose={(result) => closeModal(result)} />
			)}
			{modalState.type === 'choice' && (
				<ChoiceDialog {...modalState.options} onClose={(result) => closeModal(result)} />
			)}
			{modalState.type === 'input' && (
				<InputDialog {...modalState.options} onClose={(result) => closeModal(result)} />
			)}
			{modalState.type === 'custom' && (
				<CustomHtmlDialog
					{...modalState.options}
					onClose={(result) => closeModal(result)}
				/>
			)}
		</ModalContext.Provider>
	);
};

interface BaseModalProps {
	onClose: (result: any) => void;
}

const ConfirmDialog: React.FC<ConfirmDialogOptions & BaseModalProps> = ({
	title,
	text,
	icon = 'warning',
	confirmButtonText = 'Yes, proceed!',
	onClose,
}) => {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
			<div className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl">
				<div className="mb-4 flex items-center justify-center">
					{icon === 'warning' && <AlertTriangle className="h-12 w-12 text-yellow-500" />}
					{icon === 'error' && <XCircle className="h-12 w-12 text-red-500" />}
					{icon === 'success' && <CheckCircle className="h-12 w-12 text-green-500" />}
					{icon === 'info' && <Info className="h-12 w-12 text-blue-500" />}
					{icon === 'question' && <HelpCircle className="h-12 w-12 text-gray-400" />}
				</div>
				<h2 className="mb-2 text-center text-xl font-bold text-gray-100">{title}</h2>
				<p className="mb-6 text-center text-gray-300">{text}</p>
				<div className="flex justify-center space-x-3">
					<button
						onClick={() => onClose(true)}
						className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
					>
						{confirmButtonText}
					</button>
					<button
						onClick={() => onClose(false)}
						className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

const ChoiceDialog: React.FC<ChoiceDialogOptions & BaseModalProps> = ({
	title,
	text,
	confirmButtonText,
	denyButtonText,
	cancelButtonText = 'Cancel',
	onClose,
}) => {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
			<div className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl">
				<div className="mb-4 flex items-center justify-center">
					<HelpCircle className="h-12 w-12 text-gray-400" />
				</div>
				<h2 className="mb-2 text-center text-xl font-bold text-gray-100">{title}</h2>
				<p className="mb-6 text-center text-gray-300">{text}</p>
				<div className="flex justify-center space-x-3">
					<button
						onClick={() => onClose('confirm')}
						className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
					>
						{confirmButtonText}
					</button>
					<button
						onClick={() => onClose('deny')}
						className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
					>
						{denyButtonText}
					</button>
					<button
						onClick={() => onClose('cancel')}
						className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
					>
						{cancelButtonText}
					</button>
				</div>
			</div>
		</div>
	);
};

const InputDialog: React.FC<InputDialogOptions & BaseModalProps> = ({
	title,
	inputPlaceholder = 'Enter a value',
	onClose,
}) => {
	const [inputValue, setInputValue] = useState('');

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onClose(inputValue || null);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
			<div className="w-full max-w-md rounded-lg bg-gray-900 p-6 shadow-xl">
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
						<button
							type="button"
							onClick={() => onClose(null)}
							className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

const CustomHtmlDialog: React.FC<CustomHtmlDialogOptions & BaseModalProps> = ({
	title,
	html,
	preConfirm,
	onClose,
}) => {
	const handleConfirm = async () => {
		if (preConfirm) {
			const result = await preConfirm();
			onClose({ isConfirmed: true, value: result });
		} else {
			onClose({ isConfirmed: true });
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
			<div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-gray-900 p-6 shadow-xl">
				<h2 className="mb-4 text-center text-xl font-bold text-gray-100">{title}</h2>
				<div className="mb-6 text-gray-100" dangerouslySetInnerHTML={{ __html: html }} />
				<div className="flex justify-center space-x-3">
					<button
						onClick={handleConfirm}
						className="rounded bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
					>
						OK
					</button>
					<button
						onClick={() => onClose({ isConfirmed: false })}
						className="rounded bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};
