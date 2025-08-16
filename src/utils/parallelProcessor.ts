export interface ProcessResult<T, R = void> {
	item: T;
	success: boolean;
	error?: Error;
	result?: R;
}

/**
 * Process an array of items with a maximum concurrency limit
 * @param items Array of items to process
 * @param processor Async function to process each item
 * @param concurrency Maximum number of concurrent operations
 * @param onProgress Optional callback for progress updates
 * @returns Promise that resolves with results for all items
 */
export async function processWithConcurrency<T, R = void>(
	items: T[],
	processor: (item: T) => Promise<R>,
	concurrency: number,
	onProgress?: (completed: number, total: number) => void
): Promise<ProcessResult<T, R>[]> {
	const queue = items.map((item, index) => ({ item, index }));
	const results: ProcessResult<T, R>[] = new Array(items.length);
	const inProgress = new Map<Promise<{ result: ProcessResult<T, R>; index: number }>, number>();
	let completed = 0;
	const total = items.length;

	while (queue.length > 0 || inProgress.size > 0) {
		// Start new tasks up to the concurrency limit
		while (inProgress.size < concurrency && queue.length > 0) {
			const { item, index } = queue.shift()!;
			const promise = processor(item)
				.then((result) => ({
					result: { item, success: true, result } as ProcessResult<T, R>,
					index,
				}))
				.catch((error) => ({
					result: { item, success: false, error } as ProcessResult<T, R>,
					index,
				}))
				.finally(() => {
					inProgress.delete(promise);
					completed++;
					if (onProgress) {
						onProgress(completed, total);
					}
				});
			inProgress.set(promise, index);
		}

		// Wait for at least one task to complete before continuing
		if (inProgress.size > 0) {
			const { result, index } = await Promise.race(inProgress.keys());
			results[index] = result;
		}
	}

	return results;
}
