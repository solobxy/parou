// =====================================================================================
// PAROU.PT — Título Andante de cada trajeto (Área Metropolitana do Porto)
//
// Só com dados oficiais, que o construtor da base (parou-dados/andante.py) tira todos os dias de andante.pt:
//   - andante_dist: anéis entre zonas, do mapa oficial do Andante (a própria zona conta 1);
//   - andante_zona: zona de cada paragem (Metro e STCP pelo GTFS do operador; UNIR e CP pelo polígono oficial,
//     só longe das fronteiras);
//   - app_state 'andante': preços das viagens ocasionais, duração máxima de cada título e cartão Azul, com a data em
//     que entraram em vigor e a data em que foram lidos.
//
// Regra oficial (andante.pt/titulos-ocasionais): o título vale para os anéis de zonas à volta da zona da 1.ª validação
// (Z2 = 2 anéis, Z3 = 3…), com um mínimo de Z2, durante a duração máxima do título. Aqui: o título é o maior número de
// anéis entre a zona onde se entra pela 1.ª vez e qualquer paragem por onde a viagem passa; a última entrada tem de
// acontecer dentro da duração do título.
//
// Na dúvida, não se mostra nada: um operador sem Andante, uma paragem sem zona certa (perto de uma fronteira), preços
// lidos há demasiado tempo ou ainda não em vigor, ou uma viagem que precisaria de mais do que um título.
// =====================================================================================
import { getDatabase } from './db/gtfsDatabase';
import type { TarifaViagem } from '../types/perto';

export interface PrecosAndante {
  simples: Record<string, number>;
  h24: Record<string, number>;
  duracao_min: Record<string, number>;
  cartao_azul?: number | null;
  em_vigor_desde?: string | null;
  /** ISO: quando foram lidos do site oficial */
  obtidos?: string;
}

export interface TabelaAndante {
  anel: (origem: string, destino: string) => number | undefined;
  precos?: PrecosAndante;
  fontePrecos: string;
}

export interface PernaTarifa {
  /** O operador (e, na CP, o tipo de comboio) aceita os títulos ocasionais Andante */
  elegivel: boolean;
  /** Hora de entrada (segundos), para a duração máxima do título */
  parte: number;
  /** Zona de cada paragem por onde passa, da entrada à saída (undefined = sem zona certa) */
  zonas: Array<string | undefined>;
}

/** Preços lidos há mais do que isto deixam de se mostrar (o site pode ter mudado e a leitura falhado) */
export const VALIDADE_PRECOS_DIAS = 10;

/** Data de hoje em Lisboa, AAAA-MM-DD */
function hojeLisboa(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/**
 * Os preços servem para esta viagem? Lidos do site oficial há pouco tempo (contado a partir de agora, de verdade) e já em
 * vigor no dia da viagem (preços anunciados para o ano seguinte ainda não contam)
 */
export function precosValidos(p: PrecosAndante | undefined, diaDaViagem: Date, agoraReal: number = Date.now()): boolean {
  if (!p || !p.simples || !p.duracao_min || !p.obtidos) return false;
  const lidos = Date.parse(p.obtidos);
  if (!Number.isFinite(lidos) || agoraReal - lidos > VALIDADE_PRECOS_DIAS * 86400_000 || lidos - agoraReal > 86400_000) return false;
  if (p.em_vigor_desde && p.em_vigor_desde > hojeLisboa(diaDaViagem)) return false;
  return true;
}

/** Título Andante para uma viagem (as pernas de transporte, por ordem), ou undefined se não há certeza */
export function calcularTituloAndante(pernas: PernaTarifa[], tabela: TabelaAndante, diaDaViagem: Date = new Date(), agoraReal: number = Date.now()): TarifaViagem | undefined {
  if (!pernas.length) return undefined;
  if (pernas.some((p) => !p.elegivel || p.zonas.length === 0 || p.zonas.some((z) => !z))) return undefined;
  const p = tabela.precos;
  if (!precosValidos(p, diaDaViagem, agoraReal)) return undefined;
  const origem = pernas[0].zonas[0] as string;
  let zonas = 2;
  for (const perna of pernas) {
    for (const z of perna.zonas) {
      const a = tabela.anel(origem, z as string);
      if (a === undefined || !Number.isInteger(a) || a < 1) return undefined;
      zonas = Math.max(zonas, a);
    }
  }
  const k = String(zonas);
  const preco = p!.simples[k], preco24h = p!.h24?.[k], duracao = p!.duracao_min[k];
  if (!(preco > 0) || !(duracao > 0)) return undefined; // título acima do que a tabela oficial tem
  const decorrido = (pernas[pernas.length - 1].parte - pernas[0].parte) / 60;
  if (!(decorrido >= 0) || decorrido > duracao) return undefined; // um título não chega: não se adivinha quantos
  const t: TarifaViagem = { sistema: 'andante', zonas, preco, duracaoMin: duracao, fonte: tabela.fontePrecos };
  if (preco24h > 0) t.preco24h = preco24h;
  if (p!.cartao_azul && p!.cartao_azul > 0) t.cartao = p!.cartao_azul;
  if (p!.em_vigor_desde) t.emVigorDesde = p!.em_vigor_desde;
  return t;
}

// ------------------------------------------------------------------------------------- dados da base

/** Na CP, os títulos ocasionais Andante valem nos comboios urbanos e regionais (andante.pt/perguntas-frequentes) */
export function comboioCpComAndante(nomeCurto: string | null | undefined): boolean {
  const n = String(nomeCurto || '').trim();
  return n === 'R' || n === 'U' || /^Linha d[eoa]s? /i.test(n);
}

const FEEDS_ANDANTE = new Set(['metro_porto', 'stcp', 'unir', 'unirh']);

interface Carregado {
  chave: string;
  t: number;
  tabela?: TabelaAndante;
  zona: Map<string, string>;
}
let cache: Carregado | null = null;

function carregar(): Carregado | null {
  const db = getDatabase();
  let chave = '';
  try { chave = String((db.prepare("SELECT value FROM app_state WHERE key = 'dataset_built_at'").get() as any)?.value || ''); } catch { /* base sem estado */ }
  if (cache && cache.chave === chave && Date.now() - cache.t < 6 * 3600_000) return cache;
  const zona = new Map<string, string>();
  let tabela: TabelaAndante | undefined;
  try {
    const estado = JSON.parse(String((db.prepare("SELECT value FROM app_state WHERE key = 'andante'").get() as any)?.value || 'null'));
    if (estado && estado.precos) {
      const dist = new Map<string, number>();
      for (const r of db.prepare('SELECT o, d, n FROM andante_dist').all() as Array<{ o: string; d: string; n: number }>) dist.set(`${r.o}|${r.d}`, r.n);
      for (const r of db.prepare('SELECT stop_id, zona FROM andante_zona').all() as Array<{ stop_id: string; zona: string }>) zona.set(r.stop_id, r.zona);
      if (dist.size && zona.size) {
        tabela = { anel: (o, d) => dist.get(`${o}|${d}`), precos: estado.precos, fontePrecos: String(estado.fonte_precos || 'https://andante.pt/comprar/andante-azul/') };
      }
    }
  } catch { /* base sem as tabelas do Andante (anterior a esta versão): sem títulos */ }
  cache = { chave, t: Date.now(), tabela, zona };
  return cache;
}

/** Perna como o planeador a guarda */
export interface PernaPlano { trip: string; route: string; feed: string; de: string; para: string; parte: number; sa?: number; sb?: number }

const paraApp = (id: string) => (id.startsWith('unirh:') ? `unir:${id.slice(6)}` : id);

/** Título Andante para as pernas de transporte de uma opção do planeador (undefined fora do Andante ou sem certeza) */
export function tarifaDaViagem(pernas: PernaPlano[], diaDaViagem: Date = new Date()): TarifaViagem | undefined {
  try {
    if (!pernas.length || !pernas.every((p) => FEEDS_ANDANTE.has(p.feed) || p.feed === 'cp')) return undefined;
    const c = carregar();
    if (!c?.tabela) return undefined;
    const db = getDatabase();
    const qParagens = db.prepare('SELECT stop_id FROM stop_times WHERE trip_id = ? AND stop_sequence BETWEEN ? AND ? ORDER BY stop_sequence');
    const qRota = db.prepare('SELECT route_short_name AS s FROM routes WHERE route_id = ?');
    const pt: PernaTarifa[] = pernas.map((p) => {
      let elegivel = FEEDS_ANDANTE.has(p.feed);
      if (p.feed === 'cp') elegivel = comboioCpComAndante((qRota.get(p.route) as any)?.s);
      // Sem a sequência da viagem não se sabe por onde passa: fica sem zonas (e sem título)
      const ids = p.sa != null && p.sb != null ? (qParagens.all(p.trip, p.sa, p.sb) as Array<{ stop_id: string }>).map((r) => paraApp(r.stop_id)) : [];
      return { elegivel, parte: p.parte, zonas: ids.map((id) => c.zona.get(id)) };
    });
    return calcularTituloAndante(pt, c.tabela, diaDaViagem);
  } catch {
    return undefined;
  }
}
