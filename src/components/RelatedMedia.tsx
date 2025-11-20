import { Popcorn } from 'lucide-react';
import { useRouter } from 'next/router';

type RelatedMediaProps = {
	imdbId: string;
	mediaType: 'movie' | 'show';
};

export default function RelatedMedia({ imdbId, mediaType }: RelatedMediaProps) {
	const router = useRouter();

	const handleNavigate = (event: React.MouseEvent<HTMLButtonElement>) => {
		const destination = `/${mediaType}/${imdbId}/related`;
		console.info('Navigating to related media', { mediaType, imdbId, destination });
		if (event.metaKey || event.ctrlKey) {
			window.open(destination, '_blank');
			return;
		}
		router.push(destination).catch((error) => {
			console.error('Failed to navigate to related media page', { mediaType, imdbId, error });
		});
	};

	return (
		<button
			className="rounded border border-purple-500 bg-purple-900/30 p-1 text-purple-100 transition-colors hover:bg-purple-800/50"
			onClick={handleNavigate}
			type="button"
			title="Show related media"
		>
			<Popcorn size={18} />
		</button>
	);
}
