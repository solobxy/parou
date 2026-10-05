/**
 * PAROU.PT - Porto Open Data Service
 * Datasets:
 * 1. STCP GTFS: https://opendata.porto.digital/dataset/horarios-paragens-e-rotas-em-formato-gtfs-stcp
 *    (Resources: "GTFS STCP dd-mm-aaaa" - pick most recent date)
 * 2. Metro do Porto GTFS: https://opendata.porto.digital/dataset/horarios-paragens-e-rotas-em-formato-gtfs
 *    (Resources: "GTFS Metro do Porto dd-mm-aaaa" - pick most recent date)
 * 3. STCP Realtime Bus Location: https://opendata.porto.digital/dataset/urban-platform-bus-location
 *    (Endpoint: https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000)
 */

export interface StcpLiveVehicle {
  id: string;
  vehicle_id: string;
  line: string;
  lat: number;
  lon: number;
  bearing?: number;
  speed?: number;
  timestamp: number;
  license_plate?: string;
  destination?: string;
  operator: string;
}

// Memory caches
let cachedStcpUrl: { url: string; timestamp: number } | null = null;
let cachedMetroPortoUrl: { url: string; timestamp: number } | null = null;
let cachedStcpVehicles: { vehicles: StcpLiveVehicle[]; timestamp: number } = { vehicles: [], timestamp: 0 };

const URL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (checked daily)
const VEHICLES_CACHE_TTL_MS = 15 * 1000;      // 15 seconds cache for live vehicle positions

function parseDateFromResourceName(name: string): number {
  if (!name) return 0;
  // Match dd-mm-yyyy or dd_mm_yyyy
  const m = name.match(/(\d{1,2})[-_](\d{1,2})[-_](\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    return new Date(year, month, day).getTime();
  }
  // Match mm-yyyy or mm_yyyy
  const mMonthYear = name.match(/(\d{1,2})[-_](\d{4})/);
  if (mMonthYear) {
    return new Date(parseInt(mMonthYear[2], 10), parseInt(mMonthYear[1], 10) - 1, 1).getTime();
  }
  return 0;
}

/**
 * Resolves the most recent GTFS ZIP file from STCP dataset
 * https://opendata.porto.digital/dataset/horarios-paragens-e-rotas-em-formato-gtfs-stcp
 */
export async function getLatestStcpGtfsUrl(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedStcpUrl && now - cachedStcpUrl.timestamp < URL_CACHE_TTL_MS) {
    return cachedStcpUrl.url;
  }

  const defaultStcpUrl = 'https://dadosabertos.cm-porto.pt/dataset/71490e40-9e19-11f1-84ed-6abdb6d5cf34/resource/51340c18-0ef5-4895-b099-cf7247ea54f4/download/gtfs_feed.zip';

  try {
    const res = await fetch('https://dadosabertos.cm-porto.pt/api/3/action/package_show?id=horarios-paragens-e-rotas-stcp', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json();
      const resources: any[] = (json.result?.resources || []).filter(
        (r: any) => r.url && (r.url.endsWith('.zip') || (r.format && r.format.toLowerCase().includes('zip')) || (r.format && r.format.toLowerCase().includes('gtfs')))
      );

      if (resources.length > 0) {
        resources.sort((a, b) => {
          const dateA = parseDateFromResourceName(a.name || '');
          const dateB = parseDateFromResourceName(b.name || '');
          if (dateB !== dateA) return dateB - dateA;
          const modA = new Date(a.last_modified || a.created || 0).getTime();
          const modB = new Date(b.last_modified || b.created || 0).getTime();
          return modB - modA;
        });

        const best = resources[0];
        if (best && best.url) {
          cachedStcpUrl = { url: best.url, timestamp: now };
          return best.url;
        }
      }
    }
  } catch (err: any) {
    console.warn('[PortoOpenData] Erro ao resolver URL mais recente da STCP:', err?.message || err);
  }

  return cachedStcpUrl?.url || defaultStcpUrl;
}

/**
 * Resolves the most recent GTFS ZIP file from Metro do Porto dataset
 * https://opendata.porto.digital/dataset/horarios-paragens-e-rotas-em-formato-gtfs
 */
export async function getLatestMetroPortoGtfsUrl(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedMetroPortoUrl && now - cachedMetroPortoUrl.timestamp < URL_CACHE_TTL_MS) {
    return cachedMetroPortoUrl.url;
  }

  const defaultMetroUrl = 'https://dadosabertos.cm-porto.pt/dataset/713a680c-9e19-11f1-84ed-6abdb6d5cf34/resource/28a13723-2af1-4bbb-a2b1-f8b08df8c7e4/download/___';

  try {
    const res = await fetch('https://dadosabertos.cm-porto.pt/api/3/action/package_show?id=horarios-paragens-e-rotas-metro-porto', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const json = await res.json();
      const resources: any[] = (json.result?.resources || []).filter(
        (r: any) => r.url && (r.url.endsWith('.zip') || (r.format && r.format.toLowerCase().includes('zip')) || (r.format && r.format.toLowerCase().includes('gtfs')) || r.url.includes('/download/'))
      );

      if (resources.length > 0) {
        resources.sort((a, b) => {
          const dateA = parseDateFromResourceName(a.name || '');
          const dateB = parseDateFromResourceName(b.name || '');
          if (dateB !== dateA) return dateB - dateA;
          const modA = new Date(a.last_modified || a.created || 0).getTime();
          const modB = new Date(b.last_modified || b.created || 0).getTime();
          return modB - modA;
        });

        // Filter out known empty resources (like 17-07-2026 which has 0 bytes)
        for (const candidate of resources) {
          if (candidate.url && !candidate.url.includes('b2b89001-611f-4264-a480-079cab3e0d5a')) {
            cachedMetroPortoUrl = { url: candidate.url, timestamp: now };
            return candidate.url;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn('[PortoOpenData] Erro ao resolver URL mais recente do Metro do Porto:', err?.message || err);
  }

  return cachedMetroPortoUrl?.url || defaultMetroUrl;
}

let lastStcpFailTime = 0;
const STCP_RETRY_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * Fetches real-time STCP bus locations from Porto Open Data (urban-platform-bus-location)
 * Endpoint: https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000
 * Requirement 4: Independent of database. If service fails, retries after 30s without blocking the rest.
 */
export async function getStcpLiveVehicles(): Promise<StcpLiveVehicle[]> {
  const now = Date.now();
  if (cachedStcpVehicles.vehicles.length > 0 && now - cachedStcpVehicles.timestamp < VEHICLES_CACHE_TTL_MS) {
    return cachedStcpVehicles.vehicles;
  }

  // If a recent failure occurred, do not hammer or block: return previous cache and retry after 30s
  if (now - lastStcpFailTime < STCP_RETRY_INTERVAL_MS) {
    return cachedStcpVehicles.vehicles;
  }

  try {
    const res = await fetch('https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'PAROU.PT/2.0' },
      signal: AbortSignal.timeout(5000), // Fast 5s timeout to prevent blocking
    });

    if (!res.ok) {
      lastStcpFailTime = now;
      return cachedStcpVehicles.vehicles;
    }

    const rawList = (await res.json()) as any[];
    if (!Array.isArray(rawList)) {
      lastStcpFailTime = now;
      return cachedStcpVehicles.vehicles;
    }

    const vehicles: StcpLiveVehicle[] = [];

    for (const item of rawList) {
      const coords = item.location?.value?.coordinates;
      if (!coords || !Array.isArray(coords) || coords.length < 2) continue;

      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (isNaN(lat) || isNaN(lon) || lat < 40.5 || lat > 42.5 || lon < -9.5 || lon > -7.5) continue;

      let line = '';
      if (Array.isArray(item.annotations?.value)) {
        for (const ann of item.annotations.value) {
          if (typeof ann === 'string' && ann.startsWith('stcp:route:')) {
            line = ann.replace('stcp:route:', '').trim();
            break;
          }
        }
      }
      if (!line && typeof item.name?.value === 'string') {
        const parts = item.name.value.split(' ');
        if (parts.length >= 2) line = parts[1];
      }

      const vehicleId = item.fleetVehicleId?.value || item.id?.replace(/.*:/, '') || 'bus';
      const obsTimeStr = item.observationDateTime?.value;
      const obsEpochSecs = obsTimeStr ? Math.floor(new Date(obsTimeStr).getTime() / 1000) : Math.floor(now / 1000);

      vehicles.push({
        id: item.id || `stcp_${vehicleId}`,
        vehicle_id: String(vehicleId),
        line: line || 'STCP',
        lat,
        lon,
        bearing: item.bearing?.value || item.heading?.value || undefined,
        speed: item.speed?.value ? Number(item.speed.value) : undefined,
        timestamp: obsEpochSecs,
        operator: 'STCP',
      });
    }

    cachedStcpVehicles = { vehicles, timestamp: now };
    lastStcpFailTime = 0;
    return vehicles;
  } catch (err: any) {
    lastStcpFailTime = now;
    return cachedStcpVehicles.vehicles;
  }
}
