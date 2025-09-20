import fs from 'node:fs';
import path from 'node:path';

import type { Database } from 'better-sqlite3';
import Sqlite from 'better-sqlite3';

import type { RealDebridObservabilityStats } from './getRealDebridObservabilityStats';

const SQLITE_ENV_KEY = 'REAL_DEBRID_OBSERVABILITY_SQLITE_PATH';
const LEGACY_JSON_ENV_KEY = 'REAL_DEBRID_OBSERVABILITY_SNAPSHOT_PATH';

type ResolvedPaths = {
	sqlitePath: string;
	legacyJsonPath: string | null;
	source: 'sqlite env override' | 'legacy env override' | 'default';
};

let database: Database | null = null;
let activeDatabasePath: string | null = null;
let loggedSnapshotPath: string | null = null;
const migratedPairs = new Set<string>();

function resolvePaths(): ResolvedPaths {
	const configuredSqlite = process.env[SQLITE_ENV_KEY]?.trim();
	const configuredJson = process.env[LEGACY_JSON_ENV_KEY]?.trim();

	if (configuredSqlite) {
		return {
			sqlitePath: path.resolve(configuredSqlite),
			legacyJsonPath: configuredJson ? path.resolve(configuredJson) : null,
			source: 'sqlite env override',
		};
	}

	if (configuredJson) {
		const resolvedJson = path.resolve(configuredJson);
		const ext = path.extname(resolvedJson);
		const sqliteCandidate =
			ext && ext.length > 0
				? `${resolvedJson.slice(0, -ext.length)}.sqlite`
				: `${resolvedJson}.sqlite`;
		return {
			sqlitePath: sqliteCandidate,
			legacyJsonPath: resolvedJson,
			source: 'legacy env override',
		};
	}

	return {
		sqlitePath: path.join(process.cwd(), '.data', 'real-debrid-observability.sqlite'),
		legacyJsonPath: null,
		source: 'default',
	};
}

function logSnapshotPath(filePath: string, source: ResolvedPaths['source']) {
	if (loggedSnapshotPath === filePath) {
		return;
	}
	loggedSnapshotPath = filePath;
	console.info(`Real-Debrid observability snapshot path (sqlite): ${filePath} (${source})`);
}

function ensureDirectory(filePath: string) {
	const directory = path.dirname(filePath);
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	}
}

function migrateLegacySnapshot(db: Database, resolved: ResolvedPaths) {
	const legacyJsonPath = resolved.legacyJsonPath;
	if (!legacyJsonPath) {
		return;
	}

	const migrationKey = `${resolved.sqlitePath}::${legacyJsonPath}`;
	if (migratedPairs.has(migrationKey)) {
		return;
	}
	migratedPairs.add(migrationKey);

	const existing = db.prepare('SELECT 1 FROM snapshot WHERE id = 1').get();
	if (existing) {
		return;
	}

	try {
		if (!fs.existsSync(legacyJsonPath)) {
			return;
		}
		const raw = fs.readFileSync(legacyJsonPath, 'utf8');
		if (!raw.trim()) {
			return;
		}
		const parsed = JSON.parse(raw) as RealDebridObservabilityStats;
		const payload = JSON.stringify(parsed);
		db.prepare(`INSERT INTO snapshot (id, payload, updated_at) VALUES (1, ?, ?)`).run(
			payload,
			Date.now()
		);
		console.info(
			`Migrated Real-Debrid observability snapshot from legacy JSON at ${legacyJsonPath} to sqlite at ${resolved.sqlitePath}`
		);
	} catch (error) {
		console.error(
			`Failed migrating Real-Debrid observability snapshot from ${legacyJsonPath}`,
			error
		);
	}
}

function ensureDatabase(): { db: Database; resolved: ResolvedPaths } {
	const resolved = resolvePaths();
	if (database && activeDatabasePath === resolved.sqlitePath) {
		return { db: database, resolved };
	}

	if (database) {
		database.close();
		database = null;
		activeDatabasePath = null;
	}

	ensureDirectory(resolved.sqlitePath);
	const instance = new Sqlite(resolved.sqlitePath);
	instance.pragma('journal_mode = WAL');
	instance.pragma('synchronous = NORMAL');
	instance.exec(
		`CREATE TABLE IF NOT EXISTS snapshot (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			payload TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		)`
	);

	migrateLegacySnapshot(instance, resolved);

	database = instance;
	activeDatabasePath = resolved.sqlitePath;
	logSnapshotPath(resolved.sqlitePath, resolved.source);
	return { db: instance, resolved };
}

export function saveRealDebridSnapshot(snapshot: RealDebridObservabilityStats) {
	const { db } = ensureDatabase();
	try {
		db.prepare(
			`INSERT INTO snapshot (id, payload, updated_at)
			VALUES (1, ?, ?)
			ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
		).run(JSON.stringify(snapshot), Date.now());
	} catch (error) {
		console.error('Failed to persist Real-Debrid observability snapshot to sqlite', error);
	}
}

export function loadRealDebridSnapshot(): RealDebridObservabilityStats | null {
	const { db } = ensureDatabase();
	try {
		const row = db.prepare('SELECT payload FROM snapshot WHERE id = 1').get() as
			| { payload: string }
			| undefined;
		if (!row || !row.payload) {
			return null;
		}
		return JSON.parse(row.payload) as RealDebridObservabilityStats;
	} catch (error) {
		console.error('Failed to read Real-Debrid observability snapshot from sqlite', error);
		return null;
	}
}

export const __testing = {
	resolvePaths,
	resetState() {
		if (database) {
			database.close();
		}
		database = null;
		activeDatabasePath = null;
		loggedSnapshotPath = null;
		migratedPairs.clear();
	},
};
