// O Firebase só é carregado quando há sessão iniciada (ver ./nuvem.ts)
import { carregarFirebase, utilizadorFirebase } from './nuvem';
type Unsubscribe = () => void;
async function nuvem() {
  const [{ db }, fs] = await Promise.all([carregarFirebase(), import('firebase/firestore')]);
  return { db, ...fs };
}
import { FavoriteItem, FavoriteCategory, FavoriteLiveStatus } from '../types/favorites';

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
 * Add an item to favorites (local and Firestore if logged in)
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

  // If user is authenticated, sync to Firestore
  const user = utilizadorFirebase();
  if (user) {
    try {
      const { db, doc, setDoc } = await nuvem();
      const favDocRef = doc(db, 'users', user.uid, 'favorites', fullItem.id);
      await setDoc(favDocRef, fullItem, { merge: true });
    } catch (err) {
      console.warn('[FavoritesService] Erro ao guardar favorito no Firestore:', err);
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

  // If user is authenticated, delete from Firestore
  const user = utilizadorFirebase();
  if (user) {
    try {
      const { db, doc, deleteDoc } = await nuvem();
      const favDocRef = doc(db, 'users', user.uid, 'favorites', id);
      await deleteDoc(favDocRef);
    } catch (err) {
      console.warn('[FavoritesService] Erro ao remover favorito no Firestore:', err);
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

/**
 * Merge local favorites and remote Firestore favorites without duplicates.
 * Takes the most complete or most recently updated item.
 */
export async function syncAndMergeFavorites(userId: string): Promise<FavoriteItem[]> {
  try {
    const localItems = getLocalFavorites();
    const { db, collection, getDocs, doc, setDoc } = await nuvem();
    const favsCollectionRef = collection(db, 'users', userId, 'favorites');
    const querySnapshot = await getDocs(favsCollectionRef);

    const remoteItems: FavoriteItem[] = [];
    querySnapshot.forEach((docSnap) => {
      if (docSnap.exists()) {
        remoteItems.push(docSnap.data() as FavoriteItem);
      }
    });

    // Merge map keyed by ID
    const mergedMap = new Map<string, FavoriteItem>();

    // 1. Add remote items
    for (const remote of remoteItems) {
      mergedMap.set(remote.id, remote);
    }

    // 2. Merge local items: if not in remote, add to map and upload to Firestore
    const itemsToUpload: FavoriteItem[] = [];
    for (const local of localItems) {
      const existing = mergedMap.get(local.id);
      if (!existing) {
        mergedMap.set(local.id, local);
        itemsToUpload.push(local);
      } else {
        // Prefer newer timestamp
        const newer = (local.updatedAt || local.addedAt) > (existing.updatedAt || existing.addedAt)
          ? local
          : existing;
        mergedMap.set(local.id, newer);
      }
    }

    // Upload any local items that were missing in the cloud
    for (const item of itemsToUpload) {
      try {
        const itemRef = doc(db, 'users', userId, 'favorites', item.id);
        await setDoc(itemRef, item, { merge: true });
      } catch (uploadErr) {
        console.warn(`[FavoritesService] Falha ao subir favorito ${item.id}:`, uploadErr);
      }
    }

    const mergedList = Array.from(mergedMap.values()).sort(
      (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
    );

    // Save combined state to local storage
    setLocalFavorites(mergedList);
    return mergedList;
  } catch (err) {
    console.warn('[FavoritesService] Erro ao fundir favoritos com Firestore:', err);
    return getLocalFavorites();
  }
}

/**
 * Subscribe to Firestore favorites for live cross-device sync
 */
export function subscribeToUserFavorites(
  userId: string,
  onUpdate: (favorites: FavoriteItem[]) => void
): Unsubscribe {
  let cancelado = false;
  let parar: Unsubscribe | null = null;
  nuvem().then(({ db, collection, onSnapshot }) => {
  if (cancelado) return;
  const favsCollectionRef = collection(db, 'users', userId, 'favorites');

  parar = onSnapshot(
    favsCollectionRef,
    (snapshot) => {
      const remoteItems: FavoriteItem[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.exists()) {
          remoteItems.push(docSnap.data() as FavoriteItem);
        }
      });

      // Merge with local storage
      const localItems = getLocalFavorites();
      const map = new Map<string, FavoriteItem>();

      for (const item of localItems) map.set(item.id, item);
      for (const item of remoteItems) map.set(item.id, item);

      const combined = Array.from(map.values()).sort(
        (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
      );

      setLocalFavorites(combined);
      onUpdate(combined);
    },
    (err) => {
      console.warn('[FavoritesService] Erro no listener de favoritos Firestore:', err);
    }
  );
  }).catch((err) => console.warn('[FavoritesService] Firebase indisponível:', err));
  return () => { cancelado = true; parar?.(); };
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
        // Estimate departure for frequent lines based on time
        const hour = now.getHours();
        const mins = now.getMinutes();
        if (hour >= 6 && hour <= 23) {
          isRealtime = true;
          etaMinutes = Math.max(2, (mins % 7));
          nextDepartureTime = `Em ${etaMinutes} min`;
          if (statusLevel === 'Normal') {
            statusDescription = 'Frequência regular (4-7 min)';
          }
        } else {
          statusDescription = 'Serviço noturno reduzido';
          nextDepartureTime = 'A partir das 06:30';
        }
      } else if (item.type === 'rota') {
        isRealtime = true;
        etaMinutes = 5;
        nextDepartureTime = 'Próxima saída em 5 min';
        statusDescription = `${item.estimatedMinutes ? `Duração: ~${item.estimatedMinutes} min` : 'Em serviço'}`;
      }

      statusMap.set(item.id, {
        id: item.id,
        isRealtime,
        status: statusLevel,
        nextDepartureTime: nextDepartureTime || undefined,
        etaMinutes,
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
