import { UserTorrent, UserTorrentStatus } from '@/torrent/userTorrent';
import { handleReinsertTorrentinRd, handleRestartTorrent } from '@/utils/addMagnet';
import { handleDeleteAdTorrent, handleDeleteRdTorrent } from '@/utils/deleteTorrent';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/router';
import LibraryTorrentRow from '../LibraryTorrentRow';

// Mock dependencies
jest.mock('@/utils/addMagnet');
jest.mock('@/utils/deleteTorrent');
jest.mock('@/utils/copyMagnet');
jest.mock('@/utils/hashList');
jest.mock('next/router', () => ({
	useRouter: jest.fn(),
}));

const mockHandleReinsertTorrentinRd = handleReinsertTorrentinRd as jest.MockedFunction<
	typeof handleReinsertTorrentinRd
>;
const mockHandleRestartTorrent = handleRestartTorrent as jest.MockedFunction<
	typeof handleRestartTorrent
>;
const mockHandleDeleteRdTorrent = handleDeleteRdTorrent as jest.MockedFunction<
	typeof handleDeleteRdTorrent
>;
const mockHandleDeleteAdTorrent = handleDeleteAdTorrent as jest.MockedFunction<
	typeof handleDeleteAdTorrent
>;

describe('LibraryTorrentRow Reinsert Functionality', () => {
	const mockRouter = {
		push: jest.fn(),
		query: {},
	};

	const mockTorrent: UserTorrent = {
		id: 'rd:123',
		hash: 'abc123hash',
		filename: 'test.mkv',
		title: 'Test Movie',
		bytes: 1000000000,
		progress: 100,
		status: UserTorrentStatus.finished,
		serviceStatus: 'downloaded',
		added: new Date('2024-01-01'),
		mediaType: 'movie',
		links: ['link1', 'link2'],
		selectedFiles: [],
		seeders: 10,
		speed: 0,
	};

	const defaultProps = {
		torrent: mockTorrent,
		rdKey: 'test-rd-key',
		adKey: null,
		shouldDownloadMagnets: false,
		hashGrouping: {},
		titleGrouping: {},
		tvGroupingByTitle: {},
		isSelected: false,
		onSelect: jest.fn(),
		onDelete: jest.fn(),
		onShowInfo: jest.fn(),
		onTypeChange: jest.fn(),
		onRefreshLibrary: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		(useRouter as jest.Mock).mockReturnValue(mockRouter);
	});

	describe('Reinsert Button Click', () => {
		it('should call handleReinsertTorrentinRd without selectedFileIds for RD torrents', async () => {
			mockHandleReinsertTorrentinRd.mockResolvedValueOnce(undefined);

			const { container } = render(<LibraryTorrentRow {...defaultProps} />);

			// Find the reinsert button
			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			expect(reinsertButton).toBeInTheDocument();

			// Click the reinsert button
			fireEvent.click(reinsertButton!);

			await waitFor(() => {
				// Should call handleReinsertTorrentinRd with no selectedFileIds
				expect(mockHandleReinsertTorrentinRd).toHaveBeenCalledWith(
					'test-rd-key',
					mockTorrent,
					true
				);
				// Should NOT pass selectedFileIds since the function handles it internally
				expect(mockHandleReinsertTorrentinRd).toHaveBeenCalledTimes(1);
				expect(mockHandleReinsertTorrentinRd.mock.calls[0].length).toBe(3);
			});

			// Should call onDelete after successful reinsert
			expect(defaultProps.onDelete).toHaveBeenCalledWith('rd:123');

			// Should refresh library
			expect(defaultProps.onRefreshLibrary).toHaveBeenCalled();
		});

		it('should handle AllDebrid torrents differently', async () => {
			const adTorrent = { ...mockTorrent, id: 'ad:456' };
			const adProps = {
				...defaultProps,
				torrent: adTorrent,
				rdKey: null,
				adKey: 'test-ad-key',
			};

			mockHandleRestartTorrent.mockResolvedValueOnce(undefined);

			const { container } = render(<LibraryTorrentRow {...adProps} />);

			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			fireEvent.click(reinsertButton!);

			await waitFor(() => {
				// Should call handleRestartTorrent for AD
				expect(mockHandleRestartTorrent).toHaveBeenCalledWith('test-ad-key', 'ad:456');
				// Should NOT call RD reinsert
				expect(mockHandleReinsertTorrentinRd).not.toHaveBeenCalled();
			});

			// Should still refresh library
			expect(adProps.onRefreshLibrary).toHaveBeenCalled();
		});

		it('should handle errors gracefully', async () => {
			const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
			const error = new Error('Reinsert failed');
			mockHandleReinsertTorrentinRd.mockRejectedValueOnce(error);

			const { container } = render(<LibraryTorrentRow {...defaultProps} />);

			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			fireEvent.click(reinsertButton!);

			await waitFor(() => {
				expect(consoleErrorSpy).toHaveBeenCalledWith(error);
			});

			// Should NOT call onDelete or refresh on error
			expect(defaultProps.onDelete).not.toHaveBeenCalled();
			expect(defaultProps.onRefreshLibrary).not.toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it('should stop event propagation to prevent row click', async () => {
			mockHandleReinsertTorrentinRd.mockResolvedValueOnce(undefined);

			const { container } = render(<LibraryTorrentRow {...defaultProps} />);

			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			const clickEvent = new MouseEvent('click', { bubbles: true });
			const stopPropagationSpy = jest.spyOn(clickEvent, 'stopPropagation');

			fireEvent(reinsertButton!, clickEvent);

			expect(stopPropagationSpy).toHaveBeenCalled();
		});
	});

	describe('Delete Button', () => {
		it('should call appropriate delete function for RD torrents', async () => {
			mockHandleDeleteRdTorrent.mockResolvedValueOnce(undefined);

			const { container } = render(<LibraryTorrentRow {...defaultProps} />);

			const deleteButton = container.querySelector('button[title="Delete"]');
			fireEvent.click(deleteButton!);

			await waitFor(() => {
				expect(mockHandleDeleteRdTorrent).toHaveBeenCalledWith('test-rd-key', 'rd:123');
				expect(defaultProps.onDelete).toHaveBeenCalledWith('rd:123');
			});
		});

		it('should call appropriate delete function for AD torrents', async () => {
			const adTorrent = { ...mockTorrent, id: 'ad:456' };
			const adProps = {
				...defaultProps,
				torrent: adTorrent,
				rdKey: null,
				adKey: 'test-ad-key',
			};

			mockHandleDeleteAdTorrent.mockResolvedValueOnce(undefined);

			const { container } = render(<LibraryTorrentRow {...adProps} />);

			const deleteButton = container.querySelector('button[title="Delete"]');
			fireEvent.click(deleteButton!);

			await waitFor(() => {
				expect(mockHandleDeleteAdTorrent).toHaveBeenCalledWith('test-ad-key', 'ad:456');
				expect(adProps.onDelete).toHaveBeenCalledWith('ad:456');
			});
		});
	});

	describe('Row Display', () => {
		it('should display torrent information correctly', () => {
			render(<LibraryTorrentRow {...defaultProps} />);

			// Check title is displayed
			expect(screen.getByText('Test Movie')).toBeInTheDocument();

			// Check file size (1GB)
			expect(screen.getByText('1.0 GB')).toBeInTheDocument();

			// Check status for finished torrent
			expect(screen.getByText('downloaded')).toBeInTheDocument();
		});

		it('should show progress for downloading torrents', () => {
			const downloadingTorrent = {
				...mockTorrent,
				status: UserTorrentStatus.downloading,
				progress: 45.67,
				seeders: 5,
				speed: 1000000,
			};

			render(<LibraryTorrentRow {...defaultProps} torrent={downloadingTorrent} />);

			// Check progress percentage
			expect(screen.getByText('45.67%')).toBeInTheDocument();

			// Check seeders
			expect(screen.getByText('5')).toBeInTheDocument();

			// Check speed (1MB/s)
			expect(screen.getByText('1.0MB/s')).toBeInTheDocument();
		});

		it('should apply selected styling when selected', () => {
			const { container } = render(<LibraryTorrentRow {...defaultProps} isSelected={true} />);

			const row = container.querySelector('tr');
			expect(row).toHaveClass('bg-green-800');
		});
	});

	describe('Conditional Rendering', () => {
		it('should not call reinsert if no rdKey for RD torrent', async () => {
			const propsNoRdKey = { ...defaultProps, rdKey: null };

			const { container } = render(<LibraryTorrentRow {...propsNoRdKey} />);

			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			fireEvent.click(reinsertButton!);

			await waitFor(() => {
				expect(mockHandleReinsertTorrentinRd).not.toHaveBeenCalled();
			});
		});

		it('should not call reinsert if no adKey for AD torrent', async () => {
			const adTorrent = { ...mockTorrent, id: 'ad:456' };
			const propsNoAdKey = {
				...defaultProps,
				torrent: adTorrent,
				rdKey: null,
				adKey: null,
			};

			const { container } = render(<LibraryTorrentRow {...propsNoAdKey} />);

			const reinsertButton = container.querySelector('button[title="Reinsert"]');
			fireEvent.click(reinsertButton!);

			await waitFor(() => {
				expect(mockHandleRestartTorrent).not.toHaveBeenCalled();
			});
		});
	});
});
