import bencode from 'bencode';
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { getHashOfTorrent } from './torrentFile';

const toArrayBuffer = (buffer: Buffer) =>
	buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

describe('getHashOfTorrent', () => {
	it('extracts the info hash from a torrent file', async () => {
		const info = { name: 'Sample', pieceLength: 16384 };
		const torrentData = bencode.encode({ info });
		const fakeBlob = {
			arrayBuffer: vi.fn().mockResolvedValue(toArrayBuffer(Buffer.from(torrentData))),
		} as unknown as Blob;

		const expected = createHash('sha1').update(bencode.encode(info)).digest('hex');
		await expect(getHashOfTorrent(fakeBlob)).resolves.toBe(expected);
	});

	it('returns undefined when the file is invalid', async () => {
		const fakeBlob = {
			arrayBuffer: vi.fn().mockResolvedValue(toArrayBuffer(Buffer.from([0, 1, 2]))),
		} as unknown as Blob;

		await expect(getHashOfTorrent(fakeBlob)).resolves.toBeUndefined();
	});
});
