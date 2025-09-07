import { deleteMagnet as deleteAdTorrent } from '@/services/allDebrid';
import { deleteTorrent as deleteRdTorrent } from '@/services/realDebrid';
import { deleteTorrent as deleteTbTorrent } from '@/services/torbox';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	handleDeleteAdTorrent,
	handleDeleteRdTorrent,
	handleDeleteTbTorrent,
} from './deleteTorrent';

// Mock all dependencies
vi.mock('@/services/allDebrid');
vi.mock('@/services/realDebrid');
vi.mock('@/services/torbox');
vi.mock('react-hot-toast', () => {
	const fn: any = vi.fn((message: string) => {});
	fn.error = vi.fn();
	return { default: fn };
});

describe('deleteTorrent utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('handleDeleteRdTorrent', () => {
		const rdKey = 'test-rd-key';
		const torrentId = 'rd:123456';

		it('should successfully delete RD torrent and show toast', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);

			await handleDeleteRdTorrent(rdKey, torrentId);

			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '123456');
			expect(toast).toHaveBeenCalledWith('Torrent deleted (rd:123456)', expect.any(Object));
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should successfully delete RD torrent without toast when disabled', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);

			await handleDeleteRdTorrent(rdKey, torrentId, true);

			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '123456');
			expect(toast).not.toHaveBeenCalled();
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should handle errors and show error toast', async () => {
			const error = new Error('Network error');
			vi.mocked(deleteRdTorrent).mockRejectedValue(error);

			await handleDeleteRdTorrent(rdKey, torrentId);

			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '123456');
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in RD (rd:123456)');
		});

		it('should handle errors with disableToast true', async () => {
			const error = new Error('Network error');
			vi.mocked(deleteRdTorrent).mockRejectedValue(error);

			await handleDeleteRdTorrent(rdKey, torrentId, true);

			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '123456');
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in RD (rd:123456)');
			expect(toast).not.toHaveBeenCalled();
		});

		it('should extract ID correctly from different formats', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);

			// Test with different ID formats
			await handleDeleteRdTorrent(rdKey, 'rd:abc123', true);
			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, 'abc123');

			await handleDeleteRdTorrent(rdKey, 'rd:789xyz', true);
			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '789xyz');

			await handleDeleteRdTorrent(rdKey, 'rd:1', true);
			expect(deleteRdTorrent).toHaveBeenCalledWith(rdKey, '1');
		});

		it('should handle undefined error objects', async () => {
			vi.mocked(deleteRdTorrent).mockRejectedValue(undefined);

			await handleDeleteRdTorrent(rdKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in RD (rd:123456)');
		});

		it('should handle non-Error objects', async () => {
			vi.mocked(deleteRdTorrent).mockRejectedValue('String error');

			await handleDeleteRdTorrent(rdKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in RD (rd:123456)');
		});
	});

	describe('handleDeleteAdTorrent', () => {
		const adKey = 'test-ad-key';
		const torrentId = 'ad:987654';

		it('should successfully delete AD torrent and show toast', async () => {
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);

			await handleDeleteAdTorrent(adKey, torrentId);

			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '987654');
			expect(toast).toHaveBeenCalledWith('Torrent deleted (ad:987654)', expect.any(Object));
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should successfully delete AD torrent without toast when disabled', async () => {
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);

			await handleDeleteAdTorrent(adKey, torrentId, true);

			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '987654');
			expect(toast).not.toHaveBeenCalled();
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should handle errors and show error toast', async () => {
			const error = new Error('API error');
			vi.mocked(deleteAdTorrent).mockRejectedValue(error);

			await handleDeleteAdTorrent(adKey, torrentId);

			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '987654');
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in AD (ad:987654)');
		});

		it('should handle errors with disableToast true', async () => {
			const error = new Error('API error');
			vi.mocked(deleteAdTorrent).mockRejectedValue(error);

			await handleDeleteAdTorrent(adKey, torrentId, true);

			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '987654');
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in AD (ad:987654)');
			expect(toast).not.toHaveBeenCalled();
		});

		it('should extract ID correctly from different formats', async () => {
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);

			// Test with different ID formats
			await handleDeleteAdTorrent(adKey, 'ad:test123', true);
			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, 'test123');

			await handleDeleteAdTorrent(adKey, 'ad:456def', true);
			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '456def');

			await handleDeleteAdTorrent(adKey, 'ad:999', true);
			expect(deleteAdTorrent).toHaveBeenCalledWith(adKey, '999');
		});

		it('should handle undefined error objects', async () => {
			vi.mocked(deleteAdTorrent).mockRejectedValue(undefined);

			await handleDeleteAdTorrent(adKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in AD (ad:987654)');
		});

		it('should handle non-Error objects', async () => {
			vi.mocked(deleteAdTorrent).mockRejectedValue({ code: 'ERROR_CODE' });

			await handleDeleteAdTorrent(adKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in AD (ad:987654)');
		});
	});

	describe('handleDeleteTbTorrent', () => {
		const tbKey = 'test-tb-key';
		const torrentId = 'tb:456789';

		it('should successfully delete TB torrent and show toast', async () => {
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			await handleDeleteTbTorrent(tbKey, torrentId);

			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 456789);
			expect(toast).toHaveBeenCalledWith('Torrent deleted (tb:456789)', expect.any(Object));
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should successfully delete TB torrent without toast when disabled', async () => {
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			await handleDeleteTbTorrent(tbKey, torrentId, true);

			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 456789);
			expect(toast).not.toHaveBeenCalled();
			expect(toast.error).not.toHaveBeenCalled();
		});

		it('should handle errors and show error toast', async () => {
			const error = new Error('Connection failed');
			vi.mocked(deleteTbTorrent).mockRejectedValue(error);

			await handleDeleteTbTorrent(tbKey, torrentId);

			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 456789);
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in TB (tb:456789)');
		});

		it('should handle errors with disableToast true', async () => {
			const error = new Error('Connection failed');
			vi.mocked(deleteTbTorrent).mockRejectedValue(error);

			await handleDeleteTbTorrent(tbKey, torrentId, true);

			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 456789);
			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in TB (tb:456789)');
			expect(toast).not.toHaveBeenCalled();
		});

		it('should correctly parse integer IDs', async () => {
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			// Test with different numeric ID formats
			await handleDeleteTbTorrent(tbKey, 'tb:123', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 123);

			await handleDeleteTbTorrent(tbKey, 'tb:999999', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 999999);

			await handleDeleteTbTorrent(tbKey, 'tb:1', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 1);

			await handleDeleteTbTorrent(tbKey, 'tb:0', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, 0);
		});

		it('should handle invalid numeric IDs', async () => {
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			// NaN will be passed as NaN to the service
			await handleDeleteTbTorrent(tbKey, 'tb:abc', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, NaN);

			await handleDeleteTbTorrent(tbKey, 'tb:', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith(tbKey, NaN);
		});

		it('should handle undefined error objects', async () => {
			vi.mocked(deleteTbTorrent).mockRejectedValue(undefined);

			await handleDeleteTbTorrent(tbKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in TB (tb:456789)');
		});

		it('should handle non-Error objects', async () => {
			vi.mocked(deleteTbTorrent).mockRejectedValue(12345);

			await handleDeleteTbTorrent(tbKey, torrentId);

			expect(toast.error).toHaveBeenCalledWith('Error deleting torrent in TB (tb:456789)');
		});
	});

	describe('Edge cases and error handling', () => {
		it('should handle empty keys', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			await handleDeleteRdTorrent('', 'rd:123', true);
			expect(deleteRdTorrent).toHaveBeenCalledWith('', '123');

			await handleDeleteAdTorrent('', 'ad:456', true);
			expect(deleteAdTorrent).toHaveBeenCalledWith('', '456');

			await handleDeleteTbTorrent('', 'tb:789', true);
			expect(deleteTbTorrent).toHaveBeenCalledWith('', 789);
		});

		it('should handle very long IDs', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);
			vi.mocked(deleteTbTorrent).mockResolvedValue({} as any);

			const longId = 'a'.repeat(1000);

			await handleDeleteRdTorrent('key', `rd:${longId}`, true);
			expect(deleteRdTorrent).toHaveBeenCalledWith('key', longId);

			await handleDeleteAdTorrent('key', `ad:${longId}`, true);
			expect(deleteAdTorrent).toHaveBeenCalledWith('key', longId);

			const longNumericId = '9'.repeat(20);
			await handleDeleteTbTorrent('key', `tb:${longNumericId}`, true);
			expect(deleteTbTorrent).toHaveBeenCalledWith('key', parseInt(longNumericId));
		});

		it('should handle special characters in IDs', async () => {
			vi.mocked(deleteRdTorrent).mockResolvedValue({} as any);
			vi.mocked(deleteAdTorrent).mockResolvedValue({} as any);

			const specialId = 'test-id_123.abc';

			await handleDeleteRdTorrent('key', `rd:${specialId}`, true);
			expect(deleteRdTorrent).toHaveBeenCalledWith('key', specialId);

			await handleDeleteAdTorrent('key', `ad:${specialId}`, true);
			expect(deleteAdTorrent).toHaveBeenCalledWith('key', specialId);
		});

		it('should log errors to console', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const error = new Error('Test error');

			vi.mocked(deleteRdTorrent).mockRejectedValue(error);
			await handleDeleteRdTorrent('key', 'rd:123');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting RD torrent:', 'Test error');

			vi.mocked(deleteAdTorrent).mockRejectedValue(error);
			await handleDeleteAdTorrent('key', 'ad:456');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting AD torrent:', 'Test error');

			vi.mocked(deleteTbTorrent).mockRejectedValue(error);
			await handleDeleteTbTorrent('key', 'tb:789');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting TB torrent:', 'Test error');

			consoleSpy.mockRestore();
		});

		it('should handle non-Error objects in console logging', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			vi.mocked(deleteRdTorrent).mockRejectedValue('string error');
			await handleDeleteRdTorrent('key', 'rd:123');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting RD torrent:', 'Unknown error');

			vi.mocked(deleteAdTorrent).mockRejectedValue(null);
			await handleDeleteAdTorrent('key', 'ad:456');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting AD torrent:', 'Unknown error');

			vi.mocked(deleteTbTorrent).mockRejectedValue({ message: 'not an Error instance' });
			await handleDeleteTbTorrent('key', 'tb:789');
			expect(consoleSpy).toHaveBeenCalledWith('Error deleting TB torrent:', 'Unknown error');

			consoleSpy.mockRestore();
		});
	});
});
