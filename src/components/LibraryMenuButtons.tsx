import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import LibraryButton from './LibraryButton';
import LibraryLinkButton from './LibraryLinkButton';

interface LibraryMenuButtonsProps {
	currentPage: number;
	maxPages: number;
	onPrevPage: () => void;
	onNextPage: () => void;
	onResetFilters: () => void;
	sameHashSize: number;
	sameTitleSize: number;
	selectedTorrentsSize: number;
	uncachedCount: number;
	inProgressCount: number;
	slowCount: number;
	failedCount: number;
}

export default function LibraryMenuButtons({
	currentPage,
	maxPages,
	onPrevPage,
	onNextPage,
	onResetFilters,
	sameHashSize,
	sameTitleSize,
	selectedTorrentsSize,
	uncachedCount,
	inProgressCount,
	slowCount,
	failedCount,
}: LibraryMenuButtonsProps) {
	return (
		<div className="mb-0 flex overflow-x-auto">
			<LibraryButton
				variant="indigo"
				onClick={onPrevPage}
				disabled={currentPage <= 1}
				className="mr-1"
			>
				<FaArrowLeft />
			</LibraryButton>
			<span className="w-16 text-center">
				{currentPage}/{maxPages}
			</span>
			<LibraryButton
				variant="indigo"
				size="xs"
				onClick={onNextPage}
				disabled={currentPage >= maxPages}
				className="ml-1"
			>
				<FaArrowRight />
			</LibraryButton>
			<LibraryLinkButton href="/library?mediaType=movie&page=1" variant="yellow">
				🎥 Movies
			</LibraryLinkButton>
			<LibraryLinkButton href="/library?mediaType=tv&page=1" variant="yellow">
				📺 TV&nbsp;shows
			</LibraryLinkButton>
			<LibraryLinkButton href="/library?mediaType=other&page=1" variant="yellow">
				🗂️ Others
			</LibraryLinkButton>
			<LibraryButton variant="yellow" size="xs" onClick={onResetFilters}>
				Reset
			</LibraryButton>

			{sameHashSize > 0 && (
				<LibraryLinkButton
					href="/library?status=samehash&page=1"
					variant="orange"
					size="sm"
				>
					👀 Same&nbsp;hash
				</LibraryLinkButton>
			)}
			{sameTitleSize > 0 && sameHashSize < sameTitleSize && (
				<LibraryLinkButton
					href="/library?status=sametitle&page=1"
					variant="amber"
					size="sm"
				>
					👀 Same&nbsp;title
				</LibraryLinkButton>
			)}

			{selectedTorrentsSize > 0 && (
				<LibraryLinkButton href="/library?status=selected&page=1" variant="slate">
					👀 Selected ({selectedTorrentsSize})
				</LibraryLinkButton>
			)}
			{uncachedCount > 0 && (
				<LibraryLinkButton href="/library?status=uncached&page=1" variant="slate">
					👀 Uncached
				</LibraryLinkButton>
			)}

			{inProgressCount > 0 && (
				<LibraryLinkButton href="/library?status=inprogress&page=1" variant="slate">
					👀 In&nbsp;progress
				</LibraryLinkButton>
			)}
			{slowCount > 0 && (
				<LibraryLinkButton href="/library?status=slow&page=1" variant="slate">
					👀 No&nbsp;seeds
				</LibraryLinkButton>
			)}
			{failedCount > 0 && (
				<LibraryLinkButton href="/library?status=failed&page=1" variant="slate">
					👀 Failed
				</LibraryLinkButton>
			)}
		</div>
	);
}
