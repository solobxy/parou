import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  TransitRouteOption, 
  DestinationSuggestion 
} from '../types/perto';
import { CentralAlert } from '../types/alerts';
import { getLocalFavorites, addFavorite, removeFavorite } from './favoritesService';

const FAVORITE_STOPS_KEY = 'parou_favorite_stops_v1';

export async function fetchNearbyTransit(
  lat: number,
  lon: number,
  radius: number = 500
): Promise<{
  stops: NearbyStopItem[];
  vehicles: NearbyVehicleItem[];
  alerts: CentralAlert[];
  radiusMeters: number;
  timestamp: string;
}> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
    _t: Date.now().toString(), // Avoid any browser caching of previous locations
  });

  const res = await fetch(`/api/transit/nearby?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
    },
  });
  if (!res.ok) {
    throw new Error(`Falha ao obter transportes próximos (${res.status})`);
  }
  const data = await res.json();

  // Attach local favorite flags
  const favSet = getFavoriteStopIds();
  if (data.stops && Array.isArray(data.stops)) {
    data.stops = data.stops.map((s: NearbyStopItem) => ({
      ...s,
      isFavorite: favSet.has(s.id),
    }));
  }

  return data;
}

export async function searchDestinations(
  query: string,
  userLat?: number,
  userLon?: number
): Promise<DestinationSuggestion[]> {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({ q: query.trim() });
  if (userLat !== undefined && userLon !== undefined) {
    params.set('lat', userLat.toString());
    params.set('lon', userLon.toString());
  }

  const res = await fetch(`/api/transit/destinations?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Falha ao pesquisar destinos (${res.status})`);
  }
  const data = await res.json();
  return data.suggestions || [];
}

export async function planTransitRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
  destName: string
): Promise<{
  routes: TransitRouteOption[];
  originCoords: { lat: number; lon: number };
  destCoords: { lat: number; lon: number };
  destName: string;
}> {
  const params = new URLSearchParams({
    originLat: originLat.toString(),
    originLon: originLon.toString(),
    destLat: destLat.toString(),
    destLon: destLon.toString(),
    destName: destName,
  });

  const res = await fetch(`/api/transit/plan-route?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Falha ao calcular rota (${res.status})`);
  }
  return res.json();
}

// -------------------------------------------------------------
// FAVORITES PERSISTENCE (LOCALSTORAGE FOR GUEST / SYNCED)
// -------------------------------------------------------------

export function getFavoriteStopIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FAVORITE_STOPS_KEY);
    const set = new Set<string>();
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach((id) => set.add(id));
    }
    // Also include from global favorites
    const centralFavs = getLocalFavorites();
    for (const f of centralFavs) {
      if (f.category === 'paragens' || f.type === 'paragem' || f.type === 'estacao') {
        set.add(f.id);
        if (f.id.startsWith('stop-')) {
          set.add(f.id.replace('stop-', ''));
        }
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

export function toggleFavoriteStopId(stopId: string, stopMeta?: Partial<NearbyStopItem>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const favs = getFavoriteStopIds();
    const cleanId = stopId.startsWith('stop-') ? stopId.replace('stop-', '') : stopId;
    let isNowFavorite = false;

    if (favs.has(cleanId) || favs.has(`stop-${cleanId}`)) {
      favs.delete(cleanId);
      favs.delete(`stop-${cleanId}`);
      isNowFavorite = false;
      removeFavorite(`stop-${cleanId}`);
      removeFavorite(cleanId);
    } else {
      favs.add(cleanId);
      isNowFavorite = true;

      const title = stopMeta?.name || cleanId;
      const operatorName = stopMeta?.operatorName || 'Transporte Público';
      const locality = stopMeta?.locality || 'Portugal';
      const lat = stopMeta?.latitude;
      const lon = stopMeta?.longitude;
      const mode = (stopMeta?.transportMode || 'Autocarro') as any;

      addFavorite({
        id: `stop-${cleanId}`,
        type: title.toLowerCase().includes('estação') ? 'estacao' : 'paragem',
        category: 'paragens',
        title,
        subtitle: `${operatorName} • ${locality}`,
        operatorId: stopMeta?.operatorId,
        operatorName,
        transportMode: mode,
        latitude: lat,
        longitude: lon,
        locality,
        district: stopMeta?.district,
      });
    }

    localStorage.setItem(FAVORITE_STOPS_KEY, JSON.stringify(Array.from(favs)));
    return isNowFavorite;
  } catch {
    return false;
  }
}
