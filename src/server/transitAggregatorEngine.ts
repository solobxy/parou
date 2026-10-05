import { 
  NormalizedTransitService, 
  TransitSearchQuery, 
  TransitSourceRegistryEntry,
  TransitTransportMode 
} from '../types/transit';
import { getDatabase, getAllFeeds, reloadDatabaseConnection } from './db/gtfsDatabase';
import { getLisbonTime } from './gtfsStreamEngine';

/**
 * PAROU.PT National Transit Aggregator Engine
 * One single source of truth: unified SQLite database (routes, stops, feeds).
 * "carreiras carregadas" = total routes of all OK feeds;
 * "Registo de Fontes (N)" = number of feeds.
 */

async function doAggregateNationalTransitServices(params: TransitSearchQuery): Promise<{
  services: NormalizedTransitService[];
  total: number;
  registry: TransitSourceRegistryEntry[];
  timestamp: string;
}> {
  const db = getDatabase();
  const lisbon = getLisbonTime();
  const currentSecs = lisbon.currentSeconds;

  // Feeds registry (source of truth)
  const allFeeds = getAllFeeds();
  const registry = allFeeds.map((f) => ({
    source_id: f.id,
    id: f.id,
    operator: f.operator_name,
    operador: f.operator_name,
    region: f.source_origin === 'seed' ? 'Nacional / Regional' : 'Descoberta Automática',
    região: f.source_origin === 'seed' ? 'Nacional / Regional' : 'Descoberta Automática',
    modes: [f.mode as any],
    modos: [f.mode as any],
    source_url: f.url,
    feed_url: f.latest_url || f.url,
    status: f.status,
    estado: f.status,
    status_type: f.status,
    routes_count: f.lines_count || 0,
    stops_count: f.stops_count || 0,
    trips_count: f.trips_count || 0,
    last_updated: f.last_ok || f.last_fetch_at,
    last_ok: f.last_ok,
    last_error: f.last_error,
  }));

  // Total routes of all OK feeds
  const totalRow = db.prepare(`
    SELECT COUNT(*) as c
    FROM routes r
    JOIN feeds f ON r.feed_id = f.id
    WHERE f.status = 'OK'
  `).get() as { c: number } | undefined;
  const totalRoutes = totalRow?.c || 0;

  // Build filter query
  let where = `WHERE f.status = 'OK'`;
  const sqlParams: any[] = [];

  if (params.query) {
    const term = `%${params.query.trim()}%`;
    where += ` AND (r.route_short_name LIKE ? OR r.route_long_name LIKE ? OR f.operator_name LIKE ? OR r.feed_id LIKE ?)`;
    sqlParams.push(term, term, term, term);
  }

  if (params.operator && params.operator !== 'Todos') {
    where += ` AND (f.operator_name LIKE ? OR f.id LIKE ?)`;
    sqlParams.push(`%${params.operator}%`, `%${params.operator}%`);
  }

  if (params.transport_mode && params.transport_mode !== 'Todos') {
    where += ` AND (f.mode LIKE ? OR CASE r.route_type WHEN 0 THEN 'Elétrico' WHEN 1 THEN 'Metro' WHEN 2 THEN 'Comboio' WHEN 3 THEN 'Autocarro' WHEN 4 THEN 'Barco' ELSE 'Autocarro' END = ?)`;
    sqlParams.push(`%${params.transport_mode}%`, params.transport_mode);
  }

  // Fetch routes up to 100
  const rows = db.prepare(`
    SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
           f.operator_name, f.mode as feed_mode
    FROM routes r
    JOIN feeds f ON r.feed_id = f.id
    ${where}
    ORDER BY 
      CASE WHEN r.route_short_name GLOB '[0-9]*' THEN CAST(r.route_short_name AS INTEGER) ELSE 999999 END ASC,
      r.route_short_name ASC
    LIMIT 100
  `).all(...sqlParams) as Array<{
    route_id: string;
    feed_id: string;
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    route_color: string;
    operator_name: string;
    feed_mode: string;
  }>;

  const services = rows.map((r) => {
    let mode: TransitTransportMode = 'Autocarro';
    if (r.route_type === 0) mode = 'Elétrico';
    else if (r.route_type === 1) mode = 'Metro';
    else if (r.route_type === 2) mode = 'Comboio';
    else if (r.route_type === 4) mode = 'Barco';

    const color = r.route_color ? (r.route_color.startsWith('#') ? r.route_color : `#${r.route_color}`) : '#2563EB';

    // Destinations from trips
    let origin = 'Início da Linha';
    let dest = r.route_long_name || 'Terminal';
    try {
      const headsigns = db.prepare(`
        SELECT DISTINCT trip_headsign FROM trips WHERE route_id = ? AND trip_headsign IS NOT NULL AND trip_headsign != '' LIMIT 2
      `).all(r.route_id) as Array<{ trip_headsign: string }>;
      if (headsigns[0]?.trip_headsign) origin = headsigns[0].trip_headsign;
      if (headsigns[1]?.trip_headsign) dest = headsigns[1].trip_headsign;
      else if (headsigns[0]?.trip_headsign) dest = headsigns[0].trip_headsign;
    } catch {}

    // Sample upcoming departures for this route
    let departures: any[] = [];
    try {
      const depRows = db.prepare(`
        SELECT st.departure_secs, t.trip_headsign, s.stop_name, s.stop_id
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        JOIN stops s ON st.stop_id = s.stop_id
        WHERE t.route_id = ? AND st.departure_secs >= ?
        ORDER BY st.departure_secs ASC
        LIMIT 4
      `).all(r.route_id, currentSecs - 60) as Array<{
        departure_secs: number;
        trip_headsign: string;
        stop_name: string;
        stop_id: string;
      }>;

      departures = depRows.map((d) => {
        const depHour = Math.floor(d.departure_secs / 3600) % 24;
        const depMin = Math.floor((d.departure_secs % 3600) / 60);
        const timeStr = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;
        const diffMin = Math.max(0, Math.round((d.departure_secs - currentSecs) / 60));
        return {
          scheduled_time: timeStr,
          actual_time: timeStr,
          destination: d.trip_headsign || dest,
          stop_name: d.stop_name,
          stop_id: d.stop_id,
          status: 'Programado' as const,
          countdown_minutes: diffMin,
        };
      });
    } catch {}

    return {
      id: r.route_id,
      line_code: r.route_short_name || r.route_id,
      line_name: r.route_long_name || '',
      operator_id: r.feed_id,
      operator_name: r.operator_name,
      transport_mode: mode,
      route_color: color,
      region: r.feed_id.startsWith('metro_porto') || r.feed_id === 'stcp' ? 'Área Metropolitana do Porto' : 'Nacional / Área Metropolitana',
      municipalities: [],
      origin,
      destination: dest,
      service_status: 'Normal' as const,
      data_classification: 'Programado' as const,
      departures,
      realtime_info: {
        has_realtime: false,
        source_feed: r.feed_id,
        accuracy_level: 'Oficial GTFS',
        latency_seconds: 0,
      },
    };
  });

  return {
    services: services as any,
    total: totalRoutes,
    registry: registry as any,
    timestamp: new Date().toISOString(),
  };
}

export async function aggregateNationalTransitServices(params: TransitSearchQuery): Promise<{
  services: NormalizedTransitService[];
  total: number;
  registry: TransitSourceRegistryEntry[];
  timestamp: string;
}> {
  try {
    return await doAggregateNationalTransitServices(params);
  } catch (err: any) {
    console.warn('[Transit Aggregator] Detetada exceção ao consultar base de dados:', err?.message || err);
    // Reload connection and retry once
    reloadDatabaseConnection();
    try {
      return await doAggregateNationalTransitServices(params);
    } catch (retryErr: any) {
      console.warn('[Transit Aggregator] Falha na segunda tentativa, a usar fallback vazio seguro:', retryErr?.message);
      const allFeeds = getAllFeeds();
      return {
        services: [],
        total: 0,
        registry: allFeeds.map(f => ({
          source_id: f.id,
          id: f.id,
          operator: f.operator_name,
          operador: f.operator_name,
          region: 'Portugal',
          região: 'Portugal',
          modes: [f.mode as any],
          modos: [f.mode as any],
          source_url: f.url,
          feed_url: f.latest_url || f.url,
          status: f.status,
          estado: f.status,
          status_type: f.status,
          routes_count: f.lines_count || 0,
          stops_count: f.stops_count || 0,
          trips_count: f.trips_count || 0,
          last_updated: f.last_ok || f.last_fetch_at,
          last_ok: f.last_ok,
          last_error: f.last_error,
        })) as any,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export function getNationalServiceById(id: string): NormalizedTransitService | undefined {
  try {
    const db = getDatabase();
    const r = db.prepare(`
      SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
             f.operator_name, f.mode as feed_mode
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      WHERE r.route_id = ?
    `).get(id) as any;

    if (!r) return undefined;

    let mode: TransitTransportMode = 'Autocarro';
    if (r.route_type === 0) mode = 'Elétrico';
    else if (r.route_type === 1) mode = 'Metro';
    else if (r.route_type === 2) mode = 'Comboio';
    else if (r.route_type === 4) mode = 'Barco';

    return {
      id: r.route_id,
      line_code: r.route_short_name || r.route_id,
      line_name: r.route_long_name || '',
      operator_id: r.feed_id,
      operator_name: r.operator_name,
      transport_mode: mode,
      route_color: r.route_color || '#2563EB',
      region: 'Portugal',
      municipalities: [],
      origin: 'Origem',
      destination: 'Destino',
      service_status: 'Normal',
      data_classification: 'Programado',
      departures: [],
    } as any;
  } catch {
    return undefined;
  }
}

