import { Prisma } from '@prisma/client';
import {
	AnimeService,
	AvailabilityService,
	CastService,
	HashSearchService,
	HistoryAggregationService,
	RdObservabilityService,
	ReportService,
	ScrapedService,
	SearchService,
	StreamHealthService,
	TorrentSnapshotService,
	ZurgKeysService,
} from './database';
import { HashSearchParams } from './database/hashSearch';
import { RealDebridOperation } from './database/rdObservability';
import { StreamServerStatus } from './database/streamHealth';
import { ScrapeSearchResult } from './mediasearch';
import { TorrentInfoResponse } from './types';

export type RepositoryDependencies = Partial<{
	availabilityService: AvailabilityService;
	scrapedService: ScrapedService;
	searchService: SearchService;
	animeService: AnimeService;
	castService: CastService;
	reportService: ReportService;
	torrentSnapshotService: TorrentSnapshotService;
	hashSearchService: HashSearchService;
	zurgKeysService: ZurgKeysService;
	rdObservabilityService: RdObservabilityService;
	streamHealthService: StreamHealthService;
	historyAggregationService: HistoryAggregationService;
}>;

export class Repository {
	private availabilityService: AvailabilityService;
	private scrapedService: ScrapedService;
	private searchService: SearchService;
	private animeService: AnimeService;
	private castService: CastService;
	private reportService: ReportService;
	private torrentSnapshotService: TorrentSnapshotService;
	private hashSearchService: HashSearchService;
	private zurgKeysService: ZurgKeysService;
	private rdObservabilityService: RdObservabilityService;
	private streamHealthService: StreamHealthService;
	private historyAggregationService: HistoryAggregationService;

	constructor({
		availabilityService,
		scrapedService,
		searchService,
		animeService,
		castService,
		reportService,
		torrentSnapshotService,
		hashSearchService,
		zurgKeysService,
		rdObservabilityService,
		streamHealthService,
		historyAggregationService,
	}: RepositoryDependencies = {}) {
		this.availabilityService = availabilityService ?? new AvailabilityService();
		this.scrapedService = scrapedService ?? new ScrapedService();
		this.searchService = searchService ?? new SearchService();
		this.animeService = animeService ?? new AnimeService();
		this.castService = castService ?? new CastService();
		this.reportService = reportService ?? new ReportService();
		this.torrentSnapshotService = torrentSnapshotService ?? new TorrentSnapshotService();
		this.hashSearchService = hashSearchService ?? new HashSearchService();
		this.zurgKeysService = zurgKeysService ?? new ZurgKeysService();
		this.rdObservabilityService = rdObservabilityService ?? new RdObservabilityService();
		this.streamHealthService = streamHealthService ?? new StreamHealthService();
		this.historyAggregationService =
			historyAggregationService ?? new HistoryAggregationService();
	}

	// Ensure connection is properly closed when repository is no longer needed
	public async disconnect(): Promise<void> {
		await Promise.all([
			this.availabilityService.disconnect(),
			this.scrapedService.disconnect(),
			this.searchService.disconnect(),
			this.animeService.disconnect(),
			this.castService.disconnect(),
			this.reportService.disconnect(),
			this.torrentSnapshotService.disconnect(),
			this.hashSearchService.disconnect(),
			this.zurgKeysService.disconnect(),
			this.rdObservabilityService.disconnect(),
			this.streamHealthService.disconnect(),
			this.historyAggregationService.disconnect(),
		]);
	}

	// Availability Service Methods
	public getIMDBIdByHash(hash: string) {
		return this.availabilityService.getIMDBIdByHash(hash);
	}

	public saveIMDBIdMapping(hash: string, imdbId: string) {
		return this.availabilityService.saveIMDBIdMapping(hash, imdbId);
	}

	public handleDownloadedTorrent(torrentInfo: TorrentInfoResponse, hash: string, imdbId: string) {
		return this.availabilityService.handleDownloadedTorrent(torrentInfo, hash, imdbId);
	}

	public upsertAvailability(data: {
		hash: string;
		imdbId: string;
		filename: string;
		originalFilename: string;
		bytes: number;
		originalBytes: number;
		host: string;
		progress: number;
		status: string;
		ended: string;
		selectedFiles: Array<{ id: number; path: string; bytes: number; selected: number }>;
		links: string[];
	}) {
		return this.availabilityService.upsertAvailability(data);
	}

	public checkAvailability(imdbId: string, hashes: string[]) {
		return this.availabilityService.checkAvailability(imdbId, hashes);
	}

	public checkAvailabilityByHashes(hashes: string[]) {
		return this.availabilityService.checkAvailabilityByHashes(hashes);
	}

	public removeAvailability(hash: string) {
		return this.availabilityService.removeAvailability(hash);
	}

	public getHashByLink(link: string) {
		return this.availabilityService.getHashByLink(link);
	}

	// AllDebrid Availability Service Methods
	public upsertAvailabilityAd(data: {
		hash: string;
		imdbId: string;
		filename: string;
		size: number;
		status: string;
		statusCode: number;
		completionDate: number;
		files: Array<{ n: string; s: number; l: string }>;
	}) {
		return this.availabilityService.upsertAvailabilityAd(data);
	}

	public checkAvailabilityAd(imdbId: string, hashes: string[]) {
		return this.availabilityService.checkAvailabilityAd(imdbId, hashes);
	}

	public removeAvailabilityAd(hash: string) {
		return this.availabilityService.removeAvailabilityAd(hash);
	}

	public getIMDBIdByHashAd(hash: string) {
		return this.availabilityService.getIMDBIdByHashAd(hash);
	}

	// Scraped Service Methods
	public getScrapedTrueResults<T>(key: string, maxSizeGB?: number, page?: number) {
		return this.scrapedService.getScrapedTrueResults<T>(key, maxSizeGB, page);
	}

	public getScrapedResults<T>(key: string, maxSizeGB?: number, page?: number) {
		return this.scrapedService.getScrapedResults<T>(key, maxSizeGB, page);
	}

	public saveScrapedTrueResults(
		key: string,
		value: ScrapeSearchResult[],
		updateUpdatedAt?: boolean,
		replaceOldScrape?: boolean
	) {
		return this.scrapedService.saveScrapedTrueResults(
			key,
			value,
			updateUpdatedAt,
			replaceOldScrape
		);
	}

	public saveScrapedResults(
		key: string,
		value: ScrapeSearchResult[],
		updateUpdatedAt?: boolean,
		replaceOldScrape?: boolean
	) {
		return this.scrapedService.saveScrapedResults(
			key,
			value,
			updateUpdatedAt,
			replaceOldScrape
		);
	}

	public keyExists(key: string) {
		return this.scrapedService.keyExists(key);
	}

	public isOlderThan(imdbId: string, daysAgo: number) {
		return this.scrapedService.isOlderThan(imdbId, daysAgo);
	}

	public getOldestRequest(olderThan?: Date | null) {
		return this.scrapedService.getOldestRequest(olderThan);
	}

	public processingMoreThanAnHour() {
		return this.scrapedService.processingMoreThanAnHour();
	}

	public getOldestScrapedMedia(mediaType: 'tv' | 'movie', quantity?: number) {
		return this.scrapedService.getOldestScrapedMedia(mediaType, quantity);
	}

	public getAllImdbIds(mediaType: 'tv' | 'movie') {
		return this.scrapedService.getAllImdbIds(mediaType);
	}

	public markAsDone(imdbId: string) {
		return this.scrapedService.markAsDone(imdbId);
	}

	public getRecentlyUpdatedContent() {
		return this.scrapedService.getRecentlyUpdatedContent();
	}

	// Search Service Methods
	public saveSearchResults<T>(key: string, value: T) {
		return this.searchService.saveSearchResults(key, value);
	}

	public getSearchResults<T>(key: string) {
		return this.searchService.getSearchResults<T>(key);
	}

	// Anime Service Methods
	public getRecentlyUpdatedAnime(limit: number) {
		return this.animeService.getRecentlyUpdatedAnime(limit);
	}

	public searchAnimeByTitle(query: string) {
		return this.animeService.searchAnimeByTitle(query);
	}

	public getAnimeByMalIds(malIds: number[]) {
		return this.animeService.getAnimeByMalIds(malIds);
	}

	public getAnimeByKitsuIds(kitsuIds: number[]) {
		return this.animeService.getAnimeByKitsuIds(kitsuIds);
	}

	// Cast Service Methods
	public saveCastProfile(
		userId: string,
		clientId: string,
		clientSecret: string,
		refreshToken?: string | null,
		movieMaxSize?: number,
		episodeMaxSize?: number,
		otherStreamsLimit?: number
	) {
		return this.castService.saveCastProfile(
			userId,
			clientId,
			clientSecret,
			refreshToken,
			movieMaxSize,
			episodeMaxSize,
			otherStreamsLimit
		);
	}

	public getLatestCast(imdbId: string, userId: string) {
		return this.castService.getLatestCast(imdbId, userId);
	}

	public getCastURLs(imdbId: string, userId: string) {
		return this.castService.getCastURLs(imdbId, userId);
	}

	public getOtherCastURLs(imdbId: string, userId: string) {
		return this.castService.getOtherCastURLs(imdbId, userId);
	}

	public getCastProfile(userId: string) {
		return this.castService.getCastProfile(userId);
	}

	public saveCast(
		imdbId: string,
		userId: string,
		hash: string,
		url: string,
		rdLink: string,
		fileSize: number
	) {
		return this.castService.saveCast(imdbId, userId, hash, url, rdLink, fileSize);
	}

	public fetchCastedMovies(userId: string) {
		return this.castService.fetchCastedMovies(userId);
	}

	public fetchCastedShows(userId: string) {
		return this.castService.fetchCastedShows(userId);
	}

	public fetchAllCastedLinks(userId: string) {
		return this.castService.fetchAllCastedLinks(userId);
	}

	public deleteCastedLink(imdbId: string, userId: string, hash: string) {
		return this.castService.deleteCastedLink(imdbId, userId, hash);
	}

	public getAllUserCasts(userId: string) {
		return this.castService.getAllUserCasts(userId);
	}

	public getUserCastStreams(imdbId: string, userId: string, limit?: number) {
		return this.castService.getUserCastStreams(imdbId, userId, limit);
	}

	public getOtherStreams(imdbId: string, userId: string, limit?: number, maxSize?: number) {
		return this.castService.getOtherStreams(imdbId, userId, limit, maxSize);
	}

	// Torrent Snapshot Methods
	public upsertTorrentSnapshot({
		id,
		hash,
		addedDate,
		payload,
	}: {
		id: string;
		hash: string;
		addedDate: Date;
		payload: Prisma.InputJsonValue;
	}) {
		return this.torrentSnapshotService.upsertSnapshot({
			id,
			hash,
			addedDate,
			payload,
		});
	}

	public getLatestTorrentSnapshot(hash: string) {
		return this.torrentSnapshotService.getLatestSnapshot(hash);
	}

	public getSnapshotsByHashes(hashes: string[]) {
		return this.torrentSnapshotService.getSnapshotsByHashes(hashes);
	}

	// Report Service Methods
	public reportContent(
		hash: string,
		imdbId: string,
		userId: string,
		type: 'porn' | 'wrong_imdb' | 'wrong_season'
	) {
		return this.reportService.reportContent(hash, imdbId, userId, type);
	}

	public getEmptyMedia(quantity?: number) {
		return this.reportService.getEmptyMedia(quantity);
	}

	public getReportedHashes(imdbId: string) {
		return this.reportService.getReportedHashes(imdbId);
	}

	// Database Size Methods
	public getContentSize() {
		return this.scrapedService.getContentSize();
	}

	public getProcessingCount() {
		return this.scrapedService.getProcessingCount();
	}

	public getRequestedCount() {
		return this.scrapedService.getRequestedCount();
	}

	// Hash Search Service Methods
	public getHashesByImdbId(params: HashSearchParams) {
		return this.hashSearchService.getHashesByImdbId(params);
	}

	// Zurg Keys Service Methods
	public createZurgApiKey(validUntilDate: Date) {
		return this.zurgKeysService.createApiKey(validUntilDate);
	}

	public validateZurgApiKey(apiKey: string) {
		return this.zurgKeysService.validateApiKey(apiKey);
	}

	public getZurgApiKey(apiKey: string) {
		return this.zurgKeysService.getApiKey(apiKey);
	}

	public deleteZurgApiKey(apiKey: string) {
		return this.zurgKeysService.deleteApiKey(apiKey);
	}

	public deleteExpiredZurgKeys() {
		return this.zurgKeysService.deleteExpiredKeys();
	}

	public listZurgApiKeys() {
		return this.zurgKeysService.listApiKeys();
	}

	// RD Observability Service Methods
	public recordRdEvent(operation: RealDebridOperation, status: number) {
		return this.rdObservabilityService.recordEvent(operation, status);
	}

	public getRdObservabilityStats() {
		return this.rdObservabilityService.getStats();
	}

	public cleanupOldRdEvents() {
		return this.rdObservabilityService.cleanupOldEvents();
	}

	public getRdEventCount() {
		return this.rdObservabilityService.getEventCount();
	}

	// Stream Health Service Methods
	public upsertStreamHealthResults(results: StreamServerStatus[]) {
		return this.streamHealthService.upsertHealthResults(results);
	}

	public getAllStreamStatuses() {
		return this.streamHealthService.getAllStatuses();
	}

	public getStreamHealthMetrics() {
		return this.streamHealthService.getMetrics();
	}

	public deleteStreamHealthHosts(hosts: string[]) {
		return this.streamHealthService.deleteHosts(hosts);
	}

	public deleteDeprecatedStreamHosts() {
		return this.streamHealthService.deleteDeprecatedHosts();
	}

	public cleanupOldStreamHealth(olderThanHours?: number) {
		return this.streamHealthService.cleanupOldEntries(olderThanHours);
	}

	public getStreamHealthCount() {
		return this.streamHealthService.getCount();
	}

	// History Aggregation Service Methods
	public aggregateRdHourly(targetHour?: Date) {
		return this.historyAggregationService.aggregateRdHourly(targetHour);
	}

	public rollupRdDaily(targetDate?: Date) {
		return this.historyAggregationService.rollupRdDaily(targetDate);
	}

	public recordStreamHealthSnapshot(data: {
		totalServers: number;
		workingServers: number;
		avgLatencyMs: number | null;
		minLatencyMs: number | null;
		maxLatencyMs: number | null;
		fastestServer: string | null;
		failedServers: string[];
	}) {
		return this.historyAggregationService.recordStreamHealthSnapshot(data);
	}

	public recordServerReliability(
		statuses: Array<{ host: string; ok: boolean; latencyMs: number | null }>
	) {
		return this.historyAggregationService.recordServerReliability(statuses);
	}

	public rollupStreamDaily(targetDate?: Date) {
		return this.historyAggregationService.rollupStreamDaily(targetDate);
	}

	public cleanupOldHistoryData() {
		return this.historyAggregationService.cleanupOldData();
	}

	public getRdRawHistory(hoursBack?: number, operation?: string) {
		return this.historyAggregationService.getRdRawHistory(hoursBack, operation);
	}

	public getRdHourlyHistory(hoursBack?: number, operation?: string) {
		return this.historyAggregationService.getRdHourlyHistory(hoursBack, operation);
	}

	public getRdDailyHistory(daysBack?: number, operation?: string) {
		return this.historyAggregationService.getRdDailyHistory(daysBack, operation);
	}

	public getStreamHourlyHistory(hoursBack?: number) {
		return this.historyAggregationService.getStreamHourlyHistory(hoursBack);
	}

	public getStreamDailyHistory(daysBack?: number) {
		return this.historyAggregationService.getStreamDailyHistory(daysBack);
	}

	public getServerReliability(
		daysBack?: number,
		sortBy?: 'reliability' | 'latency',
		limit?: number
	) {
		return this.historyAggregationService.getServerReliability(daysBack, sortBy, limit);
	}

	public runHistoryAggregation() {
		return this.historyAggregationService.runAggregation();
	}

	public runDailyRollup(targetDate?: Date) {
		return this.historyAggregationService.runDailyRollup(targetDate);
	}
}

// Export singleton instance to ensure only one PrismaClient exists
export const repository = new Repository();
