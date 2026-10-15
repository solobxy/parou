import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  TransitRouteOption, 
  DestinationSuggestion,
  CandidatoUnir,
  HibridaUnir,
  PonteUnir,
  DuplaUnir,
  CadeiaUnir,
  LigacaoUnir,
} from '../types/perto';
import { CentralAlert } from '../types/alerts';
import { getLocalFavorites, addFavorite, removeFavorite } from './favoritesService';

const FAVORITE_STOPS_KEY = 'parou_favorite_stops_v1';

export async function fetchNearbyTransit(
  lat: number,
  lon: number,
  radius: number = 500,
  signal?: AbortSignal
): Promise<{
  stops: NearbyStopItem[];
  vehicles: NearbyVehicleItem[];
  alerts: CentralAlert[];
  radiusMeters: number;
  timestamp: string;
  isLoading?: boolean;
  message?: string;
  totalOperators?: number;
  loadedOperators?: number;
}> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius: radius.toString(),
    _t: Date.now().toString(), // Avoid any browser caching of previous locations
  });

  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/transit/nearby?${params.toString()}`, {
    cache: 'no-store',
    signal: reqSignal,
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

  return {
    ...data,
    stops: data.stops || [],
    vehicles: data.vehicles || [],
    alerts: data.alerts || [],
    isLoading: Boolean(data.isLoading || data.status === 'loading'),
  };
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
  destName: string,
  /** Partir a outra hora (vários destinos: o troço seguinte começa quando se chega ao anterior) */
  quando?: Date,
  /** `semPonte`: modo antigo (sem combinações gerais). `nivel` (0–2): modo geral da UNIR; sobe a cada continuação depois de uma linha da UNIR */
  opcoes?: { semPonte?: boolean; nivel?: number },
): Promise<{
  routes: TransitRouteOption[];
  /** Ligações diretas da UNIR: a app completa-as com o horário da AMP */
  unir?: CandidatoUnir[];
  /** Viagem normal até um transbordo + linha da UNIR até ao destino (a app completa a UNIR com a AMP) */
  hibridas?: HibridaUnir[];
  /** Linha da UNIR a partir da origem até um ponto onde se continua em transporte */
  pontes?: PonteUnir[];
  /** Duas linhas da UNIR com transbordo entre elas */
  duplas?: DuplaUnir[];
  /** Três linhas da UNIR seguidas */
  cadeias?: CadeiaUnir[];
  /** Combinações gerais com a UNIR (modo `nivel`) */
  ligacoes?: LigacaoUnir[];
  /** Sem resposta por falta de paragens com horários: metros até à mais próxima (-1 = nenhuma a menos de 8 km) */
  longe?: { origem?: number; destino?: number };
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
  // Só pede outra hora quando é mesmo diferente de agora (o pedido normal fica igual)
  if (quando && Math.abs(quando.getTime() - Date.now()) > 90_000) params.set('quando', quando.toISOString());
  if (opcoes?.semPonte) params.set('ponte', '0');
  if (opcoes?.nivel !== undefined) params.set('nv', String(opcoes.nivel));

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

// Linhas favoritas: a mesma lista dos Horários (parou_favorite_line_ids) e do separador Favoritos (id "line-…"),
// por isso a estrela fica igual no Perto, nos Horários e nos Favoritos.
const FAVORITE_LINES_KEY = 'parou_favorite_line_ids';

export interface DadosLinhaFavorita {
  name?: string;
  code?: string;
  color?: string;
  operatorId?: string;
  operatorName?: string;
}

export function getFavoriteLineIds(): Set<string> {
  const set = new Set<string>();
  if (typeof window === 'undefined') return set;
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITE_LINES_KEY) || '[]');
    if (Array.isArray(v)) v.forEach((id) => { if (typeof id === 'string') set.add(id); });
  } catch { /* lista ilegível: conta só a dos favoritos */ }
  try {
    for (const f of getLocalFavorites()) if (f.id.startsWith('line-')) set.add(f.id.slice(5));
  } catch { /* sem favoritos locais */ }
  return set;
}

/** Marca ou desmarca uma linha (id = o da lista de linhas, ex. "carris:245_0"). Devolve se ficou favorita. */
export function toggleFavoriteLineId(lineId: string, meta?: DadosLinhaFavorita): boolean {
  if (typeof window === 'undefined' || !lineId) return false;
  const eraFavorita = getFavoriteLineIds().has(lineId);
  // Primeiro a lista dos Horários; depois a dos Favoritos (que avisa as outras janelas já com tudo gravado)
  let guardadas: string[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITE_LINES_KEY) || 'null');
    if (Array.isArray(v)) guardadas = v.filter((id) => typeof id === 'string');
  } catch { /* começa vazia */ }
  const seguinte = eraFavorita
    ? guardadas.filter((id) => id !== lineId)
    : (guardadas.includes(lineId) ? guardadas : [...guardadas, lineId]);
  try { localStorage.setItem(FAVORITE_LINES_KEY, JSON.stringify(seguinte)); } catch { /* sem espaço: fica só nos Favoritos */ }
  if (eraFavorita) {
    removeFavorite(`line-${lineId}`).catch(() => {});
  } else {
    addFavorite({
      id: `line-${lineId}`,
      type: 'linha',
      category: 'transportes',
      title: meta?.name || meta?.code || lineId,
      subtitle: meta?.operatorName,
      lineCode: meta?.code,
      lineName: meta?.name,
      lineColor: meta?.color,
      operatorId: meta?.operatorId,
      operatorName: meta?.operatorName,
    } as any).catch(() => {});
  }
  return !eraFavorita;
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
