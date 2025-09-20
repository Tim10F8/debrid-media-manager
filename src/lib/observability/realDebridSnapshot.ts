import fs from 'node:fs';
import path from 'node:path';

import type { RealDebridObservabilityStats } from './getRealDebridObservabilityStats';

const SNAPSHOT_ENV_KEY = 'REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH';

let loggedSnapshotPath: string | null = null;

function resolveSnapshotPath(): string {
	const configured = process.env[SNAPSHOT_ENV_KEY]?.trim();
	if (configured) {
		return path.resolve(configured);
	}
	return path.join(process.cwd(), '.data', 'real-debrid-observability.json');
}

function logSnapshotPath(filePath: string) {
	if (loggedSnapshotPath === filePath) {
		return;
	}
	loggedSnapshotPath = filePath;
	const source = process.env[SNAPSHOT_ENV_KEY]?.trim() ? 'env override' : 'default';
	console.info(`Real-Debrid observability snapshot path: ${filePath} (${source})`);
}

function ensureDirectory(filePath: string) {
	const directory = path.dirname(filePath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

export function saveRealDebridSnapshot(snapshot: RealDebridObservabilityStats) {
	const filePath = resolveSnapshotPath();
	logSnapshotPath(filePath);
	const directory = path.dirname(filePath);
	const tempPath = path.join(
		directory,
		`${path.basename(filePath)}.${process.pid}-${Date.now()}.tmp`
	);

	try {
		ensureDirectory(filePath);
		const payload = JSON.stringify(snapshot);
		fs.writeFileSync(tempPath, payload, 'utf8');
		fs.renameSync(tempPath, filePath);
	} catch (error) {
		try {
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		} catch (cleanupError) {
			console.error('Failed to clean up temporary Real-Debrid snapshot file', cleanupError);
		}
		console.error(`Failed to persist Real-Debrid observability snapshot at ${filePath}`, error);
	}
}

export function loadRealDebridSnapshot(): RealDebridObservabilityStats | null {
	const filePath = resolveSnapshotPath();
	logSnapshotPath(filePath);
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		const raw = fs.readFileSync(filePath, 'utf8');
		if (!raw.trim()) {
			return null;
		}
		return JSON.parse(raw) as RealDebridObservabilityStats;
	} catch (error) {
		if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error('Failed to read Real-Debrid observability snapshot', error);
		}
		return null;
	}
}

export const __testing = {
	resolveSnapshotPath,
};
