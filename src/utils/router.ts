const DEFAULT_FALLBACK = '/';

const sanitizePath = (value: string): string => {
	if (!value) return DEFAULT_FALLBACK;
	const trimmed = value.trim();
	if (!trimmed.startsWith('/')) return DEFAULT_FALLBACK;
	if (trimmed.startsWith('//')) return DEFAULT_FALLBACK;
	// Prevent protocol-like prefixes or javascript schemes
	const lowered = trimmed.toLowerCase();
	if (
		lowered.startsWith('http://') ||
		lowered.startsWith('https://') ||
		lowered.startsWith('javascript:')
	) {
		return DEFAULT_FALLBACK;
	}
	return trimmed;
};

export const getSafeRedirectPath = (
	redirect: string | string[] | undefined,
	fallback: string = DEFAULT_FALLBACK
): string => {
	const desired = Array.isArray(redirect) ? redirect[0] : redirect;
	const safeFallback = sanitizePath(fallback) || DEFAULT_FALLBACK;
	if (!desired) return safeFallback;
	const sanitized = sanitizePath(desired);
	return sanitized === DEFAULT_FALLBACK ? safeFallback : sanitized;
};
