import Image from 'next/image';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

// Pre-compute subdomain based on IMDB ID (deterministic hash)
const getPosterUrl = (imdbId: string | null | undefined): string => {
	if (!imdbId) return '';

	const numericId = imdbId.replace(/[^0-9]/g, '');
	let hash = 0;
	for (let i = 0; i < numericId.length; i++) {
		hash = (hash << 5) - hash + parseInt(numericId[i]);
		hash = hash & hash;
	}

	const subdomain = Math.abs(hash) % 10;
	return `https://posters${subdomain}.debridmediamanager.com/${imdbId}-small.jpg`;
};

// Cache for API-fetched poster URLs to avoid duplicate requests
const posterCache = new Map<string, string>();

type PosterProps = {
	imdbId: string;
	title?: string;
};

const Poster = memo(
	function Poster({ imdbId, title }: PosterProps) {
		const [posterUrl, setPosterUrl] = useState(() => getPosterUrl(imdbId));
		const [fallbackAttempted, setFallbackAttempted] = useState(false);
		const mountedRef = useRef(true);

		useEffect(() => {
			mountedRef.current = true;
			return () => {
				mountedRef.current = false;
			};
		}, []);

		useEffect(() => {
			if (imdbId) {
				// Check cache first
				const cached = posterCache.get(imdbId);
				if (cached) {
					setPosterUrl(cached);
					setFallbackAttempted(true);
				} else {
					setPosterUrl(getPosterUrl(imdbId));
					setFallbackAttempted(false);
				}
			}
		}, [imdbId]);

		const handleImageError = useCallback(async () => {
			if (!fallbackAttempted && imdbId) {
				setFallbackAttempted(true);

				// Check cache before making API call
				const cached = posterCache.get(imdbId);
				if (cached) {
					setPosterUrl(cached);
					return;
				}

				try {
					const response = await fetch(`/api/poster?imdbid=${imdbId}`);
					if (response.ok && mountedRef.current) {
						const data = await response.json();
						posterCache.set(imdbId, data.url);
						setPosterUrl(data.url);
						return;
					}
					throw new Error('API failed');
				} catch {
					if (!mountedRef.current) return;
					// Use fakeimg.pl as final fallback
					const displayText = title || imdbId || 'No Poster';
					const encodedTitle = encodeURIComponent(displayText);
					const fallbackUrl = `https://fakeimg.pl/400x600/282828/eae0d0?font_size=40&font=bebas&text=${encodedTitle}&w=640&q=75`;
					posterCache.set(imdbId, fallbackUrl);
					setPosterUrl(fallbackUrl);
				}
			}
		}, [fallbackAttempted, imdbId, title]);

		return (
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded bg-gray-800">
				{posterUrl ? (
					<Image
						fill
						sizes="80px"
						src={posterUrl}
						alt={`Poster for ${title || imdbId || 'unknown'}`}
						loading="lazy"
						onError={handleImageError}
						className="object-cover"
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-gray-600">
						<div className="p-2 text-center text-sm">Loading...</div>
					</div>
				)}
			</div>
		);
	},
	// Custom comparison - only re-render if imdbId or title changes
	(prevProps, nextProps) =>
		prevProps.imdbId === nextProps.imdbId && (prevProps.title ?? '') === (nextProps.title ?? '')
);

export default Poster;
