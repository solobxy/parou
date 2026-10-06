import { getDatabase } from './db/gtfsDatabase';
import { getAllFeeds } from './db/gtfsDatabase';
import { getStcpLiveVehicles } from './portoOpenDataService';
import { DateTime } from 'luxon';

export const VALID_DAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type ValidDayCol = typeof VALID_DAY_COLUMNS[number];

export function getLisbonDateContext(refDate?: Date) {
  const dt = refDate 
    ? DateTime.fromJSDate(refDate).setZone('Europe/Lisbon')
    : DateTime.now().setZone('Europe/Lisbon');

  const todayStr = dt.toFormat('yyyyMMdd');
  const todaySeconds = dt.hour * 3600 + dt.minute * 60 + dt.second;

  const yesterdayDt = dt.minus({ days: 1 });
  const yesterdayStr = yesterdayDt.toFormat('yyyyMMdd');

  const tomorrowDt = dt.plus({ days: 1 });
  const tomorrowStr = tomorrowDt.toFormat('yyyyMMdd');

  const DAY_COL_MAP: Record<number, ValidDayCol> = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    7: 'sunday',
  };

  return {
    todayStr,
    todayDayCol: DAY_COL_MAP[dt.weekday],
    todaySeconds,
    yesterdayStr,
    yesterdayDayCol: DAY_COL_MAP[yesterdayDt.weekday],
    tomorrowStr,
    tomorrowDayCol: DAY_COL_MAP[tomorrowDt.weekday],
    currentSeconds: todaySeconds,
  };
}

export function getServiceFilterSql(dateStr: string, dayCol: ValidDayCol): string {
  if (!VALID_DAY_COLUMNS.includes(dayCol)) {
    throw new Error(`Invalid weekday column: ${dayCol}`);
  }
  return `(t.feed_id, t.service_id) IN (
    SELECT feed_id, service_id FROM calendar
     WHERE start_date <= '${dateStr}' AND end_date >= '${dateStr}' AND ${dayCol} = 1
    UNION
    SELECT feed_id, service_id FROM calendar_dates
     WHERE date = '${dateStr}' AND exception_type = 1
    EXCEPT
    SELECT feed_id, service_id FROM calendar_dates
     WHERE date = '${dateStr}' AND exception_type = 2
  )`;
}

export function getLisbonTime() {
  const ctx = getLisbonDateContext();
  return {
    currentSeconds: ctx.todaySeconds,
    dateStr: ctx.todayStr,
  };
}

export interface LineSummary {
  id: string;
  code: string;
  name: string;
  color: string;
  mode: string;
  operator: string;
  operator_id: string;
  feed_id: string;
  nearest_stop?: {
    id: string;
    name: string;
    distance_meters: number;
    lat: number;
    lon: number;
  };
  destinations?: string[];
  first_departure?: string;
  last_departure?: string;
  departures?: Array<{
    direction_id: number;
    destination: string;
    time: string;
    state: 'Tempo Real' | 'Programado' | 'Suprimido';
    countdown_minutes: number;
    displayText: string;
  }>;
}

export interface LineDetail extends LineSummary {
  directions: Array<{
    direction_id: number;
    headsign: string;
    stops: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      sequence: number;
      next_arrival?: string;
    }>;
  }>;
  vehicles: Array<{
    id: string;
    lat: number;
    lon: number;
    bearing?: number;
    speed?: number;
    timestamp?: string;
    trip_id?: string;
  }>;
}

export interface StopDepartureItem {
  line_id: string;
  line_code: string;
  line_name: string;
  color: string;
  mode: string;
  operator: string;
  destination: string;
  scheduled_time: string;
  actual_time?: string;
  state: 'Tempo Real' | 'Programado' | 'Suprimido';
  countdown_minutes: number;
  delay_minutes?: number;
  displayText: string;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function modeFromRouteType(routeType: number, feedMode?: string, shortName?: string, feedId?: string): string {
  if (routeType === 0) return 'Elétrico';
  if (feedId === 'carris' && shortName && shortName.endsWith('E')) return 'Elétrico';
  if (routeType === 1) return 'Metro';
  if (routeType === 2) return 'Comboio';
  if (routeType === 3) return 'Autocarro';
  if (routeType === 4) return 'Barco';
  return feedMode || 'Autocarro';
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'a chegar';
  if (minutes === 1) return 'daqui a 1 min';
  return `daqui a ${minutes} min`;
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

// Live vehicle cache for Carris Metropolitana (10-second TTL)
let cmVehiclesCache: { data: any[]; timestamp: number } = { data: [], timestamp: 0 };

async function getCmVehicles(): Promise<any[]> {
  const now = Date.now();
  if (cmVehiclesCache.data.length > 0 && now - cmVehiclesCache.timestamp < 10000) {
    return cmVehiclesCache.data;
  }
  try {
    const res = await fetch('https://api.carrismetropolitana.pt/v2/vehicles', {
      headers: { 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        cmVehiclesCache = { data, timestamp: now };
        return data;
      }
    }
  } catch (err) {
    // Return stale cache if available
  }
  return cmVehiclesCache.data;
}

function normalizeCpRoute(row: {
  route_id: string;
  feed_id: string;
  route_short_name: string;
  route_long_name: string;
}): { code: string; name: string } {
  if (row.feed_id !== 'cp') {
    return {
      code: row.route_short_name || row.route_id,
      name: row.route_long_name || '',
    };
  }

  let code = (row.route_short_name || '').trim();
  let name = (row.route_long_name || '').trim();

  if (code === 'AP' || name.toLowerCase().includes('alfa pendular')) {
    code = 'AP';
    name = name || 'Alfa Pendular';
  } else if (code === 'IC' || name.toLowerCase().includes('intercidades')) {
    code = 'IC';
    name = name || 'Intercidades';
  } else if (code === 'IR' || name.toLowerCase().includes('interregional')) {
    code = 'IR';
    name = name || 'InterRegional';
  } else if (code === 'R' || name.toLowerCase().includes('regional')) {
    code = 'R';
    name = name || 'Regional';
  } else if (code.startsWith('Linha de ') || code.startsWith('Linha do ') || code.startsWith('Linha da ')) {
    name = code;
    code = name.replace('Linha de ', '').replace('Linha do ', '').replace('Linha da ', '');
  }

  // If name is still empty, derive canonical name from OD
  if (!name || name === '') {
    if (row.route_id.includes('94_2006') || row.route_id.includes('94_1008')) {
      name = 'Linha do Norte / Minho / Douro (Porto)';
    } else {
      name = code ? `${code} (Comboios de Portugal)` : 'Serviço Ferroviário Nacional';
    }
  }

  return { code: code || 'CP', name };
}

export class LinesEngine {
  /**
   * GET /api/lines?near=lat,lon
   * Rules:
   * - lines serving stops within 500 m of GPS (1 km if fewer than 10 lines)
   * - sorted by distance to that line's nearest stop
   * - next 2 departures per direction at nearest stop with state and "daqui a X min"
   */
  static async getLinesNear(userLat: number, userLon: number, requestedRadius = 500): Promise<LineSummary[]> {
    const db = getDatabase();
    const lisbon = getLisbonTime();
    const currentSecs = lisbon.currentSeconds;

    // Search radius: start with requested (default 500), will broaden to 1000 if needed
    let searchRadius = Math.max(500, requestedRadius);

    const runCandidateSearch = (radiusMeters: number) => {
      const radLat = (userLat * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.cos(radLat));
      const dLat = (radiusMeters * 1.25) / 111000;
      const dLon = (radiusMeters * 1.25) / (111000 * cosLat);

      const minLat = userLat - dLat;
      const maxLat = userLat + dLat;
      const minLon = userLon - dLon;
      const maxLon = userLon + dLon;

      const rawStops = db.prepare(`
        SELECT s.stop_id, s.feed_id, s.stop_name, s.stop_lat, s.stop_lon
        FROM stops s
        JOIN feeds f ON s.feed_id = f.id
        WHERE s.stop_lat BETWEEN ? AND ? AND s.stop_lon BETWEEN ? AND ?
      `).all(minLat, maxLat, minLon, maxLon) as Array<{
        stop_id: string;
        feed_id: string;
        stop_name: string;
        stop_lat: number;
        stop_lon: number;
      }>;

      // Filter by exact haversine
      const stopsInRadius = rawStops
        .map((s) => ({
          ...s,
          dist: haversineDistanceMeters(userLat, userLon, s.stop_lat, s.stop_lon),
        }))
        .filter((s) => s.dist <= radiusMeters)
        .sort((a, b) => a.dist - b.dist);

      return stopsInRadius;
    };

    let nearbyStops = runCandidateSearch(searchRadius);

    // Get lines serving these stops
    const getLinesForStops = (stopsList: Array<{ stop_id: string; feed_id: string; stop_name: string; stop_lat: number; stop_lon: number; dist: number }>): Map<string, Array<{ stop_id: string; dist: number }>> => {
      const routeStopMap = new Map<string, Array<{ stop_id: string; dist: number }>>();
      if (stopsList.length === 0) return routeStopMap;
      const stopIds = stopsList.map((s) => s.stop_id);
      const stopMap = new Map<string, { stop_id: string; feed_id: string; stop_name: string; stop_lat: number; stop_lon: number; dist: number }>();
      stopsList.forEach((s) => stopMap.set(s.stop_id, s));

      // Query routes serving these stops
      // Use chunks if stops are many
      const chunkSize = 150;

      for (let i = 0; i < stopIds.length; i += chunkSize) {
        const slice = stopIds.slice(i, i + chunkSize);
        const placeholders = slice.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT DISTINCT st.stop_id, r.route_id
          FROM stop_times st
          JOIN trips t ON st.trip_id = t.trip_id
          JOIN routes r ON t.route_id = r.route_id
          JOIN feeds f ON r.feed_id = f.id
          WHERE st.stop_id IN (${placeholders})
        `).all(...slice) as Array<{ stop_id: string; route_id: string }>;

        rows.forEach((r) => {
          const stop = stopMap.get(r.stop_id);
          if (stop) {
            const arr = routeStopMap.get(r.route_id) || [];
            arr.push({ stop_id: r.stop_id, dist: stop.dist });
            routeStopMap.set(r.route_id, arr);
          }
        });
      }

      return routeStopMap;
    };

    let routeStopMap = getLinesForStops(nearbyStops);

    // If fewer than 10 lines, widen to 1000m
    if (routeStopMap.size < 10 && searchRadius < 1000) {
      searchRadius = 1000;
      nearbyStops = runCandidateSearch(searchRadius);
      routeStopMap = getLinesForStops(nearbyStops);
    }

    // Collect all candidate stops
    const stopMap = new Map<string, typeof nearbyStops[0]>();
    nearbyStops.forEach((s) => stopMap.set(s.stop_id, s));

    // Map to accumulate grouped line cards
    // For CP: grouped by canonical line name + destination at this stop
    // For other operators: grouped by route_id
    const cardMap = new Map<string, {
      id: string;
      code: string;
      name: string;
      color: string;
      mode: string;
      operator: string;
      operator_id: string;
      feed_id: string;
      nearest_stop: LineSummary['nearest_stop'];
      destinations: string[];
      trips: Array<{
        trip_id: string;
        direction_id: number;
        trip_headsign: string;
        departure_secs: number;
        frequency_label?: string;
      }>;
    }>();

    // Query non-terminating departures for each nearby stop
    for (const stop of nearbyStops) {
      const departures = db.prepare(`
        SELECT st.departure_secs, t.trip_id, t.trip_headsign, t.direction_id,
               r.route_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
               f.operator_name, f.mode as feed_mode, f.id as feed_id
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        JOIN routes r ON t.route_id = r.route_id
        JOIN feeds f ON r.feed_id = f.id
        WHERE st.stop_id = ?
          AND st.stop_sequence < (SELECT MAX(st2.stop_sequence) FROM stop_times st2 WHERE st2.trip_id = st.trip_id)
          AND (t.trip_headsign IS NULL OR t.trip_headsign != ?)
        ORDER BY st.departure_secs ASC
      `).all(stop.stop_id, stop.stop_name) as Array<{
        departure_secs: number;
        trip_id: string;
        trip_headsign: string;
        direction_id: number;
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        operator_name: string;
        feed_mode: string;
        feed_id: string;
      }>;

      for (const dep of departures) {
        const isCp = dep.feed_id === 'cp';
        const norm = normalizeCpRoute(dep);
        const dest = dep.trip_headsign || 'Destino';
        const cardKey = isCp ? `cp:${norm.name}::${dest}` : dep.route_id;

        if (!cardMap.has(cardKey)) {
          const color = dep.route_color ? (dep.route_color.startsWith('#') ? dep.route_color : `#${dep.route_color}`) : '#2563EB';
          const mode = modeFromRouteType(dep.route_type, dep.feed_mode, dep.route_short_name, dep.feed_id);

          cardMap.set(cardKey, {
            id: isCp ? `cp:${norm.code}_${dest.replace(/\s+/g, '_')}` : dep.route_id,
            code: isCp ? norm.code : (norm.code || dep.route_short_name || dep.route_id),
            name: isCp ? `${norm.name} → ${dest}` : (norm.name || dep.route_long_name || ''),
            color,
            mode,
            operator: dep.operator_name,
            operator_id: dep.feed_id,
            feed_id: dep.feed_id,
            nearest_stop: {
              id: stop.stop_id,
              name: stop.stop_name,
              distance_meters: Math.round(stop.dist),
              lat: stop.stop_lat,
              lon: stop.stop_lon,
            },
            destinations: [dest],
            trips: [],
          });
        }

        // Check frequencies.txt for this trip
        const freqs = db.prepare('SELECT start_time_secs, end_time_secs, headway_secs, exact_times FROM frequencies WHERE trip_id = ?').all(dep.trip_id) as Array<{
          start_time_secs: number;
          end_time_secs: number;
          headway_secs: number;
          exact_times: number;
        }>;

        if (freqs.length > 0) {
          const firstStopRow = db.prepare('SELECT MIN(departure_secs) as min_dep FROM stop_times WHERE trip_id = ?').get(dep.trip_id) as { min_dep: number } | undefined;
          const firstStopDepSecs = firstStopRow?.min_dep ?? dep.departure_secs;
          const travelTimeToStop = Math.max(0, dep.departure_secs - firstStopDepSecs);

          for (const f of freqs) {
            const freqLabel = f.exact_times === 0 ? `a cada ${Math.round(f.headway_secs / 60)} min` : undefined;
            for (let tSecs = f.start_time_secs; tSecs < f.end_time_secs; tSecs += f.headway_secs) {
              cardMap.get(cardKey)!.trips.push({
                trip_id: dep.trip_id,
                direction_id: dep.direction_id || 0,
                trip_headsign: dest,
                departure_secs: tSecs + travelTimeToStop,
                frequency_label: freqLabel,
              });
            }
          }
        } else {
          cardMap.get(cardKey)!.trips.push({
            trip_id: dep.trip_id,
            direction_id: dep.direction_id || 0,
            trip_headsign: dest,
            departure_secs: dep.departure_secs,
          });
        }
      }
    }

    // Also include any nearby route that didn't have immediate stop_times (e.g. STCP 9M night network)
    const routeIds = Array.from(routeStopMap.keys());
    for (const rId of routeIds) {
      if (rId.startsWith('cp:')) continue; // CP routes are already represented by canonical grouped lines
      if (!Array.from(cardMap.values()).some((c) => c.id === rId)) {
        const rMeta = db.prepare(`
          SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
                 f.operator_name, f.mode as feed_mode
          FROM routes r
          JOIN feeds f ON r.feed_id = f.id
          WHERE r.route_id = ?
        `).get(rId) as any;
        if (rMeta) {
          const candStops = routeStopMap.get(rId) || [];
          candStops.sort((a, b) => a.dist - b.dist);
          const bestS = candStops[0] ? stopMap.get(candStops[0].stop_id) : undefined;
          const norm = normalizeCpRoute(rMeta);
          const color = rMeta.route_color ? (rMeta.route_color.startsWith('#') ? rMeta.route_color : `#${rMeta.route_color}`) : '#2563EB';
          const mode = modeFromRouteType(rMeta.route_type, rMeta.feed_mode, rMeta.route_short_name, rMeta.feed_id);

          cardMap.set(rId, {
            id: rId,
            code: norm.code || rMeta.route_short_name || rId,
            name: norm.name || rMeta.route_long_name || '',
            color,
            mode,
            operator: rMeta.operator_name,
            operator_id: rMeta.feed_id,
            feed_id: rMeta.feed_id,
            nearest_stop: bestS ? {
              id: bestS.stop_id,
              name: bestS.stop_name,
              distance_meters: Math.round(bestS.dist),
              lat: bestS.stop_lat,
              lon: bestS.stop_lon,
            } : undefined,
            destinations: [],
            trips: [],
          });
        }
      }
    }

    // Format departures for each card:
    const lineSummaries: LineSummary[] = [];

    for (const card of cardMap.values()) {
      const departures: LineSummary['departures'] = [];
      let firstDepStr: string | undefined;
      let lastDepStr: string | undefined;

      if (card.trips.length > 0) {
        // Group trips by direction_id (Separar as partidas por sentido)
        const tripsByDirection = new Map<number, typeof card.trips>();
        for (const trip of card.trips) {
          const dir = trip.direction_id ?? 0;
          if (!tripsByDirection.has(dir)) tripsByDirection.set(dir, []);
          tripsByDirection.get(dir)!.push(trip);
        }

        const sortedDirs = Array.from(tripsByDirection.keys()).sort((a, b) => a - b);

        for (const dirId of sortedDirs) {
          const dirTrips = tripsByDirection.get(dirId)!;
          dirTrips.sort((a, b) => a.departure_secs - b.departure_secs);

          if (!firstDepStr && dirTrips.length > 0) {
            const firstSecs = dirTrips[0].departure_secs;
            firstDepStr = `${String(Math.floor(firstSecs / 3600) % 24).padStart(2, '0')}:${String(Math.floor((firstSecs % 3600) / 60)).padStart(2, '0')}`;
          }
          if (dirTrips.length > 0) {
            const lastSecs = dirTrips[dirTrips.length - 1].departure_secs;
            lastDepStr = `${String(Math.floor(lastSecs / 3600) % 24).padStart(2, '0')}:${String(Math.floor((lastSecs % 3600) / 60)).padStart(2, '0')}`;
          }

          // Upcoming trips today for this direction (from currentSecs - 120)
          const upcomingTrips = dirTrips.filter((t) => t.departure_secs >= currentSecs - 120);

          if (upcomingTrips.length > 0) {
            // Take up to 2 departures per direction
            for (const nextT of upcomingTrips.slice(0, 2)) {
              const diffSecs = nextT.departure_secs - currentSecs;
              let diffMinutes = Math.max(0, Math.round(diffSecs / 60));
              let displayText = `daqui a ${diffMinutes} min`;
              if (nextT.frequency_label) {
                displayText = nextT.frequency_label;
              } else if (diffSecs <= 0 && diffSecs >= -120) {
                diffMinutes = 0;
                displayText = 'a partir';
              } else if (diffSecs <= 60) {
                diffMinutes = 0;
                displayText = 'a chegar';
              }

              const depHour = Math.floor(nextT.departure_secs / 3600) % 24;
              const depMin = Math.floor((nextT.departure_secs % 3600) / 60);
              const timeStr = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;

              departures.push({
                direction_id: dirId,
                destination: nextT.trip_headsign || card.destinations[0] || 'Destino',
                time: timeStr,
                state: 'Programado',
                countdown_minutes: diffMinutes,
                displayText,
              });
            }
          } else {
            // Next departure is tomorrow morning
            const tomorrowT = dirTrips[0];
            const depHour = Math.floor(tomorrowT.departure_secs / 3600) % 24;
            const depMin = Math.floor((tomorrowT.departure_secs % 3600) / 60);
            const timeStr = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;
            const diffMins = Math.round(((24 * 3600 - currentSecs) + tomorrowT.departure_secs) / 60);

            departures.push({
              direction_id: dirId,
              destination: tomorrowT.trip_headsign || card.destinations[0] || 'Destino',
              time: timeStr,
              state: 'Programado',
              countdown_minutes: diffMins,
              displayText: tomorrowT.frequency_label || `amanhã às ${timeStr}`,
            });
          }
        }
      } else {
        // No schedule found for this line
        departures.push({
          direction_id: 0,
          destination: card.destinations[0] || card.name || 'Destino',
          time: 'sem horário',
          state: 'Suprimido',
          countdown_minutes: 99999,
          displayText: 'sem horário',
        });
      }

      lineSummaries.push({
        id: card.id,
        code: card.code,
        name: card.name,
        color: card.color,
        mode: card.mode,
        operator: card.operator,
        operator_id: card.operator_id,
        feed_id: card.feed_id,
        nearest_stop: card.nearest_stop,
        destinations: card.destinations,
        first_departure: firstDepStr,
        last_departure: lastDepStr,
        departures,
      });
    }

    // Sort lines by nearest stop distance ascending
    lineSummaries.sort((a, b) => {
      const distA = a.nearest_stop?.distance_meters ?? 999999;
      const distB = b.nearest_stop?.distance_meters ?? 999999;
      return distA - distB;
    });

    return lineSummaries;
  }

  /**
   * GET /api/lines?ids=id1,id2
   */
  static async getLinesByIds(ids: string[]): Promise<LineSummary[]> {
    if (!ids || ids.length === 0) return [];
    const db = getDatabase();
    const placeholders = ids.map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
             f.operator_name, f.mode as feed_mode
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      WHERE r.route_id IN (${placeholders})
    `).all(...ids) as Array<{
      route_id: string;
      feed_id: string;
      route_short_name: string;
      route_long_name: string;
      route_type: number;
      route_color: string;
      operator_name: string;
      feed_mode: string;
    }>;

    return rows.map((r) => {
      const norm = normalizeCpRoute(r);
      return {
        id: r.route_id,
        code: norm.code || r.route_short_name || r.route_id,
        name: norm.name || r.route_long_name || '',
        color: r.route_color ? (r.route_color.startsWith('#') ? r.route_color : `#${r.route_color}`) : '#2563EB',
        mode: modeFromRouteType(r.route_type, r.feed_mode, r.route_short_name, r.feed_id),
        operator: r.operator_name,
        operator_id: r.feed_id,
        feed_id: r.feed_id,
      };
    });
  }

  /**
   * GET /api/lines?q=&mode=&page=
   * Fast indexed search & pagination (50 items per page)
   */
  static async searchLines(
    q?: string,
    mode?: string,
    page = 1,
    pageSize = 50
  ): Promise<{ lines: LineSummary[]; total: number; page: number; total_pages: number }> {
    const db = getDatabase();
    const offset = Math.max(0, (page - 1) * pageSize);

    let whereClause = `WHERE 1=1`;
    const params: any[] = [];

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      whereClause += ` AND (r.route_short_name LIKE ? OR r.route_long_name LIKE ? OR f.operator_name LIKE ? OR r.feed_id LIKE ?)`;
      params.push(term, term, term, term);
    }

    if (mode && mode !== 'Todos' && mode !== 'todos') {
      whereClause += ` AND (f.mode LIKE ? OR CASE r.route_type WHEN 0 THEN 'Elétrico' WHEN 1 THEN 'Metro' WHEN 2 THEN 'Comboio' WHEN 3 THEN 'Autocarro' WHEN 4 THEN 'Barco' ELSE 'Autocarro' END = ?)`;
      params.push(`%${mode}%`, mode);
    }

    // Total count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      ${whereClause}
    `;
    const totalRow = db.prepare(countSql).get(...params) as { total: number };
    const total = totalRow?.total || 0;

    // Paginated rows
    const dataSql = `
      SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
             f.operator_name, f.mode as feed_mode
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      ${whereClause}
      ORDER BY 
        CASE WHEN r.route_short_name GLOB '[0-9]*' THEN CAST(r.route_short_name AS INTEGER) ELSE 999999 END ASC,
        r.route_short_name ASC
      LIMIT ? OFFSET ?
    `;
    const rows = db.prepare(dataSql).all(...params, pageSize, offset) as Array<{
      route_id: string;
      feed_id: string;
      route_short_name: string;
      route_long_name: string;
      route_type: number;
      route_color: string;
      operator_name: string;
      feed_mode: string;
    }>;

    const lines: LineSummary[] = [];
    const seenCpNames = new Set<string>();

    for (const r of rows) {
      const norm = normalizeCpRoute(r);
      if (r.feed_id === 'cp') {
        const canonical = norm.name || norm.code;
        if (seenCpNames.has(canonical)) continue;
        seenCpNames.add(canonical);
      }

      lines.push({
        id: r.route_id,
        code: norm.code || r.route_short_name || r.route_id,
        name: norm.name || r.route_long_name || '',
        color: r.route_color ? (r.route_color.startsWith('#') ? r.route_color : `#${r.route_color}`) : '#2563EB',
        mode: modeFromRouteType(r.route_type, r.feed_mode, r.route_short_name, r.feed_id),
        operator: r.operator_name,
        operator_id: r.feed_id,
        feed_id: r.feed_id,
      });
    }

    return {
      lines,
      total,
      page,
      total_pages: Math.ceil(total / pageSize),
    };
  }

  /**
   * GET /api/lines/:id
   * Detailed line view with ordered stops by direction and real-time live vehicles
   */
  static async getLineDetail(lineId: string): Promise<LineDetail | null> {
    const db = getDatabase();
    const route = db.prepare(`
      SELECT r.route_id, r.feed_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
             f.operator_name, f.mode as feed_mode
      FROM routes r
      JOIN feeds f ON r.feed_id = f.id
      WHERE r.route_id = ?
    `).get(lineId) as {
      route_id: string;
      feed_id: string;
      route_short_name: string;
      route_long_name: string;
      route_type: number;
      route_color: string;
      operator_name: string;
      feed_mode: string;
    } | undefined;

    if (!route) return null;

    const lisbon = getLisbonTime();
    const currentSecs = lisbon.currentSeconds;

    // Distinct directions and sample trips
    const directionRows = db.prepare(`
      SELECT DISTINCT direction_id, trip_headsign
      FROM trips
      WHERE route_id = ?
      GROUP BY direction_id
    `).all(lineId) as Array<{ direction_id: number; trip_headsign: string }>;

    const directions: LineDetail['directions'] = [];

    for (const dir of directionRows) {
      // Find a representative trip that has maximum stops for this direction
      const repTrip = db.prepare(`
        SELECT t.trip_id, COUNT(st.stop_id) as stop_count
        FROM trips t
        JOIN stop_times st ON t.trip_id = st.trip_id
        WHERE t.route_id = ? AND t.direction_id = ?
        GROUP BY t.trip_id
        ORDER BY stop_count DESC
        LIMIT 1
      `).get(lineId, dir.direction_id) as { trip_id: string; stop_count: number } | undefined;

      const stops: LineDetail['directions'][0]['stops'] = [];

      if (repTrip) {
        const stopRows = db.prepare(`
          SELECT st.stop_id, st.stop_sequence, st.departure_secs,
                 s.stop_name, s.stop_lat, s.stop_lon
          FROM stop_times st
          JOIN stops s ON st.stop_id = s.stop_id
          WHERE st.trip_id = ?
          ORDER BY st.stop_sequence ASC
        `).all(repTrip.trip_id) as Array<{
          stop_id: string;
          stop_sequence: number;
          departure_secs: number;
          stop_name: string;
          stop_lat: number;
          stop_lon: number;
        }>;

        for (const sr of stopRows) {
          // Look up next scheduled arrival at this stop for this route
          const nextArr = db.prepare(`
            SELECT departure_secs
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            WHERE st.stop_id = ? AND t.route_id = ? AND st.departure_secs >= ?
            ORDER BY st.departure_secs ASC
            LIMIT 1
          `).get(sr.stop_id, lineId, currentSecs - 60) as { departure_secs: number } | undefined;

          let nextArrivalStr = 'sem horário';
          if (nextArr) {
            const h = Math.floor(nextArr.departure_secs / 3600) % 24;
            const m = Math.floor((nextArr.departure_secs % 3600) / 60);
            nextArrivalStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          }

          stops.push({
            id: sr.stop_id,
            name: sr.stop_name,
            lat: sr.stop_lat,
            lon: sr.stop_lon,
            sequence: sr.stop_sequence,
            next_arrival: nextArrivalStr,
          });
        }
      }

      directions.push({
        direction_id: dir.direction_id,
        headsign: dir.trip_headsign || route.route_long_name || `Sentido ${dir.direction_id}`,
        stops,
      });
    }

    // Live vehicles on this line
    const vehicles: LineDetail['vehicles'] = [];
    try {
      if (route.feed_id === 'carris_metropolitana' || route.feed_id === 'cm') {
        const cleanId = route.route_id.replace(/^cm:/, '');
        const cmRes = await fetch(`https://api.carrismetropolitana.pt/lines/${cleanId}/vehicles`, { signal: AbortSignal.timeout(1500) });
        if (cmRes.ok) {
          const vData = await cmRes.json();
          if (Array.isArray(vData)) {
            vData.forEach((v: any) => {
              if (v.lat && v.lon) {
                vehicles.push({
                  id: v.id || v.vehicle_id,
                  lat: v.lat,
                  lon: v.lon,
                  bearing: v.bearing,
                  speed: v.speed,
                  timestamp: v.timestamp ? new Date(v.timestamp).toISOString() : new Date().toISOString(),
                  trip_id: v.trip_id,
                });
              }
            });
          }
        }
      } else if (route.feed_id === 'stcp') {
        const lineCode = (route.route_short_name || route.route_id.replace(/^stcp:/, '')).toLowerCase();
        const stcpBuses = await getStcpLiveVehicles();
        for (const b of stcpBuses) {
          if (b.line.toLowerCase() === lineCode) {
            vehicles.push({
              id: b.id,
              lat: b.lat,
              lon: b.lon,
              bearing: b.bearing,
              speed: b.speed,
              timestamp: new Date(b.timestamp * 1000).toISOString(),
            });
          }
        }
      }
    } catch {}

    const color = route.route_color ? (route.route_color.startsWith('#') ? route.route_color : `#${route.route_color}`) : '#2563EB';

    return {
      id: route.route_id,
      code: route.route_short_name || route.route_id,
      name: route.route_long_name || '',
      color,
      mode: modeFromRouteType(route.route_type, route.feed_mode, route.route_short_name, route.feed_id),
      operator: route.operator_name,
      operator_id: route.feed_id,
      feed_id: route.feed_id,
      destinations: directions.map((d) => d.headsign),
      directions,
      vehicles,
    };
  }

  /**
   * GET /api/stops/:id/departures?n=5
   * Real scheduled & real-time departures at stop
   */
  static async getStopDepartures(stopId: string, limit = 5): Promise<{
    stop_id: string;
    stop_name: string;
    departures: StopDepartureItem[];
  }> {
    const db = getDatabase();
    const stop = db.prepare('SELECT stop_id, stop_name, feed_id FROM stops WHERE stop_id = ?').get(stopId) as {
      stop_id: string;
      stop_name: string;
      feed_id: string;
    } | undefined;

    const stopName = stop?.stop_name || 'Paragem';
    const lisbon = getLisbonTime();
    const currentSecs = lisbon.currentSeconds;

    // 1. Real-time source (Requirement 5): For Carris Metropolitana stops, query /v2/arrivals/by_stop/:id
    const departures: StopDepartureItem[] = [];
    const cleanStopId = stopId.replace(/^(cm|mdb-2027|carris_metropolitana):/, '');

    if (stopId.startsWith('unir:')) {
      try {
        const { getUnirStopDepartures } = await import('./unirQiHorasService');
        const unirDeps = await getUnirStopDepartures(stopId);
        if (unirDeps && unirDeps.length > 0) {
          return {
            stop_id: stopId,
            stop_name: stopName,
            departures: unirDeps.slice(0, limit).map((d: any) => ({
              line_id: d.route_id,
              line_code: d.route_short_name,
              line_name: d.route_long_name,
              color: '#1E3A8A',
              mode: 'Autocarro',
              operator: 'UNIR (Área Metropolitana do Porto)',
              destination: d.trip_headsign,
              scheduled_time: d.departure_time,
              state: 'Programado' as const,
              countdown_minutes: d.countdown_minutes,
              displayText: d.display_text,
            })),
          };
        }
      } catch (err) {
        console.warn('[LinesEngine] Erro ao obter partidas UNIR:', err);
      }
    }

    if (/^\d{6}$/.test(cleanStopId) || stopId.startsWith('cm:') || stopId.startsWith('mdb-2027:')) {
      try {
        const arrRes = await fetch(`https://api.carrismetropolitana.pt/v2/arrivals/by_stop/${cleanStopId}`, {
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'PAROU.PT/2.0' },
        });
        if (arrRes.ok) {
          const arrData = await arrRes.json();
          if (Array.isArray(arrData)) {
            // Sort arrivals by estimated or scheduled arrival
            const liveArrivals = arrData.filter((a: any) => a.estimated_arrival);
            for (const a of liveArrivals) {
              if (departures.length >= limit) break;
              const estTime = a.estimated_arrival.slice(0, 5); // "HH:MM"
              const estSecs = timeStringToSeconds(a.estimated_arrival);
              const diffSecs = estSecs - currentSecs;

              // If bus already departed > 2 min ago, drop it
              if (diffSecs < -120) continue;

              let diffMins = Math.round(diffSecs / 60);
              let displayText = `daqui a ${diffMins} min`;
              if (diffSecs <= 0 && diffSecs >= -120) {
                diffMins = 0;
                displayText = 'a partir';
              } else if (diffSecs <= 60) {
                diffMins = 0;
                displayText = 'a chegar';
              }

              const schedSecs = a.scheduled_arrival ? timeStringToSeconds(a.scheduled_arrival) : estSecs;
              const delayMins = Math.round((estSecs - schedSecs) / 60);

              departures.push({
                line_id: `cm:${a.line_id}`,
                line_code: a.line_id,
                line_name: `Carreira ${a.line_id}`,
                color: '#FFCC00',
                mode: 'Autocarro',
                operator: 'Carris Metropolitana',
                destination: a.headsign || 'Destino',
                scheduled_time: a.scheduled_arrival ? a.scheduled_arrival.slice(0, 5) : estTime,
                actual_time: estTime,
                state: 'Tempo Real',
                countdown_minutes: Math.max(0, diffMins),
                delay_minutes: delayMins,
                displayText,
              });
            }
          }
        }
      } catch (err) {
        // Fallback to scheduled
      }
    }

    // 2. Fetch scheduled departures from SQLite if more needed
    if (departures.length < limit) {
      const remainingLimit = limit - departures.length;

      const rawStopId = stopId.includes(':') ? stopId.split(':')[1] : stopId;

      // Exclude trips ending at this stop (Requirement 2):
      // stop_sequence < max(stop_sequence) AND trip_headsign != stopName
      const rows = db.prepare(`
        SELECT st.departure_secs, t.trip_id, t.trip_headsign,
               r.route_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
               f.operator_name, f.mode as feed_mode, f.id as feed_id,
               0 as is_tomorrow
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        JOIN routes r ON t.route_id = r.route_id
        JOIN feeds f ON r.feed_id = f.id
        WHERE f.status != 'horário expirado' AND f.status != 'EXPIRED'
          AND (st.stop_id = ? OR st.stop_id IN (SELECT s2.stop_id FROM stops s2 WHERE s2.parent_station = ? OR s2.parent_station = ?))
          AND st.departure_secs >= ?
          AND st.stop_sequence < (SELECT MAX(st2.stop_sequence) FROM stop_times st2 WHERE st2.trip_id = st.trip_id)
          AND (t.trip_headsign IS NULL OR t.trip_headsign != ?)
        ORDER BY st.departure_secs ASC
        LIMIT ?
      `).all(stopId, stopId, rawStopId, currentSecs - 120, stopName, remainingLimit * 4) as Array<{
        departure_secs: number;
        trip_id: string;
        trip_headsign: string;
        route_id: string;
        route_short_name: string;
        route_long_name: string;
        route_type: number;
        route_color: string;
        operator_name: string;
        feed_mode: string;
        feed_id: string;
        is_tomorrow: number;
      }>;

      let combinedRows = [...rows];
      if (combinedRows.length < remainingLimit) {
        const morningRows = db.prepare(`
          SELECT st.departure_secs, t.trip_id, t.trip_headsign,
                 r.route_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color,
                 f.operator_name, f.mode as feed_mode, f.id as feed_id,
                 1 as is_tomorrow
          FROM stop_times st
          JOIN trips t ON st.trip_id = t.trip_id
          JOIN routes r ON t.route_id = r.route_id
          JOIN feeds f ON r.feed_id = f.id
          WHERE f.status != 'horário expirado' AND f.status != 'EXPIRED'
            AND (st.stop_id = ? OR st.stop_id IN (SELECT s2.stop_id FROM stops s2 WHERE s2.parent_station = ? OR s2.parent_station = ?))
            AND st.departure_secs < ?
            AND st.stop_sequence < (SELECT MAX(st2.stop_sequence) FROM stop_times st2 WHERE st2.trip_id = st.trip_id)
            AND (t.trip_headsign IS NULL OR t.trip_headsign != ?)
          ORDER BY st.departure_secs ASC
          LIMIT ?
        `).all(stopId, stopId, rawStopId, currentSecs, stopName, remainingLimit * 2) as typeof rows;
        combinedRows = combinedRows.concat(morningRows);
      }

      // Deduplicate:
      // 1. By trip_id
      // 2. If two trips have identical departure time and destination at this stop, show one.
      const seenTripIds = new Set<string>();
      const seenTimeAndDest = new Set<string>();

      for (const r of combinedRows) {
        if (departures.length >= limit) break;
        if (seenTripIds.has(r.trip_id)) continue;
        seenTripIds.add(r.trip_id);

        const norm = normalizeCpRoute(r);
        const dest = r.trip_headsign || norm.name || r.route_long_name || 'Destino';
        const timeDestKey = `${r.departure_secs}:${dest.toLowerCase().trim()}`;
        if (seenTimeAndDest.has(timeDestKey)) continue;
        seenTimeAndDest.add(timeDestKey);

        const diffSecs = r.is_tomorrow === 1
          ? (24 * 3600 - currentSecs) + r.departure_secs
          : r.departure_secs - currentSecs;

        // If trip departed more than 2 minutes ago, drop it (Requirement 3: never wrap to tomorrow)
        if (diffSecs < -120) continue;

        let diffMinutes = Math.round(diffSecs / 60);
        let displayText = `daqui a ${diffMinutes} min`;

        if (diffSecs <= 0 && diffSecs >= -120) {
          diffMinutes = 0;
          displayText = 'a partir';
        } else if (diffSecs <= 60) {
          diffMinutes = 0;
          displayText = 'a chegar';
        } else if (r.is_tomorrow === 1) {
          const depHour = Math.floor(r.departure_secs / 3600) % 24;
          const depMin = Math.floor((r.departure_secs % 3600) / 60);
          const tStr = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;
          displayText = `amanhã às ${tStr}`;
        }

        const depHour = Math.floor(r.departure_secs / 3600) % 24;
        const depMin = Math.floor((r.departure_secs % 3600) / 60);
        const timeStr = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;
        const color = r.route_color ? (r.route_color.startsWith('#') ? r.route_color : `#${r.route_color}`) : '#2563EB';

        departures.push({
          line_id: r.route_id,
          line_code: norm.code || r.route_short_name || r.route_id,
          line_name: norm.name || r.route_long_name || '',
          color,
          mode: modeFromRouteType(r.route_type, r.feed_mode, r.route_short_name, r.feed_id),
          operator: r.operator_name,
          destination: dest,
          scheduled_time: timeStr,
          actual_time: timeStr,
          state: 'Programado',
          countdown_minutes: Math.max(0, diffMinutes),
          delay_minutes: 0,
          displayText,
        });
      }
    }

    return {
      stop_id: stopId,
      stop_name: stopName,
      departures,
    };
  }
}
