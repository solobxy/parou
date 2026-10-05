import { FeedItem } from '../types/coverage';
import { logFetch, upsertFeed, getAllFeeds } from './db/gtfsDatabase';
import { SEED_FEEDS } from './gtfsSeedRegistry';

const MOBILITY_DATABASE_FEEDS_CSV = 'https://files.mobilitydatabase.org/feeds_v2.csv';

export interface DiscoveryResult {
  discoveredCount: number;
  ptFeedsCount: number;
  errors: string[];
  headersLogged: string[];
}

let lastDiscoveryResult: DiscoveryResult = {
  discoveredCount: 0,
  ptFeedsCount: 0,
  errors: [],
  headersLogged: [],
};

export function getLastDiscoveryResult(): DiscoveryResult {
  return lastDiscoveryResult;
}

/**
 * Standard RFC-4180 CSV Parser
 * Accurately parses quoted fields, escaped quotes (""), and embedded commas.
 */
export function parseCsvRows(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        // skip CR
      } else if (char === '\n') {
        currentRow.push(currentField);
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    lines.push(currentRow);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = line[c] !== undefined ? line[c].trim() : '';
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Run Auto-Discovery of Portuguese Transit Feeds
 */
export async function runAutoDiscovery(): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // 1. Ensure SEED FEEDS are seeded into the database
  for (const seed of SEED_FEEDS) {
    try {
      upsertFeed(seed);
    } catch (err) {
      console.warn('[Seed Registry] Erro ao carregar seed feed:', seed.id, err);
    }
  }

  // 2. Fetch MobilityDatabase feeds_v2.csv
  let csvText = '';
  let httpStatus = 0;
  let bytes = 0;

  try {
    const res = await fetch(MOBILITY_DATABASE_FEEDS_CSV, {
      headers: {
        'User-Agent': 'PAROU.PT/2.0 (National Feed Discovery Engine; Portugal)',
        'Accept': 'text/csv, text/plain',
      },
    });

    httpStatus = res.status;
    const duration = Date.now() - startTime;

    if (!res.ok) {
      const errMsg = `Falha ao transferir feeds_v2.csv (HTTP ${res.status})`;
      errors.push(errMsg);
      logFetch({
        feed_id: 'mobility_database_csv',
        url: MOBILITY_DATABASE_FEEDS_CSV,
        http_status: res.status,
        bytes: 0,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
        message: 'Erro no download do catálogo MobilityDatabase',
        error_details: errMsg,
      });
      lastDiscoveryResult = { discoveredCount: 0, ptFeedsCount: 0, errors, headersLogged: [] };
      return lastDiscoveryResult;
    }

    csvText = await res.text();
    bytes = Buffer.byteLength(csvText, 'utf8');

    logFetch({
      feed_id: 'mobility_database_csv',
      url: MOBILITY_DATABASE_FEEDS_CSV,
      http_status: 200,
      bytes,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: 'Download do catálogo MobilityDatabase concluído com sucesso',
    });
  } catch (fetchErr: any) {
    const duration = Date.now() - startTime;
    const errDetails = fetchErr?.message || 'Erro de rede desconhecido';
    errors.push(`Erro de ligação a MobilityDatabase: ${errDetails}`);
    logFetch({
      feed_id: 'mobility_database_csv',
      url: MOBILITY_DATABASE_FEEDS_CSV,
      http_status: 0,
      bytes: 0,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: 'Exceção de rede ao contactar MobilityDatabase',
      error_details: errDetails,
    });
    lastDiscoveryResult = { discoveredCount: 0, ptFeedsCount: 0, errors, headersLogged: [] };
    return lastDiscoveryResult;
  }

  // 3. Parse CSV by header name
  const { headers, rows } = parseCsvRows(csvText);
  console.log('[MobilityDatabase] Headers lidos:', headers.join(', '));

  // Validate expected headers
  const requiredHeaders = [
    'id',
    'data_type',
    'location.country_code',
    'urls.direct_download',
    'status',
  ];

  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    const errMsg = `Colunas esperadas em falta no feeds_v2.csv: ${missingHeaders.join(', ')}`;
    errors.push(errMsg);
  }

  // 4. Filter Portuguese feeds
  // Keep rows with location.country_code = PT, type GTFS Schedule or GTFS Realtime, status not inactive or deprecated.
  const ptRows = rows.filter((r) => {
    const country = (r['location.country_code'] || '').toUpperCase();
    const dataType = (r['data_type'] || '').toLowerCase();
    const status = (r['status'] || '').toLowerCase();

    return (
      country === 'PT' &&
      (dataType === 'gtfs' || dataType === 'gtfs_rt') &&
      status !== 'inactive' &&
      status !== 'deprecated'
    );
  });

  const existingFeeds = getAllFeeds();
  const existingUrls = new Set(existingFeeds.map((f) => f.url.toLowerCase()));
  const existingNames = new Set(existingFeeds.map((f) => f.operator_name.toLowerCase()));

  // Map of static feeds to link GTFS-RT feeds
  const staticFeedsMap = new Map<string, string>(); // feedId or provider -> feedId
  for (const f of existingFeeds) {
    staticFeedsMap.set(f.id, f.id);
    staticFeedsMap.set(f.operator_name.toLowerCase(), f.id);
  }

  let newlyDiscovered = 0;

  for (const r of ptRows) {
    const id = r['id'] || `pt-${Math.random().toString(36).substring(2, 8)}`;
    const dataType = (r['data_type'] || 'gtfs').toLowerCase();
    const feedType = dataType === 'gtfs_rt' ? 'gtfs_rt' : 'gtfs';
    const provider = r['provider'] || r['name'] || 'Operador de Portugal';
    const municipality = r['location.municipality'] || r['location.subdivision_name'] || '';
    const operatorName = municipality ? `${provider} (${municipality})` : provider;

    const directUrl = r['urls.direct_download'] || '';
    const latestUrl = r['urls.latest'] || directUrl;
    const downloadUrl = directUrl || latestUrl;
    const licenseUrl = r['urls.license'] || '';
    const authType = r['urls.authentication_type'] || '0';

    // Seed wins on same URL or agency name
    if (existingUrls.has(downloadUrl.toLowerCase()) || existingNames.has(operatorName.toLowerCase())) {
      continue;
    }

    // Determine auth status: if authentication_type says key is needed
    // In MobilityDatabase, '0' or empty means None. Any other value (e.g. '1', 'api_key', 'header') requires authentication.
    const needsKey = authType !== '0' && authType !== '' && authType !== 'none';

    // Mode determination heuristic
    let mode = 'Autocarro';
    const lowerName = operatorName.toLowerCase();
    if (lowerName.includes('metro') || lowerName.includes('subway')) mode = 'Metro';
    else if (lowerName.includes('comboio') || lowerName.includes('fertagus') || lowerName.includes('rail')) mode = 'Comboio';
    else if (lowerName.includes('barco') || lowerName.includes('fluvial') || lowerName.includes('transtejo')) mode = 'Barco';
    else if (lowerName.includes('elétrico') || lowerName.includes('tram')) mode = 'Elétrico';

    // Link GTFS-RT to static feed reference if available
    let realtimeEntities = 'Nenhum';
    if (feedType === 'gtfs_rt') {
      const entityType = (r['entity_type'] || '').toLowerCase();
      if (entityType.includes('tu')) realtimeEntities = 'Trip Updates';
      else if (entityType.includes('vp')) realtimeEntities = 'Vehicle Positions';
      else if (entityType.includes('sa')) realtimeEntities = 'Service Alerts';
      else realtimeEntities = 'Tempo Real GTFS-RT';
    }

    const newFeed: FeedItem = {
      id,
      operator_name: operatorName,
      mode,
      feed_type: feedType,
      source_origin: 'discovery',
      url: downloadUrl,
      latest_url: latestUrl,
      license_url: licenseUrl,
      auth_type: needsKey ? 'api_key' : 'none',
      status: needsKey ? 'NEEDS_KEY' : 'A aguardar',
      progress: needsKey ? 'NEEDS_KEY' : 'A aguardar',
      lines_count: 0,
      stops_count: 0,
      trips_count: 0,
      realtime_entities: realtimeEntities,
      last_error: needsKey ? 'Requer chave de autenticação (NEEDS_KEY) de acordo com o catálogo' : undefined,
    };

    upsertFeed(newFeed);
    existingUrls.add(downloadUrl.toLowerCase());
    existingNames.add(operatorName.toLowerCase());
    newlyDiscovered++;
  }

  lastDiscoveryResult = {
    discoveredCount: newlyDiscovered,
    ptFeedsCount: ptRows.length,
    errors,
    headersLogged: headers,
  };

  console.log(`[Discovery] Concluído: ${ptRows.length} feeds de Portugal encontrados, ${newlyDiscovered} novos adicionados.`);
  return lastDiscoveryResult;
}
