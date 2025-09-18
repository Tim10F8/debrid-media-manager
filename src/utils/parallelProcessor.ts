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
): Promise<any[]> {
	const queue = items.map((item, index) => ({ item, index }));
	const results: any[] = new Array(items.length);
	const inProgress = new Map<number, Promise<void>>();
	let completed = 0;
	const total = items.length;

	while (queue.length > 0 || inProgress.size > 0) {
		// Start new tasks up to the concurrency limit
		while (inProgress.size < concurrency && queue.length > 0) {
			const { item, index } = queue.shift()!;
			const promise = processor(item)
				.then((result) => {
					results[index] = { item, success: true, result };
				})
				.catch((error) => {
					results[index] = { item, success: false, error };
				})
				.finally(() => {
					inProgress.delete(index);
					completed++;
					if (onProgress) {
						onProgress(completed, total);
					}
				});
			inProgress.set(index, promise);
		}

		// Wait for at least one task to complete before continuing
		if (inProgress.size > 0) {
			await Promise.race(Array.from(inProgress.values()));
		}
	}

	return results;
}
