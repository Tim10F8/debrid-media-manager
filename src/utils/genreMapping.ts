const TMDB_TO_TRAKT_GENRE_MAP: Record<string, string> = {
	Action: 'action',
	Adventure: 'adventure',
	Animation: 'animation',
	Comedy: 'comedy',
	Crime: 'crime',
	Documentary: 'documentary',
	Drama: 'drama',
	Family: 'family',
	Fantasy: 'fantasy',
	History: 'history',
	Horror: 'horror',
	Music: 'music',
	Mystery: 'mystery',
	Romance: 'romance',
	'Science Fiction': 'science-fiction',
	Thriller: 'thriller',
	War: 'war',
	Western: 'western',
};

export function mapTmdbGenreToTrakt(tmdbGenreName: string): string | null {
	return TMDB_TO_TRAKT_GENRE_MAP[tmdbGenreName] || null;
}

export function formatGenreForUrl(genreName: string): string {
	const mappedGenre = mapTmdbGenreToTrakt(genreName);
	if (mappedGenre) {
		return mappedGenre;
	}
	return genreName.toLowerCase().replace(/\s+/g, '-');
}
