import { useCallback, useState } from 'react';

type LoadingState = 'loading' | 'rdSyncing' | 'adSyncing' | 'filtering' | 'grouping';

export const useLoadingStates = () => {
	const [states, setStates] = useState<Record<LoadingState, boolean>>({
		loading: true,
		rdSyncing: true,
		adSyncing: true,
		filtering: false,
		grouping: false,
	});

	const setLoadingState = useCallback((state: LoadingState, value: boolean) => {
		setStates((prev) => ({ ...prev, [state]: value }));
	}, []);

	const isAnyLoading = useCallback(() => {
		return Object.values(states).some((state) => state);
	}, [states]);

	const isSpecificLoading = useCallback(
		(...loadingTypes: LoadingState[]) => {
			return loadingTypes.some((type) => states[type]);
		},
		[states]
	);

	return {
		states,
		setLoadingState,
		isAnyLoading,
		isSpecificLoading,
		// Convenience methods
		setLoading: (value: boolean) => setLoadingState('loading', value),
		setRdSyncing: (value: boolean) => setLoadingState('rdSyncing', value),
		setAdSyncing: (value: boolean) => setLoadingState('adSyncing', value),
		setFiltering: (value: boolean) => setLoadingState('filtering', value),
		setGrouping: (value: boolean) => setLoadingState('grouping', value),
	};
};
