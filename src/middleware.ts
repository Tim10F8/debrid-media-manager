import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
	extractIdentifier,
	getRateLimitConfig,
	HybridRateLimiter,
	shouldRateLimit,
} from './services/rateLimit/middlewareRateLimiter';

// Singleton rate limiter instance
let rateLimiter: HybridRateLimiter | null = null;

function getRateLimiter(): HybridRateLimiter {
	if (!rateLimiter) {
		rateLimiter = new HybridRateLimiter(process.env.REDIS_URL);
	}
	return rateLimiter;
}

export async function middleware(request: NextRequest) {
	const pathname = request.nextUrl.pathname;

	// Only rate limit stremio API routes
	if (!shouldRateLimit(pathname)) {
		return NextResponse.next();
	}

	const cfConnectingIp = request.headers.get('cf-connecting-ip');
	const xForwardedFor = request.headers.get('x-forwarded-for');
	const identifier = extractIdentifier(pathname, cfConnectingIp, xForwardedFor);
	const config = getRateLimitConfig(pathname);

	const limiter = getRateLimiter();
	const now = Date.now();

	const { success, remaining, reset, limit } = await limiter.check(identifier, config);

	const response = success
		? NextResponse.next()
		: new NextResponse(JSON.stringify({ error: 'Rate limit exceeded' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' },
			});

	// Add rate limit headers
	response.headers.set('X-RateLimit-Limit', String(limit));
	response.headers.set('X-RateLimit-Remaining', String(remaining));
	response.headers.set('X-RateLimit-Reset', String(reset));

	if (!success) {
		response.headers.set('Retry-After', String(Math.ceil((reset - now) / 1000)));
	}

	return response;
}

export const config = {
	matcher: ['/api/stremio/:path*', '/api/torrents/:path*'],
};
