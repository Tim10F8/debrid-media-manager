import Poster from '@/components/poster';
import RelatedMedia from '@/components/RelatedMedia';
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

interface MediaHeaderProps {
	mediaType: 'movie' | 'tv';
	imdbId: string;
	title: string;
	year?: string;
	seasonNum?: string;
	description: string;
	poster: string;
	backdrop?: string;
	imdbScore: number;
	descLimit: number;
	onDescToggle: () => void;
	actionButtons: React.ReactNode;
	additionalInfo?: React.ReactNode;
}

const MediaHeader: React.FC<MediaHeaderProps> = ({
	mediaType,
	imdbId,
	title,
	year,
	seasonNum,
	description,
	poster,
	backdrop,
	imdbScore,
	descLimit,
	onDescToggle,
	actionButtons,
	additionalInfo,
}) => {
	const backdropStyle = backdrop
		? {
				backgroundImage: `linear-gradient(to bottom, hsl(0, 0%, 12%,0.5) 0%, hsl(0, 0%, 12%,0) 50%, hsl(0, 0%, 12%,0.5) 100%), url(${backdrop})`,
				backgroundPosition: 'center',
				backgroundSize: 'screen',
			}
		: {};

	const displayTitle =
		mediaType === 'movie'
			? `${title} (${year})`
			: seasonNum
				? `${title} - Season ${seasonNum}`
				: title;

	return (
		<div
			className="grid auto-cols-auto grid-flow-col auto-rows-auto gap-2"
			style={backdropStyle}
		>
			{(poster && (
				<Image
					width={200}
					height={300}
					src={poster}
					alt={`${mediaType === 'movie' ? 'Movie' : 'Show'} poster`}
					className="row-span-5 shadow-lg"
				/>
			)) || <Poster imdbId={imdbId} title={title} />}

			<div className="flex justify-end p-2">
				<Link
					href="/"
					className="h-fit w-fit rounded border-2 border-cyan-500 bg-cyan-900/30 px-2 py-1 text-sm text-cyan-100 transition-colors hover:bg-cyan-800/50"
				>
					Go Home
				</Link>
			</div>

			<h2 className="text-xl font-bold [text-shadow:_0_2px_0_rgb(0_0_0_/_80%)]">
				{displayTitle}
			</h2>

			<div className="h-fit w-fit bg-slate-900/75" onClick={onDescToggle}>
				{descLimit > 0 ? description.substring(0, descLimit) + '..' : description}{' '}
				{imdbScore > 0 && (
					<div className="inline text-yellow-100">
						<Link href={`https://www.imdb.com/title/${imdbId}/`} target="_blank">
							IMDB Score: {imdbScore < 10 ? imdbScore : imdbScore / 10}
						</Link>
					</div>
				)}
			</div>

			{additionalInfo}

			<div className="flex flex-wrap items-center gap-2">
				{actionButtons}
				<RelatedMedia imdbId={imdbId} mediaType={mediaType === 'tv' ? 'show' : 'movie'} />
			</div>
		</div>
	);
};

export default MediaHeader;
