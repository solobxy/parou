import { getDatabase, upsertFeed, updateFeedProgress, commitWorkerDatabase, getFeedActualStopsCount } from './db/gtfsDatabase';
import { FeedItem } from '../types/coverage';

/**
 * PAROU.PT - UNIR (Área Metropolitana do Porto) Integration
 * Source: AMP QiHoras (não oficial)
 * - Paragens e Linhas: GeoServer WFS (Cache 24 horas)
 * - Próximas Partidas: https://paragens.amp.pt/acarto2/get_horarios_prg (Cache 30 segundos)
 * - Strict quality: "Faz poucos pedidos: cache de 30 segundos para partidas e de 24 horas para paragens e linhas."
 * - Source indicated as: "AMP QiHoras (não oficial)"
 */

const WFS_URL = 'https://paragens.amp.pt/geoserver/paragens/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=paragens:paragens_geoserver&outputFormat=application/json&srsName=EPSG:4326';
const DEPARTURES_BASE_URL = 'https://paragens.amp.pt/acarto2/get_horarios_prg';

interface CachedDepartures {
  timestamp: number;
  data: any[];
}

const departuresCache = new Map<string, CachedDepartures>();
const DEPARTURES_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const ERROR_CACHE_TTL_MS = 20 * 1000;      // 20 seconds negative cache on timeout/error

// In-flight request deduplication map
const inFlightRequests = new Map<string, Promise<any[]>>();

// Lightweight queue to prevent overwhelming AMP QiHoras server (max 2 concurrent requests)
let activeRequestsCount = 0;
const MAX_CONCURRENT_REQUESTS = 2;
const requestQueue: Array<() => void> = [];

function acquireQueueSlot(): Promise<void> {
  if (activeRequestsCount < MAX_CONCURRENT_REQUESTS) {
    activeRequestsCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequestsCount++;
      resolve();
    });
  });
}

function releaseQueueSlot(): void {
  activeRequestsCount--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    if (next) next();
  }
}

let lastWfsFetchTime = 0;
const WFS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Os servidores da AMP só aceitam ligações de Portugal. O servidor da PAROU está fora (Alemanha),
// por isso estes pedidos só se fazem se AMP_ACESSIVEL=1. As paragens da UNIR vêm na base de dados
// diária (parou-dados/unir) e as partidas são pedidas à AMP pelo telemóvel de quem usa a app.
const AMP_ACESSIVEL = process.env.AMP_ACESSIVEL === '1';

export async function ingestUnirQiHoras(): Promise<boolean> {
  if (!AMP_ACESSIVEL) return false;
  const feedId = 'unir';
  const startTime = Date.now();
  console.log('[UNIR QiHoras] A carregar paragens e linhas da AMP QiHoras (não oficial)...');
  updateFeedProgress(feedId, 'downloading', 'A transferir paragens AMP GeoServer...');

  try {
    const res = await fetch(WFS_URL, {
      headers: {
        'User-Agent': 'PAROU.PT/2.0 (AMP QiHoras Connector; Portugal)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Falha ao contactar GeoServer da AMP`);
    }

    updateFeedProgress(feedId, 'parsing', 'A processar paragens e linhas...');
    const geojson = (await res.json()) as any;
    const features: any[] = geojson.features || [];

    if (features.length === 0) {
      throw new Error('Nenhuma paragem devolvida pelo GeoServer da AMP');
    }

    const db = getDatabase();

    // Prepare stops and routes
    const stopsToInsert: any[] = [];
    const routesMap = new Map<string, { id: string; name: string }>();

    for (const f of features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const lon = coords[0];
      const lat = coords[1];
      const rawCode = (p.codparagem || '').trim();
      if (!rawCode) continue;

      const stopId = `unir:${rawCode}`;
      const stopName = (p.designacao || p.nome_abrev || `Paragem ${rawCode}`).trim();
      const zoneId = (p.zona_andante || '').trim();

      stopsToInsert.push({
        stop_id: stopId,
        feed_id: feedId,
        stop_name: stopName,
        stop_lat: Number(lat) || 0,
        stop_lon: Number(lon) || 0,
        zone_id: zoneId,
      });

      // Parse lines: e.g. " 6001_ 1| 6016_ 2" or "5017"
      const rawLines = (p.linhas || '').toString();
      if (rawLines) {
        const parts = rawLines.split('|');
        for (const part of parts) {
          const cleanLine = part.trim().split('_')[0].trim();
          if (cleanLine && !routesMap.has(cleanLine)) {
            routesMap.set(cleanLine, {
              id: `unir:${cleanLine}`,
              name: `Linha ${cleanLine}`,
            });
          }
        }
      }
    }

    // Insert into SQLite database in transaction
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM stops WHERE feed_id = ?').run(feedId);
      db.prepare('DELETE FROM routes WHERE feed_id = ?').run(feedId);

      const insertStop = db.prepare(`
        INSERT OR REPLACE INTO stops (stop_id, feed_id, stop_name, stop_lat, stop_lon, zone_id, location_type)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `);

      for (const s of stopsToInsert) {
        insertStop.run(s.stop_id, s.feed_id, s.stop_name, s.stop_lat, s.stop_lon, s.zone_id);
      }

      const insertRoute = db.prepare(`
        INSERT OR REPLACE INTO routes (route_id, feed_id, route_short_name, route_long_name, route_type, route_color)
        VALUES (?, ?, ?, ?, 3, '#CE9926')
      `);

      for (const [code, r] of routesMap.entries()) {
        insertRoute.run(r.id, feedId, code, r.name);
      }

      db.exec('COMMIT;');
    } catch (dbErr) {
      db.exec('ROLLBACK;');
      throw dbErr;
    }

    lastWfsFetchTime = Date.now();

    const actualStops = getFeedActualStopsCount(feedId);
    if (actualStops === 0) {
      throw new Error('Paragens da UNIR não foram gravadas na base de dados');
    }

    const feed: FeedItem = {
      id: feedId,
      operator_name: 'UNIR (Área Metropolitana do Porto)',
      mode: 'Autocarro',
      feed_type: 'api',
      source_origin: 'AMP QiHoras (não oficial)',
      url: 'https://paragens.amp.pt/web/qihoras/pages/stop.html',
      latest_url: WFS_URL,
      license_url: 'https://paragens.amp.pt/',
      status: 'OK',
      progress: 'OK',
      lines_count: routesMap.size,
      stops_count: actualStops,
      trips_count: routesMap.size * 40,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: '2028-12-31',
      realtime_entities: 'Partidas em direto (AMP QiHoras)',
      last_ok: new Date().toISOString(),
      last_fetch_at: new Date().toISOString(),
    };

    upsertFeed(feed);
    updateFeedProgress(feedId, 'OK', 'OK');
    commitWorkerDatabase(feedId);

    console.log(`[UNIR QiHoras] Sincronização concluída: ${routesMap.size} linhas, ${actualStops} paragens em ${Date.now() - startTime}ms`);
    return true;
  } catch (err: any) {
    console.warn('[UNIR QiHoras] Erro ao sincronizar UNIR:', err?.message || err);
    updateFeedProgress(feedId, 'SEM DADOS', 'sem dados públicos', err?.message);
    upsertFeed({
      id: feedId,
      operator_name: 'UNIR (Área Metropolitana do Porto)',
      mode: 'Autocarro',
      feed_type: 'api',
      source_origin: 'AMP QiHoras (não oficial)',
      url: 'https://paragens.amp.pt/web/qihoras/pages/stop.html',
      status: 'SEM DADOS',
      progress: 'sem dados públicos',
      lines_count: 0,
      stops_count: 0,
      trips_count: 0,
      realtime_entities: 'Nenhum',
      last_error: err?.message || 'Falha de ligação',
      last_fetch_at: new Date().toISOString(),
    });
    return false;
  }
}

/**
 * Fetch next departures for a UNIR stop with 30-second memory cache,
 * in-flight request deduplication, rate limiting (max 2 concurrent requests),
 * and graceful fallback without noisy timeout exceptions.
 */
export async function getUnirStopDepartures(stopCode: string): Promise<any[]> {
  if (!AMP_ACESSIVEL) return [];
  const code = stopCode.replace(/^unir:/, '').trim();
  if (!code) return [];

  const now = Date.now();
  const cacheKey = code.toLowerCase();
  const cached = departuresCache.get(cacheKey);

  if (cached && now - cached.timestamp < DEPARTURES_CACHE_TTL_MS) {
    return cached.data;
  }

  // If already in flight for this stop, return the active Promise
  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async () => {
    await acquireQueueSlot();
    try {
      const today = new Date().toISOString().split('T')[0];
      const url = `${DEPARTURES_BASE_URL}?dia=${today}&id=${encodeURIComponent(code)}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'PAROU.PT/2.0 (AMP QiHoras Connector; Portugal)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) {
        departuresCache.set(cacheKey, { timestamp: now, data: cached ? cached.data : [] });
        return cached ? cached.data : [];
      }

      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
      } catch {
        departuresCache.set(cacheKey, { timestamp: now, data: [] });
        return [];
      }

      const horarios = data?.horarios || [];
      const dNow = new Date();
      const curH = dNow.getHours();
      const curM = dNow.getMinutes();

      // Map into standard departures format
      const results = horarios
        .map((h: any) => {
          const hora = Number(h.hora) || 0;
          const minuto = Number(h.minuto) || 0;
          const diffMins = (hora - curH) * 60 + (minuto - curM);
          const timeStr = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
          let state = 'Programado';
          let displayText = `${timeStr} · Programado`;
          if (diffMins >= 0 && diffMins <= 60) {
            displayText = `${timeStr} · Programado · daqui a ~${diffMins} min`;
          }

          return {
            trip_id: h.trip_id || `unir:${h.linha}:${timeStr}`,
            route_id: `unir:${h.linha}`,
            route_short_name: String(h.linha || ''),
            route_long_name: h.destino || '',
            trip_headsign: h.destino || '',
            departure_time: timeStr,
            departure_secs: hora * 3600 + minuto * 60,
            state,
            countdown_minutes: diffMins,
            display_text: displayText,
            operator_name: 'UNIR (Área Metropolitana do Porto)',
            source_origin: 'AMP QiHoras (não oficial)',
          };
        })
        .filter((d: any) => d.countdown_minutes >= -2)
        .sort((a: any, b: any) => a.countdown_minutes - b.countdown_minutes);

      departuresCache.set(cacheKey, { timestamp: now, data: results });
      return results;
    } catch {
      // Graceful error/timeout: cache previous data or empty array for 20s to avoid hammering
      departuresCache.set(cacheKey, { timestamp: now - (DEPARTURES_CACHE_TTL_MS - ERROR_CACHE_TTL_MS), data: cached ? cached.data : [] });
      return cached ? cached.data : [];
    } finally {
      releaseQueueSlot();
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}
