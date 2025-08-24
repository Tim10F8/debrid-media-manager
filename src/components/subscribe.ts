import Swal from './modals/modal';

export const showSubscribeModal = async () => {
	Swal.fire({
		// icon: 'info',
		html: 'Coming soon!',
		showConfirmButton: false,
		customClass: {
			htmlContainer: '!mx-1',
		},
		width: '800px',
		showCloseButton: true,
		inputAutoFocus: true,
	});
};
