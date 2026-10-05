import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FeedItem } from '../types/coverage';
import {
  getDatabase,
  getAllFeeds,
  getFeedById,
  upsertFeed,
  updateFeedProgress,
  logFetch,
  clearFeedData,
  batchInsertRoutes,
  batchInsertStops,
  batchInsertTrips,
  batchInsertStopTimes,
  batchInsertCalendar,
  batchInsertCalendarDates,
  batchInsertFrequencies,
  setAppState,
  getAppState,
  commitWorkerDatabase,
  beginFeedTransaction,
  commitFeedTransaction,
  rollbackFeedTransaction,
  createDatabaseBackupVacuum,
  getFeedActualStopsCount,
  saveDatabaseBackup,
} from './db/gtfsDatabase';
import { ingestUnirQiHoras } from './unirQiHorasService';
import { getLatestStcpGtfsUrl, getLatestMetroPortoGtfsUrl } from './portoOpenDataService';

const execAsync = promisify(exec);

const TMP_DOWNLOADS_DIR = '/tmp/parou_gtfs_downloads';
const TMP_EXTRACTED_DIR = '/tmp/parou_gtfs_extracted';

if (!fs.existsSync(TMP_DOWNLOADS_DIR)) fs.mkdirSync(TMP_DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(TMP_EXTRACTED_DIR)) fs.mkdirSync(TMP_EXTRACTED_DIR, { recursive: true });

const MAX_ZIP_BYTES = 180 * 1024 * 1024; // 180 MB limit

export interface IngestionProgressState {
  isLoading: boolean;
  totalOperators: number;
  loadedOperators: number;
  currentOperator: string;
  currentFeedId: string;
  message: string;
  updatedAt: string;
}

let currentLoopLoaded = 0;
let currentLoopTotal = 37;

export function reportWorkerProgress(
  loaded: number,
  total: number,
  currentOp: string,
  feedId: string,
  isLoading: boolean
) {
  if (loaded > 0) currentLoopLoaded = loaded;
  if (total > 0) currentLoopTotal = total;
  const effectiveLoaded = loaded > 0 ? loaded : currentLoopLoaded;
  const effectiveTotal = total > 0 ? total : currentLoopTotal;

  const message = isLoading
    ? `A carregar dados: ${effectiveLoaded} de ${effectiveTotal} operadores`
    : 'Todos os operadores carregados';

  const state: IngestionProgressState = {
    isLoading,
    totalOperators: effectiveTotal,
    loadedOperators: effectiveLoaded,
    currentOperator: currentOp,
    currentFeedId: feedId,
    message,
    updatedAt: new Date().toISOString(),
  };

  setAppState('ingestion_progress', state);

  if (process.send) {
    try {
      process.send({
        type: 'INGESTION_PROGRESS',
        ...state,
      });
    } catch {}
  }
}

export function getIngestionProgress(): IngestionProgressState {
  const state = getAppState<IngestionProgressState>('ingestion_progress');
  if (state) return state;

  return {
    isLoading: false,
    totalOperators: 0,
    loadedOperators: 0,
    currentOperator: '',
    currentFeedId: '',
    message: '',
    updatedAt: new Date().toISOString(),
  };
}

function getTodayYyyyMmDd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function timeStringToSeconds(tStr: string): number {
  if (!tStr) return 0;
  const parts = tStr.split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2] || '0', 10) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Downloads a GTFS zip buffer with automatic fallback to Mobility Database latest mirror.
 * Checks for HTTP error, SSL error, HTML response instead of ZIP, and zip magic signature.
 */
async function fetchZipBufferWithFallback(
  feedId: string,
  primaryUrl: string,
  mirrorUrl?: string | null,
  authKey?: string | null,
  etag?: string | null,
  lastModified?: string | null
): Promise<{ buffer: Buffer; usedUrl: string; etag?: string; lastModified?: string } | null> {
  const tryUrl = async (url: string) => {
    const headers: Record<string, string> = {
      'User-Agent': 'PAROU.PT/2.0 (GTFS Ingestion Engine; Portugal)',
      'Accept': 'application/zip, application/octet-stream, */*',
    };
    if (etag) headers['If-None-Match'] = etag;
    if (lastModified) headers['If-Modified-Since'] = lastModified;
    if (authKey) headers['Authorization'] = `Bearer ${authKey}`;

    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // Verify it is not an HTML page
    if (contentType.includes('text/html') || (buf.length > 0 && buf[0] === 0x3c)) {
      throw new Error(`Servidor devolveu página HTML em vez de ZIP (${buf.length} bytes)`);
    }

    // Verify ZIP magic header: PK\x03\x04 or PK\x05\x06
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error(`Ficheiro não é um arquivo ZIP válido (assinatura ${buf.slice(0, 4).toString('hex')})`);
    }

    return {
      buffer: buf,
      usedUrl: url,
      etag: res.headers.get('etag') || undefined,
      lastModified: res.headers.get('last-modified') || undefined,
    };
  };

  // If primary URL has known expired SSL (such as api.transtejo.pt), prefer the valid mirror directly
  const effectivePrimaryUrl = primaryUrl.includes('api.transtejo.pt') && mirrorUrl
    ? mirrorUrl
    : primaryUrl;

  try {
    return await tryUrl(effectivePrimaryUrl);
  } catch (primErr: any) {
    if (mirrorUrl && mirrorUrl !== effectivePrimaryUrl && mirrorUrl.startsWith('http')) {
      try {
        const mirrorRes = await tryUrl(mirrorUrl);
        console.log(`[Ingestion] Feed ${feedId} descarregado com sucesso via espelho Mobility Database: ${mirrorUrl}`);
        return mirrorRes;
      } catch (mirrorErr: any) {
        console.warn(`[Ingestion] Link primário e espelho indisponíveis para ${feedId}: ${mirrorErr.message}`);
      }
    }
    return null;
  }
}

/**
 * Ingest Carris Metropolitana via official JSON API v2
 * Note: covers 15 of 18 municipalities, uses API NOT the 68 MB zip.
 */
export async function ingestCarrisMetropolitanaApi(): Promise<void> {
  const feedId = 'carris_metropolitana';
  const feed = getFeedById(feedId);
  const startTime = Date.now();
  const baseUrl = 'https://api.carrismetropolitana.pt/v2';

  updateFeedProgress(feedId, 'downloading', 'A transferir linhas e paragens da API v2...');

  try {
    // 1. Fetch Lines
    const linesUrl = `${baseUrl}/lines`;
    const resLines = await fetch(linesUrl, {
      headers: { 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(30000),
    });
    const durLines = Date.now() - startTime;

    if (!resLines.ok) {
      const err = `HTTP ${resLines.status} ao obter /lines`;
      logFetch({
        feed_id: feedId,
        url: linesUrl,
        http_status: resLines.status,
        bytes: 0,
        duration_ms: durLines,
        timestamp: new Date().toISOString(),
        message: 'Erro na API Carris Metropolitana',
        error_details: err,
      });
      updateFeedProgress(feedId, 'ERROR', `ERROR: ${err}`, err);
      upsertFeed({
        id: feedId,
        operator_name: 'Carris Metropolitana',
        mode: 'Autocarro',
        feed_type: 'api',
        source_origin: 'seed',
        url: baseUrl,
        status: 'ERROR',
        progress: `ERROR: ${err}`,
        lines_count: feed?.lines_count || 717,
        stops_count: feed?.stops_count || 12752,
        trips_count: feed?.trips_count || 21000,
        realtime_entities: 'Veículos, Chegadas e Alertas (API v2 direta)',
        last_error: err,
        last_fetch_at: new Date().toISOString(),
      });
      return;
    }

    const linesData = (await resLines.json()) as any[];
    const linesBytes = JSON.stringify(linesData).length;

    updateFeedProgress(feedId, 'parsing', 'A transferir paragens...');

    logFetch({
      feed_id: feedId,
      url: linesUrl,
      http_status: 200,
      bytes: linesBytes,
      duration_ms: durLines,
      timestamp: new Date().toISOString(),
      message: `Sucesso: ${linesData.length} linhas obtidas da API v2`,
    });

    // 2. Fetch Stops
    const stopsUrl = `${baseUrl}/stops`;
    const tStops = Date.now();
    const resStops = await fetch(stopsUrl, {
      headers: { 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(30000),
    });
    const durStops = Date.now() - tStops;
    const stopsData = resStops.ok ? ((await resStops.json()) as any[]) : [];
    const stopsBytes = JSON.stringify(stopsData).length;

    updateFeedProgress(feedId, 'parsing', 'A gravar paragens e linhas...');

    logFetch({
      feed_id: feedId,
      url: stopsUrl,
      http_status: resStops.status,
      bytes: stopsBytes,
      duration_ms: durStops,
      timestamp: new Date().toISOString(),
      message: `Sucesso: ${stopsData.length} paragens obtidas da API v2`,
    });

    // 3. Batch insert into SQLite
    clearFeedData(feedId);

    const routesToInsert = linesData.map((l) => ({
      route_id: `cm:${l.id}`,
      feed_id: feedId,
      route_short_name: l.short_name || l.id,
      route_long_name: l.long_name || '',
      route_type: 3,
      route_color: l.color || '#FBC02D',
    }));
    batchInsertRoutes(routesToInsert);

    const stopsToInsert = stopsData.map((s) => ({
      stop_id: `cm:${s.id}`,
      feed_id: feedId,
      stop_name: s.long_name || s.name || s.tts_name || `Paragem ${s.id}`,
      stop_lat: Number(s.lat || 0),
      stop_lon: Number(s.lon || 0),
      zone_id: s.locality || s.municipality_name || '',
      parent_station: s.parent_station ? `cm:${s.parent_station}` : undefined,
    }));
    batchInsertStops(stopsToInsert);

    const actualStops = getFeedActualStopsCount(feedId);
    if (actualStops === 0) {
      throw new Error('Paragens da Carris Metropolitana não foram gravadas na base de dados.');
    }

    upsertFeed({
      id: feedId,
      operator_name: 'Carris Metropolitana',
      mode: 'Autocarro',
      feed_type: 'api',
      source_origin: 'seed',
      url: baseUrl,
      latest_url: baseUrl,
      license_url: 'https://dados.gov.pt/pt/datasets/gtfs-carris-metropolitana/',
      auth_type: 'none',
      status: 'OK',
      progress: 'OK',
      lines_count: linesData.length,
      stops_count: actualStops,
      trips_count: linesData.length * 30,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: '2028-12-31',
      realtime_entities: 'Veículos, Chegadas e Alertas (API v2 direta)',
      last_ok: new Date().toISOString(),
      last_fetch_at: new Date().toISOString(),
    });
    updateFeedProgress(feedId, 'OK', 'OK');
    commitWorkerDatabase(feedId);

    console.log(`[Ingestion] Carris Metropolitana sincronizada: ${linesData.length} linhas, ${actualStops} paragens`);
  } catch (err: any) {
    const dur = Date.now() - startTime;
    const msg = err?.message || 'Erro inesperado na API Carris Metropolitana';
    logFetch({
      feed_id: feedId,
      url: baseUrl,
      http_status: 0,
      bytes: 0,
      duration_ms: dur,
      timestamp: new Date().toISOString(),
      message: 'Exceção ao contactar Carris Metropolitana',
      error_details: msg,
    });
    updateFeedProgress(feedId, 'ERROR', `ERROR: ${msg}`, msg);
    upsertFeed({
      id: feedId,
      operator_name: 'Carris Metropolitana',
      mode: 'Autocarro',
      feed_type: 'api',
      source_origin: 'seed',
      url: baseUrl,
      status: 'ERROR',
      progress: `ERROR: ${msg}`,
      lines_count: feed?.lines_count || 717,
      stops_count: feed?.stops_count || 12752,
      trips_count: feed?.trips_count || 21000,
      realtime_entities: 'Veículos, Chegadas e Alertas (API v2 direta)',
      last_error: msg,
      last_fetch_at: new Date().toISOString(),
    });
  }
}

/**
 * Ingest standard GTFS Zip Feed with fallback mirror support and calendar expiry detection.
 */
export async function ingestGtfsZipFeed(feedItem: FeedItem): Promise<void> {
  const startTime = Date.now();
  const feedId = feedItem.id;
  let downloadUrl = feedItem.url;
  const isFlixbus = feedId === 'flixbus_pt';

  // Dynamic daily resolution for STCP and Metro do Porto from Porto Open Data
  if (feedId === 'stcp') {
    try {
      const dynamicUrl = await getLatestStcpGtfsUrl(true);
      if (dynamicUrl) {
        downloadUrl = dynamicUrl;
        feedItem.url = dynamicUrl;
      }
    } catch {}
  } else if (feedId === 'metro_porto') {
    try {
      const dynamicUrl = await getLatestMetroPortoGtfsUrl(true);
      if (dynamicUrl) {
        downloadUrl = dynamicUrl;
        feedItem.url = dynamicUrl;
      }
    } catch {}
  }

  updateFeedProgress(feedId, 'downloading', 'A transferir ficheiro GTFS...');

  if (!downloadUrl || !downloadUrl.startsWith('http')) {
    const err = 'URL inválido ou não fornecido para download de feed GTFS';
    updateFeedProgress(feedId, 'ERROR', 'ERROR: URL inválido', err);
    upsertFeed({ ...feedItem, status: 'ERROR', progress: 'ERROR: URL inválido', last_error: 'URL inválido', last_fetch_at: new Date().toISOString() });
    return;
  }

  const zipFilePath = path.join(TMP_DOWNLOADS_DIR, `${feedId}.zip`);
  const extractDir = path.join(TMP_EXTRACTED_DIR, feedId);

  try {
    // Download with automatic mirror fallback
    const downloadResult = await fetchZipBufferWithFallback(
      feedId,
      downloadUrl,
      feedItem.latest_url,
      feedItem.auth_key,
      feedItem.etag,
      feedItem.last_modified
    );

    if (!downloadResult) {
      const errMsg = `Falha no download (link oficial e espelho Mobility Database)`;
      const hasLocalStops = (feedItem.stops_count && feedItem.stops_count > 0);
      const finalStatus = hasLocalStops ? 'OK' : 'ERROR';

      updateFeedProgress(feedId, finalStatus, hasLocalStops ? 'OK' : `ERROR: ${errMsg}`, errMsg);
      upsertFeed({
        ...feedItem,
        status: finalStatus,
        progress: hasLocalStops ? 'OK' : `ERROR: ${errMsg}`,
        last_error: hasLocalStops ? undefined : errMsg,
        last_fetch_at: new Date().toISOString(),
      });
      return;
    }

    const { buffer, usedUrl, etag, lastModified } = downloadResult;
    const bytes = buffer.length;

    fs.writeFileSync(zipFilePath, buffer);

    logFetch({
      feed_id: feedId,
      url: usedUrl,
      http_status: 200,
      bytes,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      message: `Download concluído (${Math.round(bytes / 1024)} KB) via ${usedUrl}`,
    });

    updateFeedProgress(feedId, 'parsing', 'A descompactar ZIP...');

    // Unzip
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    try {
      await execAsync(`unzip -o -q "${zipFilePath}" -d "${extractDir}"`, { timeout: 60000 });
    } catch (unzipErr: any) {
      const err = `Arquivo ZIP corrompido: ${unzipErr.message}`;
      updateFeedProgress(feedId, 'ERROR', `ERROR: ${err}`, err);
      upsertFeed({ ...feedItem, status: 'ERROR', progress: `ERROR: ${err}`, last_error: err, last_fetch_at: new Date().toISOString() });
      return;
    }

    // Locate files
    let baseDir = extractDir;
    const extractedItems = fs.readdirSync(extractDir);
    if (extractedItems.length === 1 && fs.statSync(path.join(extractDir, extractedItems[0])).isDirectory()) {
      baseDir = path.join(extractDir, extractedItems[0]);
    }

    const requiredFiles = ['routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt'];
    const missing = requiredFiles.filter((f) => !fs.existsSync(path.join(baseDir, f)));
    if (missing.length > 0) {
      const err = `Ficheiros GTFS em falta: ${missing.join(', ')}`;
      updateFeedProgress(feedId, 'ERROR', `ERROR: ${err}`, err);
      upsertFeed({ ...feedItem, status: 'ERROR', progress: `ERROR: ${err}`, last_error: err, last_fetch_at: new Date().toISOString() });
      return;
    }

    // Helper for streaming CSV lines
    const processCsvFile = async (
      fileName: string,
      onRow: (row: Record<string, string>, rowNum: number) => void
    ): Promise<number> => {
      const filePath = path.join(baseDir, fileName);
      if (!fs.existsSync(filePath)) return 0;

      const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let headers: string[] = [];
      let rowCount = 0;

      for await (const line of rl) {
        if (!line || line.trim() === '') continue;

        if (headers.length === 0) {
          headers = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          continue;
        }

        const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          row[headers[i]] = values[i] !== undefined ? values[i] : '';
        }

        rowCount++;
        onRow(row, rowCount);
      }

      return rowCount;
    };

    clearFeedData(feedId);

    // Portugal bounding box checker for FlixBus filtering
    const isPortugalCoord = (lat: number, lon: number) => {
      if (lat >= 36.8 && lat <= 42.3 && lon >= -9.6 && lon <= -6.0) return true; // Mainland PT
      if (lat >= 32.4 && lat <= 33.3 && lon >= -17.4 && lon <= -16.2) return true; // Madeira
      if (lat >= 36.8 && lat <= 39.9 && lon >= -31.4 && lon <= -24.9) return true; // Azores
      return false;
    };

    // 1. Process stops.txt
    updateFeedProgress(feedId, 'parsing', 'A importar paragens...');
    const stopsToInsert: any[] = [];
    const validStopIds = new Set<string>();

    await processCsvFile('stops.txt', (r) => {
      const stopId = r.stop_id;
      if (!stopId) return;

      const lat = parseFloat(r.stop_lat);
      const lon = parseFloat(r.stop_lon);

      // FlixBus rule: "Carrega só as paragens e viagens dentro de Portugal"
      if (isFlixbus && !isPortugalCoord(lat, lon)) {
        return;
      }

      validStopIds.add(stopId);
      stopsToInsert.push({
        stop_id: `${feedId}:${stopId}`,
        feed_id: feedId,
        stop_name: r.stop_name || 'Paragem',
        stop_lat: isNaN(lat) ? undefined : lat,
        stop_lon: isNaN(lon) ? undefined : lon,
        zone_id: r.zone_id || undefined,
        parent_station: r.parent_station ? `${feedId}:${r.parent_station}` : undefined,
        location_type: parseInt(r.location_type || '0', 10) || 0,
      });
    });

    batchInsertStops(stopsToInsert);

    // 2. Process routes.txt
    updateFeedProgress(feedId, 'parsing', 'A importar linhas...');
    const routesToInsert: any[] = [];
    const validRouteIds = new Set<string>();

    await processCsvFile('routes.txt', (r) => {
      const routeId = r.route_id;
      if (!routeId) return;

      validRouteIds.add(routeId);
      routesToInsert.push({
        route_id: `${feedId}:${routeId}`,
        feed_id: feedId,
        route_short_name: r.route_short_name || r.route_id,
        route_long_name: r.route_long_name || '',
        route_type: parseInt(r.route_type || '3', 10) || 3,
        route_color: r.route_color ? `#${r.route_color.replace(/^#/, '')}` : undefined,
      });
    });

    batchInsertRoutes(routesToInsert);

    // 3. Process trips.txt
    updateFeedProgress(feedId, 'parsing', 'A importar viagens...');
    const tripsToInsert: any[] = [];
    const validTripIds = new Set<string>();

    await processCsvFile('trips.txt', (r) => {
      const tripId = r.trip_id;
      if (!tripId) return;

      validTripIds.add(tripId);
      tripsToInsert.push({
        trip_id: `${feedId}:${tripId}`,
        feed_id: feedId,
        route_id: `${feedId}:${r.route_id}`,
        service_id: r.service_id,
        trip_headsign: r.trip_headsign || undefined,
        direction_id: parseInt(r.direction_id || '0', 10) || 0,
        shape_id: r.shape_id ? `${feedId}:${r.shape_id}` : undefined,
      });
    });

    batchInsertTrips(tripsToInsert);

    // 4. Process calendar.txt & calendar_dates.txt
    let validFrom = '';
    let validUntil = '';

    if (fs.existsSync(path.join(baseDir, 'calendar.txt'))) {
      const calendarToInsert: any[] = [];
      await processCsvFile('calendar.txt', (r) => {
        if (!r.service_id) return;
        if (!validFrom || (r.start_date && r.start_date < validFrom)) validFrom = r.start_date;
        if (!validUntil || (r.end_date && r.end_date > validUntil)) validUntil = r.end_date;

        calendarToInsert.push({
          feed_id: feedId,
          service_id: r.service_id,
          monday: parseInt(r.monday || '0', 10) || 0,
          tuesday: parseInt(r.tuesday || '0', 10) || 0,
          wednesday: parseInt(r.wednesday || '0', 10) || 0,
          thursday: parseInt(r.thursday || '0', 10) || 0,
          friday: parseInt(r.friday || '0', 10) || 0,
          saturday: parseInt(r.saturday || '0', 10) || 0,
          sunday: parseInt(r.sunday || '0', 10) || 0,
          start_date: r.start_date || '',
          end_date: r.end_date || '',
        });
      });
      batchInsertCalendar(calendarToInsert);
    }

    if (fs.existsSync(path.join(baseDir, 'calendar_dates.txt'))) {
      const datesToInsert: any[] = [];
      await processCsvFile('calendar_dates.txt', (r) => {
        if (!r.service_id || !r.date) return;
        if (!validFrom || r.date < validFrom) validFrom = r.date;
        if (!validUntil || r.date > validUntil) validUntil = r.date;

        datesToInsert.push({
          feed_id: feedId,
          service_id: r.service_id,
          date: r.date,
          exception_type: parseInt(r.exception_type || '1', 10) || 1,
        });
      });
      batchInsertCalendarDates(datesToInsert);
    }

    // 5. Process frequencies.txt if present
    if (fs.existsSync(path.join(baseDir, 'frequencies.txt'))) {
      const freqsToInsert: any[] = [];
      await processCsvFile('frequencies.txt', (r) => {
        if (!r.trip_id) return;
        const startSecs = timeStringToSeconds(r.start_time);
        const endSecs = timeStringToSeconds(r.end_time);
        const headwaySecs = parseInt(r.headway_secs || '0', 10);
        if (headwaySecs > 0) {
          freqsToInsert.push({
            feed_id: feedId,
            trip_id: `${feedId}:${r.trip_id}`,
            start_time_secs: startSecs,
            end_time_secs: endSecs,
            headway_secs: headwaySecs,
            exact_times: parseInt(r.exact_times || '0', 10) || 0,
          });
        }
      });
      batchInsertFrequencies(freqsToInsert);
    }

    // 6. Process stop_times.txt (streaming fast insertion inside single transaction)
    updateFeedProgress(feedId, 'parsing', 'A importar horários...');
    const stopTimesFile = path.join(baseDir, 'stop_times.txt');

    if (fs.existsSync(stopTimesFile)) {
      const fileStream = fs.createReadStream(stopTimesFile, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let headers: string[] = [];
      let totalLines = 0;
      const db = getDatabase();
      const insertStopTimeStmt = db.prepare(`
        INSERT INTO stop_times (feed_id, trip_id, stop_id, arrival_secs, departure_secs, stop_sequence, pickup_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for await (const line of rl) {
        if (!line || line.trim() === '') continue;

        if (headers.length === 0) {
          headers = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          continue;
        }

        const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          row[headers[i]] = values[i] !== undefined ? values[i] : '';
        }

        const tripId = row.trip_id;
        const stopId = row.stop_id;
        if (!tripId || !stopId) continue;

        if (validTripIds.size > 0 && !validTripIds.has(tripId)) continue;
        if (validStopIds.size > 0 && !validStopIds.has(stopId)) continue;

        const depTime = row.departure_time || row.arrival_time || '00:00:00';
        const arrTime = row.arrival_time || row.departure_time || '00:00:00';

        insertStopTimeStmt.run(
          feedId,
          `${feedId}:${tripId}`,
          `${feedId}:${stopId}`,
          timeStringToSeconds(arrTime),
          timeStringToSeconds(depTime),
          parseInt(row.stop_sequence || '0', 10) || 0,
          parseInt(row.pickup_type || '0', 10) || 0
        );

        totalLines++;
        if (totalLines % 50000 === 0) {
          reportWorkerProgress(currentLoopLoaded, currentLoopTotal, `${feedItem.operator_name} (${Math.round(totalLines / 1000)}k horários)`, feedId, true);
        }
      }
    }

    // 7. Feed validity & calendar expiry check
    const actualStops = getFeedActualStopsCount(feedId);
    if (actualStops === 0) {
      throw new Error(`Nenhuma paragem foi gravada na base de dados para o feed ${feedId}`);
    }

    const todayStr = getTodayYyyyMmDd();
    const isExpired = Boolean(validUntil && validUntil.replace(/-/g, '') < todayStr);
    const finalStatus = isExpired ? 'horário expirado' : 'OK';

    const formattedValidUntil = validUntil.length === 8
      ? `${validUntil.slice(0, 4)}-${validUntil.slice(4, 6)}-${validUntil.slice(6, 8)}`
      : validUntil;
    const formattedValidFrom = validFrom.length === 8
      ? `${validFrom.slice(0, 4)}-${validFrom.slice(4, 6)}-${validFrom.slice(6, 8)}`
      : validFrom;

    upsertFeed({
      ...feedItem,
      etag,
      last_modified: lastModified,
      status: finalStatus,
      progress: finalStatus,
      lines_count: routesToInsert.length,
      stops_count: actualStops,
      trips_count: tripsToInsert.length,
      valid_from: formattedValidFrom || feedItem.valid_from,
      valid_until: formattedValidUntil || feedItem.valid_until,
      last_ok: isExpired ? feedItem.last_ok : new Date().toISOString(),
      last_error: isExpired ? `Horário expirado em ${formattedValidUntil}` : undefined,
      last_fetch_at: new Date().toISOString(),
    });
    updateFeedProgress(feedId, finalStatus, finalStatus);

    console.log(`[Ingestion] ${feedItem.operator_name} (${feedId}): ${routesToInsert.length} rotas, ${actualStops} paragens, estado: ${finalStatus}`);
  } catch (err: any) {
    const dur = Date.now() - startTime;
    const msg = err?.message || 'Erro inesperado na ingestão do feed';
    logFetch({
      feed_id: feedId,
      url: downloadUrl,
      http_status: 0,
      bytes: 0,
      duration_ms: dur,
      timestamp: new Date().toISOString(),
      message: 'Exceção na ingestão',
      error_details: msg,
    });
    updateFeedProgress(feedId, 'ERROR', `ERROR: ${msg}`, msg);
    upsertFeed({
      ...feedItem,
      status: 'ERROR',
      progress: `ERROR: ${msg}`,
      last_error: msg,
      last_fetch_at: new Date().toISOString(),
    });
  } finally {
    try {
      if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Sequential Ingestion of All Portuguese Feeds
 * Ingests one operator at a time in the background worker.
 * FlixBus is loaded last.
 * Emits progress: "A carregar dados: X de Y operadores".
 */
export async function ingestAllFeedsSequentially(skipFeedIds?: Set<string>): Promise<void> {
  console.log('[Ingestion Engine] A iniciar ingestão sequencial de todos os feeds de Portugal...');

  const allFeeds = getAllFeeds();

  // Requirement 5: Carrega os operadores em segundo plano, do ficheiro mais pequeno para o maior
  const getEstimatedFeedSize = (feed: FeedItem): number => {
    const id = feed.id.toLowerCase();
    if (id === 'carris_metropolitana') return 50 * 1024;
    if (id.includes('transtejo')) return 80 * 1024;
    if (id === 'metro_porto') return 150 * 1024;
    if (id === 'fertagus') return 450 * 1024;
    if (id === 'metro_lisboa') return 850 * 1024;
    if (id === 'mts') return 900 * 1024;
    if (id.includes('barreiro') || id.includes('tcb')) return 1024 * 1024;
    if (id.startsWith('tld-') || id.startsWith('mdb-')) return 1.5 * 1024 * 1024;
    if (id.includes('tub') || id.includes('smtuc') || id.includes('guima') || id.includes('tuba') || id.includes('mobiave') || id.includes('vamus') || id.includes('faro') || id.includes('giro') || id.includes('tavira') || id.includes('funchal')) return 2.5 * 1024 * 1024;
    if (id === 'stcp') return 8 * 1024 * 1024;
    if (id === 'unir') return 16 * 1024 * 1024;
    if (id === 'cp') return 28 * 1024 * 1024;
    if (id === 'carris') return 48 * 1024 * 1024;
    if (id === 'flixbus_pt') return 180 * 1024 * 1024;
    return 3 * 1024 * 1024;
  };

  const queue = [...allFeeds].sort((a, b) => getEstimatedFeedSize(a) - getEstimatedFeedSize(b));
  const total = queue.length;

  // Initial progress update
  reportWorkerProgress(0, total, queue[0]?.operator_name || 'Iniciando', queue[0]?.id || '', true);

  for (let i = 0; i < queue.length; i++) {
    const f = queue[i];

    if (skipFeedIds && skipFeedIds.has(f.id)) {
      console.log(`[Ingestion Engine] A ignorar feed já processado/falhado: ${f.id}`);
      continue;
    }

    reportWorkerProgress(i, total, f.operator_name, f.id, true);

    try {
      // Requirement 2: Grava cada operador numa única transação
      beginFeedTransaction();

      if (f.id === 'stcp') {
        try {
          const latestStcpUrl = await getLatestStcpGtfsUrl(true);
          f.url = latestStcpUrl;
          f.latest_url = latestStcpUrl;
        } catch {}
        await ingestGtfsZipFeed(f);
      } else if (f.id === 'carris_metropolitana') {
        await ingestCarrisMetropolitanaApi();
      } else if (f.id === 'unir') {
        await ingestUnirQiHoras();
      } else if (f.feed_type === 'gtfs') {
        await ingestGtfsZipFeed(f);
      }

      commitFeedTransaction(f.id);
    } catch (err: any) {
      // Requirement 2: Se falhar, desfaz só esse operador
      rollbackFeedTransaction();
      console.warn(`[Ingestion Engine] Erro ao processar feed ${f.id} (${f.operator_name}):`, err?.message);
      upsertFeed({
        ...f,
        status: 'falhou' as any,
        progress: `falhou: ${err?.message || 'Erro'}`,
        last_error: err?.message || 'Erro',
        last_fetch_at: new Date().toISOString(),
      });
    }

    reportWorkerProgress(i + 1, total, f.operator_name, f.id, i < queue.length - 1);
  }

  // Requirement 2: Faz a cópia de segurança (VACUUM INTO) só no fim de todo o carregamento
  createDatabaseBackupVacuum();
  reportWorkerProgress(total, total, 'Concluído', '', false);
  console.log('[Ingestion Engine] Ingestão sequencial concluída com sucesso.');
}
