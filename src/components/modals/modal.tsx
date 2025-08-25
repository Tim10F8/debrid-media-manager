import { getGlobalModalInstance } from './ModalContext';
import type { FireOptions, SwalResult } from './types';

/**
 * Swal-compatible modal API that uses React Context internally
 * This provides backward compatibility with existing code while using the unified modal system
 */
const Swal = {
	fire: async (options: FireOptions): Promise<SwalResult> => {
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

export default Swal;
