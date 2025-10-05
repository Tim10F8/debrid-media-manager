import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => {
	const get = vi.fn();
	return {
		__esModule: true,
		default: { get },
		get,
	};
});

import axios from 'axios';
import * as utils from './utils';

const axiosGetMock = vi.mocked(axios.get);

const sampleMediaInfo = {
	SelectedFiles: {
		'0': {
			MediaInfo: {
				streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 }],
				format: { duration: '3600' },
			},
		},
	},
} as const;

describe('fetchMediaInfo', () => {
	const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

	beforeEach(() => {
		axiosGetMock.mockReset();
		infoSpy.mockClear();
		errorSpy.mockClear();
	});

	it('returns snapshot media info when available', async () => {
		axiosGetMock.mockResolvedValueOnce({ data: sampleMediaInfo });

		const result = await utils.fetchMediaInfo('abcdef1234567890abcdef1234567890abcdef12');

		expect(result).toEqual(sampleMediaInfo);
		expect(axiosGetMock).toHaveBeenCalledTimes(1);
		expect(axiosGetMock).toHaveBeenCalledWith('/api/torrents/mediainfo', {
			params: { hash: 'abcdef1234567890abcdef1234567890abcdef12' },
		});
	});

	it('falls back to remote endpoint when snapshot lacks media info', async () => {
		axiosGetMock
			.mockResolvedValueOnce({ data: { SelectedFiles: {} } })
			.mockResolvedValueOnce({ data: sampleMediaInfo });
		const hash = 'abcdef1234567890abcdef1234567890abcdef12';

		const result = await utils.fetchMediaInfo(hash);
		const derivedPassword = await utils.generatePasswordHash(hash);

		expect(result).toEqual(sampleMediaInfo);
		expect(axiosGetMock).toHaveBeenNthCalledWith(1, '/api/torrents/mediainfo', {
			params: { hash },
		});
		expect(axiosGetMock).toHaveBeenNthCalledWith(
			2,
			'https://debridmediamanager.com/mediainfo',
			{
				params: { hash, password: derivedPassword },
			}
		);
	});

	it('returns null when both sources fail', async () => {
		axiosGetMock.mockRejectedValue(new Error('network error'));
		const hash = 'abcdef1234567890abcdef1234567890abcdef12';

		const result = await utils.fetchMediaInfo(hash);

		expect(result).toBeNull();
		expect(axiosGetMock).toHaveBeenCalledTimes(2);
	});

	afterAll(() => {
		infoSpy.mockRestore();
		errorSpy.mockRestore();
	});
});
