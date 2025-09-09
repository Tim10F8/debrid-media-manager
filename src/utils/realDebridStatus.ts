/**
 * Maps RealDebrid status strings to user-friendly display text
 */
export function getRealDebridStatusText(status: string): string {
	switch (status) {
		case 'magnet_conversion':
			return 'Converting Magnet';
		case 'waiting_files_selection':
			return 'Waiting File Selection';
		case 'queued':
			return 'Queued';
		case 'downloading':
			return 'Downloading';
		case 'compressing':
			return 'Compressing';
		case 'uploading':
			return 'Uploading';
		case 'downloaded':
			return 'Downloaded';
		case 'magnet_error':
			return 'Magnet Error';
		case 'error':
			return 'Error';
		case 'virus':
			return 'Virus Detected';
		case 'dead':
			return 'Dead Torrent';
		default:
			return status; // Fallback to raw status for unknown values
	}
}
