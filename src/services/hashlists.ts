import axios from 'axios';

interface CreateShortUrlResponse {
	shortUrl: string;
}

export async function createShortUrl(originalUrl: string): Promise<string> {
	try {
		const response = await axios.post<CreateShortUrlResponse>(`api/hashlists`, {
			url: originalUrl,
		});

		if (!response.data || !response.data.shortUrl) {
			throw new Error('Invalid response: missing shortUrl');
		}

		return response.data.shortUrl;
	} catch (error) {
		console.error('Error creating short URL:', error);
		throw error;
	}
}
