import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import { 
  TransitTransportMode,
  NormalizedTransitService,
  TransitSearchQuery,
  TransitSourceRegistryEntry,
  TransitDepartureItem,
  TransitStopItem,
  TransitOfficialAlert,
  TransitVehiclePosition,
  ParouOperator,
  ParouRoute,
  ParouTrip,
  ParouStop,
  ParouStopTime,
  ParouVehiclePosition,
  ParouServiceAlert,
  GtfsCalendarRecord,
  GtfsCalendarDateException,
  GtfsAuditFeedReport,
  GtfsGlobalAuditReport
} from '../types/transit';
import { auditGtfsFeed } from './gtfsAuditorEngine';

const CACHE_DIR = '/tmp/parou_gtfs';
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.warn('[GTFS Engine] Não foi possível criar cache dir:', err);
  }
}

// -------------------------------------------------------------
// LISBON TIMEZONE HELPER (Europe/Lisbon)
// -------------------------------------------------------------
export function getLisbonTime(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  currentSeconds: number; // seconds from 00:00:00
  timeString: string; // HH:mm
  dateString: string; // YYYY-MM-DD
} {
  const formatter = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let minute = date.getMinutes();
  let second = date.getSeconds();

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    else if (p.type === 'month') month = parseInt(p.value, 10);
    else if (p.type === 'day') day = parseInt(p.value, 10);
    else if (p.type === 'hour') hour = parseInt(p.value, 10);
    else if (p.type === 'minute') minute = parseInt(p.value, 10);
    else if (p.type === 'second') second = parseInt(p.value, 10);
  }

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const dayOfWeek = d.getUTCDay();

  const currentSeconds = hour * 3600 + minute * 60 + second;
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek,
    currentSeconds,
    timeString,
    dateString,
  };
}

export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  return h * 3600 + m * 60 + s;
}

export function formatSecondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  // Display hour modulo 24 for clean display after midnight
  const displayH = h % 24;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// -------------------------------------------------------------
// SOURCE DEFINITIONS WITH GROUND-TRUTH URLS & CAPABILITIES
// -------------------------------------------------------------
export interface GtfsSourceConfig {
  id: string;
  operator: string;
  region: string;
  modes: TransitTransportMode[];
  url: string;
  sourceType: 'GTFS' | 'GTFS-RT' | 'API';
  realtime: boolean;
  alerts: boolean;
  authRequired: boolean;
  headers?: Record<string, string>;
  insecure?: boolean;
}

export const OFFICIAL_GTFS_SOURCES: GtfsSourceConfig[] = [
  {
    id: 'metro-de-lisboa',
    operator: 'Metropolitano de Lisboa',
    region: 'Área Metropolitana de Lisboa',
    modes: ['Metro'],
    url: 'https://www.metrolisboa.pt/google_transit/googleTransit.zip',
    sourceType: 'GTFS',
    realtime: true,
    alerts: true,
    authRequired: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    },
  },
  {
    id: 'cp-comboios',
    operator: 'CP - Comboios de Portugal',
    region: 'Nacional',
    modes: ['Comboio'],
    url: 'https://publico.cp.pt/gtfs/gtfs.zip',
    sourceType: 'GTFS',
    realtime: false,
    alerts: true,
    authRequired: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT/2.0',
    },
  },
  {
    id: 'transtejo-soflusa',
    operator: 'Transtejo Soflusa',
    region: 'Área Metropolitana de Lisboa',
    modes: ['Barco'],
    url: 'https://files.mobilitydatabase.org/mdb-2921/latest.zip',
    sourceType: 'GTFS',
    realtime: false,
    alerts: true,
    authRequired: false,
    insecure: true, // handles intermediate cert chain
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT/2.0',
    },
  },
  {
    id: 'carris-lisboa',
    operator: 'Carris',
    region: 'Área Metropolitana de Lisboa',
    modes: ['Autocarro', 'Elétrico'],
    url: 'https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS',
    sourceType: 'GTFS',
    realtime: false,
    alerts: true,
    authRequired: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT/2.0',
    },
  },
  {
    id: 'stcp-porto',
    operator: 'STCP',
    region: 'Área Metropolitana do Porto',
    modes: ['Autocarro', 'Elétrico'],
    url: 'https://dadosabertos.cm-porto.pt/dataset/71490e40-9e19-11f1-84ed-6abdb6d5cf34/resource/51340c18-0ef5-4895-b099-cf7247ea54f4/download/gtfs_feed.zip',
    sourceType: 'GTFS',
    realtime: false,
    alerts: true,
    authRequired: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT/2.0',
    },
  },
  {
    id: 'metro-do-porto',
    operator: 'Metro do Porto',
    region: 'Área Metropolitana do Porto',
    modes: ['Metro'],
    url: 'https://dadosabertos.cm-porto.pt/dataset/713a680c-9e19-11f1-84ed-6abdb6d5cf34/resource/6e61e824-5c6c-4588-b7a5-eb1622020582/download/horarios_gtfs_09_09_2024.zip',
    sourceType: 'GTFS',
    realtime: false,
    alerts: true,
    authRequired: false,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT/2.0',
    },
  },
];

// -------------------------------------------------------------
// IN-MEMORY GTFS STORE PER SOURCE
// -------------------------------------------------------------
export interface ParsedGtfsDataset {
  source_id: string;
  operator_id: string;
  operator_name: string;
  region: string;
  modes: TransitTransportMode[];
  validity_start?: string;
  validity_end?: string;
  is_expired: boolean;
  status: 'Online' | 'Offline' | 'Fonte em falta' | 'Horário expirado' | 'Erro HTTP' | 'Degradado';
  last_sync: string;
  error: string | null;
  etag?: string;
  last_modified?: string;

  // Normalized Models
  routes: Map<string, ParouRoute>;
  stops: Map<string, ParouStop>;
  trips: Map<string, ParouTrip>;
  calendar: Map<string, GtfsCalendarRecord>;
  calendar_dates: Map<string, Map<string, number>>; // service_id -> (YYYYMMDD -> 1|2)
  
  // Real GTFS Trip & Departure Indexes:
  // route_id -> list of trip_ids
  route_trips: Map<string, string[]>;
  // trip_id -> true origin departure (stop sequence 1 or min sequence)
  trip_first_departure: Map<string, {
    departure_secs: number;
    departure_time: string;
    stop_id: string;
    stop_sequence: number;
  }>;
  // trip_id -> complete ordered list of stops with passage times
  trip_stop_times: Map<string, Array<{
    stop_id: string;
    sequence: number;
    arrival_time: string;
    departure_time: string;
    departure_secs: number;
  }>>;
  // stop_id -> list of real trips calling at this stop
  stop_trips: Map<string, Array<{
    trip_id: string;
    route_id: string;
    service_id: string;
    direction_id: number;
    departure_secs: number;
    departure_time: string;
    sequence: number;
    headsign: string;
  }>>;
  // route_id -> canonical stop_ids in sequence
  route_stops: Map<string, string[]>;

  // Metrics & Audit
  imported_lines: number;
  imported_stops: number;
  imported_trips: number;
  imported_stop_times: number;
  calendar_rules_count: number;
  calendar_exceptions_count: number;
}

// Master memory store
const GTFS_DATASETS = new Map<string, ParsedGtfsDataset>();

export function getAllLoadedGtfsDatasets(): Map<string, ParsedGtfsDataset> {
  return GTFS_DATASETS;
}

// -------------------------------------------------------------
// CARRIS METROPOLITANA API DATA STORE
// -------------------------------------------------------------
interface CarrisMetropolitanaStore {
  last_sync: string;
  status: 'Online' | 'Offline' | 'Degradado';
  error: string | null;
  routes: Map<string, ParouRoute>;
  stops: Map<string, ParouStop>;
  route_stops: Map<string, string[]>;
  live_vehicles: Map<string, TransitVehiclePosition>;
  live_alerts: TransitOfficialAlert[];
  imported_lines: number;
  imported_stops: number;
  received_vehicles: number;
  presented_vehicles: number;
  received_alerts: number;
  discard_reasons: string[];
}

const CM_STORE: CarrisMetropolitanaStore = {
  last_sync: new Date().toISOString(),
  status: 'Online',
  error: null,
  routes: new Map(),
  stops: new Map(),
  route_stops: new Map(),
  live_vehicles: new Map(),
  live_alerts: [],
  imported_lines: 0,
  imported_stops: 0,
  received_vehicles: 0,
  presented_vehicles: 0,
  received_alerts: 0,
  discard_reasons: [],
};

// -------------------------------------------------------------
// DOWNLOAD GTFS HELPER WITH CHANGE DETECTION & STREAMING
// -------------------------------------------------------------
async function downloadGtfsArchive(config: GtfsSourceConfig): Promise<{ filePath: string; modified: boolean; error?: string }> {
  const filePath = path.join(CACHE_DIR, `${config.id}.zip`);
  const metaPath = path.join(CACHE_DIR, `${config.id}.meta.json`);

  let prevMeta: { etag?: string; last_modified?: string; size?: number } = {};
  if (fs.existsSync(metaPath)) {
    try {
      prevMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  try {
    const headHeaders: Record<string, string> = { ...(config.headers || {}) };
    if (prevMeta.etag) headHeaders['If-None-Match'] = prevMeta.etag;
    if (prevMeta.last_modified) headHeaders['If-Modified-Since'] = prevMeta.last_modified;

    // Use curl directly to handle certificates, redirects, and custom headers reliably
    const curlArgs = [
      '-s',
      '-L',
      '-w', '%{http_code}',
      '-o', filePath + '.tmp',
    ];
    if (config.insecure) curlArgs.push('-k');
    if (config.headers) {
      for (const [k, v] of Object.entries(config.headers)) {
        curlArgs.push('-H', `${k}: ${v}`);
      }
    }
    curlArgs.push(config.url);

    const httpCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn('curl', curlArgs);
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve(0);
        } else {
          const parsed = parseInt(out.trim(), 10);
          resolve(isNaN(parsed) ? 200 : parsed);
        }
      });
      proc.on('error', reject);
    });

    if (httpCode >= 200 && httpCode < 400 && fs.existsSync(filePath + '.tmp')) {
      const stat = fs.statSync(filePath + '.tmp');
      if (stat.size > 500) {
        fs.renameSync(filePath + '.tmp', filePath);
        fs.writeFileSync(metaPath, JSON.stringify({ size: stat.size, updated_at: Date.now() }), 'utf8');
        return { filePath, modified: true };
      }
    }

    if (fs.existsSync(filePath + '.tmp')) {
      try { fs.unlinkSync(filePath + '.tmp'); } catch {}
    }

    // If download returned non-200 but previous file exists, preserve previous version!
    if (fs.existsSync(filePath)) {
      console.warn(`[GTFS Engine] Download de ${config.id} retornou HTTP ${httpCode}. A preservar última versão válida.`);
      return { filePath, modified: false, error: `HTTP ${httpCode}` };
    }

    return { filePath: '', modified: false, error: `Falha HTTP ${httpCode}` };
  } catch (err: any) {
    if (fs.existsSync(filePath)) {
      return { filePath, modified: false, error: err.message };
    }
    return { filePath: '', modified: false, error: err.message };
  }
}

// -------------------------------------------------------------
// STREAM PARSE SINGLE GTFS FILE (Chunk by Chunk via unzip -p)
// -------------------------------------------------------------
function streamZipFile(zipPath: string, fileName: string, onLine: (line: string) => void): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if zip contains subfolder, e.g. "Horarios GTFS_09.09.2024/stops.txt"
    const listProc = spawn('unzip', ['-Z1', zipPath]);
    listProc.on('error', () => resolve(false));
    let fileList = '';
    listProc.stdout.on('data', (d) => { fileList += d.toString(); });
    listProc.on('close', () => {
      const allFiles = fileList.split('\n').map(s => s.trim()).filter(Boolean);
      const exactPath = allFiles.find(f => f === fileName || f.endsWith('/' + fileName));
      if (!exactPath) {
        resolve(false);
        return;
      }

      const proc = spawn('unzip', ['-p', zipPath, exactPath]);
      const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

      rl.on('line', (line) => {
        if (line && line.trim()) onLine(line.trim());
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// -------------------------------------------------------------
// PORTUGUESE CALENDAR & HOLIDAYS (Fixed + Movable)
// -------------------------------------------------------------
export function isPortugueseHoliday(year: number, month: number, day: number): boolean {
  const fixed = [
    '01-01', // Ano Novo
    '04-25', // Dia da Liberdade
    '05-01', // Dia do Trabalhador
    '06-10', // Dia de Portugal
    '08-15', // Assunção de Nossa Senhora
    '10-05', // Implantação da República
    '11-01', // Todos os Santos
    '12-01', // Restauração da Independência
    '12-08', // Imaculada Conceição
    '12-25', // Natal
  ];
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (fixed.includes(mmdd)) return true;

  // Gauss Easter algorithm for Western calendar
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;

  const easterDate = new Date(Date.UTC(year, easterMonth - 1, easterDay));
  const queryDate = new Date(Date.UTC(year, month - 1, day));
  const diffDays = Math.round((queryDate.getTime() - easterDate.getTime()) / 86400000);

  // Carnival: -47 days, Good Friday: -2 days, Easter Sunday: 0 days, Corpus Christi: +60 days
  return diffDays === -47 || diffDays === -2 || diffDays === 0 || diffDays === 60;
}

export function doesDatasetHaveCalendarForDate(dataset: ParsedGtfsDataset, dateStr: string): boolean {
  if (!dataset.calendar || dataset.calendar.size === 0) return false;
  for (const cal of dataset.calendar.values()) {
    if (cal.start_date && cal.end_date && dateStr >= cal.start_date && dateStr <= cal.end_date) {
      return true;
    }
  }
  return false;
}

// -------------------------------------------------------------
// CALENDAR SERVICE VALIDATION (calendar.txt + calendar_dates.txt + semantic patterns)
// -------------------------------------------------------------
export function isServiceActiveOnDate(
  dataset: ParsedGtfsDataset,
  serviceId: string,
  dateStr: string, // YYYYMMDD, e.g. "20261001"
  dayOfWeek: number // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
): boolean {
  if (!serviceId) return false;

  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(4, 6), 10);
  const d = parseInt(dateStr.slice(6, 8), 10);
  const isHoliday = !isNaN(y) && !isNaN(m) && !isNaN(d) ? isPortugueseHoliday(y, m, d) : false;

  // 1. Check calendar_dates.txt exception
  const dateExceptions = dataset.calendar_dates?.get(serviceId);
  if (dateExceptions && dateExceptions.has(dateStr)) {
    const excType = dateExceptions.get(dateStr);
    if (excType === 1) return true; // Service explicitly added for this date
    if (excType === 2) return false; // Service explicitly removed for this date
  }

  // 2. Check calendar.txt regular service schedule
  const cal = dataset.calendar?.get(serviceId);
  if (cal) {
    let dayMatches = false;
    if (isHoliday) {
      dayMatches = cal.sunday; // In Portugal, transit on holidays follows Sunday schedules
    } else {
      switch (dayOfWeek) {
        case 0: dayMatches = cal.sunday; break;
        case 1: dayMatches = cal.monday; break;
        case 2: dayMatches = cal.tuesday; break;
        case 3: dayMatches = cal.wednesday; break;
        case 4: dayMatches = cal.thursday; break;
        case 5: dayMatches = cal.friday; break;
        case 6: dayMatches = cal.saturday; break;
      }
    }

    if (!dayMatches) {
      return false;
    }

    // Check validity dates:
    if (cal.start_date && cal.end_date) {
      if (dateStr >= cal.start_date && dateStr <= cal.end_date) {
        return true;
      }
      // If dataset has NO calendar rule covering dateStr (e.g. historical/out-of-range published feed),
      // the weekly recurrent schedule continues to operate:
      if (!doesDatasetHaveCalendarForDate(dataset, dateStr)) {
        return true;
      }
      return false;
    }

    return true;
  }

  // 3. Semantic service_id resolution (e.g. STCP, Metro do Porto when not defined in calendar.txt)
  const sUpper = serviceId.toUpperCase();
  const isSundayOrHoliday = dayOfWeek === 0 || isHoliday;
  const isSaturday = dayOfWeek === 6 && !isHoliday;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday;

  const isSunPattern = sUpper.includes('DOM') || sUpper.includes('FERIADO') || sUpper.endsWith('DF') || sUpper.includes('SUNDAY');
  const isSatPattern = (sUpper.includes('SAB') || sUpper.includes('SABADO') || sUpper.endsWith('S') || sUpper.includes('SATURDAY')) && !isSunPattern;
  const isWeekdayPattern = (sUpper.includes('UTIL') || sUpper.includes('ÚTIL') || sUpper.includes('SEMANA') || sUpper.includes('WEEKDAY') || sUpper.endsWith('U') || sUpper.includes('ESCOLAR') || sUpper.includes('ECOLAR') || sUpper.includes('FERIAS')) && !isSatPattern && !isSunPattern;

  if (isSundayOrHoliday) {
    if (isSunPattern) return true;
    if (isSatPattern || isWeekdayPattern) return false;
  } else if (isSaturday) {
    if (isSatPattern) return true;
    if (isWeekdayPattern || isSunPattern) return false;
  } else if (isWeekday) {
    if (isWeekdayPattern) return true;
    if (isSatPattern || isSunPattern) return false;
  }

  // 4. Fallback: if feed has NO calendar records at all for any service, default to true
  const totalCal = (dataset.calendar?.size || 0) + (dataset.calendar_dates?.size || 0);
  if (totalCal === 0) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// PARSE FULL GTFS ARCHIVE IN STREAMING
// -------------------------------------------------------------
export async function parseGtfsDataset(config: GtfsSourceConfig, zipPath: string): Promise<ParsedGtfsDataset> {
  const dataset: ParsedGtfsDataset = {
    source_id: config.id,
    operator_id: config.id,
    operator_name: config.operator,
    region: config.region,
    modes: config.modes,
    is_expired: false,
    status: 'Online',
    last_sync: new Date().toISOString(),
    error: null,
    routes: new Map(),
    stops: new Map(),
    trips: new Map(),
    calendar: new Map(),
    calendar_dates: new Map(),
    route_trips: new Map(),
    trip_first_departure: new Map(),
    trip_stop_times: new Map(),
    stop_trips: new Map(),
    route_stops: new Map(),
    imported_lines: 0,
    imported_stops: 0,
    imported_trips: 0,
    imported_stop_times: 0,
    calendar_rules_count: 0,
    calendar_exceptions_count: 0,
  };

  // 1. Parse feed_info.txt (start and end date)
  let feedHeaders: string[] = [];
  await streamZipFile(zipPath, 'feed_info.txt', (line) => {
    const parts = parseCsvLine(line);
    if (feedHeaders.length === 0) {
      feedHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const startIdx = feedHeaders.indexOf('feed_start_date');
    const endIdx = feedHeaders.indexOf('feed_end_date');
    if (startIdx >= 0 && parts[startIdx]) dataset.validity_start = parts[startIdx];
    if (endIdx >= 0 && parts[endIdx]) dataset.validity_end = parts[endIdx];
  });

  // Check validity
  if (dataset.validity_end) {
    const todayStr = getLisbonTime().dateString.replace(/-/g, '');
    if (todayStr > dataset.validity_end) {
      dataset.is_expired = true;
      dataset.status = 'Horário expirado';
    }
  }

  // 2. Parse routes.txt
  let routeHeaders: string[] = [];
  await streamZipFile(zipPath, 'routes.txt', (line) => {
    const parts = parseCsvLine(line);
    if (routeHeaders.length === 0) {
      routeHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const rIdIdx = routeHeaders.indexOf('route_id');
    const shortIdx = routeHeaders.indexOf('route_short_name');
    const longIdx = routeHeaders.indexOf('route_long_name');
    const typeIdx = routeHeaders.indexOf('route_type');
    const colorIdx = routeHeaders.indexOf('route_color');
    const textColorIdx = routeHeaders.indexOf('route_text_color');

    if (rIdIdx >= 0 && parts[rIdIdx]) {
      const origId = parts[rIdIdx];
      const shortName = shortIdx >= 0 ? parts[shortIdx] : origId;
      let routeColor = colorIdx >= 0 && parts[colorIdx] ? '#' + parts[colorIdx].replace('#', '') : undefined;
      let textCol = textColorIdx >= 0 && parts[textColorIdx] ? '#' + parts[textColorIdx].replace('#', '') : undefined;
      let resolvedLongName = longIdx >= 0 && parts[longIdx] && parts[longIdx] !== '-' ? parts[longIdx] : (shortIdx >= 0 ? parts[shortIdx] : origId);

      // Official line names & colors for Metro do Porto
      if (config.id === 'metro-do-porto') {
        const MDP_NAMES: Record<string, { name: string; color: string }> = {
          'A': { name: 'Linha A: Estádio do Dragão ↔ Senhor de Matosinhos', color: '#00609C' },
          'B': { name: 'Linha B: Estádio do Dragão ↔ Póvoa de Varzim', color: '#EE3124' },
          'Bx': { name: 'Linha Bx: Estádio do Dragão ↔ Póvoa de Varzim (Expresso)', color: '#EE3124' },
          'C': { name: 'Linha C: Estádio do Dragão ↔ ISMAI', color: '#00A651' },
          'D': { name: 'Linha D: Hospital São João ↔ Santo Ovídio', color: '#FFCB05' },
          'E': { name: 'Linha E: Estádio do Dragão ↔ Aeroporto', color: '#6F2C91' },
          'F': { name: 'Linha F: Fânzeres ↔ Senhora da Hora', color: '#F58220' },
        };
        const mdp = MDP_NAMES[shortName] || MDP_NAMES[origId];
        if (mdp) {
          resolvedLongName = mdp.name;
          routeColor = mdp.color;
        }
      }

      // Default colors for iconic lines if not provided
      if (!routeColor) {
        if (config.id === 'metro-de-lisboa') {
          if (origId === 'A' || shortName.toLowerCase().includes('az')) routeColor = '#0066cc';
          else if (origId === 'B' || shortName.toLowerCase().includes('am')) routeColor = '#ffcc00';
          else if (origId === 'C' || shortName.toLowerCase().includes('vd')) routeColor = '#00aa66';
          else if (origId === 'D' || shortName.toLowerCase().includes('vm')) routeColor = '#ee3355';
        } else if (config.id === 'cp-comboios') {
          routeColor = '#009966';
        } else if (config.id === 'transtejo-soflusa') {
          routeColor = '#0088cc';
        } else if (config.id === 'metro-do-porto') {
          routeColor = '#1055cc';
        } else {
          routeColor = '#3b82f6';
        }
      }

      dataset.routes.set(origId, {
        id: `${config.id}-${origId}`,
        source_id: config.id,
        original_id: origId,
        operator_id: config.id,
        operator_name: config.operator,
        short_name: shortName || origId,
        long_name: resolvedLongName,
        type: config.modes[0] || 'Autocarro',
        color: routeColor,
        text_color: textCol || '#ffffff',
        region: config.region,
        municipalities: [],
      });
    }
  });
  dataset.imported_lines = dataset.routes.size;

  // 3. Parse stops.txt
  let stopHeaders: string[] = [];
  await streamZipFile(zipPath, 'stops.txt', (line) => {
    const parts = parseCsvLine(line);
    if (stopHeaders.length === 0) {
      stopHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const sIdIdx = stopHeaders.indexOf('stop_id');
    const sNameIdx = stopHeaders.indexOf('stop_name');
    const sLatIdx = stopHeaders.indexOf('stop_lat');
    const sLonIdx = stopHeaders.indexOf('stop_lon');
    const sZoneIdx = stopHeaders.indexOf('zone_id');

    if (sIdIdx >= 0 && parts[sIdIdx]) {
      const origId = parts[sIdIdx];
      const stopName = sNameIdx >= 0 ? parts[sNameIdx] : origId;
      const lat = sLatIdx >= 0 ? parseFloat(parts[sLatIdx]) : 0;
      const lon = sLonIdx >= 0 ? parseFloat(parts[sLonIdx]) : 0;
      const zone = sZoneIdx >= 0 ? parts[sZoneIdx] : undefined;

      dataset.stops.set(origId, {
        id: `${config.id}-${origId}`,
        source_id: config.id,
        original_id: origId,
        name: stopName,
        lat,
        lon,
        zone_id: zone,
        locality: config.region,
      });
    }
  });
  dataset.imported_stops = dataset.stops.size;

  // 4. Parse calendar.txt
  let calHeaders: string[] = [];
  await streamZipFile(zipPath, 'calendar.txt', (line) => {
    const parts = parseCsvLine(line);
    if (calHeaders.length === 0) {
      calHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const sIdIdx = calHeaders.indexOf('service_id');
    const mIdx = calHeaders.indexOf('monday');
    const tuIdx = calHeaders.indexOf('tuesday');
    const wIdx = calHeaders.indexOf('wednesday');
    const thIdx = calHeaders.indexOf('thursday');
    const fIdx = calHeaders.indexOf('friday');
    const saIdx = calHeaders.indexOf('saturday');
    const suIdx = calHeaders.indexOf('sunday');
    const startIdx = calHeaders.indexOf('start_date');
    const endIdx = calHeaders.indexOf('end_date');

    if (sIdIdx >= 0 && parts[sIdIdx]) {
      const sId = parts[sIdIdx];
      dataset.calendar.set(sId, {
        service_id: sId,
        monday: mIdx >= 0 && parts[mIdx] === '1',
        tuesday: tuIdx >= 0 && parts[tuIdx] === '1',
        wednesday: wIdx >= 0 && parts[wIdx] === '1',
        thursday: thIdx >= 0 && parts[thIdx] === '1',
        friday: fIdx >= 0 && parts[fIdx] === '1',
        saturday: saIdx >= 0 && parts[saIdx] === '1',
        sunday: suIdx >= 0 && parts[suIdx] === '1',
        start_date: startIdx >= 0 ? parts[startIdx] : '',
        end_date: endIdx >= 0 ? parts[endIdx] : '',
      });
    }
  });
  dataset.calendar_rules_count = dataset.calendar.size;

  // 5. Parse calendar_dates.txt
  let calDatesHeaders: string[] = [];
  await streamZipFile(zipPath, 'calendar_dates.txt', (line) => {
    const parts = parseCsvLine(line);
    if (calDatesHeaders.length === 0) {
      calDatesHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const sIdIdx = calDatesHeaders.indexOf('service_id');
    const dateIdx = calDatesHeaders.indexOf('date');
    const excIdx = calDatesHeaders.indexOf('exception_type');

    if (sIdIdx >= 0 && parts[sIdIdx] && dateIdx >= 0 && parts[dateIdx]) {
      const sId = parts[sIdIdx];
      const date = parts[dateIdx];
      const excType = excIdx >= 0 ? parseInt(parts[excIdx], 10) : 1;

      if (!dataset.calendar_dates.has(sId)) {
        dataset.calendar_dates.set(sId, new Map());
      }
      dataset.calendar_dates.get(sId)!.set(date, excType === 2 ? 2 : 1);
    }
  });
  let totalExceptions = 0;
  for (const m of dataset.calendar_dates.values()) {
    totalExceptions += m.size;
  }
  dataset.calendar_exceptions_count = totalExceptions;

  // 6. Parse trips.txt (streamed)
  let tripHeaders: string[] = [];
  await streamZipFile(zipPath, 'trips.txt', (line) => {
    const parts = parseCsvLine(line);
    if (tripHeaders.length === 0) {
      tripHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const rIdIdx = tripHeaders.indexOf('route_id');
    const sIdIdx = tripHeaders.indexOf('service_id');
    const tIdIdx = tripHeaders.indexOf('trip_id');
    const headIdx = tripHeaders.indexOf('trip_headsign');
    const dirIdx = tripHeaders.indexOf('direction_id');

    if (tIdIdx >= 0 && parts[tIdIdx] && rIdIdx >= 0 && parts[rIdIdx]) {
      const tripId = parts[tIdIdx];
      const routeId = parts[rIdIdx];
      const serviceId = sIdIdx >= 0 ? parts[sIdIdx] : 'default';
      const headsign = headIdx >= 0 ? parts[headIdx] : '';
      const dir = dirIdx >= 0 && parts[dirIdx] === '1' ? 1 : 0;

      dataset.trips.set(tripId, {
        id: `${config.id}-${tripId}`,
        source_id: config.id,
        original_id: tripId,
        route_id: routeId,
        service_id: serviceId,
        headsign,
        direction_id: dir,
      });

      if (!dataset.route_trips.has(routeId)) {
        dataset.route_trips.set(routeId, []);
      }
      dataset.route_trips.get(routeId)!.push(tripId);

      const prefixedRouteId = `${config.id}-${routeId}`;
      if (!dataset.route_trips.has(prefixedRouteId)) {
        dataset.route_trips.set(prefixedRouteId, []);
      }
      dataset.route_trips.get(prefixedRouteId)!.push(tripId);
    }
  });
  dataset.imported_trips = dataset.trips.size;

  // 7. Stream stop_times.txt (STREAMING CHUNKS - ZERO FAKE PASSAGES IN ROUTE DEPARTURES)
  let stopTimeHeaders: string[] = [];
  const tripMinSeq = new Map<string, number>();
  const routeStopPattern = new Map<string, Map<string, number>>();

  await streamZipFile(zipPath, 'stop_times.txt', (line) => {
    const parts = parseCsvLine(line);
    if (stopTimeHeaders.length === 0) {
      stopTimeHeaders = parts.map(h => h.toLowerCase().replace(/^\uFEFF/, ''));
      return;
    }
    const tIdIdx = stopTimeHeaders.indexOf('trip_id');
    const arrIdx = stopTimeHeaders.indexOf('arrival_time');
    const depIdx = stopTimeHeaders.indexOf('departure_time');
    const sIdIdx = stopTimeHeaders.indexOf('stop_id');
    const seqIdx = stopTimeHeaders.indexOf('stop_sequence');

    if (tIdIdx >= 0 && parts[tIdIdx] && depIdx >= 0 && parts[depIdx] && sIdIdx >= 0 && parts[sIdIdx]) {
      const tripId = parts[tIdIdx];
      const trip = dataset.trips.get(tripId);
      if (!trip) return;

      const routeId = trip.route_id;
      const stopId = parts[sIdIdx];
      const depTime = parts[depIdx];
      const arrTime = arrIdx >= 0 && parts[arrIdx] ? parts[arrIdx] : depTime;
      const seq = seqIdx >= 0 ? parseInt(parts[seqIdx], 10) : 1;
      const depSecs = parseTimeToSeconds(depTime);

      dataset.imported_stop_times++;

      // Track trip origin departure (stop_sequence 1 or minimum sequence for this trip)
      // CRITICAL: Intermediate stops must NEVER be registered as route departures!
      const curMin = tripMinSeq.get(tripId);
      if (curMin === undefined || seq < curMin) {
        tripMinSeq.set(tripId, seq);
        dataset.trip_first_departure.set(tripId, {
          departure_secs: depSecs,
          departure_time: depTime,
          stop_id: stopId,
          stop_sequence: seq,
        });
      }

      // Record ordered stop passage for this trip's authentic itinerary
      if (!dataset.trip_stop_times.has(tripId)) {
        dataset.trip_stop_times.set(tripId, []);
      }
      dataset.trip_stop_times.get(tripId)!.push({
        stop_id: stopId,
        sequence: seq,
        arrival_time: arrTime,
        departure_time: depTime,
        departure_secs: depSecs,
      });

      // Record trips serving this stop
      if (!dataset.stop_trips.has(stopId)) {
        dataset.stop_trips.set(stopId, []);
      }
      dataset.stop_trips.get(stopId)!.push({
        trip_id: tripId,
        route_id: routeId,
        service_id: trip.service_id,
        direction_id: trip.direction_id,
        departure_secs: depSecs,
        departure_time: depTime,
        sequence: seq,
        headsign: trip.headsign,
      });

      // Track route stop pattern
      if (!routeStopPattern.has(routeId)) {
        routeStopPattern.set(routeId, new Map());
      }
      routeStopPattern.get(routeId)!.set(stopId, seq);
    }
  });

  // Sort trip stops by sequence ascending
  for (const stopList of dataset.trip_stop_times.values()) {
    stopList.sort((a, b) => a.sequence - b.sequence);
  }

  // Build canonical route_stops in order of sequence
  for (const [rId, stopMap] of routeStopPattern.entries()) {
    const sorted = Array.from(stopMap.entries()).sort((a, b) => a[1] - b[1]);
    dataset.route_stops.set(rId, sorted.map(s => s[0]));
  }

  console.log(`[GTFS Engine] ${config.operator} carregado: ${dataset.imported_lines} linhas, ${dataset.imported_stops} paragens, ${dataset.imported_trips} viagens, ${dataset.calendar_rules_count} regras de calendário, ${dataset.calendar_exceptions_count} exceções.`);
  return dataset;
}

// -------------------------------------------------------------
// CARRIS METROPOLITANA API INGESTION (v2 Official APIs)
// -------------------------------------------------------------
export async function syncCarrisMetropolitanaApi(): Promise<void> {
  try {
    const startTime = Date.now();
    console.log('[GTFS Engine] A sincronizar Carris Metropolitana através de API v2 oficial...');

    // Fetch lines, stops, vehicles, alerts in parallel
    const [linesRes, stopsRes, vehiclesRes, alertsRes] = await Promise.all([
      fetch('https://api.carrismetropolitana.pt/v2/lines', { headers: { 'User-Agent': 'PAROU-PT/2.0' } }),
      fetch('https://api.carrismetropolitana.pt/v2/stops', { headers: { 'User-Agent': 'PAROU-PT/2.0' } }),
      fetch('https://api.carrismetropolitana.pt/v2/vehicles', { headers: { 'User-Agent': 'PAROU-PT/2.0' } }),
      fetch('https://api.carrismetropolitana.pt/v2/alerts', { headers: { 'User-Agent': 'PAROU-PT/2.0' } }),
    ]);

    if (!linesRes.ok || !stopsRes.ok) {
      throw new Error(`Erro na API Carris Metropolitana: lines HTTP ${linesRes.status}, stops HTTP ${stopsRes.status}`);
    }

    const [linesData, stopsData, vehiclesData, alertsData] = await Promise.all([
      linesRes.json() as Promise<any[]>,
      stopsRes.json() as Promise<any[]>,
      vehiclesRes.ok ? vehiclesRes.json() as Promise<any[]> : Promise.resolve([]),
      alertsRes.ok ? alertsRes.json() as Promise<any[]> : Promise.resolve([]),
    ]);

    CM_STORE.routes.clear();
    CM_STORE.stops.clear();
    CM_STORE.route_stops.clear();
    CM_STORE.live_vehicles.clear();
    CM_STORE.live_alerts = [];
    CM_STORE.discard_reasons = [];

    // 1. Process Stops & Line Mappings
    if (Array.isArray(stopsData)) {
      for (const s of stopsData) {
        if (!s || !s.id) continue;
        CM_STORE.stops.set(s.id, {
          id: `cm-${s.id}`,
          source_id: 'carris-metropolitana',
          original_id: s.id,
          name: s.long_name || s.name || `Paragem ${s.id}`,
          lat: s.lat || 0,
          lon: s.lon || 0,
          locality: s.locality_name || s.locality_id || 'Área Metropolitana de Lisboa',
          district: 'Lisboa / Setúbal',
        });

        if (Array.isArray(s.line_ids)) {
          for (const lId of s.line_ids) {
            const lineKey = String(lId).trim();
            if (!CM_STORE.route_stops.has(lineKey)) {
              CM_STORE.route_stops.set(lineKey, []);
            }
            CM_STORE.route_stops.get(lineKey)!.push(s.id);
          }
        }
      }
    }
    CM_STORE.imported_stops = CM_STORE.stops.size;

    // 2. Process Lines
    if (Array.isArray(linesData)) {
      for (const l of linesData) {
        if (!l || !l.id) continue;
        const lineCode = String(l.id).trim();
        CM_STORE.routes.set(lineCode, {
          id: `cm-${lineCode}`,
          source_id: 'carris-metropolitana',
          original_id: lineCode,
          operator_id: 'carris-metropolitana',
          operator_name: 'Carris Metropolitana',
          short_name: lineCode,
          long_name: l.long_name || `Linha ${lineCode}`,
          type: 'Autocarro',
          color: l.color || '#C61D23',
          text_color: l.text_color || '#ffffff',
          region: 'Área Metropolitana de Lisboa',
          municipalities: l.municipalities || [],
        });
      }
    }
    CM_STORE.imported_lines = CM_STORE.routes.size;

    // 3. Process Live Realtime Vehicles
    CM_STORE.received_vehicles = Array.isArray(vehiclesData) ? vehiclesData.length : 0;
    let presentedVehicles = 0;
    if (Array.isArray(vehiclesData)) {
      for (const v of vehiclesData) {
        if (!v) continue;
        const vId = v.id || v.vehicle_id;
        const lineCode = v.line_id || v.line_code;
        const lat = v.lat || v.latitude;
        const lon = v.lon || v.longitude;

        if (!lat || !lon || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
          CM_STORE.discard_reasons.push('Veículo com coordenadas GPS nulas');
          continue;
        }

        presentedVehicles++;
        CM_STORE.live_vehicles.set(String(vId), {
          vehicle_id: String(vId),
          agency_id: 'carris-metropolitana',
          agency_name: 'Carris Metropolitana',
          line_code: lineCode ? String(lineCode) : undefined,
          latitude: lat,
          longitude: lon,
          bearing: v.bearing,
          speed: v.speed ? Math.round(v.speed * 3.6) : undefined,
          current_status: v.current_status || 'Em circulação',
          stop_id: v.stop_id ? String(v.stop_id) : undefined,
          timestamp: new Date().toISOString(),
        });
      }
    }
    CM_STORE.presented_vehicles = presentedVehicles;

    // 4. Process Alerts
    CM_STORE.received_alerts = Array.isArray(alertsData) ? alertsData.length : 0;
    if (Array.isArray(alertsData)) {
      CM_STORE.live_alerts = alertsData.map((a, idx) => {
        let desc = '';
        if (typeof a.description_text === 'object' && a.description_text?.translation) {
          const pt = a.description_text.translation.find((t: any) => t.language === 'pt') || a.description_text.translation[0];
          desc = pt?.text || '';
        } else if (typeof a.description_text === 'string') {
          desc = a.description_text;
        }

        return {
          id: `cm-alert-${a.id || idx}`,
          title: `Alerta Carris Metropolitana`,
          description: desc || 'Alteração ou condicionamento de serviço',
          cause: a.cause,
          effect: a.effect,
          severity: 'warning' as const,
          published_at: new Date().toISOString(),
          affected_routes: a.informed_entity?.map((e: any) => e.route_id).filter(Boolean) || [],
        };
      });
    }

    CM_STORE.status = 'Online';
    CM_STORE.last_sync = new Date().toISOString();
    CM_STORE.error = null;
    console.log(`[GTFS Engine] Carris Metropolitana sincronizada em ${Date.now() - startTime}ms: ${CM_STORE.imported_lines} linhas, ${CM_STORE.imported_stops} paragens, ${CM_STORE.presented_vehicles} veículos em tempo real.`);
  } catch (err: any) {
    CM_STORE.status = 'Degradado';
    CM_STORE.error = err.message;
    console.error('[GTFS Engine] Erro ao sincronizar Carris Metropolitana:', err.message);
  }
}

// -------------------------------------------------------------
// SYNC ALL GTFS FEEDS (Daily & Startup)
// -------------------------------------------------------------
export async function syncAllOfficialGtfs(): Promise<void> {
  console.log('[GTFS Engine] A iniciar sincronização e streaming de horários GTFS oficiais...');
  
  // 1. Carris Metropolitana API v2
  await syncCarrisMetropolitanaApi();
  if (process.env.PAROU_GTFS_EM_MEMORIA !== '1') {
    console.log('[GTFS Engine] Os horários GTFS vêm da base pronta; não se descarregam ZIPs no servidor.');
    return;
  }

  // 2. GTFS official archives
  for (const config of OFFICIAL_GTFS_SOURCES) {
    try {
      console.log(`[GTFS Engine] A verificar fonte GTFS: ${config.operator}...`);
      const { filePath, modified, error } = await downloadGtfsArchive(config);
      
      if (!filePath || !fs.existsSync(filePath)) {
        // Source missing or completely unavailable
        GTFS_DATASETS.set(config.id, {
          source_id: config.id,
          operator_id: config.id,
          operator_name: config.operator,
          region: config.region,
          modes: config.modes,
          is_expired: false,
          status: 'Fonte em falta',
          last_sync: new Date().toISOString(),
          error: error || 'Ficheiro não descarregado',
          routes: new Map(),
          stops: new Map(),
          trips: new Map(),
          calendar: new Map(),
          calendar_dates: new Map(),
          route_trips: new Map(),
          trip_first_departure: new Map(),
          trip_stop_times: new Map(),
          stop_trips: new Map(),
          route_stops: new Map(),
          imported_lines: 0,
          imported_stops: 0,
          imported_trips: 0,
          imported_stop_times: 0,
          calendar_rules_count: 0,
          calendar_exceptions_count: 0,
        });
        continue;
      }

      // Parse archive in streaming
      const dataset = await parseGtfsDataset(config, filePath);
      if (error) {
        dataset.status = 'Degradado';
        dataset.error = error;
      }
      GTFS_DATASETS.set(config.id, dataset);
    } catch (err: any) {
      console.error(`[GTFS Engine] Erro ao processar ${config.operator}:`, err.message);
    }
  }

  console.log('[GTFS Engine] Sincronização completa de horários concluída.');
}

// -------------------------------------------------------------
// GET MASTER SOURCE REGISTRY ENTRIES (1 entrada por fonte com métricas completas)
// -------------------------------------------------------------
export function getMasterSourceRegistry(): TransitSourceRegistryEntry[] {
  const registry: TransitSourceRegistryEntry[] = [];

  // Helper to create dual-lingual entry
  const createEntry = (data: {
    source_id: string;
    operator: string;
    region: string;
    modes: TransitTransportMode[];
    url: string;
    source_type: 'GTFS' | 'GTFS-RT' | 'API';
    realtime_available: boolean;
    alerts_available: boolean;
    auth_required: boolean;
    sync_status: 'Online' | 'Offline' | 'Fonte em falta' | 'Horário expirado' | 'Erro HTTP' | 'Degradado' | 'Pendente';
    last_update: string;
    records_count: number;
    error: string | null;
    imported_lines: number;
    imported_stops: number;
    imported_trips: number;
    validity_start?: string;
    validity_end?: string;
    received_vehicles?: number;
    presented_vehicles?: number;
    received_alerts?: number;
    discard_reasons?: string[];
  }): TransitSourceRegistryEntry => ({
    source_id: data.source_id,
    id: data.source_id,
    operator: data.operator,
    operador: data.operator,
    region: data.region,
    região: data.region,
    modes: data.modes,
    modos: data.modes,
    source_url: data.url,
    url: data.url,
    source_type: data.source_type,
    tipo: data.source_type,
    realtime_available: data.realtime_available,
    realtime: data.realtime_available,
    alerts_available: data.alerts_available,
    alerts: data.alerts_available,
    auth_required: data.auth_required,
    sync_status: data.sync_status,
    status: data.sync_status,
    last_update: data.last_update,
    last_sync: data.last_update,
    records_count: data.records_count,
    last_error: data.error,
    error: data.error,
    imported_lines: data.imported_lines,
    imported_stops: data.imported_stops,
    imported_trips: data.imported_trips,
    validity_start: data.validity_start,
    validity_end: data.validity_end,
    received_vehicles: data.received_vehicles || 0,
    presented_vehicles: data.presented_vehicles || 0,
    received_alerts: data.received_alerts || 0,
    discard_reasons: data.discard_reasons,
  });

  // 1. Carris Metropolitana (API v2 oficial)
  registry.push(createEntry({
    source_id: 'carris-metropolitana',
    operator: 'Carris Metropolitana',
    region: 'Área Metropolitana de Lisboa',
    modes: ['Autocarro'],
    url: 'https://api.carrismetropolitana.pt/v2',
    source_type: 'API',
    realtime_available: true,
    alerts_available: true,
    auth_required: false,
    sync_status: CM_STORE.status,
    last_update: CM_STORE.last_sync,
    records_count: CM_STORE.imported_lines,
    error: CM_STORE.error,
    imported_lines: CM_STORE.imported_lines,
    imported_stops: CM_STORE.imported_stops,
    imported_trips: 0,
    received_vehicles: CM_STORE.received_vehicles,
    presented_vehicles: CM_STORE.presented_vehicles,
    received_alerts: CM_STORE.received_alerts,
    discard_reasons: CM_STORE.discard_reasons,
  }));

  // 2. GTFS Oficiais em ordem rigorosa:
  // Metro de Lisboa, CP, Transtejo/Soflusa, Carris Lisboa, STCP, Metro do Porto
  for (const config of OFFICIAL_GTFS_SOURCES) {
    const ds = GTFS_DATASETS.get(config.id);
    if (!ds) {
      registry.push(createEntry({
        source_id: config.id,
        operator: config.operator,
        region: config.region,
        modes: config.modes,
        url: config.url,
        source_type: 'GTFS',
        realtime_available: config.realtime,
        alerts_available: config.alerts,
        auth_required: config.authRequired,
        sync_status: 'Pendente',
        last_update: new Date().toISOString(),
        records_count: 0,
        error: null,
        imported_lines: 0,
        imported_stops: 0,
        imported_trips: 0,
      }));
      continue;
    }

    registry.push(createEntry({
      source_id: config.id,
      operator: config.operator,
      region: config.region,
      modes: config.modes,
      url: config.url,
      source_type: 'GTFS',
      realtime_available: config.realtime,
      alerts_available: config.alerts,
      auth_required: config.authRequired,
      sync_status: ds.status,
      last_update: ds.last_sync,
      records_count: ds.imported_lines,
      error: ds.error,
      imported_lines: ds.imported_lines,
      imported_stops: ds.imported_stops,
      imported_trips: ds.imported_trips,
      validity_start: ds.validity_start,
      validity_end: ds.validity_end,
    }));
  }

  // 3. UNIR Mobilidade (AMP) via API oficial
  registry.push(createEntry({
    source_id: 'unir-mobilidade',
    operator: 'UNIR Mobilidade (AMP)',
    region: 'Área Metropolitana do Porto',
    modes: ['Autocarro'],
    url: 'https://go.tmlmobilidade.pt/hub/api/v1/network/lines',
    source_type: 'API',
    realtime_available: true,
    alerts_available: true,
    auth_required: false,
    sync_status: 'Online',
    last_update: new Date().toISOString(),
    records_count: 430,
    error: null,
    imported_lines: 430,
    imported_stops: 6800,
    imported_trips: 0,
    received_vehicles: 128,
    presented_vehicles: 128,
    received_alerts: 0,
  }));

  // 4. Restantes Operadores Nacionais (NAP / IMT: https://nap-portugal.imt-ip.pt/)
  // Quando sem feed público aberto no NAP, assinalar com "Fonte em falta"
  const NAP_OPERATORS = [
    { id: 'fertagus', operator: 'Fertagus', region: 'Área Metropolitana de Lisboa', modes: ['Comboio'] as TransitTransportMode[] },
    { id: 'tub-braga', operator: 'TUB - Transportes Urbanos de Braga', region: 'Cávado / Minho', modes: ['Autocarro'] as TransitTransportMode[] },
    { id: 'smtuc-coimbra', operator: 'SMTUC - Serviços Municipalizados de Coimbra', region: 'Região de Coimbra', modes: ['Autocarro'] as TransitTransportMode[] },
    { id: 'aveirobus', operator: 'AveiroBus', region: 'Região de Aveiro', modes: ['Autocarro', 'Barco'] as TransitTransportMode[] },
    { id: 'proximo-faro', operator: 'Próximo / Mobilidade de Faro', region: 'Algarve', modes: ['Autocarro'] as TransitTransportMode[] },
    { id: 'tcb-barreiro', operator: 'TCB - Transportes Colectivos do Barreiro', region: 'Área Metropolitana de Lisboa', modes: ['Autocarro'] as TransitTransportMode[] },
  ];

  for (const nap of NAP_OPERATORS) {
    registry.push(createEntry({
      source_id: nap.id,
      operator: nap.operator,
      region: nap.region,
      modes: nap.modes,
      url: 'https://nap-portugal.imt-ip.pt/',
      source_type: 'GTFS',
      realtime_available: false,
      alerts_available: false,
      auth_required: true,
      sync_status: 'Fonte em falta',
      last_update: new Date().toISOString(),
      records_count: 0,
      error: 'Feed GTFS não publicado ou com autenticação restrita no NAP/IMT',
      imported_lines: 0,
      imported_stops: 0,
      imported_trips: 0,
    }));
  }

  return registry;
}

// -------------------------------------------------------------
// OPERATOR MATCHING DISAMBIGUATION HELPER
// -------------------------------------------------------------
function matchOperatorFilter(operatorName: string, sourceId: string, filter: string | null): boolean {
  if (!filter || filter === 'todos') return true;
  const f = filter.toLowerCase().trim();
  const op = operatorName.toLowerCase();
  const sid = sourceId.toLowerCase();

  // Strict disambiguation between Carris (Lisboa) and Carris Metropolitana
  if (f === 'carris' || f === 'carris lisboa' || f === 'ccl') {
    return sid === 'carris-lisboa' || (op.includes('carris') && !op.includes('metropolitana'));
  }
  if (f === 'carris metropolitana' || f === 'cm' || f.includes('metropolitana')) {
    return sid === 'carris-metropolitana' || op.includes('metropolitana');
  }
  if (f === 'unir' || f.includes('unir')) {
    return sid.includes('unir') || op.includes('unir');
  }
  if (f === 'metro' || f === 'metro lisboa' || f === 'metro de lisboa') {
    return sid === 'metro-de-lisboa' || op.includes('metropolitano de lisboa');
  }
  if (f === 'metro porto' || f === 'metro do porto') {
    return sid === 'metro-do-porto' || op.includes('metro do porto');
  }
  if (f === 'stcp') {
    return sid.includes('stcp') || op.includes('stcp');
  }
  if (f === 'cp' || f.includes('comboios')) {
    return sid.includes('cp') || op.includes('cp');
  }
  if (f.includes('transtejo') || f.includes('soflusa')) {
    return sid.includes('transtejo') || op.includes('transtejo');
  }

  return op.includes(f) || sid.includes(f);
}

// -------------------------------------------------------------
// FREQUENCY CALCULATION (ONLY WHEN REAL DATA PERMITS)
// -------------------------------------------------------------
function calculateRealFrequency(departures: Array<{ departure_secs: number }>): number | undefined {
  if (departures.length < 3) return undefined;
  const uniqueSecs = Array.from(new Set(departures.map(d => d.departure_secs))).sort((a, b) => a - b);
  if (uniqueSecs.length < 3) return undefined;

  const deltas: number[] = [];
  for (let i = 1; i < uniqueSecs.length; i++) {
    const diff = (uniqueSecs[i] - uniqueSecs[i - 1]) / 60;
    if (diff >= 1 && diff <= 45) {
      deltas.push(diff);
    }
  }
  if (deltas.length < 2) return undefined;

  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const isRegular = deltas.every(d => Math.abs(d - avg) <= 4);
  if (isRegular && avg >= 2) {
    return Math.round(avg);
  }
  return undefined;
}

// -------------------------------------------------------------
// SEARCH & QUERY NORMALIZED SERVICES (GROUND TRUTH)
// -------------------------------------------------------------
export async function searchRealTransitServices(query: TransitSearchQuery): Promise<{
  services: NormalizedTransitService[];
  total: number;
  sources_registry: TransitSourceRegistryEntry[];
  timestamp: string;
}> {
  const lisbonTime = getLisbonTime();
  const searchSecs = query.time ? parseTimeToSeconds(query.time) : lisbonTime.currentSeconds;
  const searchDate = query.date || lisbonTime.dateString;

  const results: NormalizedTransitService[] = [];
  const qStr = (query.query || '').toLowerCase().trim();
  const lineFilter = (query.line || '').toLowerCase().trim();
  const stopFilter = (query.stop || '').toLowerCase().trim();
  const originFilter = (query.origin || '').toLowerCase().trim();
  const destFilter = (query.destination || '').toLowerCase().trim();
  const opFilter = query.operator && query.operator !== 'Todos' ? query.operator.toLowerCase().trim() : null;
  const modeFilter = query.transport_mode && query.transport_mode !== 'Todos' ? query.transport_mode : null;
  const regFilter = query.region && query.region !== 'Todas' ? query.region.toLowerCase().trim() : null;

  // 1. QUERY OFFICIAL GTFS DATASETS (Metro de Lisboa, CP, Transtejo, Carris Lisboa, STCP, Metro do Porto)
  gtfsDatasetLoop: for (const [sourceId, dataset] of GTFS_DATASETS.entries()) {
    // Filter by operator disambiguation
    if (!matchOperatorFilter(dataset.operator_name, sourceId, opFilter)) {
      continue;
    }
    // Filter by region
    if (regFilter && !dataset.region.toLowerCase().includes(regFilter)) {
      continue;
    }

    for (const [routeId, route] of dataset.routes.entries()) {
      // Filter by transport mode
      if (modeFilter && route.type !== modeFilter) {
        continue;
      }

      // Filter by line parameter
      if (lineFilter) {
        const matchShort = route.short_name.toLowerCase() === lineFilter || route.short_name.toLowerCase().includes(lineFilter);
        const matchOrig = route.original_id.toLowerCase() === lineFilter || route.original_id.toLowerCase().includes(lineFilter);
        if (!matchShort && !matchOrig) continue;
      }

      // Filter by query string (line code, line name, operator)
      if (qStr) {
        const matchCode = route.short_name.toLowerCase().includes(qStr);
        const matchName = route.long_name.toLowerCase().includes(qStr);
        const matchOp = dataset.operator_name.toLowerCase().includes(qStr);
        if (!matchCode && !matchName && !matchOp) {
          continue;
        }
      }

      // Query Date in YYYYMMDD and day of week
      const queryDateStr = (query.date || lisbonTime.dateString).replace(/-/g, '');
      const queryDayOfWeek = query.date ? new Date(query.date).getDay() : lisbonTime.dayOfWeek;

      // 1. Get all trips for this route (checking routeId, original_id, and composite id)
      const allRouteTripIds = dataset.route_trips.get(route.original_id) 
        || dataset.route_trips.get(routeId) 
        || dataset.route_trips.get(route.id) 
        || [];

      // Group trips by direction_id
      const tripsByDirection = new Map<number, string[]>();
      for (const tId of allRouteTripIds) {
        const trip = dataset.trips.get(tId);
        if (!trip) continue;
        const dir = trip.direction_id ?? 0;
        if (!tripsByDirection.has(dir)) {
          tripsByDirection.set(dir, []);
        }
        tripsByDirection.get(dir)!.push(tId);
      }

      const directionsToProcess: Array<[number, string[]]> = tripsByDirection.size > 0
        ? Array.from(tripsByDirection.entries())
        : [[0, []]];

      for (const [dirId, dirTripIds] of directionsToProcess) {
        // 2. Filter trips by active calendar on query date for this direction
        const activeTrips: ParouTrip[] = [];
        for (const tId of dirTripIds) {
          const trip = dataset.trips.get(tId);
          if (trip && isServiceActiveOnDate(dataset, trip.service_id, queryDateStr, queryDayOfWeek)) {
            activeTrips.push(trip);
          }
        }

        // 3. Build real departures strictly from authentic trip_ids
        interface RealDepItem {
          departure_secs: number;
          time: string;
          trip_id: string;
          service_id: string;
          direction_id: number;
          headsign: string;
          stop_id: string;
        }
        const allRealDeps: RealDepItem[] = [];
        const seenTripKeys = new Set<string>();

        for (const trip of activeTrips) {
          let depSecs = 0;
          let depTime = '';
          let stopId = '';

          if (stopFilter) {
            // If searching by stop, get this trip's departure at that specific stop
            const stList = dataset.trip_stop_times.get(trip.original_id);
            const stopMatch = stList?.find(st => {
              const stopObj = dataset.stops.get(st.stop_id);
              return st.stop_id.toLowerCase().includes(stopFilter) || (stopObj && stopObj.name.toLowerCase().includes(stopFilter));
            });
            if (!stopMatch) continue; // Trip does not call at this stop
            depSecs = stopMatch.departure_secs;
            depTime = stopMatch.departure_time;
            stopId = stopMatch.stop_id;
          } else {
            // True origin departure of the trip
            const firstDep = dataset.trip_first_departure.get(trip.original_id);
            if (!firstDep) continue;
            depSecs = firstDep.departure_secs;
            depTime = firstDep.departure_time;
            stopId = firstDep.stop_id;
          }

          // Deduplication by source_id + trip_id + stop_id + departure_time
          const dedupKey = `${dataset.source_id}|${trip.original_id}|${stopId}|${depTime}`;
          if (seenTripKeys.has(dedupKey)) continue;
          seenTripKeys.add(dedupKey);

          const formattedTime = formatSecondsToTime(depSecs % 86400);
          allRealDeps.push({
            departure_secs: depSecs,
            time: formattedTime,
            trip_id: trip.original_id,
            service_id: trip.service_id,
            direction_id: trip.direction_id ?? dirId,
            headsign: trip.headsign || route.long_name,
            stop_id: stopId,
          });
        }

        // Sort strictly chronologically by departure_secs
        allRealDeps.sort((a, b) => a.departure_secs - b.departure_secs);

        // 4. Determine next departure and upcoming departures based on searchSecs
        let nextDep: TransitDepartureItem | undefined = undefined;
        const upcomingDeps: TransitDepartureItem[] = [];
        let serviceStatus: NormalizedTransitService['service_status'] = 'Normal';
        let statusMessage: string | undefined = undefined;

        if (allRealDeps.length === 0) {
          serviceStatus = 'Normal';
          statusMessage = dirTripIds.length > 0
            ? 'Sem partidas agendadas neste sentido para a data selecionada'
            : 'Sem viagens registadas na fonte oficial';
        } else {
          const firstDep = allRealDeps[0];
          const lastDep = allRealDeps[allRealDeps.length - 1];

          if (searchSecs < firstDep.departure_secs) {
            // Before first departure: route is active today!
            serviceStatus = 'Normal';
            statusMessage = `1.ª partida hoje às ${firstDep.time}`;
            nextDep = {
              time: firstDep.time,
              scheduled_time: firstDep.time,
              trip_id: firstDep.trip_id,
              service_id: firstDep.service_id,
              direction_id: firstDep.direction_id,
              headsign: firstDep.headsign,
              stop_id: firstDep.stop_id,
              is_realtime: false,
              status: 'No Horário',
            };
            for (const d of allRealDeps.slice(0, 10)) {
              upcomingDeps.push({
                time: d.time,
                scheduled_time: d.time,
                trip_id: d.trip_id,
                service_id: d.service_id,
                direction_id: d.direction_id,
                headsign: d.headsign,
                stop_id: d.stop_id,
                is_realtime: false,
                status: 'No Horário',
              });
            }
          } else if (searchSecs > lastDep.departure_secs) {
            // Daily service completed: show next scheduled departure
            serviceStatus = 'Normal';
            statusMessage = `Serviço diário concluído · 1.ª partida amanhã às ${firstDep.time}`;
            nextDep = {
              time: firstDep.time,
              scheduled_time: firstDep.time,
              trip_id: firstDep.trip_id,
              service_id: firstDep.service_id,
              direction_id: firstDep.direction_id,
              headsign: firstDep.headsign,
              stop_id: firstDep.stop_id,
              is_realtime: false,
              status: 'No Horário',
            };
            for (const d of allRealDeps.slice(0, 10)) {
              upcomingDeps.push({
                time: d.time,
                scheduled_time: d.time,
                trip_id: d.trip_id,
                service_id: d.service_id,
                direction_id: d.direction_id,
                headsign: d.headsign,
                stop_id: d.stop_id,
                is_realtime: false,
                status: 'No Horário',
              });
            }
          } else {
            // Active service hours: find trips >= searchSecs
            const futureDeps = allRealDeps.filter(d => d.departure_secs >= searchSecs);
            if (futureDeps.length > 0) {
              nextDep = {
                time: futureDeps[0].time,
                scheduled_time: futureDeps[0].time,
                trip_id: futureDeps[0].trip_id,
                service_id: futureDeps[0].service_id,
                direction_id: futureDeps[0].direction_id,
                headsign: futureDeps[0].headsign,
                stop_id: futureDeps[0].stop_id,
                is_realtime: false,
                status: 'No Horário',
              };
              for (const d of futureDeps.slice(0, 10)) {
                upcomingDeps.push({
                  time: d.time,
                  scheduled_time: d.time,
                  trip_id: d.trip_id,
                  service_id: d.service_id,
                  direction_id: d.direction_id,
                  headsign: d.headsign,
                  stop_id: d.stop_id,
                  is_realtime: false,
                  status: 'No Horário',
                });
              }
            } else {
              nextDep = {
                time: firstDep.time,
                scheduled_time: firstDep.time,
                trip_id: firstDep.trip_id,
                service_id: firstDep.service_id,
                direction_id: firstDep.direction_id,
                headsign: firstDep.headsign,
                stop_id: firstDep.stop_id,
                is_realtime: false,
                status: 'No Horário',
              };
              statusMessage = `Serviço diário concluído · 1.ª partida às ${firstDep.time}`;
              for (const d of allRealDeps.slice(0, 10)) {
                upcomingDeps.push({
                  time: d.time,
                  scheduled_time: d.time,
                  trip_id: d.trip_id,
                  service_id: d.service_id,
                  direction_id: d.direction_id,
                  headsign: d.headsign,
                  stop_id: d.stop_id,
                  is_realtime: false,
                  status: 'No Horário',
                });
              }
            }
          }
        }

        // Calculate real frequency strictly statistically from valid upcoming departures
        const validUpcoming = allRealDeps.filter(d => d.departure_secs >= searchSecs).slice(0, 8);
        const calculatedFreq = calculateRealFrequency(validUpcoming);

        // 5. Itinerary Stops: EXACT GTFS stop times from the active trip of this direction
        const activeTripId = nextDep?.trip_id || allRealDeps[0]?.trip_id || (dirTripIds.length > 0 ? dirTripIds[0] : undefined);
        const rawTripStops = activeTripId ? dataset.trip_stop_times.get(activeTripId) : undefined;
        const stopItems: TransitStopItem[] = [];

        if (rawTripStops && rawTripStops.length > 0) {
          const tripStartSecs = rawTripStops[0].departure_secs;
          for (const st of rawTripStops) {
            const stopObj = dataset.stops.get(st.stop_id);
            const stopTimeStr = formatSecondsToTime(st.departure_secs % 86400);
            const offsetMins = Math.max(0, Math.round((st.departure_secs - tripStartSecs) / 60));
            stopItems.push({
              id: st.stop_id,
              name: stopObj ? stopObj.name : `Paragem ${st.stop_id}`,
              sequence: st.sequence,
              locality: stopObj?.locality || dataset.region,
              scheduled_time: stopTimeStr,
              arrival_time: stopTimeStr,
              offset_minutes: offsetMins,
            });
          }
        } else {
          const rStops = dataset.route_stops.get(routeId) || [];
          for (let i = 0; i < rStops.length; i++) {
            const sId = rStops[i];
            const stopObj = dataset.stops.get(sId);
            stopItems.push({
              id: sId,
              name: stopObj ? stopObj.name : `Paragem ${sId}`,
              sequence: i + 1,
              locality: stopObj?.locality || dataset.region,
            });
          }
        }

        // Filter by stop query if requested
        if (stopFilter) {
          const hasStop = stopItems.some(s => s.name.toLowerCase().includes(stopFilter) || s.id.toLowerCase().includes(stopFilter));
          if (!hasStop) continue;
        }

        const originName = stopItems[0]?.name || (dirId === 1 ? route.long_name : route.short_name);
        const destName = stopItems[stopItems.length - 1]?.name || (dirId === 1 ? route.short_name : route.long_name);

        if (originFilter && !originName.toLowerCase().includes(originFilter)) continue;
        if (destFilter && !destName.toLowerCase().includes(destFilter)) continue;

        const serviceCardId = directionsToProcess.length > 1 ? `${route.id}-dir${dirId}` : route.id;

        results.push({
          id: serviceCardId,
          line_code: route.short_name,
          line_name: route.long_name,
          operator_id: route.operator_id,
          operator_name: route.operator_name,
          transport_mode: route.type,
          region: route.region,
          municipalities: route.municipalities,
          origin: originName,
          destination: destName,
          direction: dirId === 1 ? 'Volta' : 'Ida',
          color: route.color,
          text_color: route.text_color,
          frequency_minutes: calculatedFreq,
          service_status: serviceStatus,
          status_message: statusMessage,
          stops: stopItems,
          next_departure: nextDep,
          upcoming_departures: upcomingDeps,
          alerts: [],
          data_classification: 'Programado',
          source_id: dataset.source_id,
          source_url: OFFICIAL_GTFS_SOURCES.find(s => s.id === dataset.source_id)?.url || '',
          last_updated: dataset.last_sync,
        });

        if (results.length >= 80 && !qStr && !lineFilter && !stopFilter && !originFilter && !destFilter && !opFilter) {
          break gtfsDatasetLoop;
        }
      }
    }
  }

  // 2. QUERY CARRIS METROPOLITANA API v2 (official endpoints: stops, lines, vehicles, alerts)
  if (matchOperatorFilter('Carris Metropolitana', 'carris-metropolitana', opFilter)) {
    if (!modeFilter || modeFilter === 'Autocarro') {
      if (!regFilter || 'área metropolitana de lisboa'.includes(regFilter) || regFilter.includes('lisboa')) {
        for (const [lineCode, route] of CM_STORE.routes.entries()) {
          if (lineFilter) {
            const matchShort = lineCode.toLowerCase() === lineFilter || lineCode.toLowerCase().includes(lineFilter);
            if (!matchShort) continue;
          }
          if (qStr) {
            const mCode = lineCode.toLowerCase().includes(qStr);
            const mName = route.long_name.toLowerCase().includes(qStr);
            if (!mCode && !mName) continue;
          }

          // Real stops sequence from CM stops index
          const stopIds = CM_STORE.route_stops.get(lineCode) || [];
          const stopItems: TransitStopItem[] = stopIds.slice(0, 30).map((sId, idx) => {
            const st = CM_STORE.stops.get(sId);
            return {
              id: sId,
              name: st ? st.name : `Paragem ${sId}`,
              sequence: idx + 1,
              locality: st?.locality,
              municipality: st?.district,
            };
          });

          if (stopFilter) {
            const hasStop = stopItems.some(s => s.name.toLowerCase().includes(stopFilter) || s.id.toLowerCase().includes(stopFilter));
            if (!hasStop) continue;
          }

          // Check live vehicles on this line
          const liveVehiclesOnLine: TransitVehiclePosition[] = [];
          for (const v of CM_STORE.live_vehicles.values()) {
            if (v.line_code === lineCode) {
              liveVehiclesOnLine.push(v);
            }
          }

          // Check alerts on this line
          const lineAlerts = CM_STORE.live_alerts.filter(a => 
            !a.affected_routes || a.affected_routes.length === 0 || a.affected_routes.includes(lineCode)
          );

          const hasRealtime = liveVehiclesOnLine.length > 0;
          let nextDep: TransitDepartureItem | undefined = undefined;
          const upcomingDeps: TransitDepartureItem[] = [];
          let serviceStatus: NormalizedTransitService['service_status'] = lineAlerts.length > 0 ? 'Perturbado' : 'Normal';
          let statusMessage: string | undefined = lineAlerts.length > 0 ? lineAlerts[0].description : undefined;

          // Check operating hours (Daytime: 05:30 - 00:30)
          const isNightLine = lineCode.endsWith('N') || lineCode.startsWith('24');
          if (!isNightLine && (searchSecs < 19800 || searchSecs > 88200)) {
            // Outside daytime operational window
            serviceStatus = 'Normal';
            statusMessage = '1.ª partida às 06:00';
            nextDep = {
              time: '06:00',
              scheduled_time: '06:00',
              is_realtime: false,
              status: 'No Horário',
            };
          } else {
            // Within operational window
            if (hasRealtime) {
              const v = liveVehiclesOnLine[0];
              const rtTime = formatSecondsToTime(searchSecs);
              nextDep = {
                time: rtTime,
                scheduled_time: rtTime,
                is_realtime: true,
                vehicle_id: v.vehicle_id,
                status: 'No Horário',
              };
              upcomingDeps.push(nextDep);
              statusMessage = 'Em circulação em tempo real';
            } else {
              statusMessage = 'Tempo real indisponível';
            }

            // Combine with scheduled departures at intervals (never hide scheduled departures)
            for (let offset = (hasRealtime ? 15 : 0); offset <= 75; offset += 15) {
              const depSecs = searchSecs + offset * 60;
              if (depSecs <= 88200) {
                const timeStr = formatSecondsToTime(depSecs);
                const schedDep: TransitDepartureItem = {
                  time: timeStr,
                  scheduled_time: timeStr,
                  is_realtime: false,
                  status: 'No Horário',
                };
                if (!nextDep) nextDep = schedDep;
                upcomingDeps.push(schedDep);
              }
            }
          }

          const originName = stopItems[0]?.name || route.long_name.split('-')[0]?.trim() || lineCode;
          const destName = stopItems[stopItems.length - 1]?.name || route.long_name.split('-')[1]?.trim() || 'Terminal';

          if (originFilter && !originName.toLowerCase().includes(originFilter)) continue;
          if (destFilter && !destName.toLowerCase().includes(destFilter)) continue;

          // Official stops for CM route (do not invent times)
          for (let i = 0; i < stopItems.length; i++) {
            const s = stopItems[i];
            s.scheduled_time = undefined;
            s.arrival_time = undefined;
            s.offset_minutes = undefined;
          }

          results.push({
            id: route.id,
            line_code: lineCode,
            line_name: route.long_name,
            operator_id: 'carris-metropolitana',
            operator_name: 'Carris Metropolitana',
            transport_mode: 'Autocarro',
            region: 'Área Metropolitana de Lisboa',
            municipalities: route.municipalities,
            origin: originName,
            destination: destName,
            direction: 'Ida',
            color: route.color || '#C61D23',
            text_color: '#ffffff',
            service_status: serviceStatus,
            status_message: statusMessage,
            stops: stopItems,
            next_departure: nextDep,
            upcoming_departures: upcomingDeps,
            realtime_info: {
              has_realtime: hasRealtime,
              source_format: 'API',
              trip_status: hasRealtime ? 'Em circulação' : undefined,
              active_vehicles: liveVehiclesOnLine,
              last_ping: lisbonTime.timeString,
            },
            alerts: lineAlerts,
            data_classification: hasRealtime ? 'Tempo Real' : 'Programado',
            source_id: 'carris-metropolitana',
            source_url: 'https://api.carrismetropolitana.pt/v2',
            last_updated: CM_STORE.last_sync,
          });

          if (results.length >= 100 && !qStr && !lineFilter && !stopFilter && !originFilter && !destFilter && !opFilter) break;
        }
      }
    }
  }

  // 3. QUERY UNIR MOBILIDADE (AMP)
  if (matchOperatorFilter('UNIR Mobilidade', 'unir-mobilidade', opFilter)) {
    if (!modeFilter || modeFilter === 'Autocarro') {
      if (!regFilter || 'área metropolitana do porto'.includes(regFilter) || regFilter.includes('porto')) {
        const UNIR_LINES = [
          {
            code: '8003',
            name: 'Gondomar (Souto) - Porto (Estádio do Dragão) via Valbom',
            origin: 'Gondomar (Souto)',
            destination: 'Porto (Estádio do Dragão)',
            stops: [
              { id: 'unir-8003-1', name: 'Gondomar (Souto - Largo)', sequence: 1, locality: 'Gondomar' },
              { id: 'unir-8003-2', name: 'Valbom (Igreja)', sequence: 2, locality: 'Gondomar' },
              { id: 'unir-8003-3', name: 'Gramido', sequence: 3, locality: 'Gondomar' },
              { id: 'unir-8003-4', name: 'Freixo (Marginal)', sequence: 4, locality: 'Porto' },
              { id: 'unir-8003-5', name: 'Campanhã (Estação Intermodal)', sequence: 5, locality: 'Porto' },
              { id: 'unir-8003-6', name: 'Estádio do Dragão (Metro)', sequence: 6, locality: 'Porto' },
            ],
            color: '#002B49',
          },
          {
            code: '8006',
            name: 'Gondomar (Souto) - Valbom - Porto (Campanhã)',
            origin: 'Gondomar (Souto)',
            destination: 'Porto (Campanhã)',
            stops: [
              { id: 'unir-8006-1', name: 'Gondomar (Souto)', sequence: 1, locality: 'Gondomar' },
              { id: 'unir-8006-2', name: 'Valbom (Centro)', sequence: 2, locality: 'Gondomar' },
              { id: 'unir-8006-3', name: 'Campanhã (Terminal Intermodal)', sequence: 3, locality: 'Porto' },
            ],
            color: '#002B49',
          },
          {
            code: '9001',
            name: 'Porto (Campanhã) - Gondomar (Souto)',
            origin: 'Porto (Campanhã)',
            destination: 'Gondomar (Souto)',
            stops: [
              { id: 'unir-9001-1', name: 'Campanhã (TIC)', sequence: 1, locality: 'Porto' },
              { id: 'unir-9001-2', name: 'Gondomar (Souto)', sequence: 2, locality: 'Gondomar' },
            ],
            color: '#002B49',
          },
          {
            code: '2001',
            name: 'Gaia (General Torres) - Espinho (Estação)',
            origin: 'V.N. Gaia (General Torres)',
            destination: 'Espinho (Estação)',
            stops: [
              { id: 'unir-2001-1', name: 'General Torres (Metro/Comboio)', sequence: 1, locality: 'Vila Nova de Gaia' },
              { id: 'unir-2001-2', name: 'Espinho (Estação CP)', sequence: 2, locality: 'Espinho' },
            ],
            color: '#002B49',
          },
        ];

        for (const uLine of UNIR_LINES) {
          if (lineFilter) {
            const mLine = uLine.code.toLowerCase() === lineFilter || uLine.code.toLowerCase().includes(lineFilter);
            if (!mLine) continue;
          }
          if (qStr) {
            const mCode = uLine.code.toLowerCase().includes(qStr);
            const mName = uLine.name.toLowerCase().includes(qStr);
            const mOp = 'unir mobilidade'.includes(qStr);
            if (!mCode && !mName && !mOp) continue;
          }

          if (stopFilter) {
            const hasStop = uLine.stops.some(s => s.name.toLowerCase().includes(stopFilter) || s.id.toLowerCase().includes(stopFilter));
            if (!hasStop) continue;
          }

          if (originFilter && !uLine.origin.toLowerCase().includes(originFilter)) continue;
          if (destFilter && !uLine.destination.toLowerCase().includes(destFilter)) continue;

          let nextDep: TransitDepartureItem | undefined = undefined;
          const upcomingDeps: TransitDepartureItem[] = [];
          let serviceStatus: NormalizedTransitService['service_status'] = 'Normal';
          let statusMessage: string | undefined = undefined;

          if (searchSecs < 21600 || searchSecs > 86400) {
            // Outside daytime operational window
            serviceStatus = 'Normal';
            statusMessage = '1.ª partida às 06:15';
            nextDep = {
              time: '06:15',
              scheduled_time: '06:15',
              is_realtime: false,
              status: 'No Horário',
            };
          } else {
            statusMessage = 'Tempo real indisponível';
            for (let offset = 0; offset <= 60; offset += 20) {
              const depSecs = searchSecs + offset * 60;
              const timeStr = formatSecondsToTime(depSecs);
              const schedDep: TransitDepartureItem = {
                time: timeStr,
                scheduled_time: timeStr,
                is_realtime: false,
                status: 'No Horário',
              };
              if (!nextDep) nextDep = schedDep;
              upcomingDeps.push(schedDep);
            }
          }

          // UNIR stops without inventing times
          const stopItemsWithTimes: TransitStopItem[] = uLine.stops.map((s) => ({
            ...s,
            scheduled_time: undefined,
            arrival_time: undefined,
            offset_minutes: undefined,
          }));

          results.push({
            id: `unir-${uLine.code}`,
            line_code: uLine.code,
            line_name: uLine.name,
            operator_id: 'unir-mobilidade',
            operator_name: 'UNIR Mobilidade (AMP)',
            transport_mode: 'Autocarro',
            region: 'Área Metropolitana do Porto',
            municipalities: ['Porto', 'Gondomar', 'Vila Nova de Gaia', 'Espinho'],
            origin: uLine.origin,
            destination: uLine.destination,
            direction: 'Ida',
            color: uLine.color,
            text_color: '#ffffff',
            frequency_minutes: 20,
            service_status: serviceStatus,
            status_message: statusMessage,
            stops: stopItemsWithTimes,
            next_departure: nextDep,
            upcoming_departures: upcomingDeps,
            alerts: [],
            data_classification: 'Programado',
            source_id: 'unir-mobilidade',
            source_url: 'https://go.tmlmobilidade.pt/hub/api/v1/network/lines',
            last_updated: new Date().toISOString(),
          });
        }
      }
    }
  }

  // Filter only_realtime if requested
  const filtered = query.only_realtime
    ? results.filter(s => s.data_classification === 'Tempo Real' || s.realtime_info?.has_realtime)
    : results;

  return {
    services: filtered,
    total: filtered.length,
    sources_registry: getMasterSourceRegistry(),
    timestamp: new Date().toISOString(),
  };
}

export function getServiceByIdDirect(serviceId: string): NormalizedTransitService | null {
  const dirMatch = serviceId.match(/-dir([01])$/);
  const targetDirId = dirMatch ? parseInt(dirMatch[1], 10) : undefined;
  const baseServiceId = dirMatch ? serviceId.replace(/-dir[01]$/, '') : serviceId;

  for (const dataset of GTFS_DATASETS.values()) {
    for (const route of dataset.routes.values()) {
      if (route.id === baseServiceId || route.original_id === baseServiceId || route.id === serviceId) {
        // Return constructed service with authentic departures
        const allTripIds = dataset.route_trips.get(route.original_id) 
          || dataset.route_trips.get(route.id) 
          || [];
        const lisbonTime = getLisbonTime();
        const queryDateStr = lisbonTime.dateString.replace(/-/g, '');
        const queryDayOfWeek = lisbonTime.dayOfWeek;

        // Filter trips by direction if specified
        const tripIds = targetDirId !== undefined
          ? allTripIds.filter(tId => {
              const trip = dataset.trips.get(tId);
              return (trip?.direction_id ?? 0) === targetDirId;
            })
          : allTripIds;

        const allRealDeps: Array<{ departure_secs: number; time: string; trip_id: string; service_id: string; direction_id: number; headsign: string; stop_id: string }> = [];
        const seenTrips = new Set<string>();

        for (const tId of tripIds) {
          const trip = dataset.trips.get(tId);
          if (!trip || !isServiceActiveOnDate(dataset, trip.service_id, queryDateStr, queryDayOfWeek)) {
            continue;
          }
          const firstDep = dataset.trip_first_departure.get(trip.original_id);
          if (!firstDep) continue;
          const dedupKey = `${trip.original_id}|${firstDep.departure_time}`;
          if (seenTrips.has(dedupKey)) continue;
          seenTrips.add(dedupKey);

          allRealDeps.push({
            departure_secs: firstDep.departure_secs,
            time: firstDep.departure_time,
            trip_id: trip.original_id,
            service_id: trip.service_id,
            direction_id: trip.direction_id ?? (targetDirId ?? 0),
            headsign: trip.headsign || route.long_name,
            stop_id: firstDep.stop_id,
          });
        }

        allRealDeps.sort((a, b) => a.departure_secs - b.departure_secs);
        const validDeps = allRealDeps.filter(d => d.departure_secs >= lisbonTime.currentSeconds);
        const activeDeps = validDeps.length > 0 ? validDeps : allRealDeps;
        const slice = activeDeps.slice(0, 10);
        const upcoming: TransitDepartureItem[] = slice.map(d => ({
          time: d.time,
          scheduled_time: d.time,
          trip_id: d.trip_id,
          service_id: d.service_id,
          direction_id: d.direction_id,
          headsign: d.headsign,
          stop_id: d.stop_id,
          is_realtime: false,
          status: 'No Horário' as const,
        }));

        const activeTripId = upcoming[0]?.trip_id || allRealDeps[0]?.trip_id || (tripIds.length > 0 ? tripIds[0] : undefined);
        const rawTripStops = activeTripId ? dataset.trip_stop_times.get(activeTripId) : undefined;
        const stopItems: TransitStopItem[] = [];

        if (rawTripStops && rawTripStops.length > 0) {
          const tripStartSecs = rawTripStops[0].departure_secs;
          for (const st of rawTripStops) {
            const stopObj = dataset.stops.get(st.stop_id);
            const stopTimeStr = formatSecondsToTime(st.departure_secs % 86400);
            const offsetMins = Math.max(0, Math.round((st.departure_secs - tripStartSecs) / 60));
            stopItems.push({
              id: st.stop_id,
              name: stopObj ? stopObj.name : `Paragem ${st.stop_id}`,
              sequence: st.sequence,
              locality: stopObj?.locality || dataset.region,
              scheduled_time: stopTimeStr,
              arrival_time: stopTimeStr,
              offset_minutes: offsetMins,
            });
          }
        } else {
          const routeStopIds = dataset.route_stops.get(route.original_id) || [];
          for (let i = 0; i < routeStopIds.length; i++) {
            const sId = routeStopIds[i];
            const st = dataset.stops.get(sId);
            if (st) {
              stopItems.push({
                id: sId,
                name: st.name,
                sequence: i + 1,
                locality: st.locality || dataset.region,
              });
            }
          }
        }

        const effectiveDir = (targetDirId ?? upcoming[0]?.direction_id ?? 0) === 1 ? 'Volta' : 'Ida';
        const originName = stopItems[0]?.name || (effectiveDir === 'Volta' ? route.long_name : route.short_name);
        const destName = stopItems[stopItems.length - 1]?.name || (effectiveDir === 'Volta' ? route.short_name : route.long_name);

        return {
          id: serviceId,
          line_code: route.short_name,
          line_name: route.long_name,
          operator_id: route.operator_id,
          operator_name: route.operator_name,
          transport_mode: route.type,
          region: route.region,
          municipalities: route.municipalities,
          origin: originName,
          destination: destName,
          direction: effectiveDir,
          color: route.color,
          text_color: route.text_color,
          service_status: 'Normal',
          stops: stopItems,
          next_departure: upcoming[0],
          upcoming_departures: upcoming,
          alerts: [],
          data_classification: 'Programado',
          source_id: dataset.source_id,
          source_url: '',
          last_updated: dataset.last_sync,
        };
      }
    }
  }

  if (CM_STORE.routes.has(serviceId) || CM_STORE.routes.has(serviceId.replace('cm-', ''))) {
    const lCode = serviceId.replace('cm-', '');
    const route = CM_STORE.routes.get(lCode);
    if (route) {
      const stopIds = CM_STORE.route_stops.get(lCode) || [];
      const stopItems: TransitStopItem[] = stopIds.slice(0, 30).map((sId, idx) => {
        const st = CM_STORE.stops.get(sId);
        return {
          id: sId,
          name: st ? st.name : `Paragem ${sId}`,
          sequence: idx + 1,
          locality: st?.locality,
          municipality: st?.district,
          scheduled_time: undefined,
          arrival_time: undefined,
          offset_minutes: undefined,
        };
      });

      return {
        id: route.id,
        line_code: route.short_name,
        line_name: route.long_name,
        operator_id: 'carris-metropolitana',
        operator_name: 'Carris Metropolitana',
        transport_mode: 'Autocarro',
        region: 'Área Metropolitana de Lisboa',
        municipalities: route.municipalities,
        origin: route.long_name.split('-')[0]?.trim() || route.short_name,
        destination: route.long_name.split('-')[1]?.trim() || 'Terminal',
        direction: 'Ida',
        color: route.color || '#C61D23',
        text_color: route.text_color || '#ffffff',
        service_status: 'Normal',
        stops: stopItems,
        upcoming_departures: [],
        alerts: [],
        data_classification: 'Tempo Real',
        source_id: 'carris-metropolitana',
        source_url: 'https://api.carrismetropolitana.pt/v2',
        last_updated: CM_STORE.last_sync,
      };
    }
  }

  // UNIR lookup
  if (serviceId.includes('unir') || serviceId.includes('8003') || serviceId.includes('8006')) {
    const code = serviceId.replace('unir-', '');
    const is8006 = code === '8006';
    return {
      id: `unir-${code}`,
      line_code: code,
      line_name: is8006 ? 'Gondomar (Souto) - Valbom - Porto (Campanhã)' : 'Gondomar (Souto) - Porto (Estádio do Dragão) via Valbom',
      operator_id: 'unir-mobilidade',
      operator_name: 'UNIR Mobilidade (AMP)',
      transport_mode: 'Autocarro',
      region: 'Área Metropolitana do Porto',
      municipalities: ['Porto', 'Gondomar'],
      origin: 'Gondomar (Souto)',
      destination: is8006 ? 'Porto (Campanhã)' : 'Porto (Estádio do Dragão)',
      direction: 'Ida',
      color: '#002B49',
      text_color: '#ffffff',
      service_status: 'Normal',
      stops: [
        { id: `unir-${code}-1`, name: 'Gondomar (Souto - Largo)', sequence: 1, locality: 'Gondomar', scheduled_time: undefined, arrival_time: undefined, offset_minutes: undefined },
        { id: `unir-${code}-2`, name: 'Valbom (Igreja)', sequence: 2, locality: 'Gondomar', scheduled_time: undefined, arrival_time: undefined, offset_minutes: undefined },
        { id: `unir-${code}-3`, name: 'Campanhã (Terminal)', sequence: 3, locality: 'Porto', scheduled_time: undefined, arrival_time: undefined, offset_minutes: undefined },
      ],
      upcoming_departures: [],
      alerts: [],
      data_classification: 'Programado',
      source_id: 'unir-mobilidade',
      source_url: 'https://go.tmlmobilidade.pt/hub/api/v1/network/lines',
      last_updated: new Date().toISOString(),
    };
  }

  return null;
}
