import Poster from '@/components/poster';
import axios from 'axios';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

type MediaItem = {
	title: string;
	year: number;
	ids: {
		imdb: string;
	};
};

const buildDestination = (imdbId: string, mediaType: 'movie' | 'show') =>
	mediaType === 'show' ? `/show/${imdbId}/1` : `/movie/${imdbId}`;

export default function RelatedShowsPage() {
	const router = useRouter();
	const imdbIdParam = useMemo(() => {
		const raw = router.query.imdbid;
		return typeof raw === 'string' ? raw : '';
	}, [router.query.imdbid]);

	const [relatedMedia, setRelatedMedia] = useState<MediaItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	const fetchRelated = useCallback(async () => {
		if (!imdbIdParam) return;
		console.info('Fetching related shows', { imdbId: imdbIdParam });
		setIsLoading(true);
		setStatusMessage(null);
		try {
			const response = await axios.get<{ results: MediaItem[]; message?: string }>(
				`/api/related/show`,
				{
					params: {
						imdbId: imdbIdParam,
					},
				}
			);
			setRelatedMedia(response.data.results);
			setStatusMessage(response.data.message ?? null);
		} catch (requestError) {
			console.error('Failed to load related shows', { imdbId: imdbIdParam, requestError });
			setStatusMessage('Failed to load related shows.');
		} finally {
			setIsLoading(false);
		}
	}, [imdbIdParam]);

	useEffect(() => {
		if (!router.isReady) return;
		void fetchRelated();
	}, [fetchRelated, router.isReady]);

	const handleNavigate = (event: MouseEvent<HTMLButtonElement>, imdbId: string) => {
		const destination = buildDestination(imdbId, 'show');
		if (event.metaKey || event.ctrlKey) {
			window.open(destination, '_blank');
			return;
		}
		void router.push(destination);
	};

	return (
		<div className="min-h-screen bg-gray-900 text-gray-100">
			<Head>
				<title>Related Shows • {imdbIdParam}</title>
			</Head>
			<main className="mx-auto max-w-6xl px-4 py-8">
				<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold">Related Shows</h1>
						<p className="text-sm text-gray-400">Based on IMDb ID {imdbIdParam}</p>
					</div>
					<Link
						href={`/show/${imdbIdParam}/1`}
						className="inline-flex items-center rounded border-2 border-indigo-500 bg-indigo-900/30 px-3 py-1 text-sm text-indigo-100 transition-colors hover:bg-indigo-800/50"
					>
						Back to Show
					</Link>
				</div>

				{statusMessage && (
					<div className="mb-4 rounded border border-yellow-500 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-100">
						{statusMessage}
					</div>
				)}

				{isLoading ? (
					<div>Loading related titles…</div>
				) : relatedMedia.length === 0 ? (
					<div>No related shows found.</div>
				) : (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{relatedMedia.map((item) => (
							<button
								key={item.ids.imdb}
								onClick={(event) => handleNavigate(event, item.ids.imdb)}
								type="button"
								className="cursor-pointer rounded bg-gray-800/40 p-2 text-left transition-transform hover:scale-105 hover:bg-gray-800/70"
							>
								<div className="mx-auto flex w-full max-w-[200px] flex-col items-center">
									<Poster imdbId={item.ids.imdb} title={item.title} />
									<div className="mt-2 w-full text-center">
										<div className="text-sm font-semibold text-gray-100">
											{item.title}
										</div>
										<div className="text-xs text-gray-400">{item.year}</div>
									</div>
								</div>
							</button>
						))}
					</div>
				)}
			</main>
		</div>
	);
}
