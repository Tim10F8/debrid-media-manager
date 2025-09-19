export const headRequest = async (url) => {
	try {
		const response = await fetch(url, { method: 'HEAD' });
		return response;
	} catch (error) {
		console.error('HEAD request failed:', error);
		throw error;
	}
};
