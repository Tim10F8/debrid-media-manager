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
			className="mb-1 mr-2 mt-0 rounded border-2 border-indigo-500 bg-indigo-900/30 p-1 text-xs text-indigo-100 transition-colors hover:bg-indigo-800/50"
			onClick={handleNavigate}
			type="button"
		>
			<b className="flex items-center justify-center">
				<Popcorn className="mr-1 h-3 w-3" />
				Show Related
			</b>
		</button>
	);
}
