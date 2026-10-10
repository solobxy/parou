import { useState, useEffect, useCallback, useMemo } from 'react';
import { observarSessao, utilizadorAutenticado, type Utilizador } from '../services/conta';
import { 
  FavoriteItem, 
  FavoriteCategory, 
  FavoriteLiveStatus 
} from '../types/favorites';
import { 
  getLocalFavorites, 
  addFavorite as addFavService, 
  removeFavorite as removeFavService, 
  toggleFavorite as toggleFavService, 
  syncAndMergeFavorites, 
  subscribeToUserFavorites,
  enrichFavoritesLiveStatus
} from '../services/favoritesService';

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => getLocalFavorites());
  const [currentUser, setCurrentUser] = useState<Utilizador | null>(utilizadorAutenticado());
  const [activeCategory, setActiveCategory] = useState<FavoriteCategory | 'todos'>('todos');
  const [liveStatuses, setLiveStatuses] = useState<Map<string, FavoriteLiveStatus>>(new Map());
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // 1. Refresh favorites from local state and trigger re-render
  const refreshFromLocal = useCallback(() => {
    setFavorites(getLocalFavorites());
  }, []);

  // 2. Login listener & automatic account synchronization with deduplication
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    const unsubscribeAuth = observarSessao(async (user) => {
      setCurrentUser(user);

      if (user) {
        // User logged in: automatically merge local and cloud favorites without duplicates
        try {
          const merged = await syncAndMergeFavorites(user.userId);
          setFavorites(merged);

          // Subscribe to account updates to keep other devices in sync
          if (unsubscribeFirestore) unsubscribeFirestore();
          unsubscribeFirestore = subscribeToUserFavorites(user.userId, (updatedList) => {
            setFavorites(updatedList);
          });
        } catch (err) {
          console.warn('[useFavorites] Erro ao sincronizar com utilizador:', err);
          refreshFromLocal();
        }
      } else {
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        refreshFromLocal();
      }
    });

    // Listen to custom event dispatched by favoritesService
    const handleCustomEvent = () => {
      refreshFromLocal();
    };

    window.addEventListener('parou_favorites_updated', handleCustomEvent);

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
      window.removeEventListener('parou_favorites_updated', handleCustomEvent);
    };
  }, [refreshFromLocal]);

  // 3. Enrich favorites with live statuses (ETAs, delays, active alerts)
  const refreshLiveStatuses = useCallback(async () => {
    if (favorites.length === 0) {
      setLiveStatuses(new Map());
      return;
    }

    setIsLoadingLive(true);
    try {
      const statuses = await enrichFavoritesLiveStatus(favorites);
      setLiveStatuses(statuses);
      setLastRefreshed(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.warn('[useFavorites] Erro ao carregar status ao vivo dos favoritos:', err);
    } finally {
      setIsLoadingLive(false);
    }
  }, [favorites]);

  useEffect(() => {
    refreshLiveStatuses();
    // Auto-refresh every 60 seconds
    const interval = setInterval(refreshLiveStatuses, 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshLiveStatuses]);

  // 4. Memoized Set of favorited IDs for O(1) checks
  const favoritedIdsSet = useMemo(() => {
    return new Set(favorites.map((f) => f.id));
  }, [favorites]);

  const isFavorite = useCallback(
    (id: string) => favoritedIdsSet.has(id),
    [favoritedIdsSet]
  );

  // 5. Actions
  const addFavorite = useCallback(async (item: Omit<FavoriteItem, 'addedAt'>) => {
    const saved = await addFavService(item);
    refreshFromLocal();
    return saved;
  }, [refreshFromLocal]);

  const removeFavorite = useCallback(async (id: string) => {
    await removeFavService(id);
    refreshFromLocal();
  }, [refreshFromLocal]);

  const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'addedAt'>) => {
    const isNowFav = await toggleFavService(item);
    refreshFromLocal();
    return isNowFav;
  }, [refreshFromLocal]);

  // 6. Category counts
  const countsByCategory = useMemo(() => {
    const counts = {
      todos: favorites.length,
      transportes: 0,
      paragens: 0,
      rotas: 0,
      locais: 0,
    };

    for (const item of favorites) {
      if (counts[item.category] !== undefined) {
        counts[item.category]++;
      }
    }
    return counts;
  }, [favorites]);

  // 7. Filtered list by category
  const filteredFavorites = useMemo(() => {
    if (activeCategory === 'todos') return favorites;
    return favorites.filter((item) => item.category === activeCategory);
  }, [favorites, activeCategory]);

  return {
    favorites,
    filteredFavorites,
    countsByCategory,
    activeCategory,
    setActiveCategory,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    totalCount: favorites.length,
    isAuthenticated: !!currentUser,
    userEmail: currentUser?.email || null,
    liveStatuses,
    isLoadingLive,
    lastRefreshed,
    refreshLiveStatuses,
  };
}
