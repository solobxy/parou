import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import { DB_FILE, getAppState, setAppState, reloadDatabaseConnection, getDatabase } from './db/gtfsDatabase';

const BASE_URL = process.env.PAROU_DADOS_URL || 'https://github.com/solobxy/parou-dados/releases/download/dados';
const FICHEIRO_NOVO = `${DB_FILE}.new`;
const INTERVALO_MS = 30 * 60 * 1000;
const NOVA_TENTATIVA_MS = 5 * 60 * 1000;

export interface EstadoDados {
  isLoading: boolean;
  totalOperators: number;
  loadedOperators: number;
  currentOperator: string;
  currentFeedId: string;
  message: string;
  updatedAt: string;
  dataset_built_at?: string;
}

let estado: EstadoDados = {
  isLoading: true, totalOperators: 0, loadedOperators: 0, currentOperator: '',
  currentFeedId: '', message: 'A carregar horários…', updatedAt: new Date().toISOString(),
};
let emCurso = false;
let iniciado = false;
let manifestData: any = null;
let manifestFeedsMap = new Map<string, any>();

// Cache em memória de serviços ativos por dia e fuso horário (Regra 1)
export interface ActiveServicesResult {
  dateStr: string;
  timezone: string;
  activeSet: Set<string>; // "${feed_id}:${service_id}"
  feedsWithoutCalendar: Set<string>; // feed_id
}

const servicesCache = new Map<string, ActiveServicesResult>();

export function clearServicesCache(): void {
  servicesCache.clear();
}

export function getActiveServices(data: Date = new Date(), timezone = 'Europe/Lisbon'): ActiveServicesResult {
  const dt = DateTime.fromJSDate(data).setZone(timezone);
  const d = dt.toFormat('yyyyMMdd');
  const cacheKey = `${d}_${timezone}`;
  const cached = servicesCache.get(cacheKey);
  if (cached) return cached;

  const coluna = dt.toFormat('cccc').toLowerCase();
  const activeSet = new Set<string>();
  const feedsWithoutCalendar = new Set<string>();

  try {
    const db = getDatabase();
    const serviceRows = db.prepare(`
      SELECT feed_id, service_id FROM calendar WHERE start_date <= ? AND end_date >= ? AND ${coluna} = 1
      UNION SELECT feed_id, service_id FROM calendar_dates WHERE date = ? AND exception_type = 1
      EXCEPT SELECT feed_id, service_id FROM calendar_dates WHERE date = ? AND exception_type = 2
    `).all(d, d, d, d) as Array<{ feed_id: string; service_id: string }>;

    for (const r of serviceRows) {
      activeSet.add(`${r.feed_id}:${r.service_id}`);
    }

    const feedRows = db.prepare(`
      SELECT DISTINCT id as feed_id FROM feeds WHERE id NOT IN (SELECT feed_id FROM calendar UNION SELECT feed_id FROM calendar_dates)
    `).all() as Array<{ feed_id: string }>;

    for (const f of feedRows) {
      feedsWithoutCalendar.add(f.feed_id);
    }
  } catch (err) {
    console.warn('[ActiveServices] Erro ao carregar serviços ativos:', err);
  }

  const result: ActiveServicesResult = {
    dateStr: d,
    timezone,
    activeSet,
    feedsWithoutCalendar,
  };

  servicesCache.set(cacheKey, result);
  return result;
}

export function isServiceActive(
  feedId: string,
  serviceId: string,
  activeServices: ActiveServicesResult
): boolean {
  if (activeServices.feedsWithoutCalendar.has(feedId)) return true;
  return activeServices.activeSet.has(`${feedId}:${serviceId}`);
}

export function getEstadoDadosProntos(): EstadoDados {
  return estado;
}

export function getManifestData(): any {
  return manifestData;
}

export function getManifestFeedsMap(): Map<string, any> {
  return manifestFeedsMap;
}

export function isDadosProntosPronto(): boolean {
  if (estado.isLoading && !fs.existsSync(DB_FILE)) return false;
  return fs.existsSync(DB_FILE) && baseValida(DB_FILE);
}

function baseValida(ficheiro: string): boolean {
  let db: DatabaseSync | null = null;
  try {
    if (!fs.existsSync(ficheiro)) return false;
    db = new DatabaseSync(ficheiro, { readOnly: true });
    const check = db.prepare('PRAGMA quick_check').get() as any;
    const paragens = db.prepare('SELECT COUNT(*) AS n FROM stops').get() as any;
    return check?.quick_check === 'ok' && Number(paragens?.n || 0) > 1000;
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch {}
  }
}

export async function atualizarDados(): Promise<void> {
  if (emCurso) return;
  emCurso = true;
  try {
    const resManifest = await fetch(`${BASE_URL}/manifest.json`, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!resManifest.ok) throw new Error(`manifest.json devolveu HTTP ${resManifest.status}`);
    const manifest: any = await resManifest.json();
    manifestData = manifest;
    manifestFeedsMap.clear();
    if (Array.isArray(manifest.feeds)) {
      manifest.feeds.forEach((f: any) => {
        if (f.id) manifestFeedsMap.set(f.id, f);
      });
    }

    const totais = {
      totalOperators: Number(manifest?.totals?.operators || 29),
      loadedOperators: Number(manifest?.totals?.operators_ok || 26),
    };

    const atual = getAppState<string>('dataset_built_at');
    const builtAt = manifest?.built_at || atual;
    if (atual && atual === manifest.built_at && baseValida(DB_FILE)) {
      estado = { ...estado, ...totais, dataset_built_at: builtAt, isLoading: false, message: 'Todos os operadores carregados', updatedAt: new Date().toISOString() };
      return;
    }

    estado = { ...estado, ...totais, dataset_built_at: builtAt, isLoading: true, message: `A carregar horários… ${totais.loadedOperators}/${totais.totalOperators}`, updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

    // Limpa ficheiro temporário antigo se tiver sobrado de tentativa abortada
    try { if (fs.existsSync(FICHEIRO_NOVO)) fs.unlinkSync(FICHEIRO_NOVO); } catch {}
    try { if (fs.existsSync(`${DB_FILE}.bak`)) fs.unlinkSync(`${DB_FILE}.bak`); } catch {}

    const resBase = await fetch(`${BASE_URL}/gtfs.db.gz`, { redirect: 'follow', signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!resBase.ok || !resBase.body) throw new Error(`gtfs.db.gz devolveu HTTP ${resBase.status}`);
    await pipeline(Readable.fromWeb(resBase.body as any), zlib.createGunzip(), fs.createWriteStream(FICHEIRO_NOVO));

    if (!baseValida(FICHEIRO_NOVO)) throw new Error('a base descarregada não passou a verificação');

    // Troca atómica: gtfs.db.new substitui gtfs.db, garantindo no máximo 2 ficheiros em disco durante o processo
    fs.renameSync(FICHEIRO_NOVO, DB_FILE);

    // Apaga imediatamente resíduos para libertar memória em /tmp
    for (const resto of [`${DB_FILE}-wal`, `${DB_FILE}-shm`, `${DB_FILE}.bak`, FICHEIRO_NOVO]) {
      try { if (fs.existsSync(resto)) fs.unlinkSync(resto); } catch {}
    }

    clearServicesCache();
    reloadDatabaseConnection();
    try { if (builtAt) setAppState('dataset_built_at', builtAt); } catch {}
    estado = { ...estado, ...totais, dataset_built_at: builtAt, isLoading: false, message: 'Todos os operadores carregados', updatedAt: new Date().toISOString() };
    console.log(`[Dados prontos] Base de ${manifest.built_at} ativa (${totais.loadedOperators}/${totais.totalOperators} operadores).`);
  } catch (err: any) {
    console.warn('[Dados prontos] Não foi possível atualizar:', err?.message || err);
    try { if (fs.existsSync(FICHEIRO_NOVO)) fs.unlinkSync(FICHEIRO_NOVO); } catch {}
    try { if (fs.existsSync(`${DB_FILE}.bak`)) fs.unlinkSync(`${DB_FILE}.bak`); } catch {}
    const temBase = baseValida(DB_FILE);
    estado = { ...estado, isLoading: !temBase, message: temBase ? 'A usar os dados anteriores' : 'A carregar horários… (tentando novamente)', updatedAt: new Date().toISOString() };
    if (!temBase) setTimeout(() => { void atualizarDados(); }, 5000);
  } finally {
    emCurso = false;
  }
}

export function iniciarDadosProntos(): void {
  if (iniciado || process.env.IS_WORKER === 'true') return;
  iniciado = true;
  setTimeout(() => { void atualizarDados(); }, 1000);
  setInterval(() => { void atualizarDados(); }, INTERVALO_MS);
}

export function getFeedTimezone(feedId?: string): string {
  if (!feedId) return 'Europe/Lisbon';
  const clean = feedId.toLowerCase();
  if (clean.includes('acores') || clean.includes('azores') || clean.includes('terceira') || clean.includes('saomiguel') || clean.includes('pico') || clean.includes('faial')) {
    return 'Atlantic/Azores';
  }
  return 'Europe/Lisbon';
}

export function filtroServicosHoje(alias = 't', data: Date = new Date(), timezone = 'Europe/Lisbon'): string {
  const dt = DateTime.fromJSDate(data).setZone(timezone);
  const d = dt.toFormat('yyyyMMdd');
  const coluna = dt.toFormat('cccc').toLowerCase();
  return `((${alias}.feed_id, ${alias}.service_id) IN (`
    + `SELECT feed_id, service_id FROM calendar WHERE start_date <= '${d}' AND end_date >= '${d}' AND ${coluna} = 1 `
    + `UNION SELECT feed_id, service_id FROM calendar_dates WHERE date = '${d}' AND exception_type = 1 `
    + `EXCEPT SELECT feed_id, service_id FROM calendar_dates WHERE date = '${d}' AND exception_type = 2) `
    + `OR ${alias}.feed_id NOT IN (SELECT feed_id FROM calendar UNION SELECT feed_id FROM calendar_dates))`;
}
