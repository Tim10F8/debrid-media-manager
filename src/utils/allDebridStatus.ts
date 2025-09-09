/**
 * Maps AllDebrid status codes to user-friendly display text
 */
export function getAllDebridStatusText(statusCode: string | number): string {
	const code = typeof statusCode === 'string' ? parseInt(statusCode, 10) : statusCode;

	switch (code) {
		case 0:
			return 'In Queue';
		case 1:
			return 'Downloading';
		case 2:
			return 'Compressing';
		case 3:
			return 'Uploading';
		case 4:
			return 'Ready';
		case 5:
			return 'Upload Failed';
		case 6:
			return 'Unpacking Error';
		case 7:
			return 'No Peer (20min timeout)';
		case 8:
			return 'File Too Big';
		case 9:
			return 'Internal Error';
		case 10:
			return 'Download Timeout (72h)';
		case 11:
			return 'Expired - Files Removed';
		case 12:
		case 13:
			return 'Processing Failed';
		case 14:
			return 'Tracker Error';
		case 15:
			return 'No Peer Available';
		default:
			return `Unknown Status (${code})`;
	}
}
