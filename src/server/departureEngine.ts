import { DateTime } from 'luxon';
import { 
  queryDeparturesForStop, 
  getActiveServiceIds, 
  getMaxStopSequence, 
  getFrequenciesForTrip,
  RawDepartureRow,
  getAllFeeds,
  getDatabase,
  getFeedCalendarBounds
} from './db/gtfsDatabase';
import { StopsEngine, UnifiedStop } from './stopsEngine';
import { RealtimeEngine, LiveDeparture } from './realtimeEngine';
import { getUnirStopDepartures } from './unirQiHorasService';
import { getFeedTimezone } from './dadosProntos';

export interface DepartureResult {
  stop: {
    id: string;
    name: string;
    lat: number;
    lon: number;
    operators: string[];
    modes: string[];
    member_stop_ids: string[];
  };
  now_lisbon: string;
  departures: LiveDeparture[];
  status_notice?: string;
  has_realtime: boolean;
  first_departure_today?: string;
  last_departure_today?: string;
}

const LISBON_ZONE = 'Europe/Lisbon';

export function isFeedExcluded(feed?: any): boolean {
  if (!feed) return false;
  const status = (feed.status || '').toLowerCase();
  if (['importing', 'downloading', 'parsing'].includes(status)) {
    return true;
  }
  const hasImportedData = (feed.lines_count > 0 || feed.trips_count > 0 || Boolean(feed.last_ok));
  if (!hasImportedData && ['error', 'unavailable', 'needs_key', 'needs_auth', 'falhou'].includes(status)) {
    return true;
  }
  return false;
}

export function isFeedOutdated(feed?: any, todayDateStr?: string): boolean {
  if (!feed) return false;
  const todayClean = (todayDateStr || DateTime.now().setZone('Europe/Lisbon').toFormat('yyyyMMdd')).replace(/\D/g, '').slice(0, 8);
  if (feed.valid_until) {
    const validClean = feed.valid_until.replace(/\D/g, '').slice(0, 8);
    if (validClean && validClean < todayClean) return true;
  }
  if (feed.last_error && feed.last_error.startsWith('O operador não atualizou as datas do calendário')) {
    return true;
  }
  if (feed.id) {
    const bounds = getFeedCalendarBounds();
    const bound = bounds.get(feed.id);
    if (bound?.lastDay) {
      const boundClean = bound.lastDay.replace(/\D/g, '').slice(0, 8);
      if (boundClean && boundClean < todayClean) return true;
    }
  }
  return false;
}

function formatDisplayMinutes(diffSecs: number): string {
  const mins = Math.max(0, Math.round(diffSecs / 60));
  if (mins === 0) return 'a chegar';
  if (mins === 1) return 'chega em 1 min';
  return `chega em ${mins} min`;
}

function formatProgrammedText(timeStr: string, diffSecs: number, dayLabel?: string): string {
  const mins = Math.max(0, Math.round(diffSecs / 60));
  const dayPrefix = dayLabel && dayLabel !== 'hoje' ? `${dayLabel} ` : '';
  if (mins < 60) {
    return `${timeStr} · Programado · daqui a ~${mins} min`;
  }
  return `${dayPrefix}${timeStr} · Programado`;
}

function secondsToTimeString(totalSecs: number): string {
  const normalized = totalSecs % 86400;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function comPrazo<T>(p: Promise<T>, ms: number, alternativa: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let resolvido = false;
    const timer = setTimeout(() => {
      if (!resolvido) {
        resolvido = true;
        resolve(alternativa);
      }
    }, ms);

    p.then(
      (res) => {
        if (!resolvido) {
          resolvido = true;
          clearTimeout(timer);
          resolve(res);
        }
      },
      () => {
        if (!resolvido) {
          resolvido = true;
          clearTimeout(timer);
          resolve(alternativa);
        }
      }
    );
  });
}

interface NextDeparturesCacheEntry {
  data: DepartureResult;
  expiresAt: number;
}
const nextDeparturesCache = new Map<string, NextDeparturesCacheEntry>();

export function clearNextDeparturesCache(): void {
  nextDeparturesCache.clear();
}

export class DepartureEngine {
  /**
   * Main nextDepartures engine:
   * Evaluates Europe/Lisbon, yesterday/today/+7 days, GTFS calendar + calendar_dates,
   * trips past 24:00, frequencies.txt, skip last stop / pickup_type=1,
   * and merges with RealtimeEngine.
   */
  public static async nextDepartures(
    stopParam: UnifiedStop | string,
    nowInput: Date | string = new Date(),
    maxResults = 15
  ): Promise<DepartureResult> {
    const stopIdKey = typeof stopParam === 'string' ? stopParam : stopParam?.id;
    const cacheKey = `${stopIdKey}_${maxResults}`;
    if (stopIdKey) {
      const cached = nextDeparturesCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }
    // 1. Timezone Europe/Lisbon using Luxon
    const lisbonNow = (typeof nowInput === 'string' ? DateTime.fromISO(nowInput) : DateTime.fromJSDate(nowInput))
      .setZone(LISBON_ZONE);

    const nowEpochSecs = Math.floor(lisbonNow.toSeconds());

    // 2. Resolve unified stop
    let stop: UnifiedStop | null = null;
    if (typeof stopParam === 'string') {
      stop = await StopsEngine.getUnifiedStopById(stopParam);
    } else {
      stop = stopParam;
    }

    if (!stop) {
      return {
        stop: {
          id: typeof stopParam === 'string' ? stopParam : 'unknown',
          name: 'Paragem não encontrada',
          lat: 0,
          lon: 0,
          operators: [],
          modes: [],
          member_stop_ids: [],
        },
        now_lisbon: lisbonNow.toISO() || '',
        departures: [],
        status_notice: 'Sem partidas · Paragem não encontrada no catálogo nacional.',
        has_realtime: false,
      };
    }

    const feeds = getAllFeeds();
    const feedsMap = new Map<string, any>();
    feeds.forEach((f) => feedsMap.set(f.id, f));

    // 3. Test service dates: YESTERDAY (-1), TODAY (0), and up to 7 days ahead (1..7)
    const testDayOffsets = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

    const collectedCandidates: {
      raw: RawDepartureRow;
      serviceDay: DateTime;
      serviceDayStartSecs: number;
      depEpochSecs: number;
      scheduledSecs: number;
      frequencyLabel?: string;
      dayLabel: string;
      avisoHorario?: string;
    }[] = [];

    // Map to keep track of first/last departures of the day
    let firstDepToday: string | undefined;
    let lastDepToday: string | undefined;

    // Evaluate member stops and day offsets in each feed's agency_timezone
    for (const memberStopId of stop.member_stop_ids) {
      const colonIdx = memberStopId.indexOf(':');
      const feedId = colonIdx !== -1 ? memberStopId.slice(0, colonIdx) : memberStopId;
      const feed = feedsMap.get(feedId);

      // 1. Exclui apenas feeds que nunca importaram com sucesso ou estão a meio de importação
      if (isFeedExcluded(feed)) continue;

      // 2. agency_timezone do feed, nunca UTC
      const feedZone = getFeedTimezone(feedId);
      const feedNow = (typeof nowInput === 'string' ? DateTime.fromISO(nowInput) : DateTime.fromJSDate(nowInput)).setZone(feedZone);
      const feedNowEpochSecs = Math.floor(feedNow.toSeconds());

      // 3. valid_until no passado gera aviso sem excluir
      const isOutdated = isFeedOutdated(feed, feedNow.toFormat('yyyyMMdd'));
      const avisoHorario = isOutdated ? 'horário possivelmente desatualizado' : undefined;

      for (const d of testDayOffsets) {
        const serviceDay = feedNow.plus({ days: d });
        const dateStr = serviceDay.toFormat('yyyyLLdd');
        const dayOfWeekName = serviceDay.toFormat('cccc').toLowerCase();

        const noon = DateTime.fromObject(
          { year: serviceDay.year, month: serviceDay.month, day: serviceDay.day, hour: 12, minute: 0, second: 0 },
          { zone: feedZone }
        );
        const serviceDayStart = noon.minus({ hours: 12 });
        const serviceDayStartSecs = Math.floor(serviceDayStart.toSeconds());

        let dayLabel = 'hoje';
        if (d === -1) dayLabel = 'hoje'; // Viagens após 24:00 do dia anterior partem hoje de madrugada
        else if (d === 1) dayLabel = 'amanhã';
        else if (d > 1) dayLabel = serviceDay.setLocale('pt-PT').toFormat('cccc');

        // Janela de tempo no SQL: st.departure_secs BETWEEN agora-120 AND agora+3h (Regra 2)
        const currentSecsOfDay = feedNow.hour * 3600 + feedNow.minute * 60 + feedNow.second;
        const minSecs = d === -1 ? Math.max(86400, (currentSecsOfDay + 86400) - 120) : (d === 0 ? Math.max(0, currentSecsOfDay - 120) : 0);
        const maxSecs = d === -1 ? (currentSecsOfDay + 86400) + 10800 : (d === 0 ? currentSecsOfDay + 10800 : 14400);

        const activeServiceIds = getActiveServiceIds(feedId, dateStr, dayOfWeekName);
        if (activeServiceIds.size === 0) continue;

        const rawRows = queryDeparturesForStop(
          feedId,
          memberStopId,
          Array.from(activeServiceIds),
          minSecs,
          maxSecs
        );

        for (const row of rawRows) {
          if (row.pickup_type === 1) continue;

          const maxSeq = getMaxStopSequence(feedId, row.trip_id);
          if (row.stop_sequence >= maxSeq && maxSeq > 1) {
            continue;
          }

          const freqs = getFrequenciesForTrip(feedId, row.trip_id);
          if (freqs.length > 0) {
            const db = getDatabase();
            const firstStopRow = db.prepare('SELECT MIN(departure_secs) as min_dep FROM stop_times WHERE trip_id = ?').get(row.trip_id) as { min_dep: number } | undefined;
            const firstStopDepSecs = firstStopRow?.min_dep ?? row.departure_secs;
            const travelTimeToStop = Math.max(0, row.departure_secs - firstStopDepSecs);

            for (const f of freqs) {
              const exactTimes = f.exact_times === 1;
              const freqLabel = !exactTimes ? `a cada ${Math.round(f.headway_secs / 60)} min` : undefined;

              for (let tSecs = f.start_time_secs; tSecs < f.end_time_secs; tSecs += f.headway_secs) {
                const depSecs = tSecs + travelTimeToStop;
                const depEpoch = serviceDayStartSecs + depSecs;

                if (d === 0 || (d === -1 && depSecs >= 86400)) {
                  const timeFormatted = secondsToTimeString(depSecs);
                  if (!firstDepToday) firstDepToday = timeFormatted;
                  lastDepToday = timeFormatted;
                }

                if (depEpoch >= feedNowEpochSecs) {
                  collectedCandidates.push({
                    raw: row,
                    serviceDay,
                    serviceDayStartSecs,
                    depEpochSecs: depEpoch,
                    scheduledSecs: depSecs,
                    frequencyLabel: freqLabel,
                    dayLabel,
                    avisoHorario,
                  });
                }
              }
            }
          } else {
            const depEpoch = serviceDayStartSecs + row.departure_secs;

            if (d === 0 || (d === -1 && row.departure_secs >= 86400)) {
              const timeFormatted = secondsToTimeString(row.departure_secs);
              if (!firstDepToday) firstDepToday = timeFormatted;
              lastDepToday = timeFormatted;
            }

            if (depEpoch >= feedNowEpochSecs) {
              collectedCandidates.push({
                raw: row,
                serviceDay,
                serviceDayStartSecs,
                depEpochSecs: depEpoch,
                scheduledSecs: row.departure_secs,
                dayLabel,
                avisoHorario,
              });
            }
          }
        }
      }
    }

    // Direct Carris Metropolitana integration if stop is CM or has CM member stops
    const cmMemberStops = stop.member_stop_ids.filter((id) => id.startsWith('cm:') || stop!.feed_ids.includes('carris_metropolitana'));
    let cmDirectDepartures: LiveDeparture[] = [];
    if (cmMemberStops.length > 0) {
      for (const cmId of cmMemberStops) {
        const directList = await comPrazo(RealtimeEngine.getCarrisMetropolitanaDirectDepartures(cmId, nowEpochSecs), 2000, []);
        cmDirectDepartures.push(...directList);
      }
    }

    // Direct UNIR integration if stop is UNIR or has UNIR member stops
    const unirMemberStops = stop.member_stop_ids.filter((id) => id.startsWith('unir:') || stop!.feed_ids.includes('unir'));
    let unirDirectDepartures: LiveDeparture[] = [];
    if (unirMemberStops.length > 0) {
      const uniqueUnirCodes = [...new Set(unirMemberStops.map((id) => id.replace(/^unir:/, '').trim()))].slice(0, 2);
      for (const unirCode of uniqueUnirCodes) {
        const directList = await comPrazo(getUnirStopDepartures(unirCode), 2000, []);
        unirDirectDepartures.push(
          ...directList.map((d: any) => {
            const depEpochSecs = nowEpochSecs + (d.countdown_minutes * 60);
            return {
              trip_id: d.trip_id,
              route_id: d.route_id,
              route_short_name: d.route_short_name || 'UNIR',
              route_long_name: d.route_long_name || '',
              route_type: 3,
              route_color: '#1E3A8A',
              headsign: d.trip_headsign || 'Destino',
              operator_name: 'UNIR (Área Metropolitana do Porto)',
              feed_id: 'unir',
              stop_id: `unir:${unirCode}`,
              stop_sequence: 1,
              scheduled_time: d.departure_time,
              scheduled_time_iso: DateTime.fromSeconds(depEpochSecs, { zone: LISBON_ZONE }).toISO() || '',
              scheduled_seconds: d.departure_secs || 0,
              dep_epoch_secs: depEpochSecs,
              state: 'PROGRAMADO' as const,
              state_reason: 'Horário Oficial AMP QiHoras',
              is_realtime: false,
              display_text: d.display_text,
            };
          })
        );
      }
    }

    // Deduplicate by trip_id and serviceDay so the same trip isn't added multiple times from cais and parent station
    const uniqueCandidates: typeof collectedCandidates = [];
    const seenTripDays = new Set<string>();
    for (const c of collectedCandidates) {
      const tripKey = `${c.raw.trip_id}::${c.serviceDay}::${c.scheduledSecs}`;
      if (!seenTripDays.has(tripKey)) {
        seenTripDays.add(tripKey);
        uniqueCandidates.push(c);
      }
    }

    // Sort all collected departures chronologically by depEpochSecs
    uniqueCandidates.sort((a, b) => a.depEpochSecs - b.depEpochSecs);

    // Take top candidates
    const topCandidates = uniqueCandidates.slice(0, maxResults);

    // Initial LiveDeparture items (PROGRAMADO state initially)
    const initialDepartures: LiveDeparture[] = [
      ...cmDirectDepartures.filter((d) => ((d.is_realtime && d.realtime_epoch_secs !== undefined) ? d.realtime_epoch_secs : d.dep_epoch_secs) >= nowEpochSecs),
      ...unirDirectDepartures.filter((d) => ((d.is_realtime && d.realtime_epoch_secs !== undefined) ? d.realtime_epoch_secs : d.dep_epoch_secs) >= nowEpochSecs),
      ...topCandidates.map((c) => {
        const scheduledTimeStr = secondsToTimeString(c.scheduledSecs);
        const diffSecs = c.depEpochSecs - nowEpochSecs;
        const f = feedsMap.get(c.raw.feed_id);
        const opName = f?.operator_name || c.raw.feed_id.toUpperCase();

        return {
          trip_id: c.raw.trip_id,
          route_id: c.raw.route_id,
          route_short_name: c.raw.route_short_name || c.raw.route_id,
          route_long_name: c.raw.route_long_name || '',
          route_type: c.raw.route_type,
          route_color: c.raw.route_color || '#2563eb',
          headsign: c.raw.trip_headsign || 'Destino terminal',
          operator_name: opName,
          feed_id: c.raw.feed_id,
          stop_id: c.raw.stop_id,
          stop_sequence: c.raw.stop_sequence,
          scheduled_time: scheduledTimeStr,
          scheduled_time_iso: DateTime.fromSeconds(c.depEpochSecs, { zone: LISBON_ZONE }).toISO() || '',
          scheduled_seconds: c.scheduledSecs,
          dep_epoch_secs: c.depEpochSecs,
          state: 'PROGRAMADO' as const,
          state_reason: 'Horário oficial programado',
          is_realtime: false,
          frequency_label: c.frequencyLabel,
          day_label: c.dayLabel,
          realtime_epoch_secs: undefined,
          display_text: formatProgrammedText(scheduledTimeStr, diffSecs, c.dayLabel),
          aviso_horario: (c as any).avisoHorario,
        } as LiveDeparture;
      })
    ]
      .sort((a, b) => ((a.is_realtime && a.realtime_epoch_secs !== undefined) ? a.realtime_epoch_secs : a.dep_epoch_secs) - ((b.is_realtime && b.realtime_epoch_secs !== undefined) ? b.realtime_epoch_secs : b.dep_epoch_secs))
      .slice(0, maxResults);

    // 4. Enrich with Real-time merge (Carris Metropolitana, GTFS-RT, Metro de Lisboa, CP flag)
    const enrichedDepartures = await comPrazo(
      RealtimeEngine.mergeRealtimeData(
        initialDepartures,
        stop,
        nowEpochSecs
      ),
      2000,
      initialDepartures
    );

    // Filter out any departures whose time has already passed:
    // Partidas com tempo real: filtrar pela hora prevista (horário + atraso).
    // Partidas só com horário: esconder quando a hora passa.
    const activeDepartures = enrichedDepartures.filter((d) => {
      const targetEpoch = (d.is_realtime && d.realtime_epoch_secs !== undefined)
        ? d.realtime_epoch_secs
        : d.dep_epoch_secs;
      return targetEpoch >= nowEpochSecs;
    });

    // Re-format display text strictly conforming to rules
    for (const d of activeDepartures) {
      const diffSecs = (d.realtime_epoch_secs || d.dep_epoch_secs) - nowEpochSecs;

      if (d.state === 'TEMPO REAL') {
        d.display_text = formatDisplayMinutes(diffSecs);
      } else if (d.state === 'SUPRIMIDO') {
        d.display_text = `${d.scheduled_time || 'sem horário'} · Suprimido`;
      } else if (d.frequency_label) {
        // Se exact_times for 0, mostra "a cada X min"
        d.display_text = d.frequency_label;
      } else if (d.scheduled_time) {
        d.display_text = formatProgrammedText(d.scheduled_time, diffSecs, d.day_label);
      } else {
        d.display_text = 'sem horário';
      }
    }

    // 5. Handling "Nothing left today" and "Fora de serviço"
    let statusNotice: string | undefined;

    if (activeDepartures.length === 0) {
      statusNotice = 'Sem partidas · Sem serviço programado nos próximos 7 dias para esta paragem.';
    } else {
      const nextDep = activeDepartures[0];
      const isToday = nextDep.day_label === 'hoje' || !nextDep.day_label;

      if (!isToday) {
        // Nothing left today, first departure on following day:
        // Rule: "Fora de serviço · 1.ª partida às 06:30"
        statusNotice = `Fora de serviço · 1.ª partida às ${nextDep.scheduled_time} (${nextDep.day_label})`;
      } else if (lisbonNow.hour >= 1 && lisbonNow.hour < 6) {
        // Night period before morning start
        statusNotice = `Fora de serviço · 1.ª partida às ${firstDepToday || nextDep.scheduled_time}`;
      }
    }

    const hasRealtime = activeDepartures.some((d) => d.state === 'TEMPO REAL');

    const result: DepartureResult = {
      stop: {
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        operators: stop.operators,
        modes: stop.modes,
        member_stop_ids: stop.member_stop_ids,
      },
      now_lisbon: lisbonNow.toISO() || '',
      departures: activeDepartures,
      status_notice: statusNotice,
      has_realtime: hasRealtime,
      first_departure_today: firstDepToday,
      last_departure_today: lastDepToday,
    };

    if (stopIdKey) {
      nextDeparturesCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + 30000,
      });
    }

    return result;
  }
}
