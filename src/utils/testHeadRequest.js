import { headRequest } from './headRequest.js';

const testUrl = 'https://21-4.download.real-debrid.com/speedtest/test.rar/0.123456';

headRequest(testUrl)
	.then((response) => {
		console.log('HEAD request successful');
		console.log('Status:', response.status);
		console.log('Headers:', Object.fromEntries(response.headers));
	})
	.catch((error) => {
		console.error('HEAD request failed:', error.message);
	});
