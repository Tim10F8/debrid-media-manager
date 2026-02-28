import { getMdblistClient } from '@/services/mdblistClient';
import { getTmdbKey } from '@/utils/freekeys';
import { TmdbResponse } from '@/utils/tmdb';
import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

interface FanartPoster {
	id: string;
	url: string;
	lang: string;
	likes: string;
}

interface FanartMovieResponse {
	movieposter?: FanartPoster[];
}

async function getFanartPoster(imdbId: string): Promise<string | null> {
	const apiKey = process.env.FANART_KEY;
	if (!apiKey) return null;

	try {
		const resp = await axios.get<FanartMovieResponse>(
			`https://webservice.fanart.tv/v3/movies/${imdbId}?api_key=${apiKey}`
		);
		const posters = resp.data.movieposter;
		if (!posters?.length) return null;

		// Prefer English posters, sorted by most likes
		const sorted = [...posters].sort((a, b) => {
			if (a.lang === 'en' && b.lang !== 'en') return -1;
			if (a.lang !== 'en' && b.lang === 'en') return 1;
			return Number(b.likes) - Number(a.likes);
		});

		return sorted[0].url;
	} catch {
		return null;
	}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const { imdbid } = req.query;

	if (!imdbid || typeof imdbid !== 'string') {
		return res.status(400).json({ error: 'IMDB ID is required' });
	}

	const mdblistClient = getMdblistClient();
	const getTmdbInfo = (imdbId: string) =>
		`https://api.themoviedb.org/3/find/${imdbId}?api_key=${getTmdbKey()}&external_source=imdb_id`;

	try {
		// 1. Try Fanart.tv first (movies only, supports IMDB IDs directly)
		const fanartUrl = await getFanartPoster(imdbid);
		if (fanartUrl) {
			return res.json({ url: fanartUrl });
		}

		// 2. Try TMDB (movies and TV)
		const tmdbResp = await axios.get<TmdbResponse>(getTmdbInfo(imdbid));
		const movieResult = tmdbResp.data.movie_results[0];
		const tvResult = tmdbResp.data.tv_results[0];
		const posterPath = movieResult?.poster_path || tvResult?.poster_path;

		if (posterPath) {
			return res.json({ url: `https://image.tmdb.org/t/p/w500${posterPath}` });
		}

		// 3. Try MDBList as final fallback
		const mdbResp = await mdblistClient.getInfoByImdbId(imdbid);
		if (mdbResp.poster && mdbResp.poster.startsWith('http')) {
			return res.json({ url: mdbResp.poster });
		}

		return res.status(404).json({ error: 'Poster not found' });
	} catch (error) {
		return res.status(404).json({ error: 'Poster not found' });
	}
}
