// =====================================================================================
// PAROU.PT — Greves nos trajetos
//
// Uma greve confirmada pelo operador (avisos oficiais: CP, Metro de Lisboa, TML, Carris Metropolitana…, ou o comunicado do
// operador publicado pela imprensa quando não há aviso no site dele, ver grevesNoticias.ts) aparece no troço
// do trajeto que usa esse operador, se a viagem sai dentro do período da greve, ou num dia em que o operador avisa que
// ainda há perturbações. Sem aviso do operador (no site dele ou comunicado nas notícias), não se mostra nada.
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
  tub_braga: ['tub', 'transportes urbanos de braga'],
  smtuc: ['smtuc'],
  metro_mondego: ['metro mondego'],
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
  /** Vem de uma notícia (ver grevesNoticias.ts) */
  noticia?: boolean;
  /** Véspera: a partir desta hora o serviço já acaba mais cedo (perturbação prevista, não greve) */
  vesperaMs?: number;
  /** Véspera: a partir desta hora já não há serviço (o operador diz «o serviço termina por volta das 23h») */
  vesperaFimMs?: number;
  /** O que continua a funcionar (linhas pela cor e troços entre duas estações) e a que horas (minutos desde a meia-noite) */
  servico?: { linhas: string[]; trocos: Array<[string, string]>; frequencia?: string; horas?: [number, number] };
}

/** Troço de um trajeto, para saber se fica na parte que funciona durante a greve */
export interface TrocoParaGreve {
  /** código da linha (Metro do Porto: "D") ou nome ("Amarela") */
  linha?: string;
  /** O troço em relação ao troço anunciado [a, b] (nomes sem acentos): `dentro` = as duas estações do troço ficam entre a e b
   *  (em qualquer linha que lá passe); `passa` = a viagem deste troço passa por a e por b (o troço anunciado é desta linha) */
  dentroDe?: (a: string, b: string) => { dentro: boolean; passa: boolean };
}

/** Cor de cada linha do Metro do Porto pelo código */
const COR_METRO_PORTO: Record<string, string> = { A: 'azul', B: 'vermelha', C: 'verde', D: 'amarela', E: 'violeta', F: 'laranja', G: 'rosa', H: 'rubi' };

function funcionaNaGreve(feed: string, g: AvisoGreve, troco?: TrocoParaGreve): boolean {
  const s = g.servico;
  if (!s || !troco) return false;
  const linha = norm(String(troco.linha || ''));
  const cor = feed === 'metro_porto' ? COR_METRO_PORTO[String(troco.linha || '').toUpperCase()] : linha;
  // um troço anunciado nessa viagem manda (a linha pode funcionar só em parte); sem troço nela, a linha inteira
  const onde = s.trocos.map(([a, b]) => (troco.dentroDe ? troco.dentroDe(a, b) : { dentro: false, passa: false }));
  if (onde.some((o) => o.dentro)) return true;
  // linha anunciada inteira, a não ser que haja um troço anunciado nela (aí só esse troço funciona)
  return !!cor && s.linhas.includes(cor) && !onde.some((o) => o.passa);
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
    out.push({ operador: String(a.operador || ''), titulo: String(a.título || '').replace(/\s+/g, ' ').trim(), url: String(a.source_url || ''), inicioMs, fimMs, dias, ...(/^Not[ií]cia/.test(String(a.source || '')) ? { noticia: true } : {}), ...(a.servico_na_greve ? { servico: a.servico_na_greve } : {}), ...(a.vespera_desde && Number.isFinite(Date.parse(a.vespera_desde)) ? { vesperaMs: Date.parse(a.vespera_desde) } : {}), ...(a.vespera_fim && Number.isFinite(Date.parse(a.vespera_fim)) ? { vesperaFimMs: Date.parse(a.vespera_fim) } : {}) });
  }
  // avisos que dizem o que funciona primeiro (o «Estado das Linhas» pode dizer só «greve» na mesma altura)
  return out.sort((x, y) => Number(!!y.servico) - Number(!!x.servico));
}

/** Greve que afeta um troço (operador da app e hora de partida), ou undefined */
export function greveDoTroco(feed: string, partidaMs: number, greves: AvisoGreve[], troco?: TrocoParaGreve): GreveTroco | undefined {
  const nomes = OPERADORES[feed];
  if (!nomes || !Number.isFinite(partidaMs)) return undefined;
  const dia = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' }).toISODate();
  let previsto: GreveTroco | undefined;
  for (const g of greves) {
    if (!nomes.includes(norm(g.operador))) continue;
    // sem fim indicado: vale até ao fim do dia em que começa (como na página das greves)
    let fim = Number.isFinite(g.fimMs) ? g.fimMs : DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).endOf('day').toMillis();
    // greve até ao fim do dia: as viagens depois da meia-noite (até às 3h) ainda são do serviço desse dia
    const fimL = DateTime.fromMillis(fim, { zone: 'Europe/Lisbon' });
    if (fimL.hour === 23 && fimL.minute === 59) fim = fimL.plus({ hours: 3 }).toMillis();
    if (partidaMs >= g.inicioMs && partidaMs <= fim) {
      const base: GreveTroco = { titulo: g.titulo, url: g.url, operador: g.operador, ...(g.noticia ? { noticia: true } : {}) };
      if (!funcionaNaGreve(feed, g, troco)) return g.servico ? { ...base, semServico: true } : base;
      // fora das horas anunciadas («de 30 em 30 minutos entre as 6h00 e as 7h00 … e as 00h00») não há viagens
      const h = g.servico?.horas;
      if (h) {
        const l = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' });
        const min = l.hour * 60 + l.minute;
        if (!(min >= h[0] && min < h[1]) && !(min + 1440 >= h[0] && min + 1440 < h[1])) return { ...base, semServico: true };
      }
      return { ...base, reduzido: true, ...(g.servico?.frequencia ? { frequencia: g.servico.frequencia } : {}) };
    }
    const doAviso = { titulo: g.titulo, url: g.url, operador: g.operador, ...(g.noticia ? { noticia: true } : {}) };
    // véspera: depois da hora a que o operador diz que o serviço acaba, já não há viagens
    if (g.vesperaFimMs !== undefined && partidaMs >= g.vesperaFimMs && partidaMs < g.inicioMs) return { ...doAviso, previsto: true, semServico: true };
    if (g.vesperaMs !== undefined && partidaMs >= g.vesperaMs && partidaMs < g.inicioMs) previsto = previsto || { ...doAviso, previsto: true };
    if (dia && g.dias.includes(dia)) previsto = previsto || { titulo: g.titulo, url: g.url, operador: g.operador, previsto: true };
  }
  return previsto;
}

/** Avisos de greve em memória, já lidos (síncrono: partidas e horário do dia) */
export function grevesAgora(): AvisoGreve[] {
  try {
    return grevesDosAvisos(avisosEmMemoria());
  } catch {
    return [];
  }
}

/** Avisos de greve para o planeador: os que já estão em memória (nunca espera pela rede) */
export async function grevesParaPlaneador(): Promise<AvisoGreve[]> {
  try {
    return grevesDosAvisos(avisosEmMemoria());
  } catch {
    return [];
  }
}
