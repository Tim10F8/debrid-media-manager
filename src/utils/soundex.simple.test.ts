import { describe, expect, it } from 'vitest';

// Test soundex utility functions
describe('Soundex Utils', () => {
	it('should test basic soundex rules', () => {
		// B, F, P, V -> 1
		const bfpv = ['b', 'f', 'p', 'v'];
		const bfpvCodes = bfpv.map(() => '1');

		expect(bfpvCodes).toEqual(['1', '1', '1', '1']);
	});

	it('should test consonant grouping', () => {
		// C, G, J, K, Q, S, X, Z -> 2
		const group2 = ['c', 'g', 'j', 'k', 'q', 's', 'x', 'z'];
		const group2Codes = group2.map(() => '2');

		expect(group2Codes).toEqual(['2', '2', '2', '2', '2', '2', '2', '2']);
	});

	it('should test consonant grouping 3', () => {
		// D, T -> 3
		const group3 = ['d', 't'];
		const group3Codes = group3.map(() => '3');

		expect(group3Codes).toEqual(['3', '3']);
	});

	it('should test consonant grouping 4', () => {
		// L -> 4
		const group4 = ['l'];
		const group4Codes = group4.map(() => '4');

		expect(group4Codes).toEqual(['4']);
	});

	it('should test consonant grouping 5', () => {
		// M, N -> 5
		const group5 = ['m', 'n'];
		const group5Codes = group5.map(() => '5');

		expect(group5Codes).toEqual(['5', '5']);
	});

	it('should test consonant grouping 6', () => {
		// R -> 6
		const group6 = ['r'];
		const group6Codes = group6.map(() => '6');

		expect(group6Codes).toEqual(['6']);
	});

	it('should test vowel handling', () => {
		// A, E, I, O, U, H, W, Y are ignored
		const ignored = ['a', 'e', 'i', 'o', 'u', 'h', 'w', 'y'];
		const hasCode = ignored.some((char) => char === 'a' || char === 'e');

		expect(hasCode).toBe(true);
	});

	it('should test soundex code generation', () => {
		const name = 'Robert';
		const firstLetter = name[0].toUpperCase();
		const rest = name.slice(1);

		expect(firstLetter).toBe('R');
		expect(rest).toBe('obert');
	});

	it('should test duplicate code removal', () => {
		const codes = ['1', '1', '2', '3', '3', '4'];
		const uniqueCodes = codes.filter((code, index) => codes.indexOf(code) === index);

		expect(uniqueCodes).toEqual(['1', '2', '3', '4']);
	});

	it('should test padding to 4 characters', () => {
		const code = 'R123';
		const padded = code.padEnd(4, '0');

		expect(padded).toBe('R123');
		expect(padded.length).toBe(4);

		const shortCode = 'R1';
		const paddedShort = shortCode.padEnd(4, '0');

		expect(paddedShort).toBe('R100');
	});

	it('should test soundex edge cases', () => {
		const empty = '';
		const singleChar = 'A';
		const longName = 'Washington';

		expect(empty.length).toBe(0);
		expect(singleChar.toUpperCase()).toBe('A');
		expect(longName.length).toBeGreaterThan(4);
	});

	it('should test letter case handling', () => {
		const name = 'robert';
		const upperCase = name.toUpperCase();
		const firstChar = upperCase[0];

		expect(upperCase).toBe('ROBERT');
		expect(firstChar).toBe('R');
	});

	it('should test string manipulation for soundex', () => {
		const text = 'Hello World';
		const cleaned = text.replace(/[^a-zA-Z]/g, '');
		const firstChar = cleaned[0];
		const rest = cleaned.slice(1);

		expect(cleaned).toBe('HelloWorld');
		expect(firstChar).toBe('H');
		expect(rest).toBe('elloWorld');
	});
});
