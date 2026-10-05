import { Occurrence } from '../types';

/**
 * PAROU.PT - Módulo de Persistência Local Offline (IndexedDB)
 * 
 * Guarda os relatórios e ocorrências mais recentes na base de dados IndexedDB do navegador.
 * Permite que a aplicação apresente mapas, listagens de alertas e detalhes de ocorrências
 * mesmo quando o utilizador estiver em trânsito sem rede, no túnel do metro ou em modo avião.
 */

const DB_NAME = 'parou_offline_db';
const DB_VERSION = 1;
const REPORTS_STORE = 'cached_reports';
const METADATA_STORE = 'offline_metadata';
const FALLBACK_STORAGE_KEY = 'parou_offline_reports_fallback';
const FALLBACK_META_KEY = 'parou_offline_meta_fallback';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Abre e inicializa a base de dados IndexedDB
 */
export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB não suportado no ambiente atual'));
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Armazém de relatórios
        if (!db.objectStoreNames.contains(REPORTS_STORE)) {
          const store = db.createObjectStore(REPORTS_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('district', 'district', { unique: false });
          store.createIndex('severity', 'severity', { unique: false });
        }

        // Armazém de metadados
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('[OfflineStorage] Erro ao abrir IndexedDB:', request.error);
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('[OfflineStorage] Abertura de IndexedDB bloqueada por outra aba');
      };
    } catch (err) {
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Guarda a lista de relatórios no IndexedDB (com fallback para localStorage se o IndexedDB falhar)
 */
export async function saveReportsToOfflineStorage(reports: Occurrence[]): Promise<number> {
  if (!Array.isArray(reports) || reports.length === 0) return 0;

  try {
    const db = await openOfflineDatabase();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction([REPORTS_STORE, METADATA_STORE], 'readwrite');
      const store = tx.objectStore(REPORTS_STORE);
      const metaStore = tx.objectStore(METADATA_STORE);

      // Limitar a cache offline aos 150 relatórios mais recentes para manter eficiência
      const sortedReports = [...reports].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 150);

      sortedReports.forEach((report) => {
        store.put(report);
      });

      // Atualizar metadados
      const meta = {
        key: 'reports_meta',
        lastSavedAt: Date.now(),
        count: sortedReports.length,
        version: DB_VERSION,
      };
      metaStore.put(meta);

      tx.oncomplete = () => {
        resolve(sortedReports.length);
      };

      tx.onerror = () => {
        reject(tx.error);
      };
    });
  } catch (idbErr) {
    // Fallback gracioso para localStorage caso o IndexedDB esteja inacessível (ex: navegação anónima restrita)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const top50 = reports.slice(0, 50);
        window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(top50));
        window.localStorage.setItem(
          FALLBACK_META_KEY,
          JSON.stringify({ lastSavedAt: Date.now(), count: top50.length })
        );
        return top50.length;
      }
    } catch (lsErr) {
      console.warn('[OfflineStorage] Fallback localStorage indisponível:', lsErr);
    }
    return 0;
  }
}

/**
 * Recupera os relatórios guardados localmente no IndexedDB
 */
export async function getReportsFromOfflineStorage(): Promise<Occurrence[]> {
  try {
    const db = await openOfflineDatabase();
    return await new Promise<Occurrence[]>((resolve) => {
      const tx = db.transaction(REPORTS_STORE, 'readonly');
      const store = tx.objectStore(REPORTS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Ordenar por mais recente primeiro

      const results: Occurrence[] = [];
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < 150) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        console.warn('[OfflineStorage] Erro ao ler do IndexedDB:', request.error);
        resolve(getReportsFromLocalStorageFallback());
      };
    });
  } catch (err) {
    return getReportsFromLocalStorageFallback();
  }
}

/**
 * Fallback via localStorage se o IndexedDB falhar
 */
function getReportsFromLocalStorageFallback(): Occurrence[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {}
  return [];
}

/**
 * Obtém os metadados da última sincronização offline
 */
export async function getOfflineStorageMetadata(): Promise<{
  lastSavedAt: number | null;
  count: number;
  isAvailable: boolean;
}> {
  try {
    const db = await openOfflineDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(METADATA_STORE, 'readonly');
      const store = tx.objectStore(METADATA_STORE);
      const request = store.get('reports_meta');

      request.onsuccess = () => {
        const meta = request.result;
        if (meta) {
          resolve({
            lastSavedAt: meta.lastSavedAt || null,
            count: meta.count || 0,
            isAvailable: true,
          });
        } else {
          resolve(getMetadataFromLocalStorageFallback());
        }
      };

      request.onerror = () => {
        resolve(getMetadataFromLocalStorageFallback());
      };
    });
  } catch {
    return getMetadataFromLocalStorageFallback();
  }
}

function getMetadataFromLocalStorageFallback(): {
  lastSavedAt: number | null;
  count: number;
  isAvailable: boolean;
} {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(FALLBACK_META_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          lastSavedAt: parsed.lastSavedAt || null,
          count: parsed.count || 0,
          isAvailable: true,
        };
      }
    }
  } catch {}
  return { lastSavedAt: null, count: 0, isAvailable: false };
}

/**
 * Limpa o armazenamento offline
 */
export async function clearOfflineStorage(): Promise<void> {
  try {
    const db = await openOfflineDatabase();
    const tx = db.transaction([REPORTS_STORE, METADATA_STORE], 'readwrite');
    tx.objectStore(REPORTS_STORE).clear();
    tx.objectStore(METADATA_STORE).clear();
    await new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {}

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(FALLBACK_STORAGE_KEY);
      window.localStorage.removeItem(FALLBACK_META_KEY);
    }
  } catch {}
}

/**
 * Verifica se o dispositivo está conectado à internet
 */
export function isDeviceOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
}
