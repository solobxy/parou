// =====================================================================================
// PAROU.PT — Greves nos trajetos
//
// Uma greve confirmada pelo operador (avisos oficiais: CP, Metro de Lisboa, TML, Carris Metropolitana…, ou o comunicado do
// operador publicado pela imprensa quando não há aviso no site dele, ver grevesNoticias.ts) aparece no troço
// do trajeto que usa esse operador, se a viagem sai dentro do período da greve, ou num dia em que o operador avisa que
// ainda há perturbações. Sem aviso do operador (no site dele ou comunicado nas notícias), não se mostra nada.
// =====================================================================================
import { numeroDoComboio } from './cpServicosMinimos';
import { DateTime } from 'luxon';
import { avisosEmMemoria } from './centralAlertsEngine';
import { getDatabase } from './db/gtfsDatabase';
import type { GreveTroco } from '../types/perto';

/** Nomes com que cada operador aparece nos avisos oficiais e nas notícias (comparados sem acentos nem maiúsculas). Todos
 *  os operadores da app, do continente e das ilhas; um operador novo sem entrada aqui usa o nome com que está na base
 *  (ver nomesDoOperador). */
const OPERADORES: Record<string, string[]> = {
  cp: ['cp', 'cp - comboios de portugal', 'comboios de portugal'],
  metro_lisboa: ['metro de lisboa', 'metropolitano de lisboa'],
  carris: ['carris', 'carris (lisboa)'],
  cm: ['carris metropolitana'],
  cmh: ['carris metropolitana'],
  carris_metropolitana: ['carris metropolitana'],
  fertagus: ['fertagus'],
  transtejo_soflusa: ['transtejo soflusa', 'transtejo', 'soflusa'],
  mts: ['metro sul do tejo', 'metro transportes do sul', 'mts'],
  tcb_barreiro: ['tcb barreiro', 'tcb'],
  stcp: ['stcp', 'stcp (porto)'],
  metro_porto: ['metro do porto'],
  unir: ['unir'],
  unirh: ['unir'],
  tub_braga: ['tub', 'tub braga', 'transportes urbanos de braga'],
  guimabus: ['guimabus', 'guimabus (guimaraes)'],
  tuba_barcelos: ['tuba barcelos', 'tuba'],
  mobiave: ['mobiave', 'mobiave (famalicao)'],
  mobiave_famalicao: ['mobiave', 'mobiave famalicao'],
  smtuc: ['smtuc', 'smtuc (coimbra)'],
  smtuc_coimbra: ['smtuc', 'smtuc coimbra'],
  metro_mondego: ['metro mondego', 'metro mondego (coimbra)'],
  vamus: ['vamus algarve', 'vamus'],
  vamus_algarve: ['vamus algarve', 'vamus'],
  proximo_faro: ['proximo', 'proximo (faro)'],
  giro: ['giro', 'giro albufeira'],
  giro_albufeira: ['giro', 'giro albufeira'],
  sobe_desce_tavira: ['sobe e desce', 'sobe e desce (tavira)'],
  sobe_e_desce_tavira: ['sobe e desce', 'sobe e desce tavira'],
  horarios_funchal: ['horarios do funchal'],
  siga_rodoeste: ['rodoeste', 'siga rodoeste'],
  cam_madeira: ['cam', 'companhia de autocarros da madeira', 'cam - companhia de autocarros da madeira'],
  barraqueiro_oeste: ['tut torres vedras', 'barraqueiro oeste', 'barraqueiro oeste (tut torres vedras)'],
  tut_torres_vedras: ['tut torres vedras', 'tut - transportes urbanos de torres vedras'],
  'mdb-1272': ['mobicascais', 'cascais proxima'],
  mobicascais: ['mobicascais', 'cascais proxima'],
  mobilis_leiria: ['mobilis', 'mobilis (leiria)'],
  aveirobus: ['aveirobus'],
};

/** Nomes de um operador: os da lista acima ou, para um operador que ainda não está nela, o nome com que está na base
 *  (com e sem o que vem entre parênteses) */
const nomesDaBase = new Map<string, string[]>();
export function nomesDoOperador(feed: string): string[] {
  const fixos = OPERADORES[feed];
  if (fixos) return fixos;
  let l = nomesDaBase.get(feed);
  if (!l) {
    l = [];
    try {
      const n = String((getDatabase().prepare('SELECT operator_name AS n FROM feeds WHERE id = ?').get(feed) as any)?.n || '');
      if (n) {
        const base = norm(n);
        l = [...new Set([base, norm(n.replace(/\(.*?\)/g, ' ')), ...n.split(/\s+[-–—]\s+/).map(norm)].filter((x) => x.length >= 3))];
      }
    } catch { /* sem base */ }
    // só fica guardado quando a base respondeu (no arranque ainda pode não estar pronta)
    if (l.length) nomesDaBase.set(feed, l);
  }
  return l;
}

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
  servico?: { linhas: string[]; trocos: Array<[string, string]>; frequencia?: string; horas?: [number, number]; janelas?: Array<[number, number]> };
  /** CP: comboios dos serviços mínimos por dia (AAAA-MM-DD → números); os outros podem não se realizar */
  comboiosMinimos?: Record<string, string[]>;
  /** Plenário de trabalhadores: entre inicioMs e fimMs preveem-se constrangimentos (não é greve) */
  plenario?: boolean;
}

/** Troço de um trajeto, para saber se fica na parte que funciona durante a greve */
export interface TrocoParaGreve {
  /** código da linha (Metro do Porto: "D") ou nome ("Amarela") */
  linha?: string;
  /** O troço em relação ao troço anunciado [a, b] (nomes sem acentos): `dentro` = as duas estações do troço ficam entre a e b
   *  (em qualquer linha que lá passe); `passa` = a viagem deste troço passa por a e por b (o troço anunciado é desta linha) */
  dentroDe?: (a: string, b: string) => { dentro: boolean; passa: boolean };
  /** Viagem (trip_id): na CP dá o número do comboio, para os serviços mínimos */
  viagem?: string;
}

/** Cor de cada linha pelo código (Metro do Porto: letras; Metro de Lisboa: Az, Am, Vd, Vm) */
const COR_METRO_PORTO: Record<string, string> = { A: 'azul', B: 'vermelha', C: 'verde', D: 'amarela', E: 'violeta', F: 'laranja', G: 'rosa', H: 'rubi' };
const COR_METRO_LISBOA: Record<string, string> = { AZ: 'azul', AM: 'amarela', VD: 'verde', VM: 'vermelha' };

function funcionaNaGreve(feed: string, g: AvisoGreve, troco?: TrocoParaGreve): boolean {
  const s = g.servico;
  if (!s || !troco) return false;
  const linha = norm(String(troco.linha || ''));
  const codigo = String(troco.linha || '').toUpperCase();
  const cor = feed === 'metro_porto' ? COR_METRO_PORTO[codigo] : feed === 'metro_lisboa' ? (COR_METRO_LISBOA[codigo] || linha) : linha;
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
    if (!a || (a.tipo !== 'greve' && !a.plenario) || (a.status !== 'Ativo' && a.status !== 'Futuro')) continue;
    const inicioMs = Date.parse(String(a.start_datetime || ''));
    const fimMs = a.end_datetime ? Date.parse(String(a.end_datetime)) : NaN;
    if (!Number.isFinite(inicioMs)) continue;
    const dias = Array.isArray(a.dias_perturbacao) ? a.dias_perturbacao.map(String) : [];
    const ultimoDia = dias.length ? DateTime.fromISO(dias.slice().sort().pop()!, { zone: 'Europe/Lisbon' }).endOf('day').toMillis() : NaN;
    const acaba = Math.max(Number.isFinite(fimMs) ? fimMs : inicioMs + 30 * 3600_000, Number.isFinite(ultimoDia) ? ultimoDia : 0);
    if (acaba < agoraMs) continue;
    out.push({ operador: String(a.operador || ''), titulo: String(a.título || '').replace(/\s+/g, ' ').trim(), url: String(a.source_url || ''), inicioMs, fimMs, dias, ...(/^Not[ií]cia/.test(String(a.source || '')) ? { noticia: true } : {}), ...(a.servico_na_greve ? { servico: a.servico_na_greve } : {}), ...(a.vespera_desde && Number.isFinite(Date.parse(a.vespera_desde)) ? { vesperaMs: Date.parse(a.vespera_desde) } : {}), ...(a.vespera_fim && Number.isFinite(Date.parse(a.vespera_fim)) ? { vesperaFimMs: Date.parse(a.vespera_fim) } : {}), ...(a.plenario && a.tipo !== 'greve' ? { plenario: true } : {}), ...(a.comboios_minimos && typeof a.comboios_minimos === 'object' && Object.keys(a.comboios_minimos).length ? { comboiosMinimos: a.comboios_minimos } : {}) });
  }
  // avisos que dizem o que funciona primeiro (o «Estado das Linhas» pode dizer só «greve» na mesma altura)
  return out.sort((x, y) => Number(!!y.servico) - Number(!!x.servico));
}

/** CP: true = o comboio está nos serviços mínimos desse dia; false = há lista desse dia e não está; undefined = sem lista */
function minimoDaCp(g: AvisoGreve, partidaMs: number, viagem?: string): boolean | undefined {
  const lista = g.comboiosMinimos;
  const n = numeroDoComboio(viagem);
  if (!lista || !n) return undefined;
  const l = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' });
  const dias = [l.toISODate()!, ...(l.hour < 3 ? [l.minus({ days: 1 }).toISODate()!] : [])].filter((d) => Array.isArray(lista[d]) && lista[d].length);
  if (!dias.length) return undefined;
  return dias.some((d) => lista[d].includes(n));
}

/** Greve que afeta um troço (operador da app e hora de partida), ou undefined */
export function greveDoTroco(feed: string, partidaMs: number, greves: AvisoGreve[], troco?: TrocoParaGreve): GreveTroco | undefined {
  const nomes = nomesDoOperador(feed);
  if (!nomes.length || !Number.isFinite(partidaMs)) return undefined;
  const dia = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' }).toISODate();
  let previsto: GreveTroco | undefined;
  for (const g of greves) {
    if (!nomes.includes(norm(g.operador))) continue;
    // plenário: só nas horas anunciadas, como perturbação prevista (pode não se realizar)
    if (g.plenario) {
      if (partidaMs >= g.inicioMs && partidaMs < g.fimMs) previsto = previsto || { titulo: g.titulo, url: g.url, operador: g.operador, previsto: true, plenario: true };
      continue;
    }
    // sem fim indicado: vale até ao fim do dia em que começa (como na página das greves)
    let fim = Number.isFinite(g.fimMs) ? g.fimMs : DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).endOf('day').toMillis();
    // greve até ao fim do dia: as viagens depois da meia-noite (até às 3h) ainda são do serviço desse dia
    const fimL = DateTime.fromMillis(fim, { zone: 'Europe/Lisbon' });
    if (fimL.hour === 23 && fimL.minute === 59) fim = fimL.plus({ hours: 3 }).toMillis();
    if (partidaMs >= g.inicioMs && partidaMs <= fim) {
      const base: GreveTroco = { titulo: g.titulo, url: g.url, operador: g.operador, ...(g.noticia ? { noticia: true } : {}) };
      // CP: os comboios dos serviços mínimos realizam-se (dia da partida, ou o anterior para os que saem depois da meia-noite)
      const minimo = minimoDaCp(g, partidaMs, troco?.viagem);
      if (minimo === true) return { ...base, reduzido: true, garantido: true };
      if (minimo === false) return base;
      if (!funcionaNaGreve(feed, g, troco)) return g.servico ? { ...base, semServico: true } : base;
      // fora das horas anunciadas («de 30 em 30 minutos entre as 6h00 e as 7h00 … e as 00h00») não há viagens
      const h = g.servico?.horas;
      const janelas = g.servico?.janelas;
      if (h || janelas?.length) {
        const l = DateTime.fromMillis(partidaMs, { zone: 'Europe/Lisbon' });
        const min = l.hour * 60 + l.minute;
        const dentro = (j: [number, number]) => (min >= j[0] && min < j[1]) || (min + 1440 >= j[0] && min + 1440 < j[1]);
        if (h ? !dentro(h) : !janelas!.some(dentro)) return { ...base, semServico: true };
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
