import { useState, useEffect, useCallback } from 'react';
import { Occurrence } from '../types';
import { 
  saveReportsToOfflineStorage, 
  getReportsFromOfflineStorage, 
  getOfflineStorageMetadata, 
  isDeviceOnline 
} from '../services/offlineStorage';

export interface UseOfflineReportsReturn {
  isOffline: boolean;
  offlineCount: number;
  lastOfflineSync: Date | null;
  saveReportsToCache: (reports: Occurrence[]) => Promise<void>;
  loadCachedReports: () => Promise<Occurrence[]>;
}

export function useOfflineReports(): UseOfflineReportsReturn {
  const [isOffline, setIsOffline] = useState<boolean>(!isDeviceOnline());
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [lastOfflineSync, setLastOfflineSync] = useState<Date | null>(null);

  // Monitorar alterações de conectividade de rede
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Carregar metadados iniciais da cache offline
    getOfflineStorageMetadata().then((meta) => {
      setOfflineCount(meta.count);
      if (meta.lastSavedAt) {
        setLastOfflineSync(new Date(meta.lastSavedAt));
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const saveReportsToCache = useCallback(async (reports: Occurrence[]) => {
    if (!reports || reports.length === 0) return;
    try {
      const savedCount = await saveReportsToOfflineStorage(reports);
      setOfflineCount(savedCount);
      setLastOfflineSync(new Date());
    } catch (err) {
      console.warn('[useOfflineReports] Erro ao gravar cache offline:', err);
    }
  }, []);

  const loadCachedReports = useCallback(async (): Promise<Occurrence[]> => {
    try {
      const cached = await getReportsFromOfflineStorage();
      if (cached && cached.length > 0) {
        setOfflineCount(cached.length);
      }
      return cached || [];
    } catch (err) {
      console.warn('[useOfflineReports] Erro ao carregar cache offline:', err);
      return [];
    }
  }, []);

  return {
    isOffline,
    offlineCount,
    lastOfflineSync,
    saveReportsToCache,
    loadCachedReports,
  };
}
