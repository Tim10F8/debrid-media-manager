import { AlertTriangle, Check, ChevronDown, ChevronRight, Link2, Settings, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
	defaultAvailabilityCheckLimit,
	defaultDownloadMagnets,
	defaultEpisodeSize,
	defaultMagnetHandlerEnabled,
	defaultMagnetInstructionsHidden,
	defaultMovieSize,
	defaultPlayer,
	defaultTorrentsFilter,
} from '../utils/settings';

export const SettingsSection = () => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isMagnetHandlerEnabled, setIsMagnetHandlerEnabled] = useState(
		defaultMagnetHandlerEnabled
	);
	const [isInstructionsHidden, setIsInstructionsHidden] = useState(
		defaultMagnetInstructionsHidden
	);

	const [storedPlayer, setStoredPlayer] = useState(defaultPlayer);
	const [movieMaxSize, setMovieMaxSize] = useState(defaultMovieSize);
	const [episodeMaxSize, setEpisodeMaxSize] = useState(defaultEpisodeSize);
	const [onlyTrustedTorrents, setOnlyTrustedTorrents] = useState(false);
	const [defaultTorrentsFilterValue, setDefaultTorrentsFilterValue] =
		useState(defaultTorrentsFilter);
	const [downloadMagnets, setDownloadMagnets] = useState(defaultDownloadMagnets);
	const [showMassReportButtons, setShowMassReportButtons] = useState(false);
	const [availabilityCheckLimit, setAvailabilityCheckLimit] = useState(
		defaultAvailabilityCheckLimit
	);
	const [includeTrackerStats, setIncludeTrackerStats] = useState(false);
	const [enableTorrentio, setEnableTorrentio] = useState(true);
	const [enableComet, setEnableComet] = useState(true);
	const [enableMediaFusion, setEnableMediaFusion] = useState(true);
	const [enablePeerflix, setEnablePeerflix] = useState(true);
	const [enableTorrentsDB, setEnableTorrentsDB] = useState(true);
	const [enableTorrentioTor, setEnableTorrentioTor] = useState(true);
	const [enableCometTor, setEnableCometTor] = useState(true);
	const [enableMediaFusionTor, setEnableMediaFusionTor] = useState(true);
	const [enablePeerflixTor, setEnablePeerflixTor] = useState(true);
	const [enableTorrentsDBTor, setEnableTorrentsDBTor] = useState(true);

	useEffect(() => {
		if (typeof localStorage === 'undefined') return;
		// Check if protocol handler is registered
		setIsMagnetHandlerEnabled(localStorage.getItem('settings:magnetHandlerEnabled') === 'true');

		// Check if instructions are hidden
		setIsInstructionsHidden(
			localStorage.getItem('settings:magnetInstructionsHidden') === 'true'
		);

		// Load persistent settings
		setStoredPlayer(localStorage.getItem('settings:player') || defaultPlayer);
		setMovieMaxSize(localStorage.getItem('settings:movieMaxSize') || defaultMovieSize);
		setEpisodeMaxSize(localStorage.getItem('settings:episodeMaxSize') || defaultEpisodeSize);
		setOnlyTrustedTorrents(localStorage.getItem('settings:onlyTrustedTorrents') === 'true');
		setDefaultTorrentsFilterValue(
			localStorage.getItem('settings:defaultTorrentsFilter') || defaultTorrentsFilter
		);
		setDownloadMagnets(
			localStorage.getItem('settings:downloadMagnets') === 'true' || defaultDownloadMagnets
		);
		setShowMassReportButtons(localStorage.getItem('settings:showMassReportButtons') === 'true');
		setAvailabilityCheckLimit(
			localStorage.getItem('settings:availabilityCheckLimit') || defaultAvailabilityCheckLimit
		);
		setIncludeTrackerStats(localStorage.getItem('settings:includeTrackerStats') === 'true');
		setEnableTorrentio(localStorage.getItem('settings:enableTorrentio') !== 'false');
		setEnableComet(localStorage.getItem('settings:enableComet') !== 'false');
		setEnableMediaFusion(localStorage.getItem('settings:enableMediaFusion') !== 'false');
		setEnablePeerflix(localStorage.getItem('settings:enablePeerflix') !== 'false');
		setEnableTorrentsDB(localStorage.getItem('settings:enableTorrentsDB') !== 'false');
		setEnableTorrentioTor(localStorage.getItem('settings:enableTorrentioTor') !== 'false');
		setEnableCometTor(localStorage.getItem('settings:enableCometTor') !== 'false');
		setEnableMediaFusionTor(localStorage.getItem('settings:enableMediaFusionTor') !== 'false');
		setEnablePeerflixTor(localStorage.getItem('settings:enablePeerflixTor') !== 'false');
		setEnableTorrentsDBTor(localStorage.getItem('settings:enableTorrentsDBTor') !== 'false');
	}, []);

	const handlePlayerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		setStoredPlayer(value);
		if (typeof localStorage !== 'undefined') localStorage.setItem('settings:player', value);
	};

	const handleMovieSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		setMovieMaxSize(value);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:movieMaxSize', value);
	};

	const handleEpisodeSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const value = e.target.value;
		setEpisodeMaxSize(value);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:episodeMaxSize', value);
	};

	const handleTorrentsFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setDefaultTorrentsFilterValue(value);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:defaultTorrentsFilter', value);
	};

	const handleTrustedTorrentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setOnlyTrustedTorrents(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:onlyTrustedTorrents', String(checked));
	};

	const handleDownloadMagnetsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setDownloadMagnets(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:downloadMagnets', String(checked));
	};

	const handleMassReportButtonsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setShowMassReportButtons(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:showMassReportButtons', String(checked));
	};

	const handleAvailabilityCheckLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		// Only allow numbers
		if (value === '' || /^\d+$/.test(value)) {
			setAvailabilityCheckLimit(value);
			if (typeof localStorage !== 'undefined')
				localStorage.setItem('settings:availabilityCheckLimit', value);
		}
	};

	const handleIncludeTrackerStatsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setIncludeTrackerStats(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:includeTrackerStats', String(checked));
	};

	const handleEnableTorrentioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableTorrentio(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableTorrentio', String(checked));
	};

	const handleEnableCometChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableComet(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableComet', String(checked));
	};

	const handleEnableMediaFusionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableMediaFusion(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableMediaFusion', String(checked));
	};

	const handleEnablePeerflixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnablePeerflix(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enablePeerflix', String(checked));
	};

	const handleEnableTorrentsDBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableTorrentsDB(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableTorrentsDB', String(checked));
	};

	const handleEnableCometTorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableCometTor(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableCometTor', String(checked));
	};

	const handleEnableMediaFusionTorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableMediaFusionTor(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableMediaFusionTor', String(checked));
	};

	const handleEnablePeerflixTorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnablePeerflixTor(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enablePeerflixTor', String(checked));
	};

	const handleEnableTorrentsDBTorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableTorrentsDBTor(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableTorrentsDBTor', String(checked));
	};

	const handleEnableTorrentioTorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setEnableTorrentioTor(checked);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:enableTorrentioTor', String(checked));
	};

	const handleHideInstructions = () => {
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:magnetInstructionsHidden', 'true');
		setIsInstructionsHidden(true);
	};

	const handleShowInstructions = () => {
		if (typeof localStorage !== 'undefined')
			localStorage.setItem('settings:magnetInstructionsHidden', 'false');
		setIsInstructionsHidden(false);
	};

	const getBrowserSettingsInfo = () => {
		if (typeof navigator === 'undefined') {
			return { text: 'Browser protocol handler settings:', url: '' };
		}
		const ua = navigator.userAgent;
		if (ua.includes('Chrome') && !ua.includes('Edg')) {
			return {
				text: 'Chrome protocol handler settings:',
				url: 'chrome://settings/handlers',
			};
		} else if (ua.includes('Firefox')) {
			return {
				text: 'Firefox protocol handler settings:',
				url: 'about:preferences#general',
			};
		} else if (ua.includes('Edg')) {
			return {
				text: 'Edge protocol handler settings:',
				url: 'edge://settings/content/handlers',
			};
		}
		return {
			text: 'Browser protocol handler settings:',
			url: '',
		};
	};

	return (
		<div className="w-full max-w-md">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="haptic-sm flex w-full items-center justify-between rounded border-2 border-gray-500 bg-gray-800/30 px-4 py-2 text-sm font-medium text-gray-100 transition-colors hover:bg-gray-700/50"
			>
				<span className="flex items-center">
					<Settings className="mr-2 inline-block h-4 w-4 text-gray-400" />
					Settings
				</span>
				<span>
					{isExpanded ? (
						<ChevronDown className="h-4 w-4 text-gray-400" />
					) : (
						<ChevronRight className="h-4 w-4 text-gray-400" />
					)}
				</span>
			</button>

			{isExpanded && (
				<div className="mt-4 text-sm text-gray-200">
					<div className="flex flex-col gap-4">
						<div className="rounded border-2 border-yellow-500/30 p-4">
							<div className="mb-4 flex items-center justify-center text-center text-sm font-medium text-yellow-200">
								<AlertTriangle className="mr-2 inline-block h-4 w-4 text-yellow-400" />
								Experiencing lag or buffering? Try smaller files
							</div>

							<div className="flex flex-col gap-4">
								<div className="text-center text-xs text-gray-400">
									Check your connection speed:{' '}
									<a
										href="https://real-debrid.com/speedtest"
										target="_blank"
										rel="noopener"
										className="text-blue-400 hover:underline"
									>
										Real-Debrid
									</a>
									{' · '}
									<a
										href="https://alldebrid.com/speedtest"
										target="_blank"
										rel="noopener"
										className="text-blue-400 hover:underline"
									>
										AllDebrid
									</a>
									{' · '}
									<a
										href="https://speedtest.torbox.app/"
										target="_blank"
										rel="noopener"
										className="text-blue-400 hover:underline"
									>
										Torbox
									</a>
								</div>

								<div className="flex flex-col gap-1">
									<label className="font-semibold">Biggest movie size</label>
									<select
										id="dmm-movie-max-size"
										className="w-full rounded bg-gray-800 px-2 py-2.5 text-gray-200"
										value={movieMaxSize}
										onChange={handleMovieSizeChange}
									>
										<option value="1">1 GB (~1.5 Mbps)</option>
										<option value="3">3 GB (~4.5 Mbps)</option>
										<option value="5">5 GB (~7.5 Mbps)</option>
										<option value="15">15 GB (~22 Mbps)</option>
										<option value="30">30 GB (~45 Mbps)</option>
										<option value="60">60 GB (~90 Mbps)</option>
										<option value="0">Biggest available</option>
									</select>
								</div>

								<div className="flex flex-col gap-1">
									<label className="font-semibold">Biggest episode size</label>
									<select
										id="dmm-episode-max-size"
										className="w-full rounded bg-gray-800 px-2 py-2.5 text-gray-200"
										value={episodeMaxSize}
										onChange={handleEpisodeSizeChange}
									>
										<option value="0.1">100 MB (~0.7 Mbps)</option>
										<option value="0.3">300 MB (~2 Mbps)</option>
										<option value="0.5">500 MB (~3.5 Mbps)</option>
										<option value="1">1 GB (~7 Mbps)</option>
										<option value="3">3 GB (~21 Mbps)</option>
										<option value="5">5 GB (~35 Mbps)</option>
										<option value="0">Biggest available</option>
									</select>
								</div>
							</div>
						</div>

						<div className="flex flex-col gap-1">
							<label className="font-semibold">Video player</label>
							<select
								id="dmm-player"
								className="w-full rounded bg-gray-800 px-2 py-2.5 text-gray-200"
								value={storedPlayer}
								onChange={handlePlayerChange}
							>
								<optgroup label="Web">
									<option value="web/rd">Real-Debrid Stream</option>
								</optgroup>
								<optgroup label="Android">
									<option value="android/chooser">App chooser</option>
									<option value="android/org.videolan.vlc">VLC</option>
									<option value="android/com.mxtech.videoplayer.ad">
										MX Player
									</option>
									<option value="android/com.mxtech.videoplayer.pro">
										MX Player Pro
									</option>
									<option value="android/com.brouken.player">JustPlayer</option>
								</optgroup>
								<optgroup label="iOS">
									<option value="ios2/open-vidhub">VidHub</option>
									<option value="ios/infuse">Infuse</option>
									<option value="ios/vlc">VLC</option>
									<option value="ios/outplayer">Outplayer</option>
								</optgroup>
								<optgroup label="MacOS">
									<option value="mac4/open-vidhub">VidHub</option>
									<option value="mac/infuse">Infuse</option>
									<option value="mac2/iina">IINA</option>
									<option value="mac2/omniplayer">OmniPlayer</option>
									<option value="mac2/figplayer">Fig Player</option>
									<option value="mac3/nplayer-mac">nPlayer</option>
								</optgroup>
							</select>
						</div>

						<div className="flex flex-col gap-1">
							<label className="font-semibold">Default torrents filter</label>
							<input
								id="dmm-default-torrents-filter"
								type="text"
								className="w-full rounded bg-gray-800 px-2 py-2.5 text-gray-200"
								placeholder="filter results, supports regex"
								value={defaultTorrentsFilterValue}
								onChange={handleTorrentsFilterChange}
							/>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="dmm-only-trusted-torrents"
								type="checkbox"
								className="h-5 w-5 rounded border-gray-600 bg-gray-800"
								checked={onlyTrustedTorrents}
								onChange={handleTrustedTorrentsChange}
							/>
							<label className="font-semibold">Only trusted torrents</label>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="dmm-download-magnets"
								type="checkbox"
								className="h-5 w-5 rounded border-gray-600 bg-gray-800"
								checked={downloadMagnets}
								onChange={handleDownloadMagnetsChange}
							/>
							<label className="font-semibold">
								Download .magnet files instead of copy
							</label>
						</div>

						<div className="flex items-center gap-2">
							<input
								id="dmm-show-mass-report-buttons"
								type="checkbox"
								className="h-5 w-5 rounded border-gray-600 bg-gray-800"
								checked={showMassReportButtons}
								onChange={handleMassReportButtonsChange}
							/>
							<label className="font-semibold">Show mass report buttons</label>
						</div>

						<div className="flex flex-col gap-1">
							<label className="font-semibold">Availability check limit</label>
							<input
								id="dmm-availability-check-limit"
								type="number"
								min="0"
								className="w-full rounded bg-gray-800 px-2 py-2.5 text-gray-200"
								placeholder="0 for no limit"
								value={availabilityCheckLimit}
								onChange={handleAvailabilityCheckLimitChange}
							/>
							<span className="text-xs text-gray-400">
								Maximum torrents to check when using &quot;Check Available&quot;
								button (0 = no limit)
							</span>
						</div>

						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<input
									id="dmm-include-tracker-stats"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={includeTrackerStats}
									onChange={handleIncludeTrackerStatsChange}
								/>
								<label className="font-semibold">
									Include tracker stats in availability check
								</label>
							</div>
							<span className="text-xs text-gray-400">
								When enabled, also fetches seeders, leechers, and download counts
								from trackers during availability checks. This provides more
								detailed information but may slow down the check process.
							</span>
						</div>

						<div className="flex flex-col gap-2 rounded border-2 border-blue-500/30 p-3">
							<div className="text-sm font-semibold text-blue-200">
								External Sources
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-torrentio"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableTorrentio}
									onChange={handleEnableTorrentioChange}
								/>
								<label className="font-semibold">Enable Torrentio</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-comet"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableComet}
									onChange={handleEnableCometChange}
								/>
								<label className="font-semibold">Enable Comet</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-mediafusion"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableMediaFusion}
									onChange={handleEnableMediaFusionChange}
								/>
								<label className="font-semibold">Enable MediaFusion</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-peerflix"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enablePeerflix}
									onChange={handleEnablePeerflixChange}
								/>
								<label className="font-semibold">Enable Peerflix</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-torrentsdb"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableTorrentsDB}
									onChange={handleEnableTorrentsDBChange}
								/>
								<label className="font-semibold">Enable TorrentsDB</label>
							</div>

							<span className="text-xs text-gray-400">
								External sources provide additional cached torrents from
								Real-Debrid. Disable if you want to use only DMM&apos;s own search
								results.
							</span>
						</div>

						<div className="flex flex-col gap-2 rounded border-2 border-orange-500/30 p-3">
							<div className="text-sm font-semibold text-orange-200">
								Tor Proxy Options (bypasses rate limits)
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-torrentio-tor"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableTorrentioTor}
									onChange={handleEnableTorrentioTorChange}
								/>
								<label className="font-semibold">Enable Torrentio (Tor)</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-comet-tor"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableCometTor}
									onChange={handleEnableCometTorChange}
								/>
								<label className="font-semibold">Enable Comet (Tor)</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-mediafusion-tor"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableMediaFusionTor}
									onChange={handleEnableMediaFusionTorChange}
								/>
								<label className="font-semibold">Enable MediaFusion (Tor)</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-peerflix-tor"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enablePeerflixTor}
									onChange={handleEnablePeerflixTorChange}
								/>
								<label className="font-semibold">Enable Peerflix (Tor)</label>
							</div>

							<div className="flex items-center gap-2">
								<input
									id="dmm-enable-torrentsdb-tor"
									type="checkbox"
									className="h-5 w-5 rounded border-gray-600 bg-gray-800"
									checked={enableTorrentsDBTor}
									onChange={handleEnableTorrentsDBTorChange}
								/>
								<label className="font-semibold">Enable TorrentsDB (Tor)</label>
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="mt-4 flex flex-col gap-2">
				<button
					id="dmm-default"
					className={`haptic-sm w-full rounded border-2 ${
						isMagnetHandlerEnabled
							? 'border-green-500 bg-green-900/30 text-green-100 hover:bg-green-800/50'
							: 'border-blue-500 bg-blue-900/30 text-blue-100 hover:bg-blue-800/50'
					} px-4 py-2 text-sm transition-colors`}
					onClick={() => {
						if (
							typeof navigator !== 'undefined' &&
							'registerProtocolHandler' in navigator
						) {
							try {
								navigator.registerProtocolHandler(
									'magnet',
									`${(typeof location !== 'undefined' && location.origin) || ''}/library?addMagnet=%s`
								);
								if (typeof localStorage !== 'undefined')
									localStorage.setItem('settings:magnetHandlerEnabled', 'true');
								setIsMagnetHandlerEnabled(true);
							} catch (error) {
								console.error('Error registering protocol handler:', error);
							}
						}
					}}
				>
					{isMagnetHandlerEnabled ? (
						<>
							<Check className="mr-1 inline-block h-4 w-4 text-green-400" />
							DMM is your default magnet handler
						</>
					) : (
						<>
							<Link2 className="mr-1 inline-block h-4 w-4 text-blue-400" />
							Make DMM your default magnet handler
						</>
					)}
				</button>

				{!isInstructionsHidden ? (
					<div className="flex flex-col gap-1 text-xs text-gray-400">
						<div className="flex items-center justify-between">
							<div>{getBrowserSettingsInfo().text}</div>
							<button
								onClick={handleHideInstructions}
								className="ml-2 text-gray-500 hover:text-gray-300"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
						<input
							type="text"
							readOnly
							className="w-full rounded bg-gray-800 px-2 py-1.5 text-gray-200"
							value={getBrowserSettingsInfo().url}
							onClick={(e) => (e.target as HTMLInputElement).select()}
						/>
					</div>
				) : (
					<button
						onClick={handleShowInstructions}
						className="text-xs text-gray-500 hover:text-gray-300"
					>
						Show browser settings
					</button>
				)}
			</div>
		</div>
	);
};
