import { useLibraryCache } from '@/contexts/LibraryCacheContext';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/router';

export default function FloatingLibraryIndicator() {
	const { libraryItems, isLoading, isFetching, lastFetchTime, error, refreshLibrary } =
		useLibraryCache();
	const router = useRouter();

	// Don't show on library page
	if (router.pathname === '/library') {
		return null;
	}

	const handleRefresh = async () => {
		await refreshLibrary();
	};

	const formatLastFetch = () => {
		if (!lastFetchTime) return 'Never';
		const now = new Date();
		const diff = now.getTime() - lastFetchTime.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	};

	const isStale =
		lastFetchTime && new Date().getTime() - lastFetchTime.getTime() > 30 * 60 * 1000; // 30 minutes

	return (
		<div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-3 py-2 shadow-lg md:px-4 md:py-2">
			<div className="flex items-center gap-2">
				{error && (
					<div title={error}>
						<AlertCircle className="h-4 w-4 text-red-400" />
					</div>
				)}
				<div className="flex flex-col">
					<span className="text-sm text-gray-300">
						{isLoading || isFetching ? (
							<span className="text-cyan-400">
								{isLoading ? 'Loading...' : 'Refreshing...'}
							</span>
						) : (
							<div className="flex items-center gap-1">
								<span className="font-medium text-white">
									{libraryItems.length}
								</span>
								<span className="hidden text-gray-400 sm:inline">items</span>
							</div>
						)}
					</span>
					{!isLoading && !isFetching && lastFetchTime && (
						<span
							className={`text-xs ${isStale ? 'text-yellow-400' : 'text-gray-500'} hidden sm:block`}
						>
							{formatLastFetch()}
						</span>
					)}
				</div>
				<button
					onClick={handleRefresh}
					disabled={isFetching}
					className={`rounded-full p-1.5 transition-all ${
						isFetching
							? 'cursor-not-allowed bg-gray-700 text-gray-500'
							: error
								? 'bg-red-900/50 text-red-400 hover:bg-red-800/50'
								: isStale
									? 'bg-yellow-900/50 text-yellow-400 hover:bg-yellow-800/50'
									: 'bg-cyan-900/50 text-cyan-400 hover:bg-cyan-800/50 hover:text-cyan-300'
					}`}
					title={error ? 'Retry fetch' : 'Refresh library'}
					aria-label="Refresh library"
				>
					<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
				</button>
			</div>
		</div>
	);
}
