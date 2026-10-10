import { utilizadorAutenticado, favoritosDaConta } from './conta';
type Unsubscribe = () => void;
import { FavoriteItem, FavoriteCategory, FavoriteLiveStatus } from '../types/favorites';
import { ultimaPosicaoConhecida } from '../hooks/useUserLocation';
import { sortDepartures } from '../utils/transitFormatter';

const LOCAL_STORAGE_KEY = 'parou_user_favorites';

/**
 * Read favorites from local storage safely
 */
export function getLocalFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn('[FavoritesService] Erro ao ler favoritos locais:', err);
    return [];
  }
}

/**
 * Save favorites to local storage and broadcast change
 */
export function setLocalFavorites(items: FavoriteItem[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    notifyFavoritesUpdated();
  } catch (err) {
    console.warn('[FavoritesService] Erro ao gravar favoritos locais:', err);
  }
}

/**
 * Notify other components of favorites changes
 */
function notifyFavoritesUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('parou_favorites_updated'));
  }
}

/**
 * Check if a specific ID is favorited
 */
export function isItemFavorited(id: string): boolean {
  const current = getLocalFavorites();
  return current.some((f) => f.id === id);
}

/**
 * Add an item to favorites (local, and on the account if logged in)
 */
export async function addFavorite(item: Omit<FavoriteItem, 'addedAt'>): Promise<FavoriteItem> {
  const fullItem: FavoriteItem = {
    ...item,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };

  const current = getLocalFavorites();
  const exists = current.some((f) => f.id === fullItem.id);
  const updated = exists
    ? current.map((f) => (f.id === fullItem.id ? fullItem : f))
    : [fullItem, ...current];

  setLocalFavorites(updated);

  // Com sessão iniciada, guarda também na conta (no servidor da PAROU)
  if (utilizadorAutenticado()) {
    try {
      await favoritosDaConta.guardar([fullItem]);
    } catch (err) {
      console.warn('[FavoritesService] Não foi possível guardar o favorito na conta (fica neste telemóvel):', err);
    }
  }

  return fullItem;
}

/**
 * Remove an item from favorites by ID
 */
export async function removeFavorite(id: string): Promise<void> {
  const current = getLocalFavorites();
  const filtered = current.filter((f) => f.id !== id);
  setLocalFavorites(filtered);

  // Com sessão iniciada, apaga também na conta
  if (utilizadorAutenticado()) {
    try {
      await favoritosDaConta.apagar(id);
    } catch (err) {
      console.warn('[FavoritesService] Não foi possível apagar o favorito na conta:', err);
    }
  }
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(item: Omit<FavoriteItem, 'addedAt'>): Promise<boolean> {
  if (isItemFavorited(item.id)) {
    await removeFavorite(item.id);
    return false;
  } else {
    await addFavorite(item);
    return true;
  }
}

const CHAVE_SINCRONIA = 'parou_favoritos_sincronia';

function lerSincronia(): { uid: string; em: number } | null {
  try {
    const raw = localStorage.getItem(CHAVE_SINCRONIA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const quando = (f: FavoriteItem) => f.updatedAt || f.addedAt || 0;

/**
 * Junta os favoritos deste telemóvel com os da conta, sem duplicados.
 * - Primeira vez que esta conta entra neste telemóvel: junta tudo (fica o mais recente de cada um).
 * - Depois disso a conta é a verdade (o que apagaste noutro telemóvel não volta), e só sobem os
 *   favoritos que criaste aqui desde a última sincronização.
 */
export async function syncAndMergeFavorites(userId: string): Promise<FavoriteItem[]> {
  try {
    const localItems = getLocalFavorites();
    const remoteItems = (await favoritosDaConta.listar()) as FavoriteItem[];
    const sincronia = lerSincronia();
    const jaSincronizado = sincronia?.uid === userId;

    const mapa = new Map<string, FavoriteItem>();
    for (const r of remoteItems) if (r?.id) mapa.set(r.id, r);

    const paraSubir: FavoriteItem[] = [];
    for (const l of localItems) {
      const existente = mapa.get(l.id);
      if (!existente) {
        // Só aproveita o que é novo aqui (ou tudo, na primeira ligação desta conta)
        if (!jaSincronizado || quando(l) > (sincronia?.em || 0)) {
          mapa.set(l.id, l);
          paraSubir.push(l);
        }
      } else if (!jaSincronizado && quando(l) > quando(existente)) {
        mapa.set(l.id, l);
        paraSubir.push(l);
      }
    }

    if (paraSubir.length > 0) {
      try {
        await favoritosDaConta.guardar(paraSubir);
      } catch (err) {
        console.warn('[FavoritesService] Falha ao subir favoritos para a conta:', err);
      }
    }

    const lista = Array.from(mapa.values()).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    try { localStorage.setItem(CHAVE_SINCRONIA, JSON.stringify({ uid: userId, em: Date.now() })); } catch {}
    if (JSON.stringify(lista) !== JSON.stringify(localItems)) setLocalFavorites(lista);
    return lista;
  } catch (err) {
    console.warn('[FavoritesService] Não foi possível sincronizar os favoritos com a conta:', err);
    return getLocalFavorites();
  }
}

/** Vai buscar à conta as alterações feitas noutros telemóveis (de minuto a minuto, com o ecrã visível). */
export function subscribeToUserFavorites(
  userId: string,
  onUpdate: (favorites: FavoriteItem[]) => void
): Unsubscribe {
  let parado = false;
  const atualizar = async () => {
    if (parado || document.hidden || !utilizadorAutenticado()) return;
    const antes = JSON.stringify(getLocalFavorites());
    const lista = await syncAndMergeFavorites(userId);
    if (!parado && JSON.stringify(lista) !== antes) onUpdate(lista);
  };
  const temporizador = setInterval(() => { void atualizar(); }, 60_000);
  const aoVoltar = () => { if (!document.hidden) void atualizar(); };
  document.addEventListener('visibilitychange', aoVoltar);
  return () => {
    parado = true;
    clearInterval(temporizador);
    document.removeEventListener('visibilitychange', aoVoltar);
  };
}

type LinhaApi = import('./transitApi').ApiLineItem;

let linhasPertoCache: { chave: string; em: number; promessa: Promise<LinhaApi[]> } | null = null;

/** Id da linha na base (os favoritos guardam-no como "line-<id>"). */
function idDaLinha(item: FavoriteItem): string {
  return item.id.replace(/^line-/, '');
}

/** A linha guardada, se ela passar perto de ti: pelo id ou, se as variantes foram juntas, pelo número e operador. */
function linhaPerto(item: FavoriteItem, perto: LinhaApi[]): LinhaApi | undefined {
  const id = idDaLinha(item);
  return perto.find((l) => l.id === id)
    || perto.find((l) => item.lineCode && l.code === item.lineCode && (!item.operatorId || l.operator_id === item.operatorId));
}

/**
 * Pede ao servidor as linhas que passam perto da última posição conhecida e fica só com as guardadas
 * (completando as da UNIR com os horários da AMP). Sem posição ou sem resposta devolve vazio.
 */
async function partidasDasLinhasGuardadas(items: FavoriteItem[]): Promise<LinhaApi[]> {
  const guardadas = items.filter((i) => i.type === 'linha' || i.type === 'transporte');
  if (guardadas.length === 0) return [];
  const pos = ultimaPosicaoConhecida();
  if (!pos) return [];
  try {
    const { fetchLinesNear } = await import('./transitApi');
    const { completarLinhasUnir } = await import('./unirPerto');
    // A mesma resposta serve vários pedidos seguidos (a lista de favoritos atualiza-se mais do que uma vez)
    const chave = `${pos.latitude.toFixed(3)},${pos.longitude.toFixed(3)}`;
    const agora = Date.now();
    if (!linhasPertoCache || linhasPertoCache.chave !== chave || agora - linhasPertoCache.em > 30000) {
      linhasPertoCache = { chave, em: agora, promessa: fetchLinesNear(pos.latitude, pos.longitude, 1500, AbortSignal.timeout(8000)).then((r) => r.lines) };
    }
    const lines = await linhasPertoCache.promessa;
    const nossas = lines.filter((l) => guardadas.some((g) => linhaPerto(g, [l])));
    return await completarLinhasUnir(nossas);
  } catch {
    linhasPertoCache = null;
    return [];
  }
}

/**
 * Enrich favorites with real-time status, departures, and alerts
 */
export async function enrichFavoritesLiveStatus(
  items: FavoriteItem[]
): Promise<Map<string, FavoriteLiveStatus>> {
  const statusMap = new Map<string, FavoriteLiveStatus>();
  const now = new Date();

  // 1. Fetch live alerts once
  let activeAlerts: Array<{ id: string; tipo: string; título: string; operador: string; linhas: string[] }> = [];
  try {
    const alertsRes = await fetch('/api/alerts?status=Ativo');
    if (alertsRes.ok) {
      const data = await alertsRes.json();
      activeAlerts = data.alerts || [];
    }
  } catch (err) {
    console.warn('[FavoritesService] Erro ao carregar alertas ao vivo:', err);
  }

  // 1b. Linhas guardadas: as partidas reais perto da última posição conhecida
  const linhasPerto = await partidasDasLinhasGuardadas(items);

  // 2. Fetch live departures for stops or transit lines
  for (const item of items) {
    try {
      // Find matching alerts for operator or line
      const matchedAlerts = activeAlerts.filter((a) => {
        const opMatch = item.operatorName && a.operador &&
          (a.operador.toLowerCase().includes(item.operatorName.toLowerCase()) ||
           item.operatorName.toLowerCase().includes(a.operador.toLowerCase()));
        const lineMatch = item.lineCode && a.linhas && Array.isArray(a.linhas) &&
          a.linhas.some((l) => l.toLowerCase() === item.lineCode?.toLowerCase());
        const titleMatch = item.title && (a.título.toLowerCase().includes(item.title.toLowerCase()) ||
          a.operador.toLowerCase().includes(item.title.toLowerCase()));
        return opMatch || lineMatch || titleMatch;
      });

      let statusDescription = 'Circulação normal';
      let statusLevel: FavoriteLiveStatus['status'] = 'Normal';
      let delayMinutes = 0;
      let nextDepartureTime = '';
      let etaMinutes: number | undefined = undefined;
      let isRealtime = false;
      let nextDeparture: FavoriteLiveStatus['nextDeparture'];
      let stopName: string | undefined;

      if (matchedAlerts.length > 0) {
        const hasSevere = matchedAlerts.some((a) => 
          a.tipo.toLowerCase().includes('greve') || 
          a.tipo.toLowerCase().includes('interrupção') ||
          a.tipo.toLowerCase().includes('suspensa')
        );
        if (hasSevere) {
          statusLevel = 'Perturbação';
          statusDescription = `${matchedAlerts[0].tipo.toUpperCase()}: ${matchedAlerts[0].título}`;
        } else {
          statusLevel = 'Atrasos';
          statusDescription = `Alerta ativo: ${matchedAlerts[0].título}`;
          delayMinutes = 4;
        }
      }

      // If it's a stop with coordinates, fetch nearby live departure
      if ((item.type === 'paragem' || item.type === 'estacao') && item.latitude && item.longitude) {
        try {
          const res = await fetch(`/api/transit/nearby?lat=${item.latitude}&lon=${item.longitude}&radius=600`);
          if (res.ok) {
            const data = await res.json();
            const matchedStop = (data.stops || []).find((s: any) => 
              s.name.toLowerCase().includes(item.title.toLowerCase()) ||
              item.title.toLowerCase().includes(s.name.toLowerCase())
            ) || data.stops?.[0];

            if (matchedStop && matchedStop.nextDepartures && matchedStop.nextDepartures.length > 0) {
              const firstDep = matchedStop.nextDepartures[0];
              nextDepartureTime = firstDep.departureTime;
              etaMinutes = firstDep.etaMinutes;
              isRealtime = firstDep.isRealtime;
              if (firstDep.isRealtime) {
                statusDescription = `${firstDep.statusDescription} (${firstDep.destination})`;
              }
            }
          }
        } catch {
          // fallback gracefully
        }
      } else if (item.type === 'linha' || item.type === 'transporte') {
        // Só mostra a próxima partida quando existe de facto (a linha passa perto de ti agora).
        // Nunca se inventa um tempo: sem dados fica sem hora.
        const real = linhaPerto(item, linhasPerto);
        if (real) {
          const partida = sortDepartures(real.departures || []).find((d) => d.state !== 'Sem dados' && d.state !== 'Suprimido');
          if (partida) {
            nextDepartureTime = partida.time;
            nextDeparture = partida;
            etaMinutes = partida.countdown_minutes;
            isRealtime = partida.state === 'Tempo Real';
            stopName = partida.stop_name || real.nearest_stop?.name;
          }
        }
      } else if (item.type === 'rota') {
        statusDescription = item.estimatedMinutes ? `Duração: ~${item.estimatedMinutes} min` : 'Em serviço';
      }

      statusMap.set(item.id, {
        id: item.id,
        isRealtime,
        status: statusLevel,
        nextDepartureTime: nextDepartureTime || undefined,
        etaMinutes,
        nextDeparture,
        stopName,
        delayMinutes: delayMinutes > 0 ? delayMinutes : undefined,
        statusDescription,
        activeAlertsCount: matchedAlerts.length,
        alertsSummary: matchedAlerts.map((a) => `${a.tipo}: ${a.título}`),
        lastUpdated: now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      console.warn(`[FavoritesService] Erro ao enriquecer favorito ${item.id}:`, err);
    }
  }

  return statusMap;
}
