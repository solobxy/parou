import { Occurrence, NotificationPreferences, NotificationLogItem } from '../types';

const STORAGE_KEY_PREFS = 'parou_notification_preferences_v1';
const STORAGE_KEY_LOGS = 'parou_notification_history_v1';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  selectedDistrict: 'Todas',
  importantTransportOnly: true,
  severeOnly: false,
  soundEnabled: true,
  pushSubscribed: false,
};

// Retrieve stored preferences
export function getStoredNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFS);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

// Persist preferences
export function saveStoredNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
  } catch (err) {
    console.warn('Error saving notification preferences:', err);
  }
}

// Check native browser notification permission
export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Request notification permission from user
export async function requestNotificationPermission(): Promise<{
  permission: NotificationPermission | 'unsupported';
  isPWAReady: boolean;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { permission: 'unsupported', isPWAReady: false };
  }

  try {
    const perm = await Notification.requestPermission();
    let isPWAReady = false;

    if (perm === 'granted' && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'pushManager' in registration) {
          isPWAReady = true;
        }
      } catch {
        isPWAReady = false;
      }
    }

    return { permission: perm, isPWAReady };
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return { permission: 'denied', isPWAReady: false };
  }
}

// Synthesize pleasant notification chime via Web Audio API (zero audio file dependencies)
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // First bell tone (587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second bell tone (880.00 Hz - A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.12);
    gain2.gain.setValueAtTime(0.18, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // AudioContext blocked by browser policy until user gesture
  }
}

// Retrieve notification history
export function getStoredNotificationHistory(): NotificationLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Add notification to history
export function addNotificationToHistory(item: NotificationLogItem): void {
  if (typeof window === 'undefined') return;
  try {
    const logs = getStoredNotificationHistory();
    const updated = [item, ...logs.filter((l) => l.id !== item.id)].slice(0, 30);
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Error saving notification history:', err);
  }
}

// Mark notifications as read or clear
export function clearStoredNotificationHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_LOGS);
  } catch (err) {
    console.warn('Error clearing notification history:', err);
  }
}

// Determine if an occurrence represents an important transport change
export function isImportantTransportDisruption(occ: Occurrence): boolean {
  if (occ.type === 'GREVE') return true;
  if (occ.type === 'CORTE') return true;
  if (occ.type === 'AVARIA' && (occ.severity === 'Grave' || occ.severity === 'Moderada')) return true;
  if (occ.type === 'SERVICO_PUBLICO' && occ.severity === 'Grave') return true;
  if (occ.isBreaking) return true;

  // Keyword check in title/company
  const title = (occ.title || '').toLowerCase();
  const company = (occ.companyOrService || '').toLowerCase();
  if (
    title.includes('linha suspensa') ||
    title.includes('circulação interrompida') ||
    title.includes('greve geral') ||
    title.includes('sem comboios') ||
    title.includes('sem metro') ||
    title.includes('ponte 25 de abril') ||
    title.includes('vasco da gama') ||
    company.includes('cp') ||
    company.includes('metro') ||
    company.includes('carris') ||
    company.includes('fertagus') ||
    company.includes('transtejo')
  ) {
    return occ.severity === 'Grave' || occ.severity === 'Moderada';
  }

  return false;
}

function normalizarLocal(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, '').trim();
}

/** A ocorrência é num dos distritos escolhidos? (sem distritos escolhidos = todo o país) */
export function ocorrenciaNosDistritos(occ: Pick<Occurrence, 'district' | 'concelho'>, distritos: string[]): boolean {
  if (!distritos || distritos.length === 0) return true;
  const d = normalizarLocal(occ.district || '');
  const c = normalizarLocal(occ.concelho || '');
  if (!d || d === 'nacional' || d === 'portugal' || d === 'todas') return true;
  return distritos.some((escolhido) => {
    const e = normalizarLocal(escolhido);
    if (!e) return false;
    if (d === e || c === e || d.includes(e) || e.includes(d)) return true;
    // "Funchal (Madeira)" também apanha "Madeira"; "Ponta Delgada (Açores)" apanha "Açores"
    const regiao = normalizarLocal((escolhido.match(/\((.*?)\)/) || [])[1] || '');
    return Boolean(regiao) && (d.includes(regiao) || c.includes(regiao));
  });
}

// Evaluation: Does this occurrence match the user's notification preferences?
export function shouldNotifyOccurrence(
  occ: Occurrence,
  prefs: NotificationPreferences
): boolean {
  if (!prefs.enabled) return false;
  if (occ.status === 'Ocultada' || occ.status === 'Resolvida') return false;

  // Distritos escolhidos no ecrã das notificações (lista vazia = todo o país)
  const distritos = (prefs.districts && prefs.districts.length > 0)
    ? prefs.districts
    : (prefs.selectedDistrict && prefs.selectedDistrict !== 'Todas' ? [prefs.selectedDistrict] : []);
  if (!ocorrenciaNosDistritos(occ, distritos)) return false;

  if (prefs.severeOnly && occ.severity !== 'Grave') return false;

  // Por defeito só o que mexe mesmo com as viagens (greves, vias cortadas, avarias, graves)
  if (prefs.importantTransportOnly) {
    return isImportantTransportDisruption(occ) || occ.severity === 'Grave';
  }
  return true;
}

// Send system notification (PWA ServiceWorker or standard Notification)
export async function sendSystemNotification(
  title: string,
  body: string,
  reportId?: string
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: reportId ? `report-${reportId}` : 'parou-alert',
    data: {
      url: reportId ? `/?reportId=${reportId}` : '/',
      reportId,
    },
  };

  // Try service worker registration first (works best with PWA and mobile Android)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        return true;
      }
    } catch {
      // Fall through to window Notification
    }
  }

  // Fallback to standard web notification
  try {
    const notif = new Notification(title, options);
    notif.onclick = () => {
      window.focus();
      if (reportId) {
        const url = new URL(window.location.href);
        url.searchParams.set('reportId', reportId);
        window.history.pushState(null, '', url.toString());
      }
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

// Dispatches an occurrence notification (sound + system notification + history log)
export async function dispatchOccurrenceNotification(
  occ: Occurrence,
  prefs: NotificationPreferences
): Promise<NotificationLogItem | null> {
  if (!shouldNotifyOccurrence(occ, prefs)) {
    return null;
  }

  // Play subtle sound chime if enabled
  if (prefs.soundEnabled) {
    playNotificationSound();
  }

  const prefix = occ.severity === 'Grave' ? '🚨 [GRAVE] ' : occ.type === 'GREVE' ? '⚠️ [GREVE] ' : '📢 ';
  const title = `${prefix}${occ.title}`;
  const body = `${occ.district}${occ.concelho ? ` · ${occ.concelho}` : ''} | ${occ.companyOrService ? `${occ.companyOrService}: ` : ''}${occ.description || 'Acompanhe em direto no PAROU.PT'}`;

  // Try system / PWA push notification
  await sendSystemNotification(title, body, occ.id);

  const logItem: NotificationLogItem = {
    id: `notif-${occ.id}-${Date.now()}`,
    title,
    body,
    timestamp: Date.now(),
    reportId: occ.id,
    type: occ.type,
    district: occ.district,
    read: false,
  };

  addNotificationToHistory(logItem);
  return logItem;
}

// ---------------------------------------------------------------------------------
// Notificações push (chegam mesmo com a app fechada). O servidor guarda a subscrição e
// os distritos escolhidos e envia greves, avisos de mau tempo e perturbações graves.
// ---------------------------------------------------------------------------------
function chaveParaBytes(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesIguais(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

async function registoSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof window === 'undefined' || !('PushManager' in window)) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
  } catch {
    return null;
  }
}

export function pushSuportado(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Põe o servidor a par das preferências: subscreve (ou atualiza os distritos) quando as
 * notificações estão ligadas e com permissão; cancela quando estão desligadas.
 */
export async function sincronizarPush(prefs: NotificationPreferences): Promise<'ok' | 'sem-suporte' | 'sem-permissao' | 'erro'> {
  if (!pushSuportado()) return 'sem-suporte';
  const reg = await registoSW();
  if (!reg) return 'sem-suporte';
  try {
    let sub = await reg.pushManager.getSubscription();
    // Sem alertas ligados mas com lembretes de partida pendentes: a subscrição fica, só para os lembretes
    const soLembretes = !prefs.enabled && temLembretesAtivos();
    if ((!prefs.enabled && !soLembretes) || Notification.permission !== 'granted') {
      if (sub) {
        await fetch('/api/push/cancelar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => false);
      }
      return Notification.permission === 'granted' ? 'ok' : 'sem-permissao';
    }
    const r = await fetch('/api/push/chave', { cache: 'no-store' });
    if (!r.ok) return 'erro';
    const { chave } = (await r.json()) as { chave: string };
    const chaveBytes = chaveParaBytes(chave);
    // Se o servidor mudou de chaves, a subscrição antiga já não serve
    if (sub && !bytesIguais(sub.options?.applicationServerKey, chaveBytes)) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes as BufferSource });
    }
    const distritos = (prefs.districts && prefs.districts.length > 0)
      ? prefs.districts
      : (prefs.selectedDistrict && prefs.selectedDistrict !== 'Todas' ? [prefs.selectedDistrict] : []);
    const g = await fetch('/api/push/subscrever', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscricao: sub.toJSON(), distritos: soLembretes ? [] : distritos, modo: soLembretes ? 'lembretes' : 'alertas' }),
    });
    return g.ok ? 'ok' : 'erro';
  } catch (err) {
    console.warn('[Push] Não foi possível ativar:', err);
    return 'erro';
  }
}

/** Pede ao servidor uma notificação de teste (prova que o push chega com a app fechada). */
export async function testarPush(): Promise<boolean> {
  const reg = await registoSW();
  if (!reg) return false;
  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const r = await fetch('/api/push/teste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    return Boolean(j?.ok);
  } catch {
    return false;
  }
}

// Send test notification to verify audio, browser permission, and toast
export async function triggerTestNotification(
  prefs: NotificationPreferences
): Promise<NotificationLogItem> {
  if (prefs.soundEnabled) {
    playNotificationSound();
  }

  const title = 'PAROU · notificações ligadas';
  const distritos = prefs.districts && prefs.districts.length > 0 ? prefs.districts.join(', ') : 'todo o país';
  const body = `Vais receber aqui os avisos importantes (${distritos}).`;

  await sendSystemNotification(title, body);

  const logItem: NotificationLogItem = {
    id: `test-${Date.now()}`,
    title,
    body,
    timestamp: Date.now(),
    read: false,
  };

  addNotificationToHistory(logItem);
  return logItem;
}

// ---------------------------------------------------------------------------------
// Lembretes de partida: "sai de casa daqui a 5 min". O servidor envia o push à hora certa,
// mesmo com a app fechada. Ficam registados neste telemóvel para a app mostrar o estado.
// ---------------------------------------------------------------------------------
const CHAVE_LEMBRETES = 'parou_lembretes_v1';
export interface LembreteLocal { tag: string; quando: number; texto: string }

function lerLembretes(): LembreteLocal[] {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE_LEMBRETES) || '[]');
    return (Array.isArray(l) ? l : []).filter((x: LembreteLocal) => x && typeof x.tag === 'string' && x.quando > Date.now() - 10 * 60_000);
  } catch {
    return [];
  }
}
function gravarLembretes(l: LembreteLocal[]): void {
  try { localStorage.setItem(CHAVE_LEMBRETES, JSON.stringify(l.slice(-20))); } catch { /* sem armazenamento */ }
}
export function temLembretesAtivos(): boolean {
  if (typeof window === 'undefined') return false;
  return lerLembretes().some((x) => x.quando > Date.now());
}
export function lembreteAtivo(tag: string): LembreteLocal | null {
  if (typeof window === 'undefined') return null;
  return lerLembretes().find((x) => x.tag === tag && x.quando > Date.now()) || null;
}

async function subscreverParaLembretes(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const r = await fetch('/api/push/chave', { cache: 'no-store' });
  if (!r.ok) return null;
  const { chave } = (await r.json()) as { chave: string };
  const chaveBytes = chaveParaBytes(chave);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !bytesIguais(sub.options?.applicationServerKey, chaveBytes)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes as BufferSource });
  const alertasLigados = getStoredNotificationPreferences().enabled;
  const distritos = alertasLigados ? (getStoredNotificationPreferences().districts || []) : [];
  const g = await fetch('/api/push/subscrever', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscricao: sub.toJSON(), distritos, modo: alertasLigados ? 'alertas' : 'lembretes' }),
  });
  return g.ok ? sub : null;
}

export type ResultadoLembrete = 'ok' | 'sem-suporte' | 'sem-permissao' | 'erro';

/** Pede ao servidor um aviso à hora "quando" (ms). Tem de ser chamada num toque (pede a permissão). */
export async function criarLembrete(p: { tag: string; quando: number; titulo: string; corpo: string; url?: string }): Promise<ResultadoLembrete> {
  if (!pushSuportado()) return 'sem-suporte';
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') return 'sem-permissao';
    const reg = await registoSW();
    if (!reg) return 'sem-suporte';
    const enviar = async (sub: PushSubscription) => fetch('/api/push/lembrete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, quando: p.quando, titulo: p.titulo, corpo: p.corpo, url: p.url || '/', tag: p.tag }),
    });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await subscreverParaLembretes(reg);
    if (!sub) return 'erro';
    let r = await enviar(sub);
    if (r.status === 404) {
      // o servidor não conhece esta subscrição (ex.: foi apagada): volta a registá-la
      const nova = await subscreverParaLembretes(reg);
      if (!nova) return 'erro';
      r = await enviar(nova);
    }
    if (!r.ok) return 'erro';
    gravarLembretes([...lerLembretes().filter((x) => x.tag !== p.tag), { tag: p.tag, quando: p.quando, texto: p.titulo }]);
    return 'ok';
  } catch (err) {
    console.warn('[Lembrete] Falhou:', err);
    return 'erro';
  }
}

export async function cancelarLembrete(tag: string): Promise<void> {
  gravarLembretes(lerLembretes().filter((x) => x.tag !== tag));
  try {
    const reg = await registoSW();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/lembrete/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, tag }),
    });
  } catch { /* o servidor ignora lembretes já enviados */ }
}
