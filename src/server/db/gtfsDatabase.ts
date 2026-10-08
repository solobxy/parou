import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { FeedItem, FetchLogItem, FeedStatus } from '../../types/coverage';
import { SEED_FEEDS } from '../gtfsSeedRegistry';

// Cleanup old project data/ db files if they exist
try {
  const oldDataDir = path.resolve(process.cwd(), 'data');
  const filesToDelete = ['gtfs.db', 'gtfs.db.new', 'gtfs.db.gz', 'gtfs.db.bak', 'gtfs.db-wal', 'gtfs.db-shm', 'gtfs.db.tmp-wal', 'gtfs.db.tmp-shm', 'gtfs.db.tmp', 'gtfs.db.bak-shm', 'gtfs.db.bak-wal'];
  for (const f of filesToDelete) {
    const p = path.join(oldDataDir, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
} catch {}

const DATA_DIR = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[SQLite DB] Não foi possível criar pasta /tmp/parou:', err);
  }
}

export const DB_FILE = path.join(DATA_DIR, 'gtfs.db');
export const DB_BACKUP_FILE = path.join(DATA_DIR, 'gtfs.db.bak');
export const DB_TMP_FILE = path.join(DATA_DIR, 'gtfs.db.new');

// Limpar qualquer ficheiro .bak residual no arranque para poupar RAM em /tmp (Regra 2)
try {
  if (fs.existsSync(DB_BACKUP_FILE)) {
    fs.unlinkSync(DB_BACKUP_FILE);
  }
} catch {}

let dbInstance: DatabaseSync | null = null;

const cacheClearCallbacks: Array<() => void> = [];

export function registerCacheClearCallback(cb: () => void): void {
  cacheClearCallbacks.push(cb);
}

export function clearAllCaches(): void {
  for (const cb of cacheClearCallbacks) {
    try { cb(); } catch {}
  }
}

function checkFileIntegrity(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const testDb = new DatabaseSync(filePath, { readOnly: true });
    const check = testDb.prepare('PRAGMA quick_check;').get() as any;
    testDb.close();
    return check && check.quick_check === 'ok';
  } catch {
    return false;
  }
}

/**
 * Não cria cópias de segurança da base em /tmp: no Cloud Run o /tmp ocupa memória RAM.
 * saveDatabaseBackup não faz nada em produção e apaga o gtfs.db.bak se existir.
 */
export function saveDatabaseBackup(): void {
  try {
    if (fs.existsSync(DB_BACKUP_FILE)) {
      fs.unlinkSync(DB_BACKUP_FILE);
    }
  } catch (err) {
    console.warn('[SQLite DB] Aviso ao remover cópia de segurança residual:', err);
  }
}

let lastLoadedDbMtime = 0;
let lastRetryDbFileTime = 0;
let isUsingBackupFile = false;

/**
 * In the server process, reloads the read-only database connection
 * so that updates committed by parou-dados are immediately visible.
 */
export function reloadDatabaseConnection(): void {
  if (process.env.IS_WORKER === 'true') return;
  try {
    // Garante que não há ficheiro .bak residual
    try {
      if (fs.existsSync(DB_BACKUP_FILE)) fs.unlinkSync(DB_BACKUP_FILE);
    } catch {}

    let nextDb: DatabaseSync | null = null;
    let nextIsUsingBackup = false;

    if (fs.existsSync(DB_FILE) && checkFileIntegrity(DB_FILE)) {
      try {
        nextDb = new DatabaseSync(DB_FILE, { readOnly: true });
        nextDb.exec('PRAGMA busy_timeout = 10000;');
        nextIsUsingBackup = false;
        try { lastLoadedDbMtime = fs.statSync(DB_FILE).mtimeMs; } catch {}
      } catch (err: any) {
        console.warn('[SQLite DB] Não foi possível abrir nova ligação em gtfs.db, a manter atual:', err?.message || err);
      }
    }

    if (nextDb) {
      const oldDb = dbInstance;
      dbInstance = nextDb;
      isUsingBackupFile = nextIsUsingBackup;
      if (oldDb && oldDb !== nextDb) {
        try { oldDb.close(); } catch {}
      }
      clearAllCaches();
      console.log('[SQLite DB] Ligação só-leitura reaberta com sucesso no gtfs.db íntegro e caches limpas.');
    } else {
      console.warn('[SQLite DB] Verificação da base falhou ou em escrita. A manter ligação atual.');
    }
  } catch (err: any) {
    console.warn('[SQLite DB] Aviso ao recarregar ligação só-leitura (ligação mantida):', err?.message || err);
  }
}

let isOperatorTransactionActive = false;

/**
 * Single-transaction management per operator (Requirement 2)
 * Each operator is recorded in its own atomic transaction.
 * If it fails, only that operator is rolled back.
 * No full-database copying between operators.
 */
export function beginFeedTransaction(): void {
  const db = getDatabase();
  if (!isOperatorTransactionActive) {
    db.exec('BEGIN TRANSACTION;');
    isOperatorTransactionActive = true;
  }
}

export function commitFeedTransaction(feedId?: string): void {
  const db = getDatabase();
  if (isOperatorTransactionActive) {
    db.exec('COMMIT;');
    isOperatorTransactionActive = false;
  }

  // Notify the server process via IPC that this operator has been updated
  if (process.send) {
    try {
      process.send({ type: 'DATABASE_UPDATED', feedId, timestamp: new Date().toISOString() });
    } catch {}
  }
}

export function rollbackFeedTransaction(): void {
  try {
    const db = getDatabase();
    if (isOperatorTransactionActive) {
      db.exec('ROLLBACK;');
      isOperatorTransactionActive = false;
    }
  } catch {}
}

export function commitWorkerDatabase(feedId?: string): boolean {
  commitFeedTransaction(feedId);
  return true;
}

/**
 * Requirement 2: "Faz a cópia de segurança (VACUUM INTO) só no fim de todo o carregamento."
 * Creates a defragmented, clean backup copy in one native pass at the end of all feeds.
 */
export function createDatabaseBackupVacuum(): void {
  try {
    if (process.env.NODE_ENV === 'production') {
      // Em produção não se cria gtfs.db.bak para poupar espaço em disco /tmp
      if (fs.existsSync(DB_BACKUP_FILE)) {
        try { fs.unlinkSync(DB_BACKUP_FILE); } catch {}
      }
      return;
    }
    const db = getDatabase();
    if (fs.existsSync(DB_BACKUP_FILE)) {
      try { fs.unlinkSync(DB_BACKUP_FILE); } catch {}
    }
    db.exec(`VACUUM INTO '${DB_BACKUP_FILE}';`);
    console.log('[SQLite DB] Cópia de segurança gtfs.db.bak criada com sucesso via VACUUM INTO.');
  } catch (err: any) {
    console.warn('[SQLite DB] Aviso ao criar cópia de segurança via VACUUM INTO:', err?.message || err);
  }
}

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    try {
      dbInstance.prepare('SELECT 1').get();
      return dbInstance;
    } catch {
      // Se a verificação falhar, restabelece ligação
    }
  }

  try {
    if (!fs.existsSync(DB_FILE)) {
      if (fs.existsSync(DB_BACKUP_FILE) && checkFileIntegrity(DB_BACKUP_FILE)) {
        try { fs.copyFileSync(DB_BACKUP_FILE, DB_FILE); } catch {}
      }
    }

    const nextDb = new DatabaseSync(DB_FILE);
    nextDb.exec('PRAGMA journal_mode = WAL;');
    nextDb.exec('PRAGMA busy_timeout = 10000;');
    nextDb.exec('PRAGMA synchronous = NORMAL;');
    initSchema(nextDb);
    dbInstance = nextDb;
    seedFeedsIfEmpty();
    return dbInstance;
  } catch (err: any) {
    console.warn('[SQLite DB] Erro ao abrir gtfs.db:', err?.message || err);
    if (dbInstance) return dbInstance;
    throw err;
  }
}

/**
 * Regista todos os feeds oficiais na tabela feeds se a base de dados estiver vazia,
 * e assegura que os URLs e metadados oficiais dos 5 feeds principais estão sincronizados.
 */
export function seedFeedsIfEmpty(): void {
  try {
    if (!dbInstance) {
      // Evita recursão infinita se chamado durante a inicialização
      return;
    }
    const db = dbInstance;
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM feeds').get() as { cnt: number } | undefined;
    const count = Number(countRow?.cnt || 0);

    if (count === 0) {
      console.log('[SQLite DB] Base de dados sem feeds. A registar feeds oficiais do catálogo...');
      for (const seed of SEED_FEEDS) {
        upsertFeed(seed);
      }
      console.log(`[SQLite DB] ${SEED_FEEDS.length} feeds registados com sucesso.`);
    } else {
      // Sincroniza operadores com URLs oficiais solicitados
      for (const seed of SEED_FEEDS) {
        const existing = getFeedById(seed.id);
        if (!existing) {
          upsertFeed(seed);
        } else if (['cp', 'metro_lisboa', 'mts', 'tcb_barreiro', 'stcp', 'carris_metropolitana'].includes(seed.id)) {
          upsertFeed({
            ...existing,
            operator_name: seed.operator_name,
            url: seed.url,
            latest_url: seed.latest_url,
            valid_until: existing.valid_until || seed.valid_until,
            status: existing.status === 'SEM DADOS' && seed.url ? 'A aguardar' : existing.status,
            progress: existing.progress,
          });
        }
      }
    }
  } catch (err: any) {
    console.warn('[SQLite DB] Erro ao registar feeds oficiais:', err?.message || err);
  }
}

/**
 * Checks whether a feed actually has stops in the database.
 * Requirement 1: "Nunca marques um feed como carregado se as paragens dele não estiverem na base de dados."
 */
export function getFeedActualStopsCount(feedId: string): number {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM stops WHERE feed_id = ?').get(feedId) as { cnt: number } | undefined;
    return Number(row?.cnt || 0);
  } catch {
    return 0;
  }
}

function initSchema(db: DatabaseSync) {
  // Performance, concurrency and integrity pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Feeds table
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      operator_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      source_origin TEXT NOT NULL,
      url TEXT NOT NULL,
      latest_url TEXT,
      license_url TEXT,
      auth_type TEXT,
      auth_key TEXT,
      etag TEXT,
      last_modified TEXT,
      status TEXT NOT NULL,
      progress TEXT,
      lines_count INTEGER DEFAULT 0,
      stops_count INTEGER DEFAULT 0,
      trips_count INTEGER DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      realtime_entities TEXT DEFAULT 'Nenhum',
      last_ok TEXT,
      last_error TEXT,
      last_fetch_at TEXT
    );
  `);

  // Safe migration if table previously existed without progress column
  try {
    db.exec('ALTER TABLE feeds ADD COLUMN progress TEXT;');
  } catch {}

  // 2. Fetch logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS fetch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER,
      bytes INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL,
      message TEXT,
      error_details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_fetch_logs_timestamp ON fetch_logs (timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_fetch_logs_feed ON fetch_logs (feed_id);
  `);

  // 3. Normalized Stops table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stops (
      stop_id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      stop_name TEXT NOT NULL,
      stop_lat REAL,
      stop_lon REAL,
      zone_id TEXT,
      parent_station TEXT,
      location_type INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_stops_feed ON stops (feed_id);
    CREATE INDEX IF NOT EXISTS idx_stops_name ON stops (stop_name);
    CREATE INDEX IF NOT EXISTS idx_stops_coords ON stops (stop_lat, stop_lon);
  `);

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_stops_coords ON stops (stop_lat, stop_lon);');
  } catch {}

  try {
    db.exec('ALTER TABLE stops ADD COLUMN parent_station TEXT;');
  } catch {}
  try {
    db.exec('ALTER TABLE stops ADD COLUMN location_type INTEGER DEFAULT 0;');
  } catch {}

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_stops_parent ON stops (parent_station);');
  } catch {}

  // 4. Normalized Routes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
      route_id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      route_short_name TEXT,
      route_long_name TEXT,
      route_type INTEGER DEFAULT 3,
      route_color TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_routes_feed ON routes (feed_id);
  `);

  // 5. Normalized Trips table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      trip_id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      service_id TEXT,
      trip_headsign TEXT,
      direction_id INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_trips_route ON trips (route_id);
    CREATE INDEX IF NOT EXISTS idx_trips_feed ON trips (feed_id);
    CREATE INDEX IF NOT EXISTS idx_trips_service ON trips (feed_id, service_id);
  `);

  // 6. Normalized Stop Times table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stop_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      stop_id TEXT NOT NULL,
      arrival_secs INTEGER,
      departure_secs INTEGER,
      stop_sequence INTEGER,
      pickup_type INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times (stop_id, departure_secs);
    CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times (trip_id);
    CREATE INDEX IF NOT EXISTS idx_stop_times_feed ON stop_times (feed_id);
    CREATE INDEX IF NOT EXISTS idx_stop_times_trip_seq ON stop_times (trip_id, stop_sequence);
  `);

  try {
    db.exec('ALTER TABLE stop_times ADD COLUMN pickup_type INTEGER DEFAULT 0;');
  } catch {}

  // 7. Calendar table (service_id schedule per day of week & date range)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar (
      feed_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      monday INTEGER NOT NULL,
      tuesday INTEGER NOT NULL,
      wednesday INTEGER NOT NULL,
      thursday INTEGER NOT NULL,
      friday INTEGER NOT NULL,
      saturday INTEGER NOT NULL,
      sunday INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      PRIMARY KEY (feed_id, service_id)
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_lookup ON calendar (feed_id, service_id);
  `);

  // 8. Calendar Dates table (exceptions: 1 = service added, 2 = service removed)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_dates (
      feed_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      date TEXT NOT NULL,
      exception_type INTEGER NOT NULL,
      PRIMARY KEY (feed_id, service_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_cal_dates_feed_date ON calendar_dates (feed_id, date);
  `);

  // 9. Frequencies table (exact_times=0 or 1, headway_secs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS frequencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      start_time_secs INTEGER NOT NULL,
      end_time_secs INTEGER NOT NULL,
      headway_secs INTEGER NOT NULL,
      exact_times INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_freq_trip ON frequencies (feed_id, trip_id);
  `);

  // 10. App state table for worker progress and global flags
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function setAppState(key: string, value: any): void {
  try {
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[SQLite DB] Erro ao gravar app_state:', e);
  }
}

export function getAppState<T = any>(key: string): T | null {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// FEED CRUD & STATS
// ---------------------------------------------------------------------------

export function getAllFeeds(): FeedItem[] {
  try {
    const db = getDatabase();
    let rows = db.prepare('SELECT * FROM feeds ORDER BY operator_name ASC').all() as unknown as FeedItem[];
    if (!rows || rows.length === 0) {
      seedFeedsIfEmpty();
      rows = db.prepare('SELECT * FROM feeds ORDER BY operator_name ASC').all() as unknown as FeedItem[];
    }
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        ...r,
        lines_count: Number(r.lines_count || 0),
        stops_count: Number(r.stops_count || 0),
        trips_count: Number(r.trips_count || 0),
      }));
    }
  } catch (err) {
    console.warn('[SQLite DB] Erro em getAllFeeds:', err);
  }
  return SEED_FEEDS;
}

export function getFeedCalendarBounds(): Map<string, { firstDay: string | null; lastDay: string | null }> {
  const map = new Map<string, { firstDay: string | null; lastDay: string | null }>();
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        f.id,
        cal.min_start as cal_min,
        cal.max_end as cal_max,
        cd.min_date as cd_min,
        cd.max_date as cd_max
      FROM feeds f
      LEFT JOIN (
        SELECT feed_id, MIN(start_date) as min_start, MAX(end_date) as max_end 
        FROM calendar 
        GROUP BY feed_id
      ) cal ON cal.feed_id = f.id
      LEFT JOIN (
        SELECT feed_id, MIN(date) as min_date, MAX(date) as max_date 
        FROM calendar_dates 
        WHERE exception_type = 1
        GROUP BY feed_id
      ) cd ON cd.feed_id = f.id
    `).all() as any[];

    const formatIso = (d: string) => {
      const clean = d.replace(/\D/g, '');
      if (clean.length === 8) {
        return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      }
      return d;
    };

    for (const r of rows) {
      const starts = [r.cal_min, r.cd_min].filter(Boolean).map(String);
      const ends = [r.cal_max, r.cd_max].filter(Boolean).map(String);
      const first = starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      const last = ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : null;

      map.set(r.id, {
        firstDay: first ? formatIso(first) : null,
        lastDay: last ? formatIso(last) : null,
      });
    }
  } catch (err) {
    console.warn('[getFeedCalendarBounds] Erro ao consultar limites:', err);
  }
  return map;
}

export function getFeedById(id: string): FeedItem | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM feeds WHERE id = ?');
  const row = stmt.get(id) as unknown as FeedItem | undefined;
  if (!row) return null;
  return {
    ...row,
    lines_count: Number(row.lines_count || 0),
    stops_count: Number(row.stops_count || 0),
    trips_count: Number(row.trips_count || 0),
  };
}

export function upsertFeed(feed: FeedItem): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO feeds (
      id, operator_name, mode, feed_type, source_origin, url, latest_url, license_url,
      auth_type, auth_key, etag, last_modified, status, progress, lines_count, stops_count,
      trips_count, valid_from, valid_until, realtime_entities, last_ok, last_error, last_fetch_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      operator_name = excluded.operator_name,
      mode = excluded.mode,
      feed_type = excluded.feed_type,
      source_origin = excluded.source_origin,
      url = excluded.url,
      latest_url = COALESCE(excluded.latest_url, feeds.latest_url),
      license_url = COALESCE(excluded.license_url, feeds.license_url),
      auth_type = COALESCE(excluded.auth_type, feeds.auth_type),
      auth_key = COALESCE(excluded.auth_key, feeds.auth_key),
      etag = COALESCE(excluded.etag, feeds.etag),
      last_modified = COALESCE(excluded.last_modified, feeds.last_modified),
      status = excluded.status,
      progress = excluded.progress,
      lines_count = CASE WHEN excluded.lines_count > 0 THEN excluded.lines_count ELSE feeds.lines_count END,
      stops_count = CASE WHEN excluded.stops_count > 0 THEN excluded.stops_count ELSE feeds.stops_count END,
      trips_count = CASE WHEN excluded.trips_count > 0 THEN excluded.trips_count ELSE feeds.trips_count END,
      valid_from = COALESCE(excluded.valid_from, feeds.valid_from),
      valid_until = COALESCE(excluded.valid_until, feeds.valid_until),
      realtime_entities = excluded.realtime_entities,
      last_ok = COALESCE(excluded.last_ok, feeds.last_ok),
      last_error = excluded.last_error,
      last_fetch_at = excluded.last_fetch_at;
  `);

  stmt.run(
    feed.id,
    feed.operator_name,
    feed.mode,
    feed.feed_type,
    feed.source_origin,
    feed.url,
    feed.latest_url || null,
    feed.license_url || null,
    feed.auth_type || null,
    feed.auth_key || null,
    feed.etag || null,
    feed.last_modified || null,
    feed.status,
    feed.progress || null,
    feed.lines_count || 0,
    feed.stops_count || 0,
    feed.trips_count || 0,
    feed.valid_from || null,
    feed.valid_until || null,
    feed.realtime_entities || 'Nenhum',
    feed.last_ok || null,
    feed.last_error || null,
    feed.last_fetch_at || new Date().toISOString()
  );
}

export function updateFeedStatus(id: string, updates: Partial<FeedItem>): void {
  const current = getFeedById(id);
  if (!current) return;
  const merged: FeedItem = { ...current, ...updates };
  upsertFeed(merged);
}

export function updateFeedProgress(id: string, status: FeedStatus, progress: string, errorDetails?: string): void {
  const db = getDatabase();
  const currentFeed = getFeedById(id);
  // If the feed is already OK with loaded data, do not demote its public coverage status to 'queued', 'downloading' or 'parsing'
  const newStatus = (currentFeed?.status === 'OK' && (status === 'queued' || status === 'downloading' || status === 'parsing'))
    ? 'OK'
    : status;

  const stmt = db.prepare(`
    UPDATE feeds SET
      status = ?,
      progress = ?,
      last_error = CASE WHEN ? IS NOT NULL THEN ? ELSE last_error END,
      last_fetch_at = ?
    WHERE id = ?;
  `);
  stmt.run(
    newStatus,
    progress,
    errorDetails || null,
    errorDetails || null,
    new Date().toISOString(),
    id
  );
}

// ---------------------------------------------------------------------------
// LOGGING EVERY FETCH (MANDATORY RULE 4)
// ---------------------------------------------------------------------------

const memoryFetchLogs: FetchLogItem[] = [];

export function logFetch(log: Omit<FetchLogItem, 'id'>): void {
  const memItem: FetchLogItem = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    ...log,
    bytes: log.bytes || 0,
    duration_ms: log.duration_ms || 0,
    timestamp: log.timestamp || new Date().toISOString(),
    message: log.message || '',
    error_details: log.error_details || undefined,
  };
  memoryFetchLogs.unshift(memItem);
  if (memoryFetchLogs.length > 500) memoryFetchLogs.pop();

  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO fetch_logs (feed_id, url, http_status, bytes, duration_ms, timestamp, message, error_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      log.feed_id,
      log.url,
      log.http_status,
      log.bytes || 0,
      log.duration_ms || 0,
      log.timestamp || new Date().toISOString(),
      log.message || '',
      log.error_details || null
    );
  } catch {
    // If DB is opened as readOnly (server reader mode), log is safely retained in memoryFetchLogs
  }
}

export function getFetchLogs(limit = 100): FetchLogItem[] {
  let dbLogs: FetchLogItem[] = [];
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM fetch_logs ORDER BY id DESC LIMIT ?');
    dbLogs = stmt.all(limit) as unknown as FetchLogItem[];
  } catch {}

  const combined = [...memoryFetchLogs, ...dbLogs];
  const seen = new Set<string>();
  const res: FetchLogItem[] = [];
  for (const item of combined) {
    const key = `${item.timestamp}_${item.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      res.push(item);
    }
  }
  return res.slice(0, limit);
}

// ---------------------------------------------------------------------------
// GTFS DATA INGESTION BATCHES
// ---------------------------------------------------------------------------

export function clearFeedData(feedId: string): void {
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM frequencies WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM calendar_dates WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM calendar WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM stop_times WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM trips WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM routes WHERE feed_id = ?').run(feedId);
    db.prepare('DELETE FROM stops WHERE feed_id = ?').run(feedId);
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertCalendar(calendarRows: {
  feed_id: string;
  service_id: string;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}[]): void {
  if (calendarRows.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO calendar (
        feed_id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of calendarRows) {
      stmt.run(
        c.feed_id,
        c.service_id,
        c.monday,
        c.tuesday,
        c.wednesday,
        c.thursday,
        c.friday,
        c.saturday,
        c.sunday,
        c.start_date,
        c.end_date
      );
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertCalendarDates(dates: {
  feed_id: string;
  service_id: string;
  date: string;
  exception_type: number;
}[]): void {
  if (dates.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO calendar_dates (feed_id, service_id, date, exception_type)
      VALUES (?, ?, ?, ?)
    `);
    for (const d of dates) {
      stmt.run(d.feed_id, d.service_id, d.date, d.exception_type);
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertFrequencies(freqs: {
  feed_id: string;
  trip_id: string;
  start_time_secs: number;
  end_time_secs: number;
  headway_secs: number;
  exact_times: number;
}[]): void {
  if (freqs.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT INTO frequencies (feed_id, trip_id, start_time_secs, end_time_secs, headway_secs, exact_times)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const f of freqs) {
      stmt.run(f.feed_id, f.trip_id, f.start_time_secs, f.end_time_secs, f.headway_secs, f.exact_times);
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertStops(stops: { 
  stop_id: string; 
  feed_id: string; 
  stop_name: string; 
  stop_lat: number; 
  stop_lon: number; 
  zone_id?: string;
  parent_station?: string;
  location_type?: number;
}[]): void {
  if (stops.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of stops) {
      stmt.run(
        s.stop_id, 
        s.feed_id, 
        s.stop_name, 
        s.stop_lat, 
        s.stop_lon, 
        s.zone_id || null,
        s.parent_station || null,
        s.location_type || 0
      );
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertRoutes(routes: { route_id: string; feed_id: string; route_short_name: string; route_long_name: string; route_type: number; route_color?: string }[]): void {
  if (routes.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type, route_color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const r of routes) {
      stmt.run(r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color || null);
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertTrips(trips: { trip_id: string; feed_id: string; route_id: string; service_id: string; trip_headsign?: string; direction_id?: number }[]): void {
  if (trips.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO trips (trip_id, feed_id, route_id, service_id, trip_headsign, direction_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const t of trips) {
      stmt.run(t.trip_id, t.feed_id, t.route_id, t.service_id, t.trip_headsign || null, t.direction_id ?? 0);
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

export function batchInsertStopTimes(stopTimes: { 
  feed_id: string; 
  trip_id: string; 
  stop_id: string; 
  arrival_secs: number; 
  departure_secs: number; 
  stop_sequence: number;
  pickup_type?: number;
}[]): void {
  if (stopTimes.length === 0) return;
  const db = getDatabase();
  const shouldManageTx = !isOperatorTransactionActive;
  if (shouldManageTx) db.exec('BEGIN TRANSACTION;');
  try {
    const stmt = db.prepare(`
      INSERT INTO stop_times (feed_id, trip_id, stop_id, arrival_secs, departure_secs, stop_sequence, pickup_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const st of stopTimes) {
      stmt.run(st.feed_id, st.trip_id, st.stop_id, st.arrival_secs, st.departure_secs, st.stop_sequence, st.pickup_type || 0);
    }
    if (shouldManageTx) db.exec('COMMIT;');
  } catch (err) {
    if (shouldManageTx) {
      try { db.exec('ROLLBACK;'); } catch {}
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// STOP & DEPARTURE QUERIES
// ---------------------------------------------------------------------------

export interface DbStop {
  stop_id: string;
  feed_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  zone_id?: string | null;
  parent_station?: string | null;
  location_type?: number;
}

export function getAllStops(limit = 20000): DbStop[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type
      FROM stops
      WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL AND stop_lat != 0
      LIMIT ?
    `);
    return stmt.all(limit) as unknown as DbStop[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) {
      console.warn('[SQLite DB] Anomalia detetada em getAllStops. A recarregar...');
      reloadDatabaseConnection();
    }
    return [];
  }
}

/**
 * Query stops within a bounding box prefilter on indexed (stop_lat, stop_lon).
 * Only returns stops from feeds with status = 'OK'.
 */
export function queryStopsInBoundingBox(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  limit = 2500
): DbStop[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT s.stop_id, s.feed_id, s.stop_name, s.stop_lat, s.stop_lon, s.zone_id, s.parent_station, s.location_type
      FROM stops s
      LEFT JOIN feeds f ON s.feed_id = f.id
      WHERE s.stop_lat BETWEEN ? AND ?
        AND s.stop_lon BETWEEN ? AND ?
      LIMIT ?
    `);
    return stmt.all(minLat, maxLat, minLon, maxLon, limit) as unknown as DbStop[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) {
      console.warn('[SQLite DB] Anomalia detetada em queryStopsInBoundingBox. A recarregar...');
      reloadDatabaseConnection();
    }
    return [];
  }
}

/**
 * Query ALL raw stops in bounding box regardless of feed status (for diagnostic reporting)
 */
export function queryAllRawStopsInBoundingBox(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  limit = 2000
): (DbStop & { feed_status?: string })[] {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT s.stop_id, s.feed_id, s.stop_name, s.stop_lat, s.stop_lon, s.zone_id, s.parent_station, s.location_type, f.status as feed_status
      FROM stops s
      LEFT JOIN feeds f ON s.feed_id = f.id
      WHERE s.stop_lat BETWEEN ? AND ?
        AND s.stop_lon BETWEEN ? AND ?
      LIMIT ?
    `);
    return stmt.all(minLat, maxLat, minLon, maxLon, limit) as unknown as (DbStop & { feed_status?: string })[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) {
      console.warn('[SQLite DB] Anomalia detetada em queryAllRawStopsInBoundingBox. A recarregar...');
      reloadDatabaseConnection();
    }
    return [];
  }
}

export function getStopById(stopId: string): DbStop | null {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type
      FROM stops
      WHERE stop_id = ?
    `);
    const row = stmt.get(stopId) as unknown as DbStop | undefined;
    return row || null;
  } catch (err: any) {
    if (err?.message?.includes('malformed')) {
      console.warn('[SQLite DB] Anomalia detetada em getStopById. A recarregar...');
      reloadDatabaseConnection();
    }
    return null;
  }
}

export function searchStopsInDb(query: string, limit = 40): DbStop[] {
  try {
    const db = getDatabase();
    const pattern = `%${query.trim()}%`;
    const stmt = db.prepare(`
      SELECT stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type
      FROM stops
      WHERE stop_name LIKE ?
      LIMIT ?
    `);
    return stmt.all(pattern, limit) as unknown as DbStop[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
    return [];
  }
}

export function getActiveServiceIds(feedId: string, dateStr: string, dayOfWeekName: string): Set<string> {
  const active = new Set<string>();
  try {
    const db = getDatabase();

    // 1. Check calendar.txt for this feed
    const hasCalStmt = db.prepare('SELECT count(*) as c FROM calendar WHERE feed_id = ?');
    const calCount = (hasCalStmt.get(feedId) as any)?.c || 0;

    if (calCount > 0) {
      const validCol = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(dayOfWeekName) 
        ? dayOfWeekName 
        : 'monday';
      const calStmt = db.prepare(`
        SELECT service_id FROM calendar
        WHERE feed_id = ? AND ${validCol} = 1 AND start_date <= ? AND end_date >= ?
      `);
      const calRows = calStmt.all(feedId, dateStr, dateStr) as { service_id: string }[];
      for (const r of calRows) {
        active.add(r.service_id);
      }
    }

    // 2. Overlay calendar_dates.txt: 1 = add, 2 = remove
    const datesStmt = db.prepare(`
      SELECT service_id, exception_type FROM calendar_dates
      WHERE feed_id = ? AND date = ?
    `);
    const dateExceptions = datesStmt.all(feedId, dateStr) as { service_id: string; exception_type: number }[];
    for (const ex of dateExceptions) {
      if (ex.exception_type === 1) {
        active.add(ex.service_id);
      } else if (ex.exception_type === 2) {
        active.delete(ex.service_id);
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
  }

  return active;
}

export interface RawDepartureRow {
  stop_id: string;
  trip_id: string;
  feed_id: string;
  route_id: string;
  service_id: string;
  trip_headsign: string | null;
  direction_id: number;
  arrival_secs: number;
  departure_secs: number;
  stop_sequence: number;
  pickup_type: number;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number;
  route_color: string | null;
}

export function queryDeparturesForStop(
  feedId: string,
  stopId: string,
  activeServiceIds: string[],
  minSecs: number,
  maxSecs: number
): RawDepartureRow[] {
  if (activeServiceIds.length === 0) return [];
  try {
    const db = getDatabase();

    const rawStopId = stopId.includes(':') ? stopId.split(':')[1] : stopId;
    const placeholders = activeServiceIds.map(() => '?').join(',');
    const query = `
      SELECT 
        st.stop_id,
        st.trip_id,
        st.feed_id,
        st.arrival_secs,
        st.departure_secs,
        st.stop_sequence,
        st.pickup_type,
        t.route_id,
        t.service_id,
        t.trip_headsign,
        t.direction_id,
        r.route_short_name,
        r.route_long_name,
        r.route_type,
        r.route_color
      FROM stop_times st INDEXED BY idx_stop_times_stop
      CROSS JOIN trips t ON st.trip_id = t.trip_id
      CROSS JOIN routes r ON t.route_id = r.route_id
      WHERE st.stop_id IN (
          SELECT ? UNION SELECT s2.stop_id FROM stops s2 WHERE s2.parent_station IN (?, ?)
        )
        AND st.departure_secs >= ?
        AND st.departure_secs <= ?
        AND st.feed_id = ?
        AND st.pickup_type != 1
        AND t.service_id IN (${placeholders})
        AND EXISTS (SELECT 1 FROM stop_times st2 WHERE st2.trip_id = st.trip_id AND st2.stop_sequence > st.stop_sequence)
      ORDER BY st.departure_secs ASC
      LIMIT 60
    `;
    // Plano fixo: começa SEMPRE pelo índice (paragem, hora) e só depois vai às viagens.
    // Sem isto, algumas versões do SQLite começavam pelas viagens do serviço e cada
    // consulta demorava ~0,6 s (36 s para o "Perto" em Lisboa, com o servidor bloqueado).

    return db.prepare(query).all(
      stopId,
      stopId,
      rawStopId,
      minSecs,
      maxSecs,
      feedId,
      ...activeServiceIds
    ) as unknown as RawDepartureRow[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
    return [];
  }
}

export function getMaxStopSequence(feedId: string, tripId?: string): number {
  const actualTripId = tripId || feedId;
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT MAX(stop_sequence) as max_seq FROM stop_times WHERE trip_id = ?').get(actualTripId) as any;
    return row?.max_seq || 0;
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
    return 0;
  }
}

export function getFrequenciesForTrip(feedId: string, tripId: string) {
  try {
    const db = getDatabase();
    return db.prepare('SELECT * FROM frequencies WHERE feed_id = ? AND trip_id = ?').all(feedId, tripId) as {
      feed_id: string;
      trip_id: string;
      start_time_secs: number;
      end_time_secs: number;
      headway_secs: number;
      exact_times: number;
    }[];
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
    return [];
  }
}

export function getLinesServingStop(stopId: string): {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string;
  feed_id: string;
}[] {
  try {
    const db = getDatabase();
    const query = `
      SELECT DISTINCT 
        r.route_id, 
        r.route_short_name, 
        r.route_long_name, 
        r.route_type, 
        r.route_color,
        r.feed_id
      FROM stop_times st
      JOIN trips t ON st.trip_id = t.trip_id
      JOIN routes r ON t.route_id = r.route_id
      WHERE st.stop_id = ?
      LIMIT 50
    `;
    const linhas = db.prepare(query).all(stopId) as any[];
    if (linhas.length > 0 || !stopId.startsWith('unir:')) return linhas;
    // Operadores sem horários na base (UNIR): linhas da tabela stop_routes
    try {
      return db.prepare(`
        SELECT DISTINCT r.route_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color, r.feed_id
        FROM stop_routes sr JOIN routes r ON r.route_id = sr.route_id
        WHERE sr.stop_id = ? ORDER BY r.route_short_name LIMIT 50
      `).all(stopId) as any[];
    } catch {
      return [];
    }
  } catch (err: any) {
    if (err?.message?.includes('malformed')) reloadDatabaseConnection();
    return [];
  }
}

export function getCoverageTotals(): {
  totalFeeds: number;
  totalLines: number;
  totalStops: number;
  totalTrips: number;
  activeRealtimeCount: number;
  errorCount: number;
  expiredCount: number;
  okCount: number;
} {
  const db = getDatabase();
  const feeds = getAllFeeds();

  let totalLines = 0;
  let totalStops = 0;
  let totalTrips = 0;
  let activeRealtimeCount = 0;
  let errorCount = 0;
  let expiredCount = 0;
  let okCount = 0;

  for (const f of feeds) {
    totalLines += f.lines_count || 0;
    totalStops += f.stops_count || 0;
    totalTrips += f.trips_count || 0;
    if (f.realtime_entities && f.realtime_entities !== 'Nenhum') {
      activeRealtimeCount++;
    }
    if (f.status === 'OK') okCount++;
    else if (f.status === 'EXPIRED' || f.status === 'horário expirado') expiredCount++;
    else if (f.status === 'ERROR' || f.status === 'NOT_FOUND') errorCount++;
  }

  return {
    totalFeeds: feeds.length,
    totalLines,
    totalStops,
    totalTrips,
    activeRealtimeCount,
    errorCount,
    expiredCount,
    okCount,
  };
}

// ---------------------------------------------------------------------------
// Sentido de uma paragem: para onde vão os veículos que partem dali (destinos mais
// frequentes). Serve para distinguir paragens com o mesmo nome, uma de cada lado da rua.
// Se o operador não preenche o destino da viagem, usa o nome da última paragem.
// Guardado em memória (os horários mudam no máximo uma vez por dia).
// ---------------------------------------------------------------------------
export interface SentidoParagem {
  destinos: string[];
  /** Só chegam veículos (fim de linha): nada parte desta paragem */
  soChegadas: boolean;
}

const cacheSentidos = new Map<string, { valor: SentidoParagem; t: number }>();
const VALIDADE_SENTIDOS_MS = 6 * 60 * 60 * 1000;

export function getSentidoParagem(stopIds: string[]): SentidoParagem {
  const ids = Array.from(new Set(stopIds.filter(Boolean))).slice(0, 8);
  const chave = ids.slice().sort().join('|');
  const guardado = cacheSentidos.get(chave);
  if (guardado && Date.now() - guardado.t < VALIDADE_SENTIDOS_MS) return guardado.valor;

  let valor: SentidoParagem = { destinos: [], soChegadas: false };
  try {
    const db = getDatabase();
    const ph = ids.map(() => '?').join(',');
    const linhas = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(t.trip_headsign), ''), (
               SELECT s.stop_name FROM stop_times x INDEXED BY idx_stop_times_trip_seq
               JOIN stops s ON s.stop_id = x.stop_id
               WHERE x.trip_id = st.trip_id ORDER BY x.stop_sequence DESC LIMIT 1
             )) AS destino,
             COUNT(*) AS n
      FROM stop_times st INDEXED BY idx_stop_times_stop
      CROSS JOIN trips t ON st.trip_id = t.trip_id
      WHERE st.stop_id IN (${ph})
        AND st.pickup_type != 1
        AND EXISTS (SELECT 1 FROM stop_times st2 WHERE st2.trip_id = st.trip_id AND st2.stop_sequence > st.stop_sequence)
      GROUP BY destino
      ORDER BY n DESC
      LIMIT 4
    `).all(...ids) as Array<{ destino: string | null; n: number }>;

    const destinos: string[] = [];
    for (const l of linhas) {
      const d = String(l.destino || '').replace(/\*+\s*$/, '').trim();
      if (d && !destinos.some((x) => x.toLowerCase() === d.toLowerCase())) destinos.push(d);
    }
    let soChegadas = false;
    if (destinos.length === 0) {
      const passa = db.prepare(`SELECT 1 FROM stop_times INDEXED BY idx_stop_times_stop WHERE stop_id IN (${ph}) LIMIT 1`).get(...ids);
      soChegadas = Boolean(passa);
    }
    valor = { destinos, soChegadas };
  } catch (err: any) {
    console.warn('[Sentido paragem] Falhou:', err?.message || err);
  }
  cacheSentidos.set(chave, { valor, t: Date.now() });
  if (cacheSentidos.size > 5000) cacheSentidos.clear();
  return valor;
}
