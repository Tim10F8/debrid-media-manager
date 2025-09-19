import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRelativeTimeLabel } from './useRelativeTimeLabel';

function TestComponent({ timestamp, fallback }: { timestamp: Date | null; fallback: string }) {
	const label = useRelativeTimeLabel(timestamp, fallback);
	return <span>{label}</span>;
}

describe('useRelativeTimeLabel', () => {
	const baseTime = new Date('2024-01-01T00:00:00.000Z');

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(baseTime);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns fallback when timestamp is null', () => {
		render(<TestComponent timestamp={null} fallback="Never" />);
		expect(screen.getByText('Never')).toBeInTheDocument();
	});

	it('updates label as time passes', () => {
		render(<TestComponent timestamp={baseTime} fallback="Just now" />);
		expect(screen.getByText('Just now')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		expect(screen.getByText('1s ago')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(29_000);
		});
		expect(screen.getByText('30s ago')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(screen.getByText('60s ago')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(1_000);
		});
		expect(screen.getByText('1m ago')).toBeInTheDocument();
	});

	it('resets to fallback when timestamp changes', () => {
		const { rerender } = render(<TestComponent timestamp={baseTime} fallback="Just now" />);
		act(() => {
			vi.advanceTimersByTime(2 * 60 * 60 * 1000);
		});
		expect(screen.getByText('2h ago')).toBeInTheDocument();
		const refreshedAt = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000);
		rerender(<TestComponent timestamp={refreshedAt} fallback="Just now" />);
		expect(screen.getByText('Just now')).toBeInTheDocument();
	});

	it('updates immediately when timestamp jumps forward to now', () => {
		const { rerender } = render(<TestComponent timestamp={baseTime} fallback="Just now" />);
		expect(screen.getByText('Just now')).toBeInTheDocument();
		act(() => {
			vi.advanceTimersByTime(90_000);
		});
		expect(screen.getByText('1m ago')).toBeInTheDocument();
		const updatedTime = new Date(Date.now());
		rerender(<TestComponent timestamp={updatedTime} fallback="Just now" />);
		expect(screen.getByText('Just now')).toBeInTheDocument();
	});
});
