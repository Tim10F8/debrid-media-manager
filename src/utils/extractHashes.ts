export function extractHashes(hashesStr: string): string[] {
	// First check if it contains full magnet URIs
	const magnetRegex = /magnet:\?[^\s"']*/gi;
	const magnetMatches = hashesStr.match(magnetRegex);

	if (magnetMatches && magnetMatches.length > 0) {
		// Return the full magnet URIs
		return magnetMatches;
	}

	// Otherwise extract just the hashes (40-character hex strings)
	const hashRegex = /\b[a-f0-9]{40}\b/gi;
	const hashMatches = hashesStr.match(hashRegex);

	// If we found hashes, convert them to magnet URIs for AllDebrid compatibility
	if (hashMatches && hashMatches.length > 0) {
		return hashMatches.map((hash) => `magnet:?xt=urn:btih:${hash}`);
	}

	return [];
}
