import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { DateTime } from 'luxon';
import { DB_FILE, getAppState, reloadDatabaseConnection } from './db/gtfsDatabase';

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
}

let estado: EstadoDados = {
  isLoading: true, totalOperators: 0, loadedOperators: 0, currentOperator: '',
  currentFeedId: '', message: 'A preparar dados', updatedAt: new Date().toISOString(),
};
let emCurso = false;
let iniciado = false;

export function getEstadoDadosProntos(): EstadoDados {
  return estado;
}

function baseValida(ficheiro: string): boolean {
  let db: DatabaseSync | null = null;
  try {
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
    const resManifest = await fetch(`${BASE_URL}/manifest.json`, { signal: AbortSignal.timeout(30000) });
    if (!resManifest.ok) throw new Error(`manifest.json devolveu HTTP ${resManifest.status}`);
    const manifest: any = await resManifest.json();
    const totais = {
      totalOperators: Number(manifest?.totals?.operators || 0),
      loadedOperators: Number(manifest?.totals?.operators_ok || 0),
    };
    const atual = getAppState<string>('dataset_built_at');
    if (atual && atual === manifest.built_at) {
      estado = { ...estado, ...totais, isLoading: false, message: 'Todos os operadores carregados', updatedAt: new Date().toISOString() };
      return;
    }
    estado = { ...estado, ...totais, isLoading: true, message: 'A preparar dados', updatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const resBase = await fetch(`${BASE_URL}/gtfs.db.gz`, { signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!resBase.ok || !resBase.body) throw new Error(`gtfs.db.gz devolveu HTTP ${resBase.status}`);
    await pipeline(Readable.fromWeb(resBase.body as any), zlib.createGunzip(), fs.createWriteStream(FICHEIRO_NOVO));
    if (!baseValida(FICHEIRO_NOVO)) throw new Error('a base descarregada não passou a verificação');
    fs.renameSync(FICHEIRO_NOVO, DB_FILE);
    for (const resto of [`${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
      try { if (fs.existsSync(resto)) fs.unlinkSync(resto); } catch {}
    }
    reloadDatabaseConnection();
    estado = { ...estado, ...totais, isLoading: false, message: 'Todos os operadores carregados', updatedAt: new Date().toISOString() };
    console.log(`[Dados prontos] Base de ${manifest.built_at} ativa.`);
  } catch (err: any) {
    console.warn('[Dados prontos] Não foi possível atualizar:', err?.message || err);
    try { if (fs.existsSync(FICHEIRO_NOVO)) fs.unlinkSync(FICHEIRO_NOVO); } catch {}
    const temBase = getAppState<string>('dataset_built_at') !== null;
    estado = { ...estado, isLoading: false, message: temBase ? 'A usar os dados anteriores' : 'Sem dados de horários (nova tentativa dentro de 5 minutos)', updatedAt: new Date().toISOString() };
    if (!temBase) setTimeout(() => { void atualizarDados(); }, NOVA_TENTATIVA_MS);
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
