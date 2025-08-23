import { AsyncFunction, runConcurrentFunctions } from '@/utils/batch';
import { toast } from 'react-hot-toast';

interface ProgressToastOptions {
	loadingMessage: (completed: number, total: number, errorCount: number) => string;
	successMessage?: (successCount: number, errorCount: number) => string;
	errorMessage?: (errorCount: number) => string;
	toastOptions?: any;
	concurrency?: number;
	onSuccess?: () => Promise<void> | void;
	onError?: () => Promise<void> | void;
}

export const useProgressToast = () => {
	const runWithProgress = async <T>(
		tasks: AsyncFunction<T>[],
		operation: string,
		options: ProgressToastOptions
	): Promise<{ results: T[]; errors: Error[] }> => {
		const {
			loadingMessage,
			successMessage,
			errorMessage,
			toastOptions = {},
			concurrency = 4,
			onSuccess,
			onError,
		} = options;

		const progressToast = toast.loading(loadingMessage(0, tasks.length, 0), toastOptions);

		const [results, errors] = await runConcurrentFunctions(
			tasks,
			concurrency,
			0,
			(completed, total, errorCount) => {
				toast.loading(loadingMessage(completed, total, errorCount), {
					id: progressToast,
				});
			}
		);

		// Handle results
		if (errors.length && results.length) {
			const message = successMessage
				? successMessage(results.length, errors.length)
				: `${operation}: ${results.length} succeeded, ${errors.length} failed`;
			toast.error(message, {
				id: progressToast,
				...toastOptions,
			});
			if (onSuccess) await onSuccess();
		} else if (errors.length) {
			const message = errorMessage
				? errorMessage(errors.length)
				: `Failed to ${operation.toLowerCase()} ${errors.length} items`;
			toast.error(message, {
				id: progressToast,
				...toastOptions,
			});
			if (onError) await onError();
		} else if (results.length) {
			const message = successMessage
				? successMessage(results.length, 0)
				: `${operation} completed: ${results.length} items`;
			toast.success(message, {
				id: progressToast,
				...toastOptions,
			});
			if (onSuccess) await onSuccess();
		} else {
			toast.dismiss(progressToast);
		}

		return { results, errors };
	};

	return { runWithProgress };
};
