// =====================================================================================
// PAROU.PT — Greves nos trajetos
//
// Uma greve confirmada pelo operador (avisos oficiais: CP, Metro de Lisboa, TML, Carris Metropolitana…) aparece no troço
// do trajeto que usa esse operador, se a viagem sai dentro do período da greve, ou num dia em que o operador avisa que
// ainda há perturbações. Sem aviso oficial do operador, não se mostra nada.
// =====================================================================================
import { DateTime } from 'luxon';
import { avisosEmMemoria } from './centralAlertsEngine';
import type { GreveTroco } from '../types/perto';

/** Nomes com que cada operador aparece nos avisos oficiais (comparados sem acentos nem maiúsculas) */
const OPERADORES: Record<string, string[]> = {
  cp: ['cp', 'cp - comboios de portugal', 'comboios de portugal'],
  metro_lisboa: ['metro de lisboa', 'metropolitano de lisboa'],
  carris: ['carris'],
  cm: ['carris metropolitana'],
  cmh: ['carris metropolitana'],
  fertagus: ['fertagus'],
  transtejo_soflusa: ['transtejo soflusa', 'transtejo', 'soflusa'],
  mts: ['metro sul do tejo', 'metro transportes do sul', 'mts'],
  tcb_barreiro: ['tcb barreiro', 'tcb'],
  stcp: ['stcp'],
  metro_porto: ['metro do porto'],
  unir: ['unir'],
  unirh: ['unir'],
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** O que o planeador precisa de cada aviso de greve */
export interface AvisoGreve {
  operador: string;
  titulo: string;
  url: string;
  inicioMs: number;
  /** NaN = sem fim indicado */
  fimMs: number;
  /** Outros dias (AAAA-MM-DD, Lisboa) com perturbações previstas, segundo o operador */
  dias: string[];
}

/** Avisos oficiais de greve ainda a valer (ativos ou futuros) */
export function grevesDosAvisos(alertas: any[], agoraMs = Date.now()): AvisoGreve[] {
  const out: AvisoGreve[] = [];
  for (const a of alertas || []) {
    if (!a || a.tipo !== 'greve' || (a.status !== 'Ativo' && a.status !== 'Futuro')) continue;
    const inicioMs = Date.parse(String(a.start_datetime || ''));
    const fimMs = a.end_datetime ? Date.parse(String(a.end_datetime)) : NaN;
    if (!Number.isFinite(inicioMs)) continue;
    const dias = Array.isArray(a.dias_perturbacao) ? a.dias_perturbacao.map(String) : [];
    const ultimoDia = dias.length ? DateTime.fromISO(dias.slice().sort().pop()!, { zone: 'Europe/Lisbon' }).endOf('day').toMillis() : NaN;
    const acaba = Math.max(Number.isFinite(fimMs) ? fimMs : inicioMs + 30 * 3600_000, Number.isFinite(ultimoDia) ? ultimoDia : 0);
    if (acaba < agoraMs) continue;
    out.push({ operador: String(a.operador || ''), titulo: String(a.título || '').replace(/\s+/g, ' ').trim(), url: String(a.source_url || ''), inicioMs, fimMs, dias });
  }
  return out;
}

/** Greve que afeta um troço (operador da app e hora de partida), ou undefined */
export function greveDoTroco(feed: string, partidaMs: number, greves: AvisoGreve[]): GreveTroco | undefined {
  const nomes = OPERADORES[feed];
  if (!nomes || !Number.isFinite(partidaMs)) return undefined;
  const dia = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' }).toISODate();
  let previsto: GreveTroco | undefined;
  for (const g of greves) {
    if (!nomes.includes(norm(g.operador))) continue;
    // sem fim indicado: vale até ao fim do dia em que começa (como na página das greves)
    const fim = Number.isFinite(g.fimMs) ? g.fimMs : DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).endOf('day').toMillis();
    if (partidaMs >= g.inicioMs && partidaMs <= fim) return { titulo: g.titulo, url: g.url, operador: g.operador };
    if (dia && g.dias.includes(dia)) previsto = previsto || { titulo: g.titulo, url: g.url, operador: g.operador, previsto: true };
  }
  return previsto;
}

/** Avisos de greve para o planeador: os que já estão em memória (nunca espera pela rede) */
export async function grevesParaPlaneador(): Promise<AvisoGreve[]> {
  try {
    return grevesDosAvisos(avisosEmMemoria());
  } catch {
    return [];
  }
}
