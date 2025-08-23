import { UserTorrent } from '@/torrent/userTorrent';
import { normalize } from '@/utils/mediaId';
import { useCallback, useEffect, useState } from 'react';

interface GroupingState {
	defaultTitleGrouping: Record<string, number>;
	movieTitleGrouping: Record<string, number>;
	tvGroupingByEpisode: Record<string, number>;
	tvGroupingByTitle: Record<string, number>;
	hashGrouping: Record<string, number>;
	sameTitle: Set<string>;
	sameHash: Set<string>;
	totalBytes: number;
}

export const useLibraryGrouping = (userTorrentsList: UserTorrent[], loading: boolean) => {
	const [groupingState, setGroupingState] = useState<GroupingState>({
		defaultTitleGrouping: {},
		movieTitleGrouping: {},
		tvGroupingByEpisode: {},
		tvGroupingByTitle: {},
		hashGrouping: {},
		sameTitle: new Set(),
		sameHash: new Set(),
		totalBytes: 0,
	});

	const [grouping, setGrouping] = useState(false);

	const clearGroupings = useCallback((frequencyMap: Record<string, number>) => {
		for (let key in frequencyMap) {
			delete frequencyMap[key];
		}
	}, []);

	const getTitleGroupings = useCallback(
		(mediaType: UserTorrent['mediaType']) => {
			switch (mediaType) {
				case 'movie':
					return groupingState.movieTitleGrouping;
				case 'tv':
					return groupingState.tvGroupingByEpisode;
				default:
					return groupingState.defaultTitleGrouping;
			}
		},
		[groupingState]
	);

	const aggregateMetadata = useCallback(() => {
		if (loading) return;

		setGrouping(true);

		const newState: GroupingState = {
			defaultTitleGrouping: {},
			movieTitleGrouping: {},
			tvGroupingByEpisode: {},
			tvGroupingByTitle: {},
			hashGrouping: {},
			sameTitle: new Set(),
			sameHash: new Set(),
			totalBytes: 0,
		};

		for (const t of userTorrentsList) {
			if (/^Magnet/.test(t.title)) continue;

			// Group by hash
			if (t.hash in newState.hashGrouping) {
				if (newState.hashGrouping[t.hash] === 1) {
					newState.sameHash.add(t.hash);
				}
				newState.hashGrouping[t.hash]++;
			} else {
				newState.hashGrouping[t.hash] = 1;
				newState.totalBytes += t.bytes;
			}

			// Group by title based on media type
			const titleId = normalize(t.title);
			const titleGrouping =
				t.mediaType === 'movie'
					? newState.movieTitleGrouping
					: t.mediaType === 'tv'
						? newState.tvGroupingByEpisode
						: newState.defaultTitleGrouping;

			if (titleId in titleGrouping) {
				if (titleGrouping[titleId] === 1) {
					newState.sameTitle.add(titleId);
				}
				titleGrouping[titleId]++;
			} else {
				titleGrouping[titleId] = 1;
			}

			// Group by TV show title
			if (t.mediaType === 'tv' && t.info?.title) {
				const tvShowTitleId = normalize(t.info.title);
				if (tvShowTitleId in newState.tvGroupingByTitle) {
					newState.tvGroupingByTitle[tvShowTitleId]++;
				} else {
					newState.tvGroupingByTitle[tvShowTitleId] = 1;
				}
			}
		}

		setGroupingState(newState);
		setGrouping(false);
	}, [userTorrentsList, loading]);

	useEffect(() => {
		aggregateMetadata();
	}, [aggregateMetadata]);

	return {
		...groupingState,
		grouping,
		getTitleGroupings,
	};
};
