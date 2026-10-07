import { UnifiedStop } from './stopsEngine';
import { DateTime } from 'luxon';
import { getStcpLiveVehicles } from './portoOpenDataService';
import { registerCacheClearCallback } from './db/gtfsDatabase';

registerCacheClearCallback(() => RealtimeEngine.clearCaches());

export type DepartureState = 'TEMPO REAL' | 'PROGRAMADO' | 'SUPRIMIDO';

export interface LiveDeparture {
  trip_id: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  headsign: string;
  operator_name: string;
  feed_id: string;
  stop_id: string;
  stop_sequence: number;
  scheduled_time: string; // "10:42"
  scheduled_time_iso: string;
  scheduled_seconds: number;
  dep_epoch_secs: number;
  realtime_time?: string; // "10:47"
  realtime_epoch_secs?: number;
  state: DepartureState;
  state_reason: string;
  delay_seconds?: number;
  is_realtime: boolean;
  is_delayed?: boolean;
  frequency_label?: string;
  day_label?: string;
  display_text: string;
  vehicle_id?: string;
  aviso_horario?: string;
}

export interface LiveVehicle {
  id: string;
  line_id: string;
  operator: string;
  lat: number;
  lon: number;
  bearing?: number;
  speed?: number;
  timestamp: number;
}

// In-memory Server Cache with TTL
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const vehiclesCache: { data: LiveVehicle[]; timestamp: number } = { data: [], timestamp: 0 };
const arrivalsCache = new Map<string, CacheEntry<any[]>>();
const metroStatusCache: { data: any; timestamp: number } = { data: null, timestamp: 0 };

// TTLs in Milliseconds strictly according to Rule 4
const VEHICLES_CACHE_TTL_MS = 15 * 1000; // 15 s
const ARRIVALS_CACHE_TTL_MS = 30 * 1000; // 30 s
const ALERTS_CACHE_TTL_MS = 60 * 1000;   // 60 s
const MAX_STALE_AGE_SECS = 120;          // Data older than 2 min (120 s) ignored

export class RealtimeEngine {
  public static clearCaches(): void {
    vehiclesCache.data = [];
    vehiclesCache.timestamp = 0;
    arrivalsCache.clear();
    metroStatusCache.data = null;
    metroStatusCache.timestamp = 0;
  }
  /**
   * 1. Fetch live vehicles (Carris Metropolitana, etc.)
   * Server cache: 15 seconds.
   * Vehicle positions without trip updates are shown on the map only (Rule 3: do NOT invent ETAs).
   */
  public static async getLiveVehicles(): Promise<LiveVehicle[]> {
    const now = Date.now();
    if (vehiclesCache.data.length > 0 && now - vehiclesCache.timestamp < VEHICLES_CACHE_TTL_MS) {
      return vehiclesCache.data;
    }

    const validVehicles: LiveVehicle[] = [];

    // Parallel execution of all operators with complete fault tolerance (Requirement 3 & 4)
    const [cmResult, stcpResult] = await Promise.allSettled([
      // 1. Carris Metropolitana
      (async () => {
        const res = await fetch('https://api.carrismetropolitana.pt/v2/vehicles', {
          headers: { 'User-Agent': 'PAROU.PT/2.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [];
        const rawVehicles = (await res.json()) as any[];
        const list: LiveVehicle[] = [];
        if (Array.isArray(rawVehicles)) {
          for (const v of rawVehicles) {
            if (!v.lat || !v.lon) continue;
            const vTime = v.timestamp ? (v.timestamp > 1e11 ? v.timestamp / 1000 : v.timestamp) : now / 1000;
            if (now / 1000 - vTime > MAX_STALE_AGE_SECS) continue;
            list.push({
              id: v.id || `veh_${Math.random().toString(36).slice(2, 7)}`,
              line_id: v.line_id || v.route_id || '',
              operator: 'Carris Metropolitana',
              lat: Number(v.lat),
              lon: Number(v.lon),
              bearing: v.bearing ? Number(v.bearing) : undefined,
              speed: v.speed ? Number(v.speed) : undefined,
              timestamp: Math.round(vTime),
            });
          }
        }
        return list;
      })(),

      // 2. STCP (Porto Open Data: urban-platform-bus-location)
      getStcpLiveVehicles(),
    ]);

    if (cmResult.status === 'fulfilled' && Array.isArray(cmResult.value)) {
      validVehicles.push(...cmResult.value);
    }

    if (stcpResult.status === 'fulfilled' && Array.isArray(stcpResult.value)) {
      for (const b of stcpResult.value) {
        validVehicles.push({
          id: b.id,
          line_id: b.line,
          operator: 'STCP',
          lat: b.lat,
          lon: b.lon,
          bearing: b.bearing,
          speed: b.speed,
          timestamp: b.timestamp,
        });
      }
    }

    if (validVehicles.length > 0) {
      vehiclesCache.data = validVehicles;
      vehiclesCache.timestamp = now;
      return validVehicles;
    }

    return vehiclesCache.data;
  }

  /**
   * 2. Fetch Carris Metropolitana arrivals for a stop
   * Server cache: 30 seconds.
   */
  public static async getCarrisMetropolitanaArrivals(rawStopId: string): Promise<any[]> {
    const stopId = rawStopId.replace(/^cm:/, '');
    const now = Date.now();

    const cached = arrivalsCache.get(stopId);
    if (cached && now - cached.timestamp < ARRIVALS_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const res = await fetch(`https://api.carrismetropolitana.pt/v2/arrivals/by_stop/${stopId}`, {
        headers: { 'User-Agent': 'PAROU.PT/2.0' },
        signal: AbortSignal.timeout(2500),
      });

      if (!res.ok) {
        const fallback = cached?.data || [];
        arrivalsCache.set(stopId, { data: fallback, timestamp: now });
        return fallback;
      }

      const data = (await res.json()) as any[];
      const arrivalsList = Array.isArray(data) ? data : [];
      arrivalsCache.set(stopId, { data: arrivalsList, timestamp: now });
      return arrivalsList;
    } catch {
      const fallback = cached?.data || [];
      arrivalsCache.set(stopId, { data: fallback, timestamp: now });
      return fallback;
    }
  }

  /**
   * Directly transform Carris Metropolitana arrivals API to LiveDepartures
   * Evaluates TEMPO REAL where a bus is live and PROGRAMADO elsewhere.
   */
  public static async getCarrisMetropolitanaDirectDepartures(
    rawStopId: string,
    nowEpochSecs: number
  ): Promise<LiveDeparture[]> {
    const arrivals = await this.getCarrisMetropolitanaArrivals(rawStopId);
    const departures: LiveDeparture[] = [];

    for (const arr of arrivals) {
      // Ignore observed arrivals (already passed)
      if (arr.observed_arrival || arr.observed_arrival_unix) continue;

      const lineId = arr.line_id || arr.route_id || 'CM';
      const headsign = arr.headsign || arr.trip_headsign || 'Destino Terminal';

      let depEpoch: number | null = null;
      if (arr.scheduled_arrival_unix) {
        depEpoch = arr.scheduled_arrival_unix;
      } else if (arr.scheduled_arrival) {
        const parsed = DateTime.fromISO(arr.scheduled_arrival, { zone: 'Europe/Lisbon' });
        if (parsed.isValid) depEpoch = Math.floor(parsed.toSeconds());
      }

      let estEpoch: number | null = null;
      if (arr.estimated_arrival_unix) {
        estEpoch = arr.estimated_arrival_unix;
      } else if (arr.estimated_arrival) {
        const parsed = DateTime.fromISO(arr.estimated_arrival, { zone: 'Europe/Lisbon' });
        if (parsed.isValid) estEpoch = Math.floor(parsed.toSeconds());
      }

      // Se a API não devolve horário programado nem hora estimada, ignora esta partida
      if (depEpoch === null && estEpoch === null) {
        continue;
      }

      const scheduledStr = arr.scheduled_arrival
        ? arr.scheduled_arrival.slice(0, 5)
        : depEpoch !== null
        ? DateTime.fromSeconds(depEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm')
        : DateTime.fromSeconds(estEpoch!, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');

      if (depEpoch === null) {
        depEpoch = estEpoch!;
      }

      let state: DepartureState = 'PROGRAMADO';
      let stateReason = 'Horário oficial programado pela Carris Metropolitana';
      let isRealtime = false;
      let rtTime: string | undefined = undefined;
      let delaySecs: number | undefined = undefined;
      let isDelayed = false;

      // Check if CANCELED
      if (arr.schedule_relationship === 'CANCELED' || arr.schedule_relationship === 'SKIPPED') {
        state = 'SUPRIMIDO';
        stateReason = 'Viagem suprimida pelo operador em tempo real';
        isRealtime = true;
      } else if (estEpoch !== null) {
        // Live estimated bus
        const feedTime = arr.timestamp ? arr.timestamp : nowEpochSecs;
        const isStale = Math.abs(nowEpochSecs - feedTime) > MAX_STALE_AGE_SECS;

        if (!isStale && estEpoch >= nowEpochSecs) {
          state = 'TEMPO REAL';
          isRealtime = true;
          rtTime = DateTime.fromSeconds(estEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
          delaySecs = estEpoch - depEpoch;
          isDelayed = delaySecs > 90;
          stateReason = isDelayed
            ? `Atraso de ${Math.round(delaySecs / 60)} min transmitido por GPS do autocarro`
            : 'Horário estimado em direto transmitido por GPS do autocarro';
          depEpoch = estEpoch;
        } else {
          state = 'PROGRAMADO';
          stateReason = 'Sinal GPS expirado (> 2 min). A usar horário oficial programado';
        }
      }

      const diffSecs = depEpoch - nowEpochSecs;
      let displayText = `${scheduledStr} · Programado · daqui a ~${Math.max(0, Math.round(diffSecs / 60))} min`;
      if (state === 'TEMPO REAL') {
        const mins = Math.max(0, Math.round(diffSecs / 60));
        displayText = mins === 0 ? 'a chegar' : `chega em ${mins} min`;
      } else if (state === 'SUPRIMIDO') {
        displayText = `${scheduledStr} · Suprimido`;
      }

      departures.push({
        trip_id: arr.trip_id || `cm_trip_${arr.pattern_id || lineId}_${scheduledStr}`,
        route_id: `cm:${lineId}`,
        route_short_name: lineId,
        route_long_name: arr.line_long_name || '',
        route_type: 3,
        route_color: '#FBC02D',
        headsign,
        operator_name: 'Carris Metropolitana',
        feed_id: 'carris_metropolitana',
        stop_id: rawStopId,
        stop_sequence: arr.stop_sequence || 1,
        scheduled_time: scheduledStr,
        scheduled_time_iso: DateTime.fromSeconds(depEpoch, { zone: 'Europe/Lisbon' }).toISO() || '',
        scheduled_seconds: (depEpoch % 86400),
        dep_epoch_secs: depEpoch,
        realtime_time: rtTime,
        realtime_epoch_secs: isRealtime ? depEpoch : undefined,
        state,
        state_reason: stateReason,
        delay_seconds: delaySecs,
        is_realtime: isRealtime,
        is_delayed: isDelayed,
        day_label: 'hoje',
        display_text: displayText,
        vehicle_id: arr.vehicle_id,
      });
    }

    return departures;
  }

  /**
   * 3. Fetch Metro de Lisboa Line Status
   */
  public static async getMetroLisboaStatus(): Promise<Record<string, string>> {
    const now = Date.now();
    if (metroStatusCache.data && now - metroStatusCache.timestamp < ALERTS_CACHE_TTL_MS) {
      return metroStatusCache.data;
    }

    try {
      const res = await fetch('https://app.metrolisboa.pt/status/getLinhas.php', {
        headers: { 'User-Agent': 'PAROU.PT/2.0' },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const json = await res.json();
        const resp = json?.resposta || {};
        metroStatusCache.data = resp;
        metroStatusCache.timestamp = now;
        return resp;
      }
      const fallback = metroStatusCache.data || {};
      metroStatusCache.data = fallback;
      metroStatusCache.timestamp = now;
      return fallback;
    } catch {
      const fallback = metroStatusCache.data || {};
      metroStatusCache.data = fallback;
      metroStatusCache.timestamp = now;
      return fallback;
    }
  }

  /**
   * 4. Merge Real-time into Departures
   * Evaluates Carris Metropolitana live arrivals, GTFS-RT delays and trip suppression,
   * Metro de Lisboa, and CP feature flag.
   */
  public static async mergeRealtimeData(
    departures: LiveDeparture[],
    stop: UnifiedStop,
    nowEpochSecs: number
  ): Promise<LiveDeparture[]> {
    const result: LiveDeparture[] = [];

    // Metro de Lisboa real-time state check
    const metroStatus = await this.getMetroLisboaStatus();

    // Check CP feature flag (Rule 3: CP real-time unofficial endpoints only behind feature flag, OFF by default)
    const cpRealtimeEnabled = process.env.ENABLE_CP_REALTIME === 'true';

    // Group departures by feed
    for (const dep of departures) {
      let mergedDep = { ...dep };

      // Case A: Carris Metropolitana
      if (dep.feed_id === 'carris_metropolitana' || dep.stop_id.startsWith('cm:')) {
        const arrivals = await this.getCarrisMetropolitanaArrivals(dep.stop_id);

        // Find matching live arrival by pattern/line/trip/headsign
        const liveMatch = arrivals.find((arr) => {
          // Observed arrival means already passed -> ignore (Rule 3)
          if (arr.observed_arrival || arr.observed_arrival_unix) return false;

          // Match by line or pattern
          const lineMatch = arr.line_id && (dep.route_short_name === arr.line_id || dep.route_id.includes(arr.line_id));
          const timeMatch = arr.scheduled_arrival && arr.scheduled_arrival.slice(0, 5) === dep.scheduled_time.slice(0, 5);
          return lineMatch && (timeMatch || !dep.scheduled_time);
        });

        if (liveMatch) {
          // Check if CANCELED or SKIPPED
          if (liveMatch.schedule_relationship === 'CANCELED' || liveMatch.schedule_relationship === 'SKIPPED') {
            mergedDep.state = 'SUPRIMIDO';
            mergedDep.state_reason = 'Viagem suprimida pelo operador em tempo real';
            mergedDep.is_realtime = true;
          } else if (liveMatch.estimated_arrival_unix || liveMatch.estimated_arrival) {
            // Check data age: if older than 2 minutes (120 s), fallback to PROGRAMADO (Rule 3)
            const estEpoch = liveMatch.estimated_arrival_unix 
              ? liveMatch.estimated_arrival_unix 
              : Math.floor(DateTime.fromISO(liveMatch.estimated_arrival, { zone: 'Europe/Lisbon' }).toSeconds());

            const feedTime = liveMatch.timestamp ? liveMatch.timestamp : nowEpochSecs;
            const isStale = Math.abs(nowEpochSecs - feedTime) > MAX_STALE_AGE_SECS;

            if (!isStale && estEpoch >= nowEpochSecs) {
              mergedDep.state = 'TEMPO REAL';
              mergedDep.is_realtime = true;
              mergedDep.realtime_epoch_secs = estEpoch;

              const estTimeStr = DateTime.fromSeconds(estEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
              mergedDep.realtime_time = estTimeStr;

              const delay = estEpoch - dep.dep_epoch_secs;
              mergedDep.delay_seconds = delay;
              mergedDep.is_delayed = delay > 90; // more than 1.5 min late
              mergedDep.state_reason = mergedDep.is_delayed
                ? `Atraso de ${Math.round(delay / 60)} min transmitido por GPS do autocarro`
                : 'Horário estimado em direto transmitido por GPS';
            } else {
              mergedDep.state = 'PROGRAMADO';
              mergedDep.state_reason = 'Sinal GPS expirado (> 2 min). A usar horário oficial programado';
            }
          }
        }
      }

      // Case B: Metro de Lisboa
      else if (dep.feed_id === 'metro_lisboa') {
        const lineKey = dep.route_short_name.toLowerCase().includes('azul')
          ? 'azul'
          : dep.route_short_name.toLowerCase().includes('amarela')
          ? 'amarela'
          : dep.route_short_name.toLowerCase().includes('verde')
          ? 'verde'
          : dep.route_short_name.toLowerCase().includes('vermelha')
          ? 'vermelha'
          : '';

        if (lineKey && metroStatus[lineKey]) {
          const statusVal = metroStatus[lineKey].trim().toLowerCase();
          if (statusVal === 'ok') {
            mergedDep.state_reason = 'Metro de Lisboa: Circulação normal';
          } else {
            mergedDep.state_reason = `Metro de Lisboa: ${metroStatus[lineKey]}`;
          }
        }
      }

      // Case C: CP (Comboios de Portugal)
      else if (dep.feed_id === 'cp') {
        if (!cpRealtimeEnabled) {
          // Strictly comply with Rule 3: unofficial endpoints only behind feature flag, OFF by default
          mergedDep.state = 'PROGRAMADO';
          mergedDep.is_realtime = false;
          mergedDep.state_reason = 'Horário oficial programado da CP (dados em tempo real não oficiais desativados por omissão)';
        }
      }

      result.push(mergedDep);
    }

    return result;
  }
}
