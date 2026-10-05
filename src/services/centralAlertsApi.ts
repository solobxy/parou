import { 
  CentralAlert, 
  CentralAlertType, 
  CentralAlertStatus, 
  AlertCenterDiagnostic, 
  AlertPreferences,
  DEFAULT_ALERT_PREFERENCES 
} from '../types/alerts';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PREFS_STORAGE_KEY = 'parou_central_alerts_prefs_v1';
const NOTIFIED_CACHE_KEY = 'parou_notified_alerts_cache_v1';

// Retrieve stored preferences locally
export function getStoredAlertPreferences(): AlertPreferences {
  if (typeof window === 'undefined') return DEFAULT_ALERT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ALERT_PREFERENCES,
      ...parsed,
      enabledTypes: {
        ...DEFAULT_ALERT_PREFERENCES.enabledTypes,
        ...(parsed.enabledTypes || {}),
      },
    };
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

// Persist preferences locally
export function saveStoredAlertPreferences(prefs: AlertPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn('Erro ao guardar preferências de alertas:', err);
  }
}

// Sync preferences to Firestore when user has account
export async function syncAlertPreferencesToFirebase(userId: string, prefs: AlertPreferences): Promise<void> {
  if (!db || !userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { alertPreferences: prefs, lastUpdated: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.warn('Erro ao sincronizar preferências com a conta Firebase:', err);
  }
}

// Load preferences from Firestore when user logs in
export async function loadAlertPreferencesFromFirebase(userId: string): Promise<AlertPreferences | null> {
  if (!db || !userId) return null;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.alertPreferences) {
        saveStoredAlertPreferences(data.alertPreferences);
        return data.alertPreferences;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar preferências da conta Firebase:', err);
  }
  return null;
}

export interface FetchCentralAlertsParams {
  status?: CentralAlertStatus | 'Todos';
  tipo?: CentralAlertType | 'Todos';
  operador?: string;
  regiao?: string;
  municipio?: string;
  linha?: string;
  search?: string;
}

// Fetch alerts from backend
export async function fetchCentralAlerts(params: FetchCentralAlertsParams = {}): Promise<{
  alerts: CentralAlert[];
  total: number;
  timestamp: string;
}> {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'Todos') query.set('status', params.status);
  if (params.tipo && params.tipo !== 'Todos') query.set('tipo', params.tipo);
  if (params.operador && params.operador !== 'Todos') query.set('operador', params.operador);
  if (params.regiao && params.regiao !== 'Todas') query.set('regiao', params.regiao);
  if (params.municipio && params.municipio !== 'Todos') query.set('municipio', params.municipio);
  if (params.linha) query.set('linha', params.linha);
  if (params.search) query.set('search', params.search);

  const res = await fetch(`/api/central-alerts?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`Erro ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Fetch Diagnostic Dashboard data
export async function fetchCentralAlertsDiagnostic(): Promise<AlertCenterDiagnostic> {
  const res = await fetch('/api/central-alerts/diagnostic');
  if (!res.ok) {
    throw new Error(`Erro ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Force re-synchronization
export async function triggerCentralAlertsSync(): Promise<{
  success: boolean;
  total: number;
  newImported: number;
  duplicatesAvoided: number;
}> {
  const res = await fetch('/api/central-alerts/sync', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Erro ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// Record notification sent on backend diagnostic
export async function recordNotificationSent(): Promise<void> {
  try {
    await fetch('/api/central-alerts/notify-sent', { method: 'POST' });
  } catch {
    // Graceful ignore
  }
}

// Anti-Spam Cache: mapping of alert ID to hash and date
interface NotifiedCacheItem {
  hash: string;
  status: CentralAlertStatus;
  notifiedAt: number;
}

function getNotifiedCache(): Record<string, NotifiedCacheItem> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(NOTIFIED_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotifiedCache(cache: Record<string, NotifiedCacheItem>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFIED_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore
  }
}

// Check relevance: Does this alert match the user's favorites?
export function isAlertRelevantToUser(alert: CentralAlert, prefs: AlertPreferences): boolean {
  // If user disabled this alert type in preferences
  if (prefs.enabledTypes[alert.tipo] === false) {
    return false;
  }

  // If user has not enabled "notifyOnlyFavorites", all enabled categories are relevant
  if (!prefs.notifyOnlyFavorites) {
    return true;
  }

  // Check operator match
  const matchesOperator = prefs.favoriteOperators.length === 0 || prefs.favoriteOperators.some(op => 
    alert.operador.toLowerCase().includes(op.toLowerCase())
  );

  // Check region match
  const matchesRegion = prefs.favoriteRegions.length === 0 || prefs.favoriteRegions.some(reg => 
    alert.região.toLowerCase().includes(reg.toLowerCase())
  );

  // Check municipality match
  const matchesMunicipality = prefs.favoriteMunicipalities.length === 0 || prefs.favoriteMunicipalities.some(mun => 
    alert.municípios.some(m => m.toLowerCase().includes(mun.toLowerCase()))
  );

  // Check line match
  const matchesLine = prefs.favoriteLines.length === 0 || prefs.favoriteLines.some(ln => 
    alert.linhas.some(l => l.toLowerCase() === ln.toLowerCase() || l.includes(ln))
  );

  // Check stop match
  const matchesStop = prefs.favoriteStops.length === 0 || prefs.favoriteStops.some(st => 
    alert.paragens.some(p => p.toLowerCase().includes(st.toLowerCase()))
  );

  // An alert is relevant if it matches at least one specific favorite dimension that was configured
  const hasSpecificFavorites = prefs.favoriteOperators.length > 0 ||
    prefs.favoriteRegions.length > 0 ||
    prefs.favoriteMunicipalities.length > 0 ||
    prefs.favoriteLines.length > 0 ||
    prefs.favoriteStops.length > 0;

  if (!hasSpecificFavorites) {
    return true; // No favorites set, default to show enabled categories
  }

  return (
    (prefs.favoriteOperators.length > 0 && matchesOperator) ||
    (prefs.favoriteRegions.length > 0 && matchesRegion) ||
    (prefs.favoriteMunicipalities.length > 0 && matchesMunicipality) ||
    (prefs.favoriteLines.length > 0 && matchesLine) ||
    (prefs.favoriteStops.length > 0 && matchesStop)
  );
}

// PWA Push Notification Dispatcher with Anti-Spam
export async function evaluateAndDispatchAlertNotification(
  alert: CentralAlert, 
  prefs: AlertPreferences
): Promise<boolean> {
  // 1. Strict user consent: never notify if push notifications are disabled
  if (!prefs.pushNotificationsEnabled) {
    return false;
  }

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  // 2. Check relevance
  if (!isAlertRelevantToUser(alert, prefs)) {
    return false;
  }

  // 3. Condition checks for specific notification types requested by user:
  // - greve futura relevante
  // - início de greve
  // - interrupção
  // - alteração importante
  // - linha/paragem favorita afetada
  // - alteração de horário
  const isFutureStrike = alert.tipo === 'greve' && alert.status === 'Futuro' && prefs.notifyFutureStrikes;
  const isStrikeStart = alert.tipo === 'greve' && alert.status === 'Ativo' && prefs.notifyStrikeStart;
  const isInterruption = (alert.tipo === 'interrupção' || alert.tipo === 'linha suspensa') && prefs.notifyInterruptions;
  const isImportantChange = (alert.tipo === 'alteração de percurso' || alert.tipo === 'desvio' || alert.tipo === 'obras' || alert.tipo === 'cancelamento') && prefs.notifyImportantChanges;
  const isScheduleChange = (alert.tipo === 'alteração de horário' || alert.tipo === 'novo horário') && prefs.notifyScheduleChanges;

  const matchesRequestedType = isFutureStrike || isStrikeStart || isInterruption || isImportantChange || isScheduleChange;

  if (!matchesRequestedType) {
    return false;
  }

  // 4. Anti-Spam: Check if already notified for this exact state/hash
  const cache = getNotifiedCache();
  const currentHash = alert.content_hash || `${alert.título}|${alert.status}|${alert.start_datetime}`;
  const previous = cache[alert.id];

  if (previous) {
    // If same hash and same status, do NOT notify again (Anti-Spam)
    if (previous.hash === currentHash && previous.status === alert.status) {
      return false;
    }
  }

  // 5. Build rich notification body with source and timestamp
  const prefix = alert.status === 'Futuro' 
    ? '⏳ [ALERTA FUTURO]' 
    : (alert.tipo === 'greve' ? '⚠️ [GREVE]' : '🚨 [ALERTA OFICIAL]');

  const title = `${prefix} ${alert.operador}: ${alert.título}`;
  const body = `${alert.descrição.slice(0, 120)}...\nFonte: ${alert.source} • Atualizado: ${new Date(alert.last_update).toLocaleTimeString('pt-PT')}`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: `parou-alert-${alert.id}`,
          data: { url: `/?tab=alertas&alertId=${alert.id}` },
        });
      } else {
        new Notification(title, { body, icon: '/icon.svg' });
      }
    } else {
      new Notification(title, { body, icon: '/icon.svg' });
    }

    // Save to anti-spam cache
    cache[alert.id] = {
      hash: currentHash,
      status: alert.status,
      notifiedAt: Date.now(),
    };
    saveNotifiedCache(cache);

    // Increment backend diagnostic counter
    await recordNotificationSent();
    return true;
  } catch (err) {
    console.warn('Erro ao disparar notificação PWA:', err);
    return false;
  }
}
