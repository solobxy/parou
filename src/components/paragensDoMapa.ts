/**
 * Paragens por onde se arrasta o mapa do "Perto".
 *
 * O mapa é dividido em células fixas (≈1 km × 1 km). Cada célula é pedida uma só vez ao servidor
 * (resposta leve: nome, sítio e modo) e fica guardada aqui, por isso arrastar para um sítio onde já
 * se esteve não pede nada. Os pedidos são poucos de cada vez, não se repetem enquanto decorrem e
 * as zonas que ficaram longe saem da memória.
 */

export const CELULA_LAT = 0.01;
export const CELULA_LON = 0.012;

export type ModoLeve = 'Autocarro' | 'Metro' | 'Comboio' | 'Barco';

export interface ParagemLeve {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  modo: ModoLeve;
  op: string;
  /** Códigos UNIR da AMP (as partidas são pedidas pelo telemóvel) */
  unir?: string[];
}

export interface Limites {
  sul: number;
  oeste: number;
  norte: number;
  este: number;
}

interface Celula {
  t: number;
  paragens: ParagemLeve[];
}

const VALIDADE_MS = 20 * 60_000;
const MAX_CELULAS_MEMORIA = 150;
const MAX_PEDIDOS_JUNTOS = 3;
// Depois de uma falha (ou de o servidor ainda estar a carregar) não insiste logo
const ESPERA_APOS_FALHA_MS = 15_000;
// Máximo de células pedidas de uma vez: um ecrã grande com muito afastamento não pode disparar dezenas
const MAX_CELULAS_POR_VISTA = 30;

const memoria = new Map<string, Celula>();
const emCurso = new Map<string, Promise<void>>();
const falhas = new Map<string, number>();
const fila: Array<{ chave: string; i: number; j: number; resolver: () => void }> = [];
let aCorrer = 0;

const ouvintes = new Set<() => void>();

/** Avisa quando chega uma célula nova (para desenhar as paragens à medida que vão chegando) */
export function aoChegarCelula(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

const chaveDe = (i: number, j: number) => `${i},${j}`;

function celulaValida(i: number, j: number): boolean {
  return Number.isInteger(i) && Number.isInteger(j) && i >= 2990 && i <= 4300 && j >= -2800 && j <= -400;
}

/** Células que cobrem os limites, as mais perto do centro primeiro */
export function celulasDosLimites(l: Limites): Array<{ i: number; j: number }> {
  const i0 = Math.floor(l.sul / CELULA_LAT);
  const i1 = Math.floor(l.norte / CELULA_LAT);
  const j0 = Math.floor(l.oeste / CELULA_LON);
  const j1 = Math.floor(l.este / CELULA_LON);
  if (!Number.isFinite(i0 + i1 + j0 + j1)) return [];
  // Vista absurda (ex.: zoom muito afastado): não gera milhares de células
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return [];
  const ci = (l.sul + l.norte) / 2 / CELULA_LAT - 0.5;
  const cj = (l.oeste + l.este) / 2 / CELULA_LON - 0.5;
  const lista: Array<{ i: number; j: number; d: number }> = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (!celulaValida(i, j)) continue;
      lista.push({ i, j, d: (i - ci) ** 2 + (j - cj) ** 2 });
    }
  }
  lista.sort((a, b) => a.d - b.d);
  return lista.slice(0, MAX_CELULAS_POR_VISTA).map(({ i, j }) => ({ i, j }));
}

function guardar(chave: string, paragens: ParagemLeve[]) {
  memoria.delete(chave);
  memoria.set(chave, { t: Date.now(), paragens });
  while (memoria.size > MAX_CELULAS_MEMORIA) {
    const maisAntiga = memoria.keys().next().value;
    if (maisAntiga === undefined) break;
    memoria.delete(maisAntiga);
  }
  ouvintes.forEach((fn) => { try { fn(); } catch {} });
}

function limparFila() {
  while (aCorrer < MAX_PEDIDOS_JUNTOS && fila.length > 0) {
    const item = fila.shift()!;
    aCorrer++;
    pedir(item.chave, item.i, item.j)
      .catch(() => {})
      .finally(() => {
        aCorrer--;
        item.resolver();
        limparFila();
      });
  }
}

async function pedir(chave: string, i: number, j: number): Promise<void> {
  try {
    const r = await fetch(`/api/transit/stops-cell?i=${i}&j=${j}`, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(String(r.status));
    const dados = await r.json();
    if (dados?.isLoading || dados?.status === 'loading') {
      // O servidor ainda está a carregar os horários: tenta mais tarde
      falhas.set(chave, Date.now());
      return;
    }
    const brutas: any[] = Array.isArray(dados?.paragens) ? dados.paragens : [];
    const paragens: ParagemLeve[] = [];
    for (const p of brutas) {
      const lat = Number(p?.lat);
      const lon = Number(p?.lon);
      if (!p?.id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      paragens.push({
        id: String(p.id),
        nome: String(p.nome || ''),
        lat,
        lon,
        modo: p.modo === 'Metro' || p.modo === 'Comboio' || p.modo === 'Barco' ? p.modo : 'Autocarro',
        op: String(p.op || ''),
        ...(Array.isArray(p.unir) && p.unir.length ? { unir: p.unir.map(String) } : {}),
      });
    }
    guardar(chave, paragens);
    falhas.delete(chave);
  } catch {
    falhas.set(chave, Date.now());
  } finally {
    emCurso.delete(chave);
  }
}

/**
 * Garante que as células estão em memória (pede só as que faltam ou envelheceram), as mais perto
 * do centro primeiro. O que ainda estava à espera na fila e já não interessa à vista atual
 * (arrastou-se para outro lado) deixa de ser pedido. Devolve quando as pedidas acabaram.
 */
export function carregarCelulas(celulas: Array<{ i: number; j: number }>): Promise<boolean> {
  const ordem = new Map<string, number>();
  celulas.forEach((c, n) => ordem.set(chaveDe(c.i, c.j), n));

  // Larga da fila o que já não interessa
  for (let k = fila.length - 1; k >= 0; k--) {
    if (ordem.has(fila[k].chave)) continue;
    const [item] = fila.splice(k, 1);
    emCurso.delete(item.chave);
    item.resolver();
  }

  let houvePedidos = false;
  const pendentes: Promise<void>[] = [];
  for (const { i, j } of celulas) {
    const chave = chaveDe(i, j);
    const guardada = memoria.get(chave);
    if (guardada && Date.now() - guardada.t <= VALIDADE_MS) {
      // Recente = passa para o fim (as mais antigas é que saem da memória)
      memoria.delete(chave);
      memoria.set(chave, guardada);
      continue;
    }
    const ultimaFalha = falhas.get(chave);
    if (ultimaFalha && Date.now() - ultimaFalha < ESPERA_APOS_FALHA_MS) continue;
    let p = emCurso.get(chave);
    if (!p) {
      houvePedidos = true;
      p = new Promise<void>((resolver) => {
        fila.push({ chave, i, j, resolver });
      });
      emCurso.set(chave, p);
    }
    pendentes.push(p);
  }
  if (houvePedidos) fila.sort((a, b) => (ordem.get(a.chave) ?? 1e9) - (ordem.get(b.chave) ?? 1e9));
  limparFila();
  if (pendentes.length === 0) return Promise.resolve(false);
  return Promise.all(pendentes).then(() => true);
}

/** Paragens já em memória dentro dos limites (de qualquer célula que os cubra) */
export function paragensNosLimites(l: Limites): ParagemLeve[] {
  const i0 = Math.floor(l.sul / CELULA_LAT);
  const i1 = Math.floor(l.norte / CELULA_LAT);
  const j0 = Math.floor(l.oeste / CELULA_LON);
  const j1 = Math.floor(l.este / CELULA_LON);
  if (!Number.isFinite(i0 + i1 + j0 + j1) || (i1 - i0 + 1) * (j1 - j0 + 1) > 400) return [];
  const vistas = new Set<string>();
  const saida: ParagemLeve[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const c = memoria.get(chaveDe(i, j)); // mesmo velha serve até chegar a nova
      if (!c) continue;
      for (const p of c.paragens) {
        if (p.lat < l.sul || p.lat > l.norte || p.lon < l.oeste || p.lon > l.este) continue;
        // Uma estação que passa de uma célula para a vizinha pode vir nas duas
        if (vistas.has(p.id)) continue;
        vistas.add(p.id);
        saida.push(p);
      }
    }
  }
  return saida;
}
