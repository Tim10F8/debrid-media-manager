import { SocksProxyAgent } from 'socks-proxy-agent';
import { describe, expect, it } from 'vitest';
import { createAxiosInstance } from './proxy';

describe('proxy service', () => {
	describe('createAxiosInstance', () => {
		it('creates axios instance with provided agent', () => {
			const mockAgent = new SocksProxyAgent('socks5://127.0.0.1:1080');
			const instance = createAxiosInstance(mockAgent);

			expect(instance).toBeDefined();
			expect(instance.defaults.httpAgent).toBe(mockAgent);
			expect(instance.defaults.httpsAgent).toBe(mockAgent);
		});

		it('sets user-agent header', () => {
			const mockAgent = new SocksProxyAgent('socks5://127.0.0.1:1080');
			const instance = createAxiosInstance(mockAgent);

			expect(instance.defaults.headers['user-agent']).toBeDefined();
			expect(typeof instance.defaults.headers['user-agent']).toBe('string');
		});

		it('uses default timeout from environment or fallback to 3000', () => {
			const originalTimeout = process.env.REQUEST_TIMEOUT;
			delete process.env.REQUEST_TIMEOUT;

			const mockAgent = new SocksProxyAgent('socks5://127.0.0.1:1080');
			const instance = createAxiosInstance(mockAgent);

			expect(instance.defaults.timeout).toBe(3000);

			if (originalTimeout) {
				process.env.REQUEST_TIMEOUT = originalTimeout;
			}
		});

		it('uses custom timeout from environment variable', () => {
			const originalTimeout = process.env.REQUEST_TIMEOUT;
			process.env.REQUEST_TIMEOUT = '5000';

			const mockAgent = new SocksProxyAgent('socks5://127.0.0.1:1080');
			const instance = createAxiosInstance(mockAgent);

			expect(instance.defaults.timeout).toBe(5000);

			if (originalTimeout) {
				process.env.REQUEST_TIMEOUT = originalTimeout;
			} else {
				delete process.env.REQUEST_TIMEOUT;
			}
		});
	});
});
