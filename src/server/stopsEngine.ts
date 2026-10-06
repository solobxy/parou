import { 
  getAllStops, 
  getStopById, 
  searchStopsInDb, 
  getLinesServingStop, 
  DbStop, 
  getAllFeeds,
  queryStopsInBoundingBox,
  queryAllRawStopsInBoundingBox,
  getDatabase,
  registerCacheClearCallback
} from './db/gtfsDatabase';
registerCacheClearCallback(() => StopsEngine.clearCache());

export interface StopLine {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color?: string;
  operator_name: string;
  feed_id: string;
}

export interface UnifiedStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  parent_station?: string | null;
  member_stop_ids: string[];
  feed_ids: string[];
  operators: string[];
  modes: string[];
  lines: StopLine[];
}

/**
 * Haversine distance in meters between two lat/lon points
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Normalize stop name for fuzzy comparison:
 * Lowercase, unaccented, stripped of common station/stop words
 */
export function normalizeStopName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(estacao|estação|estacao de|estação de|paragem|terminal|cais|apeadeiro|interface|metro|gare|gare do|gare da)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two names are similar enough
 */
export function areNamesSimilar(nameA: string, nameB: string): boolean {
  const normA = normalizeStopName(nameA);
  const normB = normalizeStopName(nameB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Word overlap
  const wordsA = new Set(normA.split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(' ').filter((w) => w.length > 2));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const minWords = Math.min(wordsA.size, wordsB.size);
  if (minWords > 0 && intersection / minWords >= 0.75) {
    return true;
  }

  return false;
}

function getOperatorNameFromFeed(feedId: string, feedsMap: Map<string, any>): string {
  const f = feedsMap.get(feedId);
  if (f && f.operator_name) return f.operator_name;
  if (feedId === 'cp') return 'CP - Comboios de Portugal';
  if (feedId === 'carris') return 'Carris';
  if (feedId === 'carris_metropolitana') return 'Carris Metropolitana';
  if (feedId === 'metro_lisboa') return 'Metro de Lisboa';
  if (feedId === 'metro_porto') return 'Metro do Porto';
  if (feedId === 'stcp') return 'STCP';
  if (feedId === 'fertagus' || feedId === 'tld-715') return 'Fertagus';
  return feedId.toUpperCase();
}

function getModeFromFeed(feedId: string, feedsMap: Map<string, any>): string {
  const f = feedsMap.get(feedId);
  if (f && f.mode) return f.mode;
  if (feedId === 'cp' || feedId === 'tld-715') return 'Comboio';
  if (feedId === 'metro_lisboa' || feedId === 'metro_porto') return 'Metro';
  return 'Autocarro';
}

/**
 * 1. UNIFIED STOPS ENGINE
 * Loads all stops, groups by parent_station, matches known hubs,
 * and merges duplicates within 40m with same mode & similar normalized name.
 */
export class StopsEngine {
  public static calculateDistanceMeters = calculateDistanceMeters;
  private static cachedUnifiedStops: UnifiedStop[] | null = null;
  private static cacheTime = 0;
  private static readonly CACHE_TTL_MS = 60 * 1000; // 60s

  public static clearCache(): void {
    this.cachedUnifiedStops = null;
    this.cacheTime = 0;
  }

  public static async getUnifiedStops(): Promise<UnifiedStop[]> {
    const now = Date.now();
    if (this.cachedUnifiedStops && now - this.cacheTime < this.CACHE_TTL_MS) {
      return this.cachedUnifiedStops;
    }

    const rawStops = getAllStops(50000);
    const feeds = getAllFeeds();
    const feedsMap = new Map<string, any>();
    feeds.forEach((f) => feedsMap.set(f.id, f));

    // Grouping structure
    const clusters: {
      id: string;
      name: string;
      lat: number;
      lon: number;
      parent_station?: string | null;
      member_stop_ids: string[];
      feed_ids: Set<string>;
      operators: Set<string>;
      modes: Set<string>;
      stops: DbStop[];
    }[] = [];

    // Map stop_id -> cluster index for fast assignment
    const stopToClusterIndex = new Map<string, number>();

    // Spatial grid map: cellKey -> array of cluster indexes (cell size ~110m)
    const gridMap = new Map<string, number[]>();
    const getGridKey = (lat: number, lon: number) => `${Math.floor(lat * 1000)}_${Math.floor(lon * 1000)}`;

    const registerToGrid = (cIdx: number, lat: number, lon: number) => {
      const k = getGridKey(lat, lon);
      let list = gridMap.get(k);
      if (!list) {
        list = [];
        gridMap.set(k, list);
      }
      list.push(cIdx);
    };

    // Map parent_station -> cluster index
    const parentStationMap = new Map<string, number>();
    clusters.forEach((c, idx) => {
      if (c.parent_station) parentStationMap.set(c.parent_station, idx);
      c.member_stop_ids.forEach((id) => parentStationMap.set(id, idx));
    });

    // Group by parent_station or merge duplicates (same mode, similar name, within 40m)
    for (const stop of rawStops) {
      if (stopToClusterIndex.has(stop.stop_id)) continue;

      const stopMode = getModeFromFeed(stop.feed_id, feedsMap);
      const stopOp = getOperatorNameFromFeed(stop.feed_id, feedsMap);

      let targetClusterIdx = -1;

      // Rule A: group by parent_station
      if (stop.parent_station && parentStationMap.has(stop.parent_station)) {
        targetClusterIdx = parentStationMap.get(stop.parent_station)!;
      }

      // Rule B: Merge duplicates within 40 m (same mode, similar normalized name)
      // Uses spatial grid cells for O(1) candidate lookup
      if (targetClusterIdx === -1) {
        const baseLatBin = Math.floor(stop.stop_lat * 1000);
        const baseLonBin = Math.floor(stop.stop_lon * 1000);

        for (let dLat = -1; dLat <= 1 && targetClusterIdx === -1; dLat++) {
          for (let dLon = -1; dLon <= 1 && targetClusterIdx === -1; dLon++) {
            const key = `${baseLatBin + dLat}_${baseLonBin + dLon}`;
            const candidateIndexes = gridMap.get(key);
            if (!candidateIndexes) continue;

            for (const cIdx of candidateIndexes) {
              const c = clusters[cIdx];
              if (!c.modes.has(stopMode)) continue;

              const dist = calculateDistanceMeters(stop.stop_lat, stop.stop_lon, c.lat, c.lon);
              if (dist <= 40) {
                if (areNamesSimilar(stop.stop_name, c.name)) {
                  targetClusterIdx = cIdx;
                  break;
                }
              }
            }
          }
        }
      }

      if (targetClusterIdx !== -1) {
        clusters[targetClusterIdx].member_stop_ids.push(stop.stop_id);
        clusters[targetClusterIdx].feed_ids.add(stop.feed_id);
        clusters[targetClusterIdx].operators.add(stopOp);
        clusters[targetClusterIdx].modes.add(stopMode);
        clusters[targetClusterIdx].stops.push(stop);
        stopToClusterIndex.set(stop.stop_id, targetClusterIdx);
        parentStationMap.set(stop.stop_id, targetClusterIdx);
      } else {
        // Create new unified cluster
        const newIdx = clusters.length;
        clusters.push({
          id: stop.parent_station || stop.stop_id,
          name: stop.stop_name,
          lat: stop.stop_lat,
          lon: stop.stop_lon,
          parent_station: stop.parent_station || null,
          member_stop_ids: [stop.stop_id],
          feed_ids: new Set<string>([stop.feed_id]),
          operators: new Set<string>([stopOp]),
          modes: new Set<string>([stopMode]),
          stops: [stop],
        });
        registerToGrid(newIdx, stop.stop_lat, stop.stop_lon);
        stopToClusterIndex.set(stop.stop_id, newIdx);
        parentStationMap.set(stop.stop_id, newIdx);
        if (stop.parent_station) parentStationMap.set(stop.parent_station, newIdx);
      }
    }

    // Convert to UnifiedStop with lines
    // Convert to UnifiedStop (lines populated on demand for high performance)
    const result: UnifiedStop[] = clusters.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      parent_station: c.parent_station || null,
      member_stop_ids: c.member_stop_ids,
      feed_ids: Array.from(c.feed_ids),
      operators: Array.from(c.operators),
      modes: Array.from(c.modes),
      lines: [],
    }));

    this.cachedUnifiedStops = result;
    this.cacheTime = now;
    return result;
  }

  /**
   * Find a unified stop by any stop_id, parent_station, or hubId
   */
  public static async getUnifiedStopById(stopId: string): Promise<UnifiedStop | null> {
    const all = await this.getUnifiedStops();

    // 1. Direct match on id
    let found = all.find((s) => s.id === stopId || s.id.toLowerCase() === stopId.toLowerCase());
    if (found) return found;

    // 2. Member match
    found = all.find((s) => s.member_stop_ids.includes(stopId));
    if (found) return found;

    // 4. Fallback: match by normalized name if query was a station name
    const norm = normalizeStopName(stopId);
    found = all.find((s) => normalizeStopName(s.name) === norm);
    if (found) return found;

    // 4. Try from DB directly
    const dbStop = getStopById(stopId);
    if (dbStop) {
      const feeds = getAllFeeds();
      const feedsMap = new Map<string, any>();
      feeds.forEach((f) => feedsMap.set(f.id, f));

      const rawStopId = dbStop.stop_id.includes(':') ? dbStop.stop_id.split(':')[1] : dbStop.stop_id;
      const db = getDatabase();
      const childCais = db.prepare('SELECT stop_id FROM stops WHERE parent_station = ? OR parent_station = ?').all(dbStop.stop_id, rawStopId) as Array<{ stop_id: string }>;
      const member_stop_ids = [dbStop.stop_id, ...childCais.map((c) => c.stop_id)];

      const lines = getLinesServingStop(dbStop.stop_id);
      return {
        id: dbStop.stop_id,
        name: dbStop.stop_name,
        lat: dbStop.stop_lat,
        lon: dbStop.stop_lon,
        parent_station: dbStop.parent_station || null,
        member_stop_ids,
        feed_ids: [dbStop.feed_id],
        operators: [getOperatorNameFromFeed(dbStop.feed_id, feedsMap)],
        modes: [getModeFromFeed(dbStop.feed_id, feedsMap)],
        lines: lines.map((l) => ({
          route_id: l.route_id,
          route_short_name: l.route_short_name || l.route_id,
          route_long_name: l.route_long_name || '',
          route_type: l.route_type,
          route_color: l.route_color || '#3b82f6',
          operator_name: getOperatorNameFromFeed(l.feed_id, feedsMap),
          feed_id: l.feed_id,
        })),
      };
    }

    return null;
  }

  /**
   * Search unified stops from ALL feeds
   */
  public static async searchUnifiedStops(query: string, limit = 20): Promise<UnifiedStop[]> {
    const all = await this.getUnifiedStops();
    const qNorm = normalizeStopName(query);
    if (!qNorm) return all.slice(0, limit);

    const matches = all.filter((s) => {
      const sNorm = normalizeStopName(s.name);
      return (
        sNorm.includes(qNorm) ||
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.operators.some((op) => op.toLowerCase().includes(query.toLowerCase())) ||
        s.lines.some((l) => l.route_short_name.toLowerCase() === query.toLowerCase())
      );
    });

    return matches.slice(0, limit);
  }

  /**
   * Perto / Nearby stops from unified stops table of ALL feeds with status OK:
   * - Bounding-box prefilter on indexed lat/lon in SQLite
   * - Default radius 500m; if fewer than 15 stops, widen to 1 km (1000m)
   * - Stops with empty parent_station must NEVER be grouped together
   * - Group ONLY stops that share a real, non-empty parent_station
   * - Merge rule: ONLY IF same mode AND within 15 m AND same normalized name
   * - Never merge different modes or opposite-direction stops on the same street
   * - No hidden result limit below 100
   * - Sorted by distance ascending
   */
  public static async getNearbyUnifiedStops(
    userLat: number,
    userLon: number,
    requestedRadius = 500,
    limit = 100
  ): Promise<(UnifiedStop & { distance_meters: number })[]> {
    const feeds = getAllFeeds();
    const feedsMap = new Map<string, any>();
    feeds.forEach((f) => feedsMap.set(f.id, f));

    // Bounding-box prefilter calculation
    // Max search radius is at least 1000m to allow expanding to 1 km if < 15 stops found
    const searchRadiusMeters = Math.max(requestedRadius || 500, 1000);
    const radLat = (userLat * Math.PI) / 180;
    const cosLat = Math.max(0.1, Math.cos(radLat));
    const dLat = (searchRadiusMeters * 1.25) / 111000;
    const dLon = (searchRadiusMeters * 1.25) / (111000 * cosLat);

    const minLat = userLat - dLat;
    const maxLat = userLat + dLat;
    const minLon = userLon - dLon;
    const maxLon = userLon + dLon;

    // 1. Query candidates from SQL stops table with status = 'OK'
    const rawStops = queryStopsInBoundingBox(minLat, maxLat, minLon, maxLon, 2500);

    // 2. Separate into stops with a real parent_station vs unparented stops
    // RULE: Stops with an empty parent_station must NEVER be grouped together!
    // Group only stops that share a real, non-empty parent_station.
    type TempCluster = {
      id: string;
      name: string;
      lat: number;
      lon: number;
      parent_station?: string | null;
      member_stop_ids: string[];
      feed_ids: Set<string>;
      operators: Set<string>;
      modes: Set<string>;
      stops: DbStop[];
    };

    const parentStationClusters = new Map<string, TempCluster>();
    const unparentedStops: DbStop[] = [];

    for (const stop of rawStops) {
      if (stop.stop_lat === null || stop.stop_lon === null || stop.stop_lat === 0) continue;

      const parent = typeof stop.parent_station === 'string' ? stop.parent_station.trim() : '';
      const hasRealParent = parent.length > 0 && parent !== 'null' && parent !== 'undefined';

      const isParentStation = stop.location_type === 1;

      if (isParentStation) {
        // Station entity (location_type = 1)
        const clusterKey = stop.stop_id;
        const stopMode = getModeFromFeed(stop.feed_id, feedsMap);
        const stopOp = getOperatorNameFromFeed(stop.feed_id, feedsMap);
        let cluster = parentStationClusters.get(clusterKey);
        if (!cluster) {
          cluster = {
            id: clusterKey,
            name: stop.stop_name,
            lat: stop.stop_lat,
            lon: stop.stop_lon,
            parent_station: null,
            member_stop_ids: [],
            feed_ids: new Set<string>(),
            operators: new Set<string>(),
            modes: new Set<string>(),
            stops: [],
          };
          parentStationClusters.set(clusterKey, cluster);
        } else {
          cluster.name = stop.stop_name;
          cluster.lat = stop.stop_lat;
          cluster.lon = stop.stop_lon;
        }
        if (!cluster.member_stop_ids.includes(stop.stop_id)) {
          cluster.member_stop_ids.push(stop.stop_id);
        }
        cluster.feed_ids.add(stop.feed_id);
        cluster.operators.add(stopOp);
        cluster.modes.add(stopMode);
        cluster.stops.push(stop);
      } else if (hasRealParent) {
        // Rule: Only group stops that share the same non-empty parent_station
        const stopMode = getModeFromFeed(stop.feed_id, feedsMap);
        const stopOp = getOperatorNameFromFeed(stop.feed_id, feedsMap);
        const fullParentId = parent.includes(':') ? parent : `${stop.feed_id}:${parent}`;
        const clusterKey = fullParentId;
        let cluster = parentStationClusters.get(clusterKey);
        if (!cluster) {
          cluster = {
            id: clusterKey,
            name: stop.stop_name,
            lat: stop.stop_lat,
            lon: stop.stop_lon,
            parent_station: fullParentId,
            member_stop_ids: [],
            feed_ids: new Set<string>(),
            operators: new Set<string>(),
            modes: new Set<string>(),
            stops: [],
          };
          parentStationClusters.set(clusterKey, cluster);
        }
        if (!cluster.member_stop_ids.includes(stop.stop_id)) {
          cluster.member_stop_ids.push(stop.stop_id);
        }
        cluster.feed_ids.add(stop.feed_id);
        cluster.operators.add(stopOp);
        cluster.modes.add(stopMode);
        cluster.stops.push(stop);
      } else {
        unparentedStops.push(stop);
      }
    }

    const clusters: TempCluster[] = Array.from(parentStationClusters.values());

    // Rule: Unparented stops must never be merged by similar name or distance
    for (const stop of unparentedStops) {
      const stopMode = getModeFromFeed(stop.feed_id, feedsMap);
      const stopOp = getOperatorNameFromFeed(stop.feed_id, feedsMap);
      clusters.push({
        id: stop.stop_id,
        name: stop.stop_name,
        lat: stop.stop_lat,
        lon: stop.stop_lon,
        parent_station: null,
        member_stop_ids: [stop.stop_id],
        feed_ids: new Set<string>([stop.feed_id]),
        operators: new Set<string>([stopOp]),
        modes: new Set<string>([stopMode]),
        stops: [stop],
      });
    }

    // 4. Calculate exact distances and sort by distance
    const candidates = clusters.map((c) => {
      const dist = Math.round(calculateDistanceMeters(userLat, userLon, c.lat, c.lon));
      return {
        id: c.id,
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        parent_station: c.parent_station || null,
        member_stop_ids: c.member_stop_ids,
        feed_ids: Array.from(c.feed_ids),
        operators: Array.from(c.operators),
        modes: Array.from(c.modes),
        lines: [] as StopLine[],
        distance_meters: dist,
      };
    });

    candidates.sort((a, b) => a.distance_meters - b.distance_meters);

    // 5. Query Rule: Default radius 500m; if fewer than 15 stops, widen to 1 km (1000m)
    let effectiveRadius = requestedRadius || 500;
    if (effectiveRadius <= 500) {
      const count500 = candidates.filter((s) => s.distance_meters <= 500).length;
      if (count500 < 15) {
        effectiveRadius = 1000;
      }
    }

    // Keep all stops within effective radius, ordered by distance
    let finalStops = candidates.filter((s) => s.distance_meters <= effectiveRadius);

    if (limit && limit > 0 && finalStops.length > limit) {
      finalStops = finalStops.slice(0, limit);
    }

    // 6. Populate lines for returned stops
    for (const stop of finalStops) {
      const lineMap = new Map<string, StopLine>();
      for (const mId of stop.member_stop_ids) {
        const lines = getLinesServingStop(mId);
        lines.forEach((l) => lineMap.set(l.route_id, {
          ...l,
          operator_name: getOperatorNameFromFeed(l.feed_id, feedsMap),
        }));
      }
      stop.lines = Array.from(lineMap.values());
    }

    return finalStops;
  }

  /**
   * Diagnostic inspection for nearby stops:
   * Reports per feed status, raw stops in DB, post-merge stops, UI sent stops,
   * and the reason for every dropped stop.
   */
  public static async diagnoseNearby(
    userLat: number,
    userLon: number,
    requestedRadius = 500
  ) {
    const feeds = getAllFeeds();
    const feedsMap = new Map<string, any>();
    feeds.forEach((f) => feedsMap.set(f.id, f));

    const searchRadiusMeters = Math.max(requestedRadius || 500, 1000);
    const radLat = (userLat * Math.PI) / 180;
    const cosLat = Math.max(0.1, Math.cos(radLat));
    const dLat = (searchRadiusMeters * 1.25) / 111000;
    const dLon = (searchRadiusMeters * 1.25) / (111000 * cosLat);

    const minLat = userLat - dLat;
    const maxLat = userLat + dLat;
    const minLon = userLon - dLon;
    const maxLon = userLon + dLon;

    // Get ALL raw stops in bounding box regardless of feed status
    const allRaw = queryAllRawStopsInBoundingBox(minLat, maxLat, minLon, maxLon, 3000);

    // Track per stop
    const droppedStopsLog: {
      stop_id: string;
      stop_name: string;
      feed_id: string;
      distance_meters: number;
      reason: string;
    }[] = [];

    // Filter by feed status OK and coordinates
    const okRawStops: DbStop[] = [];
    for (const s of allRaw) {
      const dist = (s.stop_lat && s.stop_lon) ? Math.round(calculateDistanceMeters(userLat, userLon, s.stop_lat, s.stop_lon)) : -1;
      const f = feedsMap.get(s.feed_id);
      const fStatus = f?.status || s.feed_status || 'UNKNOWN';

      if (!s.stop_lat || !s.stop_lon || s.stop_lat === 0) {
        droppedStopsLog.push({ stop_id: s.stop_id, stop_name: s.stop_name, feed_id: s.feed_id, distance_meters: dist, reason: 'no coordinates (lat or lon is null or 0)' });
        continue;
      }

      if (fStatus !== 'OK') {
        droppedStopsLog.push({ stop_id: s.stop_id, stop_name: s.stop_name, feed_id: s.feed_id, distance_meters: dist, reason: `feed not OK (status: ${fStatus})` });
        continue;
      }

      okRawStops.push(s);
    }

    // Now perform the getNearbyUnifiedStops run
    const sentStops = await this.getNearbyUnifiedStops(userLat, userLon, requestedRadius, 100);
    const sentStopIds = new Set<string>();
    sentStops.forEach((s) => s.member_stop_ids.forEach((id) => sentStopIds.add(id)));

    // Categorize remaining dropped stops
    for (const s of okRawStops) {
      if (!sentStopIds.has(s.stop_id)) {
        const dist = Math.round(calculateDistanceMeters(userLat, userLon, s.stop_lat, s.stop_lon));
        const effectiveR = sentStops.length > 0 ? (sentStops[sentStops.length - 1].distance_meters > 500 ? 1000 : requestedRadius) : requestedRadius;
        if (dist > effectiveR) {
          droppedStopsLog.push({ stop_id: s.stop_id, stop_name: s.stop_name, feed_id: s.feed_id, distance_meters: dist, reason: `filtered (distance ${dist}m > effective radius ${effectiveR}m)` });
        } else {
          droppedStopsLog.push({ stop_id: s.stop_id, stop_name: s.stop_name, feed_id: s.feed_id, distance_meters: dist, reason: `limit (exceeded maximum limit of 100 stops)` });
        }
      }
    }

    // Tally per feed
    const feedStatsMap = new Map<string, {
      feed_id: string;
      operator_name: string;
      mode: string;
      status_in_coverage: string;
      raw_db_stops_in_radius: number;
      stops_left_after_merge: number;
      stops_sent_to_ui: number;
      dropped_stops_count: number;
    }>();

    for (const s of allRaw) {
      const dist = (s.stop_lat && s.stop_lon) ? calculateDistanceMeters(userLat, userLon, s.stop_lat, s.stop_lon) : 99999;
      const f = feedsMap.get(s.feed_id);
      if (!feedStatsMap.has(s.feed_id)) {
        feedStatsMap.set(s.feed_id, {
          feed_id: s.feed_id,
          operator_name: f?.operator_name || s.feed_id,
          mode: f?.mode || 'Autocarro',
          status_in_coverage: f?.status || 'UNKNOWN',
          raw_db_stops_in_radius: 0,
          stops_left_after_merge: 0,
          stops_sent_to_ui: 0,
          dropped_stops_count: 0,
        });
      }
      const entry = feedStatsMap.get(s.feed_id)!;
      if (dist <= 1000) {
        entry.raw_db_stops_in_radius++;
      }
    }

    for (const sent of sentStops) {
      for (const fId of sent.feed_ids) {
        if (!feedStatsMap.has(fId)) {
          const f = feedsMap.get(fId);
          feedStatsMap.set(fId, {
            feed_id: fId,
            operator_name: f?.operator_name || fId,
            mode: f?.mode || 'Autocarro',
            status_in_coverage: f?.status || 'UNKNOWN',
            raw_db_stops_in_radius: 0,
            stops_left_after_merge: 0,
            stops_sent_to_ui: 0,
            dropped_stops_count: 0,
          });
        }
        const entry = feedStatsMap.get(fId)!;
        entry.stops_sent_to_ui++;
        entry.stops_left_after_merge++;
      }
    }

    for (const d of droppedStopsLog) {
      const entry = feedStatsMap.get(d.feed_id);
      if (entry) entry.dropped_stops_count++;
    }

    return {
      query: {
        lat: userLat,
        lon: userLon,
        requested_radius_meters: requestedRadius,
        effective_radius_meters: sentStops.length > 0 && sentStops[sentStops.length - 1].distance_meters > 500 ? 1000 : 500,
        source: 'Unified SQLite GTFS database (stops + feeds tables) across ALL active feeds with status OK',
      },
      summary: {
        raw_db_stops_in_bounding_box: allRaw.length,
        raw_db_stops_in_radius: Array.from(feedStatsMap.values()).reduce((acc, f) => acc + f.raw_db_stops_in_radius, 0),
        stops_sent_to_ui: sentStops.length,
        dropped_stops_count: droppedStopsLog.length,
      },
      feeds: Array.from(feedStatsMap.values()),
      sent_stops: sentStops.map((s) => ({
        id: s.id,
        name: s.name,
        modes: s.modes,
        operators: s.operators,
        distance_meters: s.distance_meters,
        member_stops_count: s.member_stop_ids.length,
        lines_count: s.lines.length,
      })),
      dropped_stops_sample: droppedStopsLog.slice(0, 50),
    };
  }
}

