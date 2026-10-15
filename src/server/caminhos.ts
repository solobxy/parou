// O desenho de cada viagem pela estrada (ou pelo carril), tal como vem dos horários oficiais: a base de dados diária guarda-o
// em polilinha codificada (tabela `shapes`, coluna `trips.shape_id`). Aqui lê-se, encaixam-se as paragens nele e corta-se o troço
// que a app desenha. Se a base for anterior aos desenhos (sem a coluna ou a tabela), nada disto falha: a app desenha as
// paragens unidas em linha reta, como antes.

import { getDatabase, registerCacheClearCallback } from './db/gtfsDatabase';
import { codificarPolilinha, cortesDoEncaixe, desenharPorPares, descodificarPolilinha, encaixarNoDesenho } from '../utils/caminho';
import type { Ponto } from '../utils/geoPercurso';

interface Forma { texto: string; pontos: Ponto[] }

const formas = new Map<string, Forma | null>();
const MAX_FORMAS_EM_CACHE = 300;
let desenhosNaBase: boolean | null = null;
let desenhosDeLinhaNaBase: boolean | null = null;
registerCacheClearCallback(() => { formas.clear(); desenhosNaBase = null; desenhosDeLinhaNaBase = null; });

/** A base tem desenhos (coluna `trips.shape_id` e tabela `shapes`)? */
function baseTemDesenhos(): boolean {
  if (desenhosNaBase !== null) return desenhosNaBase;
  try {
    const db = getDatabase();
    const colunas = db.prepare("SELECT name FROM pragma_table_info('trips')").all() as Array<{ name: string }>;
    const tabela = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'shapes'").get();
    desenhosNaBase = colunas.some((c) => c.name === 'shape_id') && !!tabela;
  } catch {
    desenhosNaBase = false;
  }
  return desenhosNaBase;
}

/** Desenho com este identificador (null se não existe ou é pequeno demais para ser um desenho) */
function formaPorId(id: string): { id: string; forma: Forma } | null {
  const db = getDatabase();
  if (!formas.has(id)) {
    if (formas.size >= MAX_FORMAS_EM_CACHE) formas.clear();
    const f = db.prepare('SELECT pontos FROM shapes WHERE shape_id = ?').get(id) as { pontos: string } | undefined;
    const pontos = f?.pontos ? descodificarPolilinha(f.pontos) : [];
    formas.set(id, pontos.length >= 2 ? { texto: f!.pontos, pontos } : null);
  }
  const forma = formas.get(id);
  return forma ? { id, forma } : null;
}

/** Desenho de uma viagem (null se a viagem não tem) */
function formaDaViagem(tripId: string): { id: string; forma: Forma } | null {
  if (!baseTemDesenhos()) return null;
  try {
    const linha = getDatabase().prepare('SELECT shape_id AS id FROM trips WHERE trip_id = ?').get(tripId) as { id: string | null } | undefined;
    return linha?.id ? formaPorId(linha.id) : null;
  } catch {
    return null;
  }
}

/** A base tem desenhos de linhas sem viagens (tabela `route_shapes`, UNIR)? */
function baseTemDesenhosDeLinha(): boolean {
  if (desenhosDeLinhaNaBase !== null) return desenhosDeLinhaNaBase;
  try {
    const db = getDatabase();
    const t = (nome: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
    desenhosDeLinhaNaBase = t('route_shapes') && t('shapes');
  } catch {
    desenhosDeLinhaNaBase = false;
  }
  return desenhosDeLinhaNaBase;
}

/** Desenho de uma linha sem viagens na base (UNIR), por linha e sentido (null se não tem) */
function formaDaLinha(rota: string, sentido: number): { id: string; forma: Forma } | null {
  if (!baseTemDesenhosDeLinha()) return null;
  try {
    const linha = getDatabase().prepare('SELECT shape_id AS id FROM route_shapes WHERE route_id = ? AND direction_id = ?').get(rota, sentido) as { id: string | null } | undefined;
    return linha?.id ? formaPorId(linha.id) : null;
  } catch {
    return null;
  }
}

export interface CaminhoDaViagem {
  /** Desenho inteiro da viagem (polilinha codificada, 6 casas decimais) */
  caminho: string;
  /** Posição de cada paragem no desenho (ver utils/caminho.ts), uma por paragem e pela mesma ordem; null onde o desenho não passa pela paragem */
  cortes: Array<number | null>;
}

type Achado = { id: string; forma: Forma } | null;

function caminhoComPosicoes(achado: Achado, paragens: Ponto[]): CaminhoDaViagem | null {
  if (!achado) return null;
  const e = encaixarNoDesenho(achado.forma.pontos, paragens);
  if (!e) return null;
  return { caminho: e.invertido ? codificarPolilinha(e.desenho) : achado.forma.texto, cortes: cortesDoEncaixe(e.encaixe) };
}

function trocoComPares(achado: Achado, paragens: Ponto[]): string | undefined {
  if (paragens.length < 2 || !achado) return undefined;
  const e = encaixarNoDesenho(achado.forma.pontos, paragens);
  if (!e) return undefined;
  const linha = desenharPorPares(paragens, e.desenho, cortesDoEncaixe(e.encaixe));
  return linha.length >= 2 ? codificarPolilinha(linha) : undefined;
}

/** Desenho da viagem e onde cada uma das suas paragens fica nele (null: sem desenho, ou o desenho não serve para estas paragens) */
export function caminhoDaViagem(tripId: string, paragens: Ponto[]): CaminhoDaViagem | null {
  return caminhoComPosicoes(formaDaViagem(tripId), paragens);
}

/**
 * Linha a desenhar entre a primeira e a última das paragens dadas (as de um troço de uma opção de viagem), já em polilinha:
 * a estrada entre cada par de paragens e, onde o desenho não passa por uma paragem, a linha reta até ela.
 * undefined se a viagem não tem desenho ou ele não serve; nesse caso a app une as paragens em linha reta.
 */
export function caminhoDoTroco(tripId: string, paragens: Ponto[]): string | undefined {
  return trocoComPares(formaDaViagem(tripId), paragens);
}

/** O mesmo para uma linha da UNIR (sem viagens na base): o desenho é da linha e do sentido, feito pelo mapa de estradas */
export function caminhoDaLinhaUnir(rota: string, sentido: number, paragens: Ponto[]): CaminhoDaViagem | null {
  return caminhoComPosicoes(formaDaLinha(rota, sentido), paragens);
}

export function caminhoDoTrocoUnir(rota: string, sentido: number, paragens: Ponto[]): string | undefined {
  return trocoComPares(formaDaLinha(rota, sentido), paragens);
}
