import { DateTime } from 'luxon';
import { 
  queryDeparturesForStop, 
  getActiveServiceIds, 
  getMaxStopSequence, 
  getFrequenciesForTrip,
  RawDepartureRow,
  getAllFeeds,
  getDatabase
} from './db/gtfsDatabase';
import { StopsEngine, UnifiedStop } from './stopsEngine';
import { RealtimeEngine, LiveDeparture } from './realtimeEngine';
import { getUnirStopDepartures } from './unirQiHorasService';

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
    }[] = [];

    // Map to keep track of first/last departures of the day
    let firstDepToday: string | undefined;
    let lastDepToday: string | undefined;

    // Evaluate each day offset
    for (const d of testDayOffsets) {
      const serviceDay = lisbonNow.plus({ days: d });
      const dateStr = serviceDay.toFormat('yyyyLLdd');
      const dayOfWeekName = serviceDay.toFormat('cccc').toLowerCase();

      // Real time = service-day start (local noon minus 12 h in Europe/Lisbon) + seconds
      // Using Luxon to never add 24h by hand and respect daylight saving transitions
      const noon = DateTime.fromObject(
        { year: serviceDay.year, month: serviceDay.month, day: serviceDay.day, hour: 12, minute: 0, second: 0 },
        { zone: LISBON_ZONE }
      );
      const serviceDayStart = noon.minus({ hours: 12 });
      const serviceDayStartSecs = Math.floor(serviceDayStart.toSeconds());

      let dayLabel = 'hoje';
      if (d === -1) dayLabel = 'ontem';
      else if (d === 1) dayLabel = 'amanhã';
      else if (d > 1) dayLabel = serviceDay.setLocale('pt-PT').toFormat('cccc');

      // For yesterday (-1), we only consider trips passing 24:00 (i.e. departure_secs >= 86400)
      // that arrive in the early morning of today (e.g. 04:10).
      // For today (0), start querying from right now minus 2 minutes so upcoming evening departures are NOT cut off by LIMIT.
      // For future days (> 0), start from 00:00:00 (0).
      const currentSecsOfDay = lisbonNow.hour * 3600 + lisbonNow.minute * 60 + lisbonNow.second;
      const minSecs = d === -1 ? 86400 : (d === 0 ? Math.max(0, currentSecsOfDay - 120) : 0);
      const maxSecs = d === -1 ? 86400 + 43200 : 86400 * 2; // up to 48h to catch overnight services

      // Query departures for all member stops and their respective feeds
      for (const memberStopId of stop.member_stop_ids) {
        const colonIdx = memberStopId.indexOf(':');
        const feedId = colonIdx !== -1 ? memberStopId.slice(0, colonIdx) : memberStopId;

        // Regra: se o horário de um feed já tiver expirado, marca-o como "horário expirado" e não mostres partidas desse feed.
        const feed = feedsMap.get(feedId);
        if (feed && (feed.status === 'horário expirado' || feed.status === 'EXPIRED' || (feed.valid_until && feed.valid_until.replace(/-/g, '') < dateStr))) {
          continue;
        }

        // Active services per date: calendar.txt (range + weekday), then calendar_dates.txt (1=add, 2=remove)
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
          // Rule: Skip the last stop of a trip and pickup_type = 1
          if (row.pickup_type === 1) continue;

          const maxSeq = getMaxStopSequence(feedId, row.trip_id);
          if (row.stop_sequence >= maxSeq && maxSeq > 1) {
            // Last stop of trip, drop-off only
            continue;
          }

          // Rule: frequencies.txt handling (start_time + intervalo + tempo até esta paragem)
          const freqs = getFrequenciesForTrip(feedId, row.trip_id);
          if (freqs.length > 0) {
            const db = getDatabase();
            const firstStopRow = db.prepare('SELECT MIN(departure_secs) as min_dep FROM stop_times WHERE trip_id = ?').get(row.trip_id) as { min_dep: number } | undefined;
            const firstStopDepSecs = firstStopRow?.min_dep ?? row.departure_secs;
            const travelTimeToStop = Math.max(0, row.departure_secs - firstStopDepSecs);

            for (const f of freqs) {
              const exactTimes = f.exact_times === 1;
              const freqLabel = !exactTimes ? `a cada ${Math.round(f.headway_secs / 60)} min` : undefined;

              // Expand frequency: start + k * headway_secs + travelTimeToStop until end_time + travelTimeToStop
              for (let tSecs = f.start_time_secs; tSecs < f.end_time_secs; tSecs += f.headway_secs) {
                const depSecs = tSecs + travelTimeToStop;
                const depEpoch = serviceDayStartSecs + depSecs;

                if (d === 0) {
                  const timeFormatted = secondsToTimeString(depSecs);
                  if (!firstDepToday) firstDepToday = timeFormatted;
                  lastDepToday = timeFormatted;
                }

                // If departure is in future or within last 2 minutes
                if (depEpoch >= nowEpochSecs - 120) {
                  collectedCandidates.push({
                    raw: row,
                    serviceDay,
                    serviceDayStartSecs,
                    depEpochSecs: depEpoch,
                    scheduledSecs: depSecs,
                    frequencyLabel: freqLabel,
                    dayLabel,
                  });
                }
              }
            }
          } else {
            // Standard stop_times schedule
            const depEpoch = serviceDayStartSecs + row.departure_secs;

            if (d === 0) {
              const timeFormatted = secondsToTimeString(row.departure_secs);
              if (!firstDepToday) firstDepToday = timeFormatted;
              lastDepToday = timeFormatted;
            }

            // At 04:10, include yesterday's trips after 24:00 (depEpoch >= nowEpochSecs - 120)
            if (depEpoch >= nowEpochSecs - 120) {
              collectedCandidates.push({
                raw: row,
                serviceDay,
                serviceDayStartSecs,
                depEpochSecs: depEpoch,
                scheduledSecs: row.departure_secs,
                dayLabel,
              });
            }
          }
        }
      }

      // If we already have enough departures for today, we don't need to gather all 7 days
      if (d >= 0 && collectedCandidates.length >= maxResults * 2) {
        break;
      }
    }

    // Direct Carris Metropolitana integration if stop is CM or has CM member stops
    const cmMemberStops = stop.member_stop_ids.filter((id) => id.startsWith('cm:') || stop!.feed_ids.includes('carris_metropolitana'));
    let cmDirectDepartures: LiveDeparture[] = [];
    if (cmMemberStops.length > 0) {
      for (const cmId of cmMemberStops) {
        const directList = await RealtimeEngine.getCarrisMetropolitanaDirectDepartures(cmId, nowEpochSecs);
        cmDirectDepartures.push(...directList);
      }
    }

    // Direct UNIR integration if stop is UNIR or has UNIR member stops
    const unirMemberStops = stop.member_stop_ids.filter((id) => id.startsWith('unir:') || stop!.feed_ids.includes('unir'));
    let unirDirectDepartures: LiveDeparture[] = [];
    if (unirMemberStops.length > 0) {
      const uniqueUnirCodes = [...new Set(unirMemberStops.map((id) => id.replace(/^unir:/, '').trim()))].slice(0, 2);
      for (const unirCode of uniqueUnirCodes) {
        const directList = await getUnirStopDepartures(unirCode);
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
      ...cmDirectDepartures,
      ...unirDirectDepartures,
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
          display_text: formatProgrammedText(scheduledTimeStr, diffSecs, c.dayLabel),
        };
      })
    ].slice(0, maxResults);

    // 4. Enrich with Real-time merge (Carris Metropolitana, GTFS-RT, Metro de Lisboa, CP flag)
    const enrichedDepartures = await RealtimeEngine.mergeRealtimeData(
      initialDepartures,
      stop,
      nowEpochSecs
    );

    // Re-format display text strictly conforming to rules
    for (const d of enrichedDepartures) {
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

    if (enrichedDepartures.length === 0) {
      statusNotice = 'Sem partidas · Sem serviço programado nos próximos 7 dias para esta paragem.';
    } else {
      const nextDep = enrichedDepartures[0];
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

    const hasRealtime = enrichedDepartures.some((d) => d.state === 'TEMPO REAL');

    return {
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
      departures: enrichedDepartures,
      status_notice: statusNotice,
      has_realtime: hasRealtime,
      first_departure_today: firstDepToday,
      last_departure_today: lastDepToday,
    };
  }
}
