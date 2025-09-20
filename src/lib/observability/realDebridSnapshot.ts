import fs from 'node:fs';
import path from 'node:path';

import type { RealDebridObservabilityStats } from './getRealDebridObservabilityStats';

const SNAPSHOT_ENV_KEY = 'REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH';

function resolveSnapshotPath(): string {
	const configured = process.env[SNAPSHOT_ENV_KEY]?.trim();
	if (configured) {
		return path.resolve(configured);
	}
	return path.join(process.cwd(), '.data', 'real-debrid-observability.json');
}

function ensureDirectory(filePath: string) {
	const directory = path.dirname(filePath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

export function saveRealDebridSnapshot(snapshot: RealDebridObservabilityStats) {
	try {
		const filePath = resolveSnapshotPath();
		ensureDirectory(filePath);
		fs.writeFileSync(filePath, JSON.stringify(snapshot));
	} catch (error) {
		console.error('Failed to persist Real-Debrid observability snapshot', error);
	}
}

export function loadRealDebridSnapshot(): RealDebridObservabilityStats | null {
	try {
		const filePath = resolveSnapshotPath();
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
