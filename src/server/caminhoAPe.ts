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

  // Encaixar A e B no segmento de via mais perto (o ponto do segmento mais perto, não só o nó)
  const encaixe = (la: number, lo: number) => {
    let melhor: { s: [number, number]; t: number; d: number } | null = null;
    for (const s of segmentos) {
      const ax = (lon[s[0]] - lo) * mLon, ay = (lat[s[0]] - la) * mLat;
      const bx = (lon[s[1]] - lo) * mLon, by = (lat[s[1]] - la) * mLat;
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (!melhor || d < melhor.d) melhor = { s, t, d };
    }
    if (!melhor || melhor.d > ENCAIXE_M) return null;
    const [u, v] = melhor.s;
    const pla = lat[u] + (lat[v] - lat[u]) * melhor.t, plo = lon[u] + (lon[v] - lon[u]) * melhor.t;
    const i = lat.length;
    lat.push(pla); lon.push(plo); viz.push([u, v]);
    viz[u].push(i); viz[v].push(i);
    return i;
  };
  const ia = encaixe(aLat, aLon);
  const ib = encaixe(bLat, bLon);
  if (ia === null || ib === null) return null;

  // A* (distância a direito até ao destino como estimativa)
  const n = lat.length;
  const g = new Float64Array(n).fill(Infinity);
  const veio = new Int32Array(n).fill(-1);
  const fechado = new Uint8Array(n);
  const fila = new Fila();
  g[ia] = 0;
  fila.por(ia, dist(lat[ia], lon[ia], lat[ib], lon[ib]));
  const limite = reta * 3 + 800; // mais do que isto é uma volta que ninguém faz: fica a linha reta
  while (fila.tamanho) {
    const u = fila.tirar();
    if (fechado[u]) continue;
    if (u === ib) break;
    fechado[u] = 1;
    if (g[u] > limite) break;
    for (const v of viz[u]) {
      if (fechado[v]) continue;
      const ng = g[u] + dist(lat[u], lon[u], lat[v], lon[v]);
      if (ng < g[v]) {
        g[v] = ng;
        veio[v] = u;
        fila.por(v, ng + dist(lat[v], lon[v], lat[ib], lon[ib]));
      }
    }
  }
  if (!Number.isFinite(g[ib]) || g[ib] > limite) return null;

  const caminho: Array<{ lat: number; lon: number }> = [];
  for (let v = ib; v !== -1; v = veio[v]) caminho.push({ lat: lat[v], lon: lon[v] });
  caminho.reverse();
  const pontos = [{ lat: aLat, lon: aLon }, ...caminho, { lat: bLat, lon: bLon }]
    // pontos repetidos ou a menos de 1 m do anterior não acrescentam nada
    .filter((p, i, arr) => i === 0 || dist(p.lat, p.lon, arr[i - 1].lat, arr[i - 1].lon) >= 1);
  let metros = 0;
  for (let i = 1; i < pontos.length; i++) metros += dist(pontos[i - 1].lat, pontos[i - 1].lon, pontos[i].lat, pontos[i].lon);
  return { caminho: codificarPolilinha(pontos), metros: Math.round(metros), pontos };
}
