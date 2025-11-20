import { X } from 'lucide-react';
import React, { useEffect } from 'react';

interface TrailerModalProps {
	trailerUrl: string;
	onClose: () => void;
	title?: string;
}

const extractYouTubeId = (url: string): string | null => {
	if (!url) return null;
	const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
	return match ? match[1] : null;
};

const TrailerModal: React.FC<TrailerModalProps> = ({ trailerUrl, onClose, title }) => {
	const videoId = extractYouTubeId(trailerUrl);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		document.addEventListener('keydown', handleEscape);
		return () => document.removeEventListener('keydown', handleEscape);
	}, [onClose]);

	if (!videoId) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
			onClick={onClose}
		>
			<div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
				<button
					onClick={onClose}
					className="absolute -right-4 -top-4 z-10 rounded-full bg-red-600 p-2 text-white transition-colors hover:bg-red-700"
					aria-label="Close trailer"
				>
					<X size={24} />
				</button>
				<div className="relative pb-[56.25%]">
					<iframe
						className="absolute inset-0 h-full w-full rounded-lg"
						src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
						title={title ? `${title} - Trailer` : 'Trailer'}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowFullScreen
					/>
				</div>
			</div>
		</div>
	);
};

export default TrailerModal;
