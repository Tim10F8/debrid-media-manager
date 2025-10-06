import { getGlobalModalInstance } from './ModalContext';
import type { FireOptions, ModalResult } from './types';

/**
 * Custom modal API that uses React Context internally
 */
const Modal = {
	fire: async (options: FireOptions): Promise<ModalResult> => {
		const modalInstance = getGlobalModalInstance();
		if (!modalInstance) {
			console.error(
				'Modal system not initialized. Make sure ModalProvider is mounted in your app.'
			);
			return { isConfirmed: false, isDismissed: true };
		}
		return modalInstance.fire(options);
	},

	close: () => {
		const modalInstance = getGlobalModalInstance();
		if (modalInstance) {
			modalInstance.close();
		}
	},

	showLoading: () => {
		const modalInstance = getGlobalModalInstance();
		if (modalInstance) {
			modalInstance.showLoading();
		}
	},

	showValidationMessage: (message: string) => {
		// This is a stub for compatibility
		console.error(message);
	},

	DismissReason: {
		cancel: 'cancel',
		backdrop: 'backdrop',
		close: 'close',
		esc: 'esc',
		timer: 'timer',
	},
};

export default Modal;
