import { useEffect, useMemo, useState } from 'react';

const FAST_INTERVAL_MS = 1000;
const SLOW_INTERVAL_MS = 30000;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function useRelativeTimeLabel(timestamp: Date | null, fallback: string): string {
	const [nowMs, setNowMs] = useState(() => Date.now());
	const timestampMs = timestamp ? timestamp.getTime() : null;

	useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		let isActive = true;

		const computeNextInterval = (diff: number | null): number => {
			if (diff === null) return SLOW_INTERVAL_MS;
			if (diff < 0) return FAST_INTERVAL_MS;
			if (diff <= MINUTE_MS) return FAST_INTERVAL_MS;
			if (diff < HOUR_MS) {
				const remainder = diff % MINUTE_MS;
				return remainder === 0 ? MINUTE_MS : MINUTE_MS - remainder;
			}
			if (diff < DAY_MS) {
				const remainder = diff % HOUR_MS;
				return remainder === 0 ? HOUR_MS : HOUR_MS - remainder;
			}
			const remainder = diff % DAY_MS;
			return remainder === 0 ? DAY_MS : DAY_MS - remainder;
		};

		const tick = () => {
			if (!isActive) return;
			const now = Date.now();
			setNowMs(now);
			const diff = timestampMs === null ? null : now - timestampMs;
			const interval = computeNextInterval(diff);
			timeoutId = setTimeout(tick, interval);
		};

		tick();

		return () => {
			isActive = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [timestampMs]);

	return useMemo(() => {
		if (timestampMs === null) return fallback;
		const diffMs = nowMs - timestampMs;
		if (diffMs <= 0) return fallback;
		const seconds = Math.floor(diffMs / 1000);
		if (seconds <= 0) return fallback;
		if (seconds <= 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		return `${minutes}m ago`;
	}, [fallback, nowMs, timestampMs]);
}
