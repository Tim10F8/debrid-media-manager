import { render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
	CompactWorkingStreamMetrics,
	RealDebridObservabilityStats,
} from '@/lib/observability/getRealDebridObservabilityStats';
import RealDebridStatusPage from '@/pages/is-real-debrid-down-or-just-me';

function buildWorkingStream(): CompactWorkingStreamMetrics {
	return {
		total: 0,
		working: 0,
		rate: 0,
		lastChecked: null,
		failedServers: [],
		lastError: null,
		inProgress: false,
		avgLatencyMs: null,
		fastestServer: null,
		recentChecks: [],
	};
}

const baseStats: RealDebridObservabilityStats = {
	workingStream: buildWorkingStream(),
	rdApi: null,
};

type GlobalWithFetch = typeof globalThis & {
	fetch?: typeof fetch;
};

const globalWithFetch = globalThis as GlobalWithFetch;

const originalFetch = globalWithFetch.fetch;

function setMockFetch(mockImpl: ReturnType<typeof vi.fn>) {
	globalWithFetch.fetch = mockImpl as unknown as typeof fetch;
}

describe('RealDebridStatusPage client refresh', () => {
	beforeEach(() => {
		const defaultFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(baseStats),
		});
		setMockFetch(defaultFetch);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalFetch) {
			globalWithFetch.fetch = originalFetch;
		} else {
			Reflect.deleteProperty(globalWithFetch, 'fetch');
		}
	});

	it('renders working stream card', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(baseStats),
		});
		setMockFetch(mockFetch);

		const { getByTestId } = render(<RealDebridStatusPage />);

		// Wait for data to load
		await waitFor(() => expect(getByTestId('working-stream-card')).toBeTruthy());

		const workingStreamCard = getByTestId('working-stream-card');
		expect(workingStreamCard).toBeTruthy();
		expect(within(workingStreamCard).getByText('Stream Server Check')).toBeTruthy();
		expect(getByTestId('status-answer-mobile').textContent).toBe(' collecting data');
		expect(getByTestId('status-freshness').textContent?.startsWith('Last updated:')).toBe(true);
	});

	it('promotes Debrid Media Manager with an external CTA link', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(baseStats),
		});
		setMockFetch(mockFetch);

		const { getByRole, getByTestId } = render(<RealDebridStatusPage />);

		// Wait for data to load
		await waitFor(() => expect(getByTestId('dmm-marketing-copy')).toBeTruthy());

		const marketingCopy = getByTestId('dmm-marketing-copy');
		expect(marketingCopy.textContent).toContain(
			'Debrid Media Manager is a free, open source dashboard for Real-Debrid, AllDebrid, and TorBox.'
		);
		expect(marketingCopy.textContent).toContain(
			'to search, download, and manage your library.'
		);
		expect(getByTestId('dmm-marketing-separator')).toBeTruthy();
		const ctaLink = getByRole('link', { name: 'debridmediamanager.com' });
		expect(ctaLink).toBeTruthy();
		expect(ctaLink).toHaveAttribute('href', 'https://debridmediamanager.com/');
		expect(ctaLink).toHaveAttribute('target', '_blank');
		expect(ctaLink).toHaveAttribute('rel', 'noreferrer noopener');
	});

	it('requests verbose stats during client fetch', async () => {
		const resolvedStats = { ...baseStats };
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(resolvedStats),
		});
		setMockFetch(mockFetch);

		render(<RealDebridStatusPage />);

		// Wait for at least one call
		await waitFor(() => expect(mockFetch).toHaveBeenCalled());

		// Find the observability call (has verbose=true)
		const observabilityCall = mockFetch.mock.calls.find(([url]) => {
			if (typeof url !== 'string') return false;
			return url.includes('/api/observability/real-debrid');
		});
		expect(observabilityCall).toBeTruthy();
		const requestUrl = observabilityCall![0] as string;
		const parsedUrl = new URL(requestUrl);
		expect(parsedUrl.origin).toBe(window.location.origin);
		expect(parsedUrl.searchParams.get('verbose')).toBe('true');
		expect(parsedUrl.searchParams.get('_t')).not.toBeNull();
	});

	it('attaches a mock fetch when none exists', async () => {
		Reflect.deleteProperty(globalWithFetch, 'fetch');
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(baseStats),
		});
		setMockFetch(mockFetch);
		expect(globalWithFetch.fetch).toBe(mockFetch as unknown as typeof fetch);

		render(<RealDebridStatusPage />);

		// Wait for at least one call
		await waitFor(() => expect(mockFetch).toHaveBeenCalled());
	});

	it('logs when the fetch payload is invalid', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ not: 'expected' }),
		});
		setMockFetch(mockFetch);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		render(<RealDebridStatusPage />);

		// Wait for at least one call
		await waitFor(() => expect(mockFetch).toHaveBeenCalled());

		await waitFor(() => {
			const payloadLog = consoleError.mock.calls.find(
				([message]) => message === 'Received invalid Real-Debrid stats payload'
			);
			expect(payloadLog).toBeTruthy();
		});
	});
});
