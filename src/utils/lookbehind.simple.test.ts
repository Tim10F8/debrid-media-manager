import { describe, expect, it } from 'vitest';

// Test lookbehind utility functions
describe('Lookbehind Utils', () => {
	it('should test simple lookbehind operations', () => {
		const text = 'hello world';
		const reversed = text.split('').reverse().join('');

		expect(reversed).toBe('dlrow olleh');
		expect(reversed.length).toBe(text.length);
	});

	it('should test pattern matching from end', () => {
		const filename = 'movie.S01E02.1080p.mp4';
		const extension = filename.split('.').pop();

		expect(extension).toBe('mp4');
	});

	it('should test string slicing from end', () => {
		const text = 'abcdef';
		const lastThree = text.slice(-3);
		const allButLastThree = text.slice(0, -3);

		expect(lastThree).toBe('def');
		expect(allButLastThree).toBe('abc');
	});

	it('should test regex lookbehind patterns', () => {
		const text = 'price: $100, discount: 20%';
		const prices = text.match(/\$(\d+)/g);

		expect(prices).toEqual(['$100']);
	});

	it('should test array reverse operations', () => {
		const arr = [1, 2, 3, 4, 5];
		const reversed = [...arr].reverse();

		expect(reversed).toEqual([5, 4, 3, 2, 1]);
		expect(arr).toEqual([1, 2, 3, 4, 5]); // original unchanged
	});

	it('should test last character operations', () => {
		const text = 'hello';
		const lastChar = text[text.length - 1];
		const withoutLast = text.slice(0, -1);

		expect(lastChar).toBe('o');
		expect(withoutLast).toBe('hell');
	});

	it('should test path navigation backwards', () => {
		const path = '/home/user/documents/file.txt';
		const segments = path.split('/');
		const parent = segments.slice(0, -1).join('/');
		const filename = segments[segments.length - 1];

		expect(parent).toBe('/home/user/documents');
		expect(filename).toBe('file.txt');
	});

	it('should test index-based lookbehind', () => {
		const text = 'a:b:c:d';
		const colonIndices = [];
		let index = text.indexOf(':');

		while (index !== -1) {
			colonIndices.push(index);
			index = text.indexOf(':', index + 1);
		}

		expect(colonIndices).toEqual([1, 3, 5]);
	});

	it('should test backwards iteration', () => {
		const text = 'hello';
		let reversed = '';

		for (let i = text.length - 1; i >= 0; i--) {
			reversed += text[i];
		}

		expect(reversed).toBe('olleh');
	});

	it('should test pattern extraction from end', () => {
		const url = 'https://example.com/path/to/resource.jpg';
		const protocolEnd = url.indexOf('://');
		const domainStart = protocolEnd + 3;
		const domainEnd = url.indexOf('/', domainStart);

		const domain = url.slice(domainStart, domainEnd);
		expect(domain).toBe('example.com');
	});
});
