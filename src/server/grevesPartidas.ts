// =====================================================================================
// PAROU.PT — Greves nas partidas de uma paragem e no horário do dia
//
// O horário oficial (GTFS) não muda numa greve: é o operador que avisa o que continua a funcionar («só na Linha Amarela e
// entre a Senhora da Hora e o Dragão, de 15 em 15 minutos»), ou que o serviço acaba mais cedo na véspera. Cada partida
// leva o estado que esse aviso lhe dá, com as mesmas regras dos trajetos (grevesPlaneador.ts):
//  - sem-servico: o operador disse o que funciona e esta viagem fica de fora (ou é depois do fim do serviço na véspera);
//  - incerta:     há greve mas o operador não disse o que funciona (pode não se realizar), ou véspera perto do fim;
//  - reduzido:    fica na parte que funciona, mas com as frequências da greve (o horário normal não vale).
// Partidas com tempo real não se marcam: o veículo está mesmo a circular.
// =====================================================================================
import { DateTime } from 'luxon';
import type { AvisoGreve } from './grevesPlaneador';
import { greveDoTroco } from './grevesPlaneador';
import { viagemNomes, estacoesEntre, mesmaEstacao, chaveEstacao } from './grevesEstacoes';
import type { GreveTroco } from '../types/perto';

export type EstadoGreve = 'sem-servico' | 'incerta' | 'reduzido' | 'garantido' | 'desvio';

export interface GreveNaPartida {
  estado: EstadoGreve;
  operador: string;
}

/** Resumo de um aviso de greve para mostrar por cima de uma lista de partidas */
export interface ResumoGreve {
  titulo: string;
  url: string;
  operador: string;
  /** Vem de uma notícia, não do site do operador */
  noticia?: boolean;
  /** Dia (AAAA-MM-DD) em que começa a greve */
  dia: string;
  /** É a véspera (o serviço acaba mais cedo), não o dia da greve */
  vespera?: boolean;
  /** Hora a que o serviço acaba na véspera ("23:00") */
  fimVespera?: string;
  /** O que funciona, com os nomes das estações como estão na base ("Linha Amarela", "entre Senhora da Hora e Estádio do Dragão") */
  funciona?: string[];
  frequencia?: string;
  /** CP: o aviso tem a lista dos comboios dos serviços mínimos (marcados nas partidas); os outros podem não se realizar */
  minimos?: boolean;
  /** Plenário de trabalhadores: constrangimentos entre estas horas («13:15», «18:15») */
  plenario?: { das: string; as: string };
  /** Aviso do operador para algumas linhas (não é greve): supressão ou desvio */
  aviso?: 'suprimido' | 'desvio';
}

const COR_LINHA: Record<string, string> = { amarela: 'Amarela', azul: 'Azul', vermelha: 'Vermelha', verde: 'Verde', violeta: 'Violeta', laranja: 'Laranja', rosa: 'Rosa', rubi: 'Rubi' };

export function estadoDaGreve(g: GreveTroco | undefined): GreveNaPartida | undefined {
  if (!g) return undefined;
  return { estado: g.semServico ? 'sem-servico' : g.aviso === 'desvio' ? 'desvio' : g.garantido ? 'garantido' : g.reduzido ? 'reduzido' : 'incerta', operador: g.operador };
}

/** Uma partida para marcar: operador, hora (ms), viagem, paragem de onde parte e código da linha */
export interface PartidaParaGreve {
  feed: string;
  partidaMs: number;
  trip?: string;
  /** Nome da paragem de onde parte */
  paragem?: string;
  linha?: string;
}

/** A greve de uma partida numa paragem: dentro do troço anunciado = a paragem fica entre as duas pontas */
export function greveDaPartida(db: any, p: PartidaParaGreve, greves: AvisoGreve[]): GreveTroco | undefined {
  if (!greves.length) return undefined;
  return greveDoTroco(p.feed, p.partidaMs, greves, {
    linha: p.linha,
    viagem: p.trip,
    dentroDe: (a, b) => {
      if (!db || !p.trip) return { dentro: false, passa: false };
      const nomes = viagemNomes(db, p.trip);
      const passa = nomes.some((x) => mesmaEstacao(x.nome, a)) && nomes.some((x) => mesmaEstacao(x.nome, b));
      const estacoes = p.paragem ? estacoesEntre(db, p.feed, a, b) : null;
      if (!estacoes || !p.paragem) return { dentro: false, passa };
      // a paragem e a seguinte ficam no troço (na ponta do troço, no sentido de sair dele, já não há viagem)
      const aqui = chaveEstacao(p.paragem);
      const i = nomes.findIndex((x) => chaveEstacao(x.nome) === aqui);
      const seguinte = i >= 0 ? nomes[i + 1] : undefined;
      if (!estacoes.has(aqui)) return { dentro: false, passa };
      if (i < 0) return { dentro: true, passa };
      return { dentro: !!seguinte && estacoes.has(chaveEstacao(seguinte.nome)), passa };
    },
  });
}

/** Avisos que tocam este operador num intervalo (para não fazer contas quando não há greve nenhuma) */
export function grevesDoIntervalo(greves: AvisoGreve[], iniMs: number, fimMs: number): AvisoGreve[] {
  return greves.filter((g) => {
    const comeca = Math.min(g.inicioMs, g.vesperaMs ?? Infinity);
    const acaba = Number.isFinite(g.fimMs) ? g.fimMs : DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).endOf('day').toMillis();
    const ultimoDia = g.dias.length ? DateTime.fromISO(g.dias.slice().sort().pop()!, { zone: 'Europe/Lisbon' }).endOf('day').toMillis() : 0;
    return comeca <= fimMs && Math.max(acaba, ultimoDia) >= iniMs;
  });
}

const nomeBonito = (db: any, feed: string, procurado: string): string => {
  try {
    const r = (db.prepare('SELECT stop_name AS n FROM stops WHERE feed_id = ?').all(feed) as Array<{ n: string }>)
      .map((x) => String(x.n || '')).filter((n) => mesmaEstacao(n, procurado))
      .sort((a, b) => a.length - b.length)[0];
    if (r) return r;
  } catch { /* sem base */ }
  return procurado.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
};

/** Resumo de um aviso para a lista (com os nomes das estações como aparecem na app) */
export function resumoDaGreve(db: any, feed: string, g: AvisoGreve, vespera: boolean): ResumoGreve {
  const funciona: string[] = [];
  const s = g.servico;
  if (s) {
    const vistos = new Set<string>();
    for (const [a, b] of s.trocos) {
      const na = nomeBonito(db, feed, a), nb = nomeBonito(db, feed, b);
      const k = [na, nb].sort().join('|');
      if (vistos.has(k)) continue;
      vistos.add(k);
      funciona.push(`${na} – ${nb}`);
    }
    // linha inteira só se nenhum troço anunciado for dessa linha (aí já está acima)
    if (!funciona.length) for (const c of s.linhas) funciona.push(`Linha ${COR_LINHA[c] || c}`);
  }
  const fimV = g.vesperaFimMs !== undefined ? DateTime.fromMillis(g.vesperaFimMs, { zone: 'Europe/Lisbon' }).toFormat('HH:mm') : undefined;
  return {
    titulo: g.titulo, url: g.url, operador: g.operador, ...(g.noticia ? { noticia: true } : {}),
    dia: DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).toISODate() || '',
    ...(vespera ? { vespera: true, ...(fimV ? { fimVespera: fimV } : {}) } : {}),
    ...(!vespera && funciona.length ? { funciona } : {}),
    ...(!vespera && s?.frequencia ? { frequencia: s.frequencia } : {}),
    ...(!vespera && g.comboiosMinimos ? { minimos: true } : {}),
    ...(g.efeito ? { aviso: g.efeito } : {}),
    ...(g.plenario ? { plenario: { das: DateTime.fromMillis(g.inicioMs, { zone: 'Europe/Lisbon' }).toFormat('HH:mm'), as: DateTime.fromMillis(g.fimMs, { zone: 'Europe/Lisbon' }).toFormat('HH:mm') } } : {}),
  };
}

/** O aviso que deu o estado a uma partida (pelo título e operador), para o resumo */
export function avisoDe(greves: AvisoGreve[], g: GreveTroco): AvisoGreve | undefined {
  return greves.find((x) => x.titulo === g.titulo && x.operador === g.operador && x.url === g.url);
}

/** Junta o resumo do aviso que deu o estado a uma partida (um por aviso; a véspera à parte do dia da greve) */
export function juntarResumo(resumos: Map<string, ResumoGreve>, db: any, feed: string, greves: AvisoGreve[], g: GreveTroco, ms: number): void {
  const aviso = avisoDe(greves, g);
  if (!aviso) return;
  const vespera = !!g.previsto && aviso.vesperaMs !== undefined && ms < aviso.inicioMs;
  const k = `${aviso.operador}|${aviso.titulo}|${vespera ? 'v' : 'g'}`;
  if (!resumos.has(k)) resumos.set(k, resumoDaGreve(db, feed, aviso, vespera));
}

/**
 * Marca as partidas de uma paragem (resposta de /api/transit/stop/:id): cada uma leva `greve` ({estado, operador}) e a
 * resposta leva `greves` (resumo de cada aviso que marcou alguma). Muda os objetos (a resposta pode estar em cache:
 * apaga marcas antigas quando a greve já não se aplica).
 */
export function marcarGrevesNasPartidas(db: any, deps: any[], greves: AvisoGreve[], nomeParagem: (stopId: string) => string | undefined): ResumoGreve[] {
  const resumos = new Map<string, ResumoGreve>();
  if (!Array.isArray(deps) || !deps.length) return [];
  const epocas = deps.map((d) => Number(d?.dep_epoch_secs) * 1000).filter(Number.isFinite);
  const relevantes = epocas.length ? grevesDoIntervalo(greves, Math.min(...epocas), Math.max(...epocas)) : [];
  for (const d of deps) {
    if (!d) continue;
    delete d.greve;
    if (!relevantes.length || d.state === 'TEMPO REAL' || d.is_realtime) continue;
    const ms = Number(d.dep_epoch_secs) * 1000;
    if (!Number.isFinite(ms) || !d.feed_id) continue;
    const g = greveDaPartida(db, { feed: String(d.feed_id), partidaMs: ms, trip: d.trip_id ? String(d.trip_id) : undefined, paragem: d.stop_id ? nomeParagem(String(d.stop_id)) : undefined, linha: d.route_short_name ? String(d.route_short_name) : undefined }, relevantes);
    const e = estadoDaGreve(g);
    if (!e || !g) continue;
    d.greve = e;
    juntarResumo(resumos, db, String(d.feed_id), relevantes, g, ms);
  }
  return [...resumos.values()];
}
