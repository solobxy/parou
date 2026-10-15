import { UnifiedStop } from './stopsEngine';
import { DateTime } from 'luxon';
import { getStcpLiveVehicles } from './portoOpenDataService';
import { chegadasStcpOficial } from './stcpApi';
import { getDatabase, registerCacheClearCallback } from './db/gtfsDatabase';
import { estimativaTub, posicoesTub, viagensTub } from './tubTempoReal';
import { anotarAnteriores } from './historicoPosicoes';

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
  /** Viagem e linha que o operador diz que o veículo está a fazer (nem sempre existem no horário da base) */
  trip_id?: string;
  route_id?: string;
  /** Posição medida antes da atual (para o mapa mostrar o autocarro já em movimento); ver historicoPosicoes.ts */
  prev?: { lat: number; lon: number; timestamp: number };
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
const VEHICLES_CACHE_TTL_MS = 6 * 1000; // 6 s: quanto mais fresca a posição, mais exato o mapa (os operadores só mudam de 15 em 15 s)
const ARRIVALS_CACHE_TTL_MS = 30 * 1000; // 30 s
// STCP: chegadas em tempo real por paragem. Fonte principal: API oficial da STCP (stcpApi.ts, atualiza de
// 10 em 10 s, com limite de 15 000 pedidos por dia); reserva: https://stcp.pt/api/stops/{código}/realtime
const STCP_CACHE_TTL_MS = 30 * 1000; // 30 s por paragem (a API oficial tem limite de 15 000 pedidos por dia)
const stcpArrivalsCache = new Map<string, { data: any[]; timestamp: number }>();
const stcpPedidosEmCurso = new Map<string, Promise<any[]>>();
const ALERTS_CACHE_TTL_MS = 60 * 1000;   // 60 s
const MAX_STALE_AGE_SECS = 120;          // Data older than 2 min (120 s) ignored

/** Texto que explica de onde vem a hora em tempo real da STCP */
function motivoStcp(atrasoSegundos: number, porGps: boolean): string {
  if (atrasoSegundos > 90) {
    return porGps
      ? `Atraso de ${Math.round(atrasoSegundos / 60)} min transmitido por GPS do autocarro`
      : `Atraso de ${Math.round(atrasoSegundos / 60)} min indicado pela STCP`;
  }
  return porGps ? 'Hora estimada em direto pelo GPS do autocarro (STCP)' : 'Hora estimada pela STCP';
}

/** Texto que explica de onde vem a hora em tempo real da TUB */
function motivoTub(atrasoSegundos: number): string {
  return atrasoSegundos > 90
    ? `Atraso de ${Math.round(atrasoSegundos / 60)} min transmitido por GPS do autocarro (TUB)`
    : 'Hora estimada em direto pelo GPS do autocarro (TUB)';
}

// TUB: o GTFS-Realtime usa o código da linha do GTFS (na base "tub_braga:<código>"); o número que as pessoas conhecem é o nome curto.
let nomesCurtosTub: Map<string, string> | null = null;
registerCacheClearCallback(() => { nomesCurtosTub = null; });
function nomeCurtoTub(routeId: string): string {
  if (!nomesCurtosTub) {
    const mapa = new Map<string, string>();
    try {
      const rows = getDatabase().prepare("SELECT route_id AS id, route_short_name AS curto FROM routes WHERE route_id LIKE 'tub_braga:%'").all() as Array<{ id: string; curto: string | null }>;
      for (const r of rows) if (r.curto) mapa.set(r.id.replace(/^tub_braga:/, ''), String(r.curto).trim());
    } catch { /* a base ainda está a carregar: usa-se o código e tenta-se outra vez à próxima */ }
    if (mapa.size === 0) return routeId;
    nomesCurtosTub = mapa;
  }
  return nomesCurtosTub.get(routeId) || routeId;
}

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
    const [cmResult, stcpResult, tubResult] = await Promise.allSettled([
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
              ...(v.trip_id ? { trip_id: String(v.trip_id) } : {}),
              ...(v.route_id ? { route_id: String(v.route_id) } : {}),
            });
          }
        }
        return list;
      })(),

      // 2. STCP (Porto Open Data: urban-platform-bus-location)
      getStcpLiveVehicles(),

      // 3. TUB (Braga): GTFS-Realtime cedido pela TUB, pedido partilhado e com cache (tubTempoReal.ts)
      posicoesTub(4000),
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
          ...(b.trip_id ? { trip_id: b.trip_id } : {}),
          ...(b.route_id ? { route_id: b.route_id } : {}),
        });
      }
    }

    if (tubResult.status === 'fulfilled' && tubResult.value) {
      for (const p of tubResult.value.dados) {
        if (now / 1000 - p.epoch > MAX_STALE_AGE_SECS) continue;
        validVehicles.push({
          id: `tub:${p.veiculo}`,
          line_id: nomeCurtoTub(p.routeId),
          operator: 'TUB',
          lat: p.lat,
          lon: p.lon,
          bearing: p.rumo,
          speed: p.velocidade,
          timestamp: p.epoch,
          ...(p.tripId ? { trip_id: p.tripId } : {}),
          route_id: p.routeId,
        });
      }
    }

    if (validVehicles.length > 0) {
      anotarAnteriores(validVehicles, now);
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
  /**
   * Chegadas em tempo real de uma paragem STCP, com cache de 30 s por paragem.
   * Usa a API oficial da STCP e, se ela não responder, a fonte anterior (stcp.pt).
   * Devolve [] se nenhuma responder em 2,5 s ou se os dados não forem de tempo real.
   */
  public static async getStcpArrivals(stopId: string): Promise<any[]> {
    const code = stopId.replace(/^stcp:/, '').trim();
    if (!code) return [];
    const now = Date.now();
    const cached = stcpArrivalsCache.get(code);
    if (cached && now - cached.timestamp < STCP_CACHE_TTL_MS) return cached.data;
    // Vários pedidos à mesma paragem ao mesmo tempo partilham uma só ida à STCP
    const emCurso = stcpPedidosEmCurso.get(code);
    if (emCurso) return emCurso;
    const pedido = (async (): Promise<any[]> => {
      try {
        const oficial = await chegadasStcpOficial(code);
        if (oficial) {
          // Mesmo formato da fonte anterior, com a hora exata (epoch) em vez de minutos
          const data = oficial.map((c) => ({
            epoch: c.epoch,
            route_short_name: c.linha,
            route_id: c.routeId,
            route_long_name: c.longa,
            route_color: c.cor,
            trip_headsign: c.destino,
            trip_id: c.tripId ? `stcp:${c.tripId}` : '',
            delay_minutes: c.atrasoS / 60,
            status: c.cancelada ? 'CANCELLED' : '',
            com_gps: c.comGps,
          }));
          stcpArrivalsCache.set(code, { data, timestamp: Date.now() });
          return data;
        }
        const res = await fetch(`https://stcp.pt/api/stops/${encodeURIComponent(code)}/realtime`, {
          headers: { 'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)', Accept: 'application/json' },
          signal: AbortSignal.timeout(2500),
        });
        if (!res.ok) {
          stcpArrivalsCache.set(code, { data: [], timestamp: Date.now() });
          return [];
        }
        const json: any = await res.json();
        const data = json?.data_source === 'realtime' && Array.isArray(json?.arrivals) ? json.arrivals : [];
        stcpArrivalsCache.set(code, { data, timestamp: Date.now() });
        return data;
      } catch {
        const fallback = cached?.data || [];
        stcpArrivalsCache.set(code, { data: fallback, timestamp: Date.now() });
        return fallback;
      } finally {
        stcpPedidosEmCurso.delete(code);
      }
    })();
    stcpPedidosEmCurso.set(code, pedido);
    return pedido;
  }

  public static async mergeRealtimeData(
    departures: LiveDeparture[],
    stop: UnifiedStop,
    nowEpochSecs: number
  ): Promise<LiveDeparture[]> {
    const result: LiveDeparture[] = [];

    // Metro de Lisboa real-time state check
    const metroStatus = await this.getMetroLisboaStatus();

    // STCP em tempo real: cada chegada com GPS substitui a partida programada da mesma linha
    // mais próxima (até 6 min); as que não têm correspondência entram como partidas novas.
    const stcpTempoReal = new Map<LiveDeparture, { estEpoch: number; vehicleId?: string; cancelada: boolean; porGps: boolean }>();
    const stcpNovas: LiveDeparture[] = [];
    const paragensStcp = (stop.member_stop_ids || []).filter((id) => id.startsWith('stcp:')).slice(0, 3);
    for (const sid of paragensStcp) {
      const chegadas = await this.getStcpArrivals(sid);
      for (const a of chegadas) {
        // API oficial: hora exata (epoch); fonte anterior: minutos até à chegada
        const estEpoch = Number.isFinite(Number(a?.epoch))
          ? Math.round(Number(a.epoch))
          : nowEpochSecs + Math.round(Number(a?.arrival_minutes) * 60);
        const mins = (estEpoch - nowEpochSecs) / 60;
        if (!Number.isFinite(mins) || mins < -0.5 || mins > 180) continue;
        const linha = String(a.route_short_name || '').trim();
        if (!linha) continue;
        const porGps = a.com_gps !== false;
        const atrasoMin = Number(a.delay_minutes);
        const progEpoch = Number.isFinite(atrasoMin) ? estEpoch - Math.round(atrasoMin * 60) : estEpoch;
        const cancelada = /CANCEL/i.test(String(a.status || ''));
        // Mesma viagem (identificador igual, quando os horários são os oficiais) ou, senão, a partida
        // da mesma linha com a hora mais próxima (até 6 min)
        let melhor: LiveDeparture | null = a.trip_id
          ? departures.find((d) => d.feed_id === 'stcp' && d.trip_id === a.trip_id && d.stop_id === sid && !stcpTempoReal.has(d)) || null
          : null;
        let melhorDif = 6 * 60 + 1;
        if (!melhor) {
          for (const d of departures) {
            if (d.feed_id !== 'stcp' || stcpTempoReal.has(d)) continue;
            if (String(d.route_short_name || '').trim().toUpperCase() !== linha.toUpperCase()) continue;
            const dif = Math.abs(d.dep_epoch_secs - progEpoch);
            if (dif < melhorDif) { melhor = d; melhorDif = dif; }
          }
        }
        if (melhor) {
          stcpTempoReal.set(melhor, { estEpoch, vehicleId: a.vehicle_id || undefined, cancelada, porGps });
        } else if (!cancelada) {
          const atraso = estEpoch - progEpoch;
          stcpNovas.push({
            trip_id: String(a.trip_id || `stcp-rt:${linha}:${estEpoch}`),
            route_id: `stcp:${a.route_id || linha}`,
            route_short_name: linha,
            route_long_name: a.route_long_name || '',
            route_type: 3,
            route_color: a.route_color || '',
            headsign: a.trip_headsign || '',
            operator_name: 'STCP (Porto)',
            feed_id: 'stcp',
            stop_id: sid,
            stop_sequence: 0,
            scheduled_time: DateTime.fromSeconds(progEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm'),
            scheduled_time_iso: DateTime.fromSeconds(progEpoch, { zone: 'Europe/Lisbon' }).toISO() || '',
            scheduled_seconds: 0,
            dep_epoch_secs: progEpoch,
            realtime_time: DateTime.fromSeconds(estEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm'),
            realtime_epoch_secs: estEpoch,
            state: 'TEMPO REAL',
            state_reason: motivoStcp(atraso, porGps),
            delay_seconds: atraso,
            is_realtime: true,
            is_delayed: atraso > 90,
            display_text: '',
            vehicle_id: a.vehicle_id || undefined,
          } as LiveDeparture);
        }
      }
    }

    // TUB (Braga): previsões por viagem e paragem (só se esta paragem tem partidas da TUB)
    const tubViagens = departures.some((d) => d.feed_id === 'tub_braga') ? await viagensTub(1000) : null;

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

      // Case A2: STCP com chegada em tempo real
      else if (dep.feed_id === 'stcp' && stcpTempoReal.has(dep)) {
        const rt = stcpTempoReal.get(dep)!;
        if (rt.cancelada) {
          mergedDep.state = 'SUPRIMIDO';
          mergedDep.state_reason = 'Viagem suprimida pela STCP';
          mergedDep.is_realtime = true;
        } else {
          const atraso = rt.estEpoch - dep.dep_epoch_secs;
          mergedDep.state = 'TEMPO REAL';
          mergedDep.is_realtime = true;
          mergedDep.realtime_epoch_secs = rt.estEpoch;
          mergedDep.realtime_time = DateTime.fromSeconds(rt.estEpoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
          mergedDep.delay_seconds = atraso;
          mergedDep.is_delayed = atraso > 90;
          mergedDep.vehicle_id = rt.vehicleId;
          mergedDep.state_reason = motivoStcp(atraso, rt.porGps);
        }
      }

      // Case A3: TUB com previsão em direto para esta viagem e paragem (sem previsão fica o horário, como estava)
      else if (dep.feed_id === 'tub_braga') {
        const e = tubViagens ? estimativaTub(dep, tubViagens.dados) : null;
        if (e?.tipo === 'suprimida') {
          mergedDep.state = 'SUPRIMIDO';
          mergedDep.is_realtime = true;
          mergedDep.state_reason = e.motivo === 'viagem' ? 'Viagem suprimida pela TUB' : 'A TUB indica que o autocarro não pára nesta paragem';
        } else if (e?.tipo === 'hora') {
          const atraso = e.epoch - dep.dep_epoch_secs;
          mergedDep.state = 'TEMPO REAL';
          mergedDep.is_realtime = true;
          mergedDep.realtime_epoch_secs = e.epoch;
          mergedDep.realtime_time = DateTime.fromSeconds(e.epoch, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
          mergedDep.delay_seconds = atraso;
          mergedDep.is_delayed = atraso > 90;
          if (e.veiculo) mergedDep.vehicle_id = e.veiculo;
          mergedDep.state_reason = motivoTub(atraso);
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

    if (stcpNovas.length > 0) {
      result.push(...stcpNovas);
      const quando = (d: LiveDeparture) => (d.is_realtime && d.realtime_epoch_secs !== undefined ? d.realtime_epoch_secs : d.dep_epoch_secs);
      result.sort((a, b) => quando(a) - quando(b));
    }

    return result;
  }
}
