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
registerCacheClearCallback(() => { formas.clear(); desenhosNaBase = null; });

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

/** Desenho de uma viagem (null se a viagem não tem) */
function formaDaViagem(tripId: string): { id: string; forma: Forma } | null {
  if (!baseTemDesenhos()) return null;
  try {
    const db = getDatabase();
    const linha = db.prepare('SELECT shape_id AS id FROM trips WHERE trip_id = ?').get(tripId) as { id: string | null } | undefined;
    const id = linha?.id;
    if (!id) return null;
    if (!formas.has(id)) {
      if (formas.size >= MAX_FORMAS_EM_CACHE) formas.clear();
      const f = db.prepare('SELECT pontos FROM shapes WHERE shape_id = ?').get(id) as { pontos: string } | undefined;
      const pontos = f?.pontos ? descodificarPolilinha(f.pontos) : [];
      formas.set(id, pontos.length >= 2 ? { texto: f!.pontos, pontos } : null);
    }
    const forma = formas.get(id);
    return forma ? { id, forma } : null;
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

/** Desenho da viagem e onde cada uma das suas paragens fica nele (null: sem desenho, ou o desenho não serve para estas paragens) */
export function caminhoDaViagem(tripId: string, paragens: Ponto[]): CaminhoDaViagem | null {
  const achado = formaDaViagem(tripId);
  if (!achado) return null;
  const e = encaixarNoDesenho(achado.forma.pontos, paragens);
  if (!e) return null;
  return { caminho: e.invertido ? codificarPolilinha(e.desenho) : achado.forma.texto, cortes: cortesDoEncaixe(e.encaixe) };
}

/**
 * Linha a desenhar entre a primeira e a última das paragens dadas (as de um troço de uma opção de viagem), já em polilinha:
 * a estrada entre cada par de paragens e, onde o desenho não passa por uma paragem, a linha reta até ela.
 * undefined se a viagem não tem desenho ou ele não serve; nesse caso a app une as paragens em linha reta.
 */
export function caminhoDoTroco(tripId: string, paragens: Ponto[]): string | undefined {
  if (paragens.length < 2) return undefined;
  const achado = formaDaViagem(tripId);
  if (!achado) return undefined;
  const e = encaixarNoDesenho(achado.forma.pontos, paragens);
  if (!e) return undefined;
  const linha = desenharPorPares(paragens, e.desenho, cortesDoEncaixe(e.encaixe));
  return linha.length >= 2 ? codificarPolilinha(linha) : undefined;
}
