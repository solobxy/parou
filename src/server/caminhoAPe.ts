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

function base() {
  const db = getDatabase();
  if (db !== baseVista) {
    baseVista = db;
    mosaicos.clear();
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

/**
 * Caminho a pé de A para B pelas ruas. null quando não há rede (base sem a tabela, zona sem vias perto) ou quando o único
 * caminho encontrado é uma volta absurda (rede incompleta): aí fica a linha reta, como antes.
 */
export function caminhoAPe(aLat: number, aLon: number, bLat: number, bLon: number): CaminhoAPe | null {
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  base();
  if (!temTabela) return null;
  const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const mLat = 111_195, mLon = 111_195 * cosLat; // metros por grau
  const dist = (la1: number, lo1: number, la2: number, lo2: number) => Math.hypot((la1 - la2) * mLat, (lo1 - lo2) * mLon);
  const reta = dist(aLat, aLon, bLat, bLon);
  if (reta < 25 || reta > MAX_METROS) return null;

  // Mosaicos à volta dos dois pontos, com margem para dar a volta a um quarteirão ou a um rio
  const margem = Math.max(300, reta * 0.35);
  const sul = Math.min(aLat, bLat) - margem / mLat, norte = Math.max(aLat, bLat) + margem / mLat;
  const oeste = Math.min(aLon, bLon) - margem / mLon, este = Math.max(aLon, bLon) + margem / mLon;
  const y0 = Math.floor((sul - LAT0) * PASSO), y1 = Math.floor((norte - LAT0) * PASSO);
  const x0 = Math.floor((oeste - LON0) * PASSO), x1 = Math.floor((este - LON0) * PASSO);
  if ((y1 - y0 + 1) * (x1 - x0 + 1) > 60) return null;

  // Grafo: nós pelas coordenadas (as vias que se cruzam partilham o ponto), arestas com o comprimento em metros
  const idx = new Map<number, number>();
  const lat: number[] = [], lon: number[] = [];
  const viz: number[][] = [];
  const no = (la: number, lo: number) => {
    const k = (la - 30_000_000) * 30_000_000 + (lo + 32_000_000);
    let i = idx.get(k);
    if (i === undefined) { i = lat.length; idx.set(k, i); lat.push(la / 1e6); lon.push(lo / 1e6); viz.push([]); }
    return i;
  };
  const segmentos: Array<[number, number]> = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const p of lerMosaico(y * LARGURA + x)) {
        let ant = no(p[0], p[1]);
        for (let k = 1; k < p.length / 2; k++) {
          const cur = no(p[2 * k], p[2 * k + 1]);
          if (cur !== ant) { viz[ant].push(cur); viz[cur].push(ant); segmentos.push([ant, cur]); }
          ant = cur;
        }
      }
    }
  }
  if (segmentos.length === 0) return null;

  // Encaixar A e B na rede: não só no segmento mais perto (pode ser um pedaço solto, como a plataforma de uma paragem
  // ou um corredor de parque de estacionamento sem ligação), mas em todos os segmentos até 40 m mais longe do que esse.
  // Cada encaixe custa a distância até à via (×1,3, para preferir chegar à rede logo ali) e o A* escolhe o melhor.
  const candidatos = (la: number, lo: number) => {
    const ds = new Float64Array(segmentos.length);
    const ts = new Float64Array(segmentos.length);
    let dmin = Infinity;
    for (let k = 0; k < segmentos.length; k++) {
      const s = segmentos[k];
      const ax = (lon[s[0]] - lo) * mLon, ay = (lat[s[0]] - la) * mLat;
      const bx = (lon[s[1]] - lo) * mLon, by = (lat[s[1]] - la) * mLat;
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      ds[k] = Math.hypot(ax + t * dx, ay + t * dy);
      ts[k] = t;
      if (ds[k] < dmin) dmin = ds[k];
    }
    if (dmin > ENCAIXE_M) return [];
    const ate = Math.min(ENCAIXE_M, dmin + ENCAIXE_FOLGA_M);
    const perto: number[] = [];
    for (let k = 0; k < segmentos.length; k++) if (ds[k] <= ate) perto.push(k);
    perto.sort((x, y) => ds[x] - ds[y]);
    return perto.slice(0, MAX_ENCAIXES).map((k) => ({ k, t: ts[k], d: ds[k] }));
  };
  const virtual = (c: { k: number; t: number }) => {
    const [u, v] = segmentos[c.k];
    const i = lat.length;
    lat.push(lat[u] + (lat[v] - lat[u]) * c.t); lon.push(lon[u] + (lon[v] - lon[u]) * c.t);
    viz.push([u, v]); viz[u].push(i); viz[v].push(i);
    return i;
  };
  const ca = candidatos(aLat, aLon), cb = candidatos(bLat, bLon);
  if (!ca.length || !cb.length) return null;
  const va = ca.map(virtual), vb = cb.map(virtual);
  // A e B no mesmo segmento: ligação direta (sem ir à ponta do segmento e voltar)
  ca.forEach((x, i) => cb.forEach((y, j) => { if (x.k === y.k) { viz[va[i]].push(vb[j]); viz[vb[j]].push(va[i]); } }));
  // Nó final (o próprio B): chega-se lá a partir de cada encaixe de B, pelo custo do encaixe
  const fim = lat.length;
  lat.push(bLat); lon.push(bLon); viz.push([]);
  const custoFim = new Map<number, number>();
  vb.forEach((i, j) => { viz[i].push(fim); custoFim.set(i, cb[j].d * CUSTO_ENCAIXE); });

  // A* (distância a direito até B como estimativa: nunca maior do que o custo real)
  const n = lat.length;
  const g = new Float64Array(n).fill(Infinity);
  const veio = new Int32Array(n).fill(-1);
  const fechado = new Uint8Array(n);
  const fila = new Fila();
  va.forEach((i, j) => {
    const c0 = ca[j].d * CUSTO_ENCAIXE;
    if (c0 < g[i]) { g[i] = c0; fila.por(i, c0 + dist(lat[i], lon[i], bLat, bLon)); }
  });
  const limite = reta * 3 + 800; // mais do que isto é uma volta que ninguém faz: fica a linha reta
  while (fila.tamanho) {
    const u = fila.tirar();
    if (fechado[u]) continue;
    if (u === fim) break;
    fechado[u] = 1;
    if (g[u] > limite) break;
    for (const v of viz[u]) {
      if (fechado[v]) continue;
      const ng = g[u] + (v === fim ? (custoFim.get(u) as number) : dist(lat[u], lon[u], lat[v], lon[v]));
      if (ng < g[v]) {
        g[v] = ng;
        veio[v] = u;
        fila.por(v, ng + dist(lat[v], lon[v], bLat, bLon));
      }
    }
  }
  if (!Number.isFinite(g[fim]) || g[fim] > limite) return null;

  const caminho: Array<{ lat: number; lon: number }> = [];
  for (let v = veio[fim]; v !== -1; v = veio[v]) caminho.push({ lat: lat[v], lon: lon[v] });
  caminho.reverse();
  const pontos = [{ lat: aLat, lon: aLon }, ...caminho, { lat: bLat, lon: bLon }]
    // pontos repetidos ou a menos de 1 m do anterior não acrescentam nada
    .filter((p, i, arr) => i === 0 || dist(p.lat, p.lon, arr[i - 1].lat, arr[i - 1].lon) >= 1);
  let metros = 0;
  for (let i = 1; i < pontos.length; i++) metros += dist(pontos[i - 1].lat, pontos[i - 1].lon, pontos[i].lat, pontos[i].lon);
  return { caminho: codificarPolilinha(pontos), metros: Math.round(metros), pontos };
}
