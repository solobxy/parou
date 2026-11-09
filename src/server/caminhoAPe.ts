// Caminho a pé pelas ruas (passeios, escadas, praças) entre dois pontos, com a rede do OpenStreetMap que o gerador dos
// dados guarda em mosaicos (tabela ape; ver caminhos_a_pe.py no repositório dos dados). Serve para desenhar no mapa os
// troços a pé de uma viagem pelas ruas, em vez de em linha reta por cima dos prédios.
// Sem a tabela (base antiga) ou sem caminho razoável, devolve null e a app fica com a linha reta.
import { getDatabase } from './db/gtfsDatabase';
import { podarMapa } from './cacheLimitada';
import { codificarPolilinha } from '../utils/caminho';

const PASSO = 100; // mosaicos por grau
const LAT0 = 30;
const LON0 = -32;
const LARGURA = 4000;
const MAX_METROS = 3000;   // troços a pé maiores não se calculam (o planeador não os dá)
const ENCAIXE_M = 250;     // a que distância de uma via pode estar o ponto de partida ou de chegada
const ENCAIXE_FOLGA_M = 40; // encaixes possíveis: até 40 m mais longe do que o segmento mais perto
const MAX_ENCAIXES = 12;
const CUSTO_ENCAIXE = 1.3; // cada metro fora da rede conta como 1,3 m
const MAX_MOSAICOS = 400;  // mosaicos já lidos em memória (cada um tem uns kB)

type Peca = Int32Array; // [lat, lon, lat, lon, …] em micrograus

let baseVista: unknown = null;
let temTabela = false;
const mosaicos = new Map<number, Peca[]>();
/** Redes já montadas (por conjunto de mosaicos): o mesmo sítio pede-se várias vezes seguidas (opções, hora seguinte) */
const grafos = new Map<string, Grafo>();
const MAX_GRAFOS = 10;

function base() {
  const db = getDatabase();
  if (db !== baseVista) {
    baseVista = db;
    mosaicos.clear();
    grafos.clear();
    try {
      temTabela = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ape'").get();
    } catch {
      temTabela = false;
    }
  }
  return db;
}

export const haCaminhosAPe = () => { base(); return temTabela; };

function lerMosaico(t: number): Peca[] {
  const ja = mosaicos.get(t);
  if (ja) {
    mosaicos.delete(t); // o mais usado fica no fim (os primeiros são os que saem)
    mosaicos.set(t, ja);
    return ja;
  }
  const db = base();
  let pecas: Peca[] = [];
  try {
    const row = db.prepare('SELECT d FROM ape WHERE t = ?').get(t) as { d?: Uint8Array } | undefined;
    if (row?.d) {
      const my = Math.floor(t / LARGURA);
      const mx = t - my * LARGURA;
      pecas = descodificar(row.d, Math.round((LAT0 + my / PASSO) * 1e6), Math.round((LON0 + mx / PASSO) * 1e6));
    }
  } catch { /* sem a tabela: nada */ }
  mosaicos.set(t, pecas);
  podarMapa(mosaicos, MAX_MOSAICOS);
  return pecas;
}

function descodificar(d: Uint8Array, baseLat: number, baseLon: number): Peca[] {
  const pecas: Peca[] = [];
  let i = 0;
  const varint = () => {
    let r = 0, s = 0, b = 0;
    do { b = d[i++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80 && i < d.length);
    return r;
  };
  const zig = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);
  while (i < d.length) {
    const n = varint();
    const p = new Int32Array(n * 2);
    let lat = baseLat, lon = baseLon;
    for (let k = 0; k < n; k++) {
      lat += zig(varint());
      lon += zig(varint());
      p[2 * k] = lat;
      p[2 * k + 1] = lon;
    }
    pecas.push(p);
  }
  return pecas;
}

/** Fila de prioridade (heap binário) de nós por custo estimado */
class Fila {
  private n: number[] = [];
  private c: number[] = [];
  get tamanho() { return this.n.length; }
  por(no: number, custo: number) {
    const n = this.n, c = this.c;
    n.push(no); c.push(custo);
    let i = n.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= c[i]) break;
      [n[p], n[i]] = [n[i], n[p]]; [c[p], c[i]] = [c[i], c[p]];
      i = p;
    }
  }
  tirar(): number {
    const n = this.n, c = this.c;
    const topo = n[0];
    const ultN = n.pop() as number, ultC = c.pop() as number;
    if (n.length) {
      n[0] = ultN; c[0] = ultC;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1, d = e + 1;
        let m = i;
        if (e < n.length && c[e] < c[m]) m = e;
        if (d < n.length && c[d] < c[m]) m = d;
        if (m === i) break;
        [n[m], n[i]] = [n[i], n[m]]; [c[m], c[i]] = [c[i], c[m]];
        i = m;
      }
    }
    return topo;
  }
}

export interface CaminhoAPe { caminho: string; metros: number; pontos: Array<{ lat: number; lon: number }> }

/** Rede a pé de uma zona, montada a partir dos mosaicos: nós (coordenadas), vizinhos e segmentos, com uma grelha para
 *  achar depressa os segmentos perto de um ponto. Não muda depois de montada (fica na cache). */
interface Grafo {
  lat: number[]; lon: number[]; viz: number[][];
  segU: number[]; segV: number[];
  mLat: number; mLon: number;
  grade: Map<number, number[]>;
}
const CEL = 0.0005; // célula da grelha dos segmentos (~55 m)
const celula = (cy: number, cx: number) => cy * 1_000_000 + cx;

function montarGrafo(sul: number, norte: number, oeste: number, este: number, mLat: number, mLon: number): Grafo | null {
  const y0 = Math.floor((sul - LAT0) * PASSO), y1 = Math.floor((norte - LAT0) * PASSO);
  const x0 = Math.floor((oeste - LON0) * PASSO), x1 = Math.floor((este - LON0) * PASSO);
  if ((y1 - y0 + 1) * (x1 - x0 + 1) > 60) return null;
  const chave = `${y0}:${y1}:${x0}:${x1}`;
  const ja = grafos.get(chave);
  if (ja) { grafos.delete(chave); grafos.set(chave, ja); return ja; }
  // Nós pelas coordenadas: as vias que se cruzam partilham o ponto
  const idx = new Map<number, number>();
  const G: Grafo = { lat: [], lon: [], viz: [], segU: [], segV: [], mLat, mLon, grade: new Map() };
  const no = (la: number, lo: number) => {
    const k = (la - 30_000_000) * 30_000_000 + (lo + 32_000_000);
    let i = idx.get(k);
    if (i === undefined) { i = G.lat.length; idx.set(k, i); G.lat.push(la / 1e6); G.lon.push(lo / 1e6); G.viz.push([]); }
    return i;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const p of lerMosaico(y * LARGURA + x)) {
        let ant = no(p[0], p[1]);
        for (let k = 1; k < p.length / 2; k++) {
          const cur = no(p[2 * k], p[2 * k + 1]);
          if (cur !== ant) {
            G.viz[ant].push(cur); G.viz[cur].push(ant);
            const s = G.segU.length;
            G.segU.push(ant); G.segV.push(cur);
            // o segmento entra em todas as células da sua caixa (são curtos: quase sempre 1 ou 2)
            const cy0 = Math.floor(Math.min(G.lat[ant], G.lat[cur]) / CEL), cy1 = Math.floor(Math.max(G.lat[ant], G.lat[cur]) / CEL);
            const cx0 = Math.floor(Math.min(G.lon[ant], G.lon[cur]) / CEL), cx1 = Math.floor(Math.max(G.lon[ant], G.lon[cur]) / CEL);
            if ((cy1 - cy0 + 1) * (cx1 - cx0 + 1) <= 64) {
              for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
                const c = celula(cy, cx);
                const l = G.grade.get(c);
                if (l) l.push(s); else G.grade.set(c, [s]);
              }
            }
          }
          ant = cur;
        }
      }
    }
  }
  if (!G.segU.length) return null;
  grafos.set(chave, G);
  podarMapa(grafos, MAX_GRAFOS);
  return G;
}

/**
 * Uma pesquisa sobre a rede (que fica intacta na cache): os pontos de encaixe e os nós de chegada são acrescentados à
 * parte. Nós 0…n0-1 são os da rede; daí para a frente, os desta pesquisa.
 */
class Pesquisa {
  readonly n0: number;
  private latV: number[] = []; private lonV: number[] = []; private vizV: number[][] = [];
  /** vizinhos acrescentados a nós da rede (os encaixes ligam-se às pontas do segmento) */
  private extra = new Map<number, number[]>();
  private noSegmento = new Map<number, number[]>();
  /** custo e metros a sério de entrar num nó de chegada vindo de um encaixe (chave u * 4e6 + fim) */
  readonly custoFim = new Map<number, number>();
  readonly realFim = new Map<number, number>();
  constructor(readonly G: Grafo) { this.n0 = G.lat.length; }
  get n() { return this.n0 + this.latV.length; }
  lat(i: number) { return i < this.n0 ? this.G.lat[i] : this.latV[i - this.n0]; }
  lon(i: number) { return i < this.n0 ? this.G.lon[i] : this.lonV[i - this.n0]; }
  /** vizinhos de u: os da rede e os acrescentados */
  vizinhos(u: number): number[] {
    if (u >= this.n0) return this.vizV[u - this.n0];
    const e = this.extra.get(u);
    return e ? this.G.viz[u].concat(e) : this.G.viz[u];
  }
  private novo(la: number, lo: number) { this.latV.push(la); this.lonV.push(lo); this.vizV.push([]); return this.n - 1; }
  private ligar(a: number, b: number) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (x >= this.n0) this.vizV[x - this.n0].push(y);
      else { const e = this.extra.get(x); if (e) e.push(y); else this.extra.set(x, [y]); }
    }
  }
  /** Ponto de encaixe novo no meio de um segmento, ligado às duas pontas e aos outros encaixes do mesmo segmento */
  pontoNoSegmento(c: { k: number; t: number }): number {
    const u = this.G.segU[c.k], v = this.G.segV[c.k];
    const i = this.novo(this.G.lat[u] + (this.G.lat[v] - this.G.lat[u]) * c.t, this.G.lon[u] + (this.G.lon[v] - this.G.lon[u]) * c.t);
    this.ligar(i, u); this.ligar(i, v);
    const outros = this.noSegmento.get(c.k);
    if (outros) { for (const o of outros) this.ligar(i, o); outros.push(i); } else this.noSegmento.set(c.k, [i]);
    return i;
  }
  /** Nó de chegada a um ponto (fora da rede), a partir de cada encaixe, com o custo do encaixe */
  noDeChegada(la: number, lo: number, cs: Array<{ k: number; t: number; d: number }>): number {
    const fim = this.novo(la, lo);
    for (const c of cs) {
      const i = this.pontoNoSegmento(c);
      this.vizV[i - this.n0].push(fim); // só se entra (do nó de chegada não se sai)
      this.custoFim.set(i * 4_000_000 + fim, c.d * CUSTO_ENCAIXE);
      this.realFim.set(i * 4_000_000 + fim, c.d);
    }
    return fim;
  }
}

/**
 * Onde um ponto entra na rede: não só no segmento mais perto (pode ser um pedaço solto, como a plataforma de uma paragem
 * ou um corredor de parque de estacionamento sem ligação), mas em todos os segmentos até 40 m mais longe do que esse.
 * Cada encaixe custa a distância até à via (×1,3, para preferir chegar à rede logo ali).
 */
function encaixes(G: Grafo, la: number, lo: number): Array<{ k: number; t: number; d: number }> {
  // Primeiro só à volta (quase todos os pontos estão a menos de 40 m de uma via); se não chegar, até ENCAIXE_M
  for (const raio of [90, ENCAIXE_M]) {
    const raioY = Math.ceil(raio / G.mLat / CEL), raioX = Math.ceil(raio / G.mLon / CEL);
    const cy = Math.floor(la / CEL), cx = Math.floor(lo / CEL);
    const vistos = new Set<number>();
    const todos: Array<{ k: number; t: number; d: number }> = [];
    let dmin = Infinity;
    for (let dy = -raioY; dy <= raioY; dy++) {
      for (let dx = -raioX; dx <= raioX; dx++) {
        const l = G.grade.get(celula(cy + dy, cx + dx));
        if (!l) continue;
        for (const k of l) {
          if (vistos.has(k)) continue;
          vistos.add(k);
          const u = G.segU[k], v = G.segV[k];
          const ax = (G.lon[u] - lo) * G.mLon, ay = (G.lat[u] - la) * G.mLat;
          const bx = (G.lon[v] - lo) * G.mLon, by = (G.lat[v] - la) * G.mLat;
          const ex = bx - ax, ey = by - ay;
          const l2 = ex * ex + ey * ey;
          const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * ex + ay * ey) / l2)) : 0;
          const d = Math.hypot(ax + t * ex, ay + t * ey);
          if (d > raio) continue;
          todos.push({ k, t, d });
          if (d < dmin) dmin = d;
        }
      }
    }
    // com o raio pequeno, só serve se todos os encaixes possíveis (até 40 m mais longe do que o mais perto) lá cabem
    if (raio < ENCAIXE_M && !(dmin + ENCAIXE_FOLGA_M <= raio)) continue;
    const ate = dmin + ENCAIXE_FOLGA_M;
    return todos.filter((c) => c.d <= ate).sort((a, b) => a.d - b.d).slice(0, MAX_ENCAIXES);
  }
  return [];
}

const metrosPorGrau = (lat: number) => ({ mLat: 111_195, mLon: 111_195 * Math.cos(lat * Math.PI / 180) });

/**
 * Caminho a pé de A para B pelas ruas. null quando não há rede (base sem a tabela, zona sem vias perto) ou quando o único
 * caminho encontrado é uma volta absurda (rede incompleta): aí fica a linha reta, como antes.
 */
export function caminhoAPe(aLat: number, aLon: number, bLat: number, bLon: number): CaminhoAPe | null {
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  base();
  if (!temTabela) return null;
  const { mLat, mLon } = metrosPorGrau((aLat + bLat) / 2);
  const dist = (la1: number, lo1: number, la2: number, lo2: number) => Math.hypot((la1 - la2) * mLat, (lo1 - lo2) * mLon);
  const reta = dist(aLat, aLon, bLat, bLon);
  if (reta < 25 || reta > MAX_METROS) return null;

  // Mosaicos à volta dos dois pontos, com margem para dar a volta a um quarteirão ou a um rio
  const margem = Math.max(300, reta * 0.35);
  const G = montarGrafo(Math.min(aLat, bLat) - margem / mLat, Math.max(aLat, bLat) + margem / mLat,
    Math.min(aLon, bLon) - margem / mLon, Math.max(aLon, bLon) + margem / mLon, mLat, mLon);
  if (!G) return null;
  const ca = encaixes(G, aLat, aLon), cb = encaixes(G, bLat, bLon);
  if (!ca.length || !cb.length) return null;
  const R = new Pesquisa(G);
  const va = ca.map((c) => R.pontoNoSegmento(c));
  const fim = R.noDeChegada(bLat, bLon, cb);

  // A* (distância a direito até B como estimativa: nunca maior do que o custo real)
  const n = R.n;
  const g = new Float64Array(n).fill(Infinity);
  const veio = new Int32Array(n).fill(-1);
  const fechado = new Uint8Array(n);
  const fila = new Fila();
  va.forEach((i, j) => {
    const c0 = ca[j].d * CUSTO_ENCAIXE;
    if (c0 < g[i]) { g[i] = c0; fila.por(i, c0 + dist(R.lat(i), R.lon(i), bLat, bLon)); }
  });
  const limite = reta * 3 + 800; // mais do que isto é uma volta que ninguém faz: fica a linha reta
  while (fila.tamanho) {
    const u = fila.tirar();
    if (fechado[u]) continue;
    if (u === fim) break;
    fechado[u] = 1;
    if (g[u] > limite) break;
    const lu = R.lat(u), ou = R.lon(u);
    for (const v of R.vizinhos(u)) {
      if (fechado[v]) continue;
      const ng = g[u] + (v === fim ? (R.custoFim.get(u * 4_000_000 + v) as number) : dist(lu, ou, R.lat(v), R.lon(v)));
      if (ng < g[v]) {
        g[v] = ng;
        veio[v] = u;
        fila.por(v, ng + dist(R.lat(v), R.lon(v), bLat, bLon));
      }
    }
  }
  if (!Number.isFinite(g[fim]) || g[fim] > limite) return null;

  const caminho: Array<{ lat: number; lon: number }> = [];
  for (let v = veio[fim]; v !== -1; v = veio[v]) caminho.push({ lat: R.lat(v), lon: R.lon(v) });
  caminho.reverse();
  const pontos = [{ lat: aLat, lon: aLon }, ...caminho, { lat: bLat, lon: bLon }]
    // pontos repetidos ou a menos de 1 m do anterior não acrescentam nada
    .filter((p, i, arr) => i === 0 || dist(p.lat, p.lon, arr[i - 1].lat, arr[i - 1].lon) >= 1);
  let metros = 0;
  for (let i = 1; i < pontos.length; i++) metros += dist(pontos[i - 1].lat, pontos[i - 1].lon, pontos[i].lat, pontos[i].lon);
  return { caminho: codificarPolilinha(pontos), metros: Math.round(metros), pontos };
}

/**
 * Metros a pé pelas ruas de um ponto até vários (as paragens à volta de onde se parte ou aonde se chega), numa só
 * pesquisa. Para cada alvo: os metros; Infinity quando os dois estão na rede mas o caminho é uma volta enorme (outro lado
 * de um rio, de uma linha de comboio ou de uma autoestrada); null quando não se sabe (sem rede na base ou longe das vias).
 */
export function distanciasAPe(lat0: number, lon0: number, alvos: Array<{ lat: number; lon: number }>): Array<number | null> {
  const out: Array<number | null> = alvos.map(() => null);
  if (!alvos.length || !Number.isFinite(lat0) || !Number.isFinite(lon0)) return out;
  base();
  if (!temTabela) return out;
  const { mLat, mLon } = metrosPorGrau(lat0);
  const dist = (la1: number, lo1: number, la2: number, lo2: number) => Math.hypot((la1 - la2) * mLat, (lo1 - lo2) * mLon);
  const retas = alvos.map((a) => (Number.isFinite(a.lat) && Number.isFinite(a.lon) ? dist(lat0, lon0, a.lat, a.lon) : Infinity));
  const usar = alvos.map((_, i) => retas[i] <= MAX_METROS);
  if (!usar.some(Boolean)) return out;
  // A rede pede-se sempre igual à volta do ponto (o mais longe dos alvos, arredondado a 500 m): a mesma zona volta a servir
  const maxReta = Math.max(...retas.filter((r, i) => usar[i]));
  const raio = Math.ceil((maxReta + 300) / 500) * 500;
  const G = montarGrafo(lat0 - raio / mLat, lat0 + raio / mLat, lon0 - raio / mLon, lon0 + raio / mLon, mLat, mLon);
  if (!G) return out;
  const co = encaixes(G, lat0, lon0);
  if (!co.length) return out;
  const R = new Pesquisa(G);
  const vo = co.map((c) => R.pontoNoSegmento(c));
  const fins = alvos.map((a, i) => {
    if (!usar[i]) return -1;
    const cs = encaixes(G, a.lat, a.lon);
    return cs.length ? R.noDeChegada(a.lat, a.lon, cs) : -1;
  });
  const n = R.n;
  const eAlvo = new Uint8Array(n);
  let porAchar = 0;
  fins.forEach((f) => { if (f >= 0) { eAlvo[f] = 1; porAchar++; } });
  if (!porAchar) return out;

  // Dijkstra a partir do ponto, até achar todos os alvos (ou passar do limite da maior volta aceitável)
  const g = new Float64Array(n).fill(Infinity);
  const real = new Float64Array(n);
  const fechado = new Uint8Array(n);
  const fila = new Fila();
  vo.forEach((i, j) => {
    const c0 = co[j].d * CUSTO_ENCAIXE;
    if (c0 < g[i]) { g[i] = c0; real[i] = co[j].d; fila.por(i, c0); }
  });
  const limite = maxReta * 3 + 800;
  while (fila.tamanho && porAchar > 0) {
    const u = fila.tirar();
    if (fechado[u]) continue;
    fechado[u] = 1;
    if (g[u] > limite) break;
    if (eAlvo[u]) { porAchar--; continue; } // o nó de chegada não leva a mais lado nenhum
    const lu = R.lat(u), ou = R.lon(u);
    for (const v of R.vizinhos(u)) {
      if (fechado[v]) continue;
      let passo: number, passoReal: number;
      if (eAlvo[v]) {
        const chave = u * 4_000_000 + v;
        passo = R.custoFim.get(chave) as number;
        passoReal = R.realFim.get(chave) as number;
      } else {
        passo = passoReal = dist(lu, ou, R.lat(v), R.lon(v));
      }
      const ng = g[u] + passo;
      if (ng < g[v]) {
        g[v] = ng;
        real[v] = real[u] + passoReal;
        fila.por(v, ng);
      }
    }
  }
  fins.forEach((f, i) => {
    if (f < 0) return;
    const limiteAlvo = retas[i] * 3 + 800;
    out[i] = fechado[f] && g[f] <= limiteAlvo ? Math.max(retas[i], real[f]) : Infinity;
  });
  return out;
}
