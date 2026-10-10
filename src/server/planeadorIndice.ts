// =====================================================================================
// PAROU.PT — Índice em memória dos horários para o planeador (RAPTOR)
//
// Carrega todas as viagens da base (GTFS) para vetores compactos, agrupadas em "padrões"
// (mesma linha, mesma sequência de paragens). Com isso o planeador encontra, em dezenas de
// milissegundos, o percurso mais cedo a chegar ao destino com 0, 1, 2 ou 3 transbordos
// (algoritmo RAPTOR: uma ronda por viagem de transporte, com transbordos a pé entre paragens
// próximas). A base muda quando os dados diários são trocados: o índice é reconstruído em
// segundo plano, aos poucos, sem bloquear o servidor.
// =====================================================================================
import { getDatabase } from './db/gtfsDatabase';

const MARGEM = 120; // segundos entre sair de uma viagem e entrar noutra
const RAIO_VIZ = 300; // metros a pé entre paragens num transbordo
const M_POR_MIN = 75;
const DESVIO_RUAS = 1.3;
const INF = 0x3fffffff;

export interface Padrao {
  feed: string; // feed original (para os serviços ativos)
  feedSaida: string; // a "cmh" passa a Carris Metropolitana
  route: string;
  routeIdx: number;
  stops: Int32Array;
  nT: number;
  dep: Int32Array;
  arr: Int32Array;
  seq: Int32Array;
  pick: Uint8Array; // 1 = não se pode entrar aqui
  tripId: string[];
  service: string[];
  headsign: string[];
}

export interface Indice {
  db: unknown;
  construidoEm: number;
  stopId: string[];
  stopIdx: Map<string, number>;
  lat: Float64Array;
  lon: Float64Array;
  padroes: Padrao[];
  psStart: Int32Array;
  psPat: Int32Array;
  psPos: Int32Array;
  grelha: Map<number, number[]>;
  viz: Map<number, { ids: Int32Array; min: Uint8Array }>;
  nRotas: number;
}

export interface Corrida { pat: number; t: number; b: number; a: number }
export interface Jornada { k: number; rides: Corrida[]; destStop: number; chegada: number }

function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, p = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * p) / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const minAPe = (m: number) => Math.max(1, Math.round((m * DESVIO_RUAS) / M_POR_MIN));
const celulaY = (lat: number) => Math.floor(lat / 0.003);
const celulaX = (lon: number) => Math.floor(lon / 0.004);
const chaveCelula = (cy: number, cx: number) => (cy + 50000) * 200000 + (cx + 50000);

// ------------------------------------------------------------------------------------
// Construção
// ------------------------------------------------------------------------------------
let atual: Indice | null = null;
let aConstruir = false;
let ultimaFalha = 0;
export let estadoIndice = 'por construir';

export function indicePronto(): Indice | null {
  let db: unknown;
  try { db = getDatabase(); } catch { return atual; }
  if (atual && atual.db === db) return atual;
  if (!aConstruir && Date.now() - ultimaFalha > 60 * 1000) {
    aConstruir = true;
    construir(db)
      .then((ix) => { atual = ix; estadoIndice = `pronto (${ix.padroes.length} padrões, ${ix.stopId.length} paragens, ${ix.construidoEm} ms)`; console.log(`[Planeador] índice ${estadoIndice}`); })
      .catch((e) => { ultimaFalha = Date.now(); estadoIndice = `falhou: ${e?.message || e}`; console.warn('[Planeador] índice:', e?.message || e); })
      .finally(() => { aConstruir = false; });
  }
  return atual; // enquanto a nova versão se constrói, usa-se a anterior
}

const tick = () => new Promise<void>((r) => setImmediate(r));

async function construir(dbAny: any): Promise<Indice> {
  const t0 = Date.now();
  estadoIndice = 'a construir…';
  let ultimoTick = Date.now();
  const cede = async () => { if (Date.now() - ultimoTick > 25) { await tick(); ultimoTick = Date.now(); } };

  // --- paragens
  const stopIdx = new Map<string, number>();
  const stopId: string[] = [];
  const latA: number[] = [];
  const lonA: number[] = [];
  const addStop = (id: string, lat: number, lon: number) => {
    const i = stopId.length;
    stopIdx.set(id, i); stopId.push(id); latA.push(lat); lonA.push(lon);
    return i;
  };
  for (const r of dbAny.prepare('SELECT stop_id, stop_lat, stop_lon FROM stops WHERE COALESCE(location_type, 0) = 0').all() as any[]) {
    const lat = Number(r.stop_lat), lon = Number(r.stop_lon);
    addStop(String(r.stop_id), Number.isFinite(lat) ? lat : NaN, Number.isFinite(lon) ? lon : NaN);
  }
  await tick();

  // --- viagens
  const trips = dbAny.prepare('SELECT trip_id, feed_id, route_id, service_id, trip_headsign FROM trips').all() as any[];
  const nTrips = trips.length;
  const tripMap = new Map<string, number>();
  const tFeed: string[] = new Array(nTrips), tRoute: string[] = new Array(nTrips), tSvc: string[] = new Array(nTrips), tHs: string[] = new Array(nTrips), tId: string[] = new Array(nTrips);
  for (let i = 0; i < nTrips; i++) {
    const r = trips[i];
    tId[i] = String(r.trip_id); tFeed[i] = String(r.feed_id); tRoute[i] = String(r.route_id);
    tSvc[i] = r.service_id == null ? '' : String(r.service_id); tHs[i] = r.trip_headsign == null ? '' : String(r.trip_headsign);
    tripMap.set(tId[i], i);
  }
  trips.length = 0;
  await tick();

  // --- horários (por blocos, para não bloquear o servidor)
  const total = Number((dbAny.prepare('SELECT COUNT(*) AS n FROM stop_times').get() as any).n) || 0;
  const fTrip = new Int32Array(total), fStop = new Int32Array(total), fArr = new Int32Array(total), fDep = new Int32Array(total), fSeq = new Int32Array(total);
  const fPick = new Uint8Array(total);
  const q = dbAny.prepare(
    'SELECT id, trip_id, stop_id, arrival_secs AS a, departure_secs AS d, stop_sequence AS s, pickup_type AS p FROM stop_times WHERE id > ? ORDER BY id LIMIT 80000',
  );
  let n = 0, ultimoId = 0;
  for (;;) {
    const rows = q.all(ultimoId) as any[];
    if (!rows.length) break;
    for (const r of rows) {
      ultimoId = r.id;
      const ti = tripMap.get(r.trip_id);
      if (ti === undefined || n >= total) continue;
      let sid: string = r.stop_id;
      if (tFeed[ti] === 'cmh' && sid.startsWith('cmh:')) sid = `cm:${sid.slice(4)}`;
      let si = stopIdx.get(sid);
      if (si === undefined) si = addStop(sid, NaN, NaN);
      let a = r.a == null ? -1 : Number(r.a), d = r.d == null ? -1 : Number(r.d);
      if (a < 0) a = d;
      if (d < 0) d = a;
      fTrip[n] = ti; fStop[n] = si; fArr[n] = a; fDep[n] = d; fSeq[n] = Number(r.s) || 0;
      fPick[n] = Number(r.p) === 1 || d < 0 ? 1 : 0;
      n++;
    }
    await cede();
  }

  // --- ordenar por viagem (ordenação por contagem) e agrupar em padrões
  const off = new Int32Array(nTrips + 1);
  for (let i = 0; i < n; i++) off[fTrip[i] + 1]++;
  for (let i = 0; i < nTrips; i++) off[i + 1] += off[i];
  const cursor = off.slice(0, nTrips);
  const ord = new Int32Array(n);
  for (let i = 0; i < n; i++) ord[cursor[fTrip[i]]++] = i;
  await cede();

  const routeIdxMap = new Map<string, number>();
  const grupos = new Map<string, { feed: string; route: string; stops: Int32Array; trips: number[] }>();
  for (let t = 0; t < nTrips; t++) {
    const ini = off[t], fim = off[t + 1];
    const len = fim - ini;
    if (len < 2) continue;
    let ordenado = true;
    for (let j = ini + 1; j < fim; j++) if (fSeq[ord[j]] < fSeq[ord[j - 1]]) { ordenado = false; break; }
    if (!ordenado) {
      const fatia = Array.from(ord.subarray(ini, fim)).sort((x, y) => fSeq[x] - fSeq[y]);
      for (let j = 0; j < len; j++) ord[ini + j] = fatia[j];
    }
    let h1 = 2166136261, h2 = 5381;
    for (let j = ini; j < fim; j++) {
      const s = fStop[ord[j]];
      h1 = Math.imul(h1 ^ s, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) + s) >>> 0;
    }
    const chave = `${tFeed[t]}|${tRoute[t]}|${len}|${h1}|${h2}`;
    let g = grupos.get(chave);
    if (!g) {
      const stops = new Int32Array(len);
      for (let j = 0; j < len; j++) stops[j] = fStop[ord[ini + j]];
      g = { feed: tFeed[t], route: tRoute[t], stops, trips: [] };
      grupos.set(chave, g);
    }
    g.trips.push(t);
    if ((t & 4095) === 0) await cede();
  }

  const padroes: Padrao[] = [];
  for (const g of grupos.values()) {
    const nS = g.stops.length;
    // viagens por hora de partida na primeira paragem
    const primeira = (t: number) => fDep[ord[off[t]]];
    g.trips.sort((x, y) => primeira(x) - primeira(y));
    const nT = g.trips.length;
    const dep = new Int32Array(nT * nS), arr = new Int32Array(nT * nS), seq = new Int32Array(nT * nS), pick = new Uint8Array(nT * nS);
    for (let k = 0; k < nT; k++) {
      const ini = off[g.trips[k]];
      let ultimo = -1;
      for (let j = 0; j < nS; j++) {
        const f = ord[ini + j];
        const o = k * nS + j;
        let d = fDep[f], a = fArr[f];
        let pk = fPick[f];
        if (d < 0) { d = ultimo; a = ultimo; pk = 1; }
        if (d >= 0) ultimo = d;
        dep[o] = d; arr[o] = a < 0 ? d : a; seq[o] = fSeq[f]; pick[o] = pk;
      }
      // inícios sem hora: usa a primeira hora conhecida
      let j = 0;
      while (j < nS && dep[k * nS + j] < 0) j++;
      if (j > 0 && j < nS) for (let x = 0; x < j; x++) { dep[k * nS + x] = dep[k * nS + j]; arr[k * nS + x] = dep[k * nS + j]; pick[k * nS + x] = 1; }
    }
    let ri = routeIdxMap.get(`${g.feed}|${g.route}`);
    if (ri === undefined) { ri = routeIdxMap.size; routeIdxMap.set(`${g.feed}|${g.route}`, ri); }
    padroes.push({
      feed: g.feed, feedSaida: g.feed === 'cmh' ? 'carris_metropolitana' : g.feed, route: g.route, routeIdx: ri,
      stops: g.stops, nT, dep, arr, seq, pick,
      tripId: g.trips.map((t) => tId[t]), service: g.trips.map((t) => tSvc[t]), headsign: g.trips.map((t) => tHs[t]),
    });
    if ((padroes.length & 255) === 0) await cede();
  }
  grupos.clear();

  // --- paragem -> (padrão, posição)
  const nStops = stopId.length;
  const psStart = new Int32Array(nStops + 1);
  let somaPos = 0;
  for (const p of padroes) { for (let j = 0; j < p.stops.length; j++) psStart[p.stops[j] + 1]++; somaPos += p.stops.length; }
  for (let i = 0; i < nStops; i++) psStart[i + 1] += psStart[i];
  const cur = psStart.slice(0, nStops);
  const psPat = new Int32Array(somaPos), psPos = new Int32Array(somaPos);
  padroes.forEach((p, pi) => { for (let j = 0; j < p.stops.length; j++) { const s = p.stops[j]; const x = cur[s]++; psPat[x] = pi; psPos[x] = j; } });
  await cede();

  const lat = Float64Array.from(latA), lon = Float64Array.from(lonA);
  const grelha = new Map<number, number[]>();
  for (let s = 0; s < nStops; s++) {
    if (psStart[s + 1] === psStart[s] || !Number.isFinite(lat[s]) || !Number.isFinite(lon[s])) continue;
    const k = chaveCelula(celulaY(lat[s]), celulaX(lon[s]));
    const l = grelha.get(k);
    if (l) l.push(s); else grelha.set(k, [s]);
  }

  return { db: dbAny, construidoEm: Date.now() - t0, stopId, stopIdx, lat, lon, padroes, psStart, psPat, psPos, grelha, viz: new Map(), nRotas: routeIdxMap.size };
}

function vizinhos(ix: Indice, s: number): { ids: Int32Array; min: Uint8Array } {
  let v = ix.viz.get(s);
  if (v) return v;
  const ids: number[] = [], mins: number[] = [];
  if (Number.isFinite(ix.lat[s]) && Number.isFinite(ix.lon[s])) {
    const cy = celulaY(ix.lat[s]), cx = celulaX(ix.lon[s]);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const o of ix.grelha.get(chaveCelula(cy + dy, cx + dx)) || []) {
        if (o === s) continue;
        const m = distM(ix.lat[s], ix.lon[s], ix.lat[o], ix.lon[o]);
        if (m <= RAIO_VIZ) { ids.push(o); mins.push(Math.min(255, minAPe(m))); }
      }
    }
  }
  v = { ids: Int32Array.from(ids), min: Uint8Array.from(mins) };
  if (ix.viz.size > 50000) ix.viz.clear();
  ix.viz.set(s, v);
  return v;
}

// ------------------------------------------------------------------------------------
// Pesquisa (RAPTOR)
// ------------------------------------------------------------------------------------
export interface PedidoPesquisa {
  origens: Array<{ stop: number; t: number }>; // paragem e hora (s) a que lá se chega a pé
  destinos: Map<number, number>; // paragem -> segundos a pé até ao destino
  ativo: (feed: string) => Set<string>;
  maxK: number; // máximo de viagens (transbordos + 1)
  limiteSaida: number; // não entra em viagens que partam depois disto
  orcamentoMs: number;
}

export function procurar(ix: Indice, pedido: PedidoPesquisa): Jornada[] {
  const { origens, destinos, ativo, maxK, limiteSaida } = pedido;
  const prazo = Date.now() + pedido.orcamentoMs;
  const S = ix.stopId.length, P = ix.padroes.length, K = maxK;
  const tau: Int32Array[] = [], kind: Uint8Array[] = [], pPat: Int32Array[] = [], pT: Int32Array[] = [], pB: Int32Array[] = [], pA: Int32Array[] = [], pFrom: Int32Array[] = [], rk: Int32Array[] = [];
  for (let k = 0; k <= K; k++) {
    tau.push(new Int32Array(S)); kind.push(new Uint8Array(S)); pPat.push(new Int32Array(S)); pT.push(new Int32Array(S));
    pB.push(new Int32Array(S)); pA.push(new Int32Array(S)); pFrom.push(new Int32Array(S)); rk.push(new Int32Array(S));
  }
  const best = new Int32Array(S);
  const qPos = new Int32Array(P).fill(-1);
  const marca = new Int32Array(S); // carimbo para não repetir paragens numa ronda
  let carimbo = 0;
  const masks: Array<Uint8Array | undefined> = new Array(P);
  const mascara = (p: number): Uint8Array => {
    let m = masks[p];
    if (!m) {
      const pd = ix.padroes[p];
      const ac = ativo(pd.feed);
      m = new Uint8Array(pd.nT);
      for (let i = 0; i < pd.nT; i++) if (ac.has(pd.service[i])) m[i] = 1;
      masks[p] = m;
    }
    return m;
  };

  /** primeira viagem ativa, com entrada permitida, que parte desta paragem depois de "min" */
  const acharViagem = (p: number, pos: number, min: number): number => {
    const pd = ix.padroes[p];
    const nS = pd.stops.length, m = mascara(p);
    let lo = 0, hi = pd.nT;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pd.dep[mid * nS + pos] < min) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < pd.nT; i++) {
      const d = pd.dep[i * nS + pos];
      if (d > limiteSaida) return -1;
      if (m[i] && !pd.pick[i * nS + pos]) return i;
    }
    return -1;
  };

  const reconstruir = (k: number, destino: number): Jornada | null => {
    const rides: Corrida[] = [];
    let kk = k, cur = destino, guarda = 0;
    while (kk > 0) {
      if (guarda++ > 40) return null;
      while (kk > 0 && kind[kk][cur] === 0) kk--;
      if (kk === 0) break;
      let ki = kind[kk][cur];
      let passos = 0;
      while (ki === 2) { cur = pFrom[kk][cur]; ki = kind[kk][cur]; if (++passos > 5) return null; }
      if (ki !== 1) return null;
      const pat = pPat[kk][cur], t = pT[kk][cur], b = pB[kk][cur], a = pA[kk][cur];
      rides.push({ pat, t, b, a });
      cur = ix.padroes[pat].stops[b];
      kk--;
    }
    if (kind[0][cur] !== 3 || !rides.length) return null;
    rides.reverse();
    return { k, rides, destStop: destino, chegada: 0 };
  };

  const correr = (banidas: Set<number>): Jornada[] => {
    best.fill(INF);
    for (let k = 0; k <= K; k++) { tau[k].fill(INF); kind[k].fill(0); rk[k].fill(-1); }
    let alvo = INF; // melhor hora de chegada ao destino (para podar)
    let referencia = INF; // última chegada já apresentada
    const saida: Jornada[] = [];
    let marcados: number[] = [];
    for (const o of origens) {
      if (o.t < tau[0][o.stop]) {
        if (tau[0][o.stop] === INF) marcados.push(o.stop);
        tau[0][o.stop] = o.t; best[o.stop] = o.t; kind[0][o.stop] = 3;
      }
    }
    for (let k = 1; k <= K; k++) {
      if (Date.now() > prazo) break;
      tau[k].set(tau[k - 1]); rk[k].set(rk[k - 1]);
      const tocados: number[] = [];
      for (const s of marcados) {
        for (let j = ix.psStart[s]; j < ix.psStart[s + 1]; j++) {
          const p = ix.psPat[j], pos = ix.psPos[j];
          if (banidas.size && banidas.has(ix.padroes[p].routeIdx)) continue;
          if (qPos[p] < 0) { tocados.push(p); qPos[p] = pos; } else if (pos < qPos[p]) qPos[p] = pos;
        }
      }
      const novos: number[] = [];
      carimbo++;
      const anterior = tau[k - 1], margem = k > 1 ? MARGEM : 0;
      for (const p of tocados) {
        const pd = ix.padroes[p], nS = pd.stops.length;
        let t = -1, emb = 0;
        for (let pos = qPos[p]; pos < nS; pos++) {
          const s = pd.stops[pos];
          if (t >= 0) {
            const a = pd.arr[t * nS + pos];
            if (a >= 0 && a < best[s] && a < alvo) {
              tau[k][s] = a; best[s] = a; kind[k][s] = 1;
              pPat[k][s] = p; pT[k][s] = t; pB[k][s] = emb; pA[k][s] = pos; rk[k][s] = pd.routeIdx;
              if (marca[s] !== carimbo) { marca[s] = carimbo; novos.push(s); }
            }
          }
          const prev = anterior[s];
          if (prev < INF && rk[k - 1][s] !== pd.routeIdx) {
            const min = prev + margem;
            if (t < 0 || min <= pd.dep[t * nS + pos]) {
              const t2 = acharViagem(p, pos, min);
              if (t2 >= 0 && (t < 0 || t2 < t)) { t = t2; emb = pos; }
            }
          }
        }
      }
      for (const p of tocados) qPos[p] = -1;

      // transbordos a pé entre paragens próximas
      const aPe: number[] = [];
      for (const s of novos) {
        if (kind[k][s] !== 1) continue;
        const v = vizinhos(ix, s);
        for (let j = 0; j < v.ids.length; j++) {
          const o = v.ids[j];
          const c = tau[k][s] + v.min[j] * 60;
          if (c < best[o] && c < alvo) {
            tau[k][o] = c; best[o] = c; kind[k][o] = 2; pFrom[k][o] = s; rk[k][o] = rk[k][s];
            aPe.push(o);
          }
        }
      }

      // chegada ao destino nesta ronda
      let melhorD = -1, melhorC = INF;
      for (const [d, egress] of destinos) {
        if (kind[k][d] === 0) continue;
        const c = tau[k][d] + egress;
        if (c < melhorC) { melhorC = c; melhorD = d; }
      }
      if (melhorD >= 0) {
        if (melhorC < alvo) alvo = melhorC;
        const exigido = k === 1 ? 0 : k === 2 ? 3 * 60 : 5 * 60; // cada transbordo tem de poupar tempo
        if (referencia === INF || melhorC <= referencia - exigido) {
          const j = reconstruir(k, melhorD);
          if (j) { j.chegada = melhorC; saida.push(j); referencia = melhorC; }
        }
      }
      const prox = new Set<number>(novos);
      for (const o of aPe) prox.add(o);
      marcados = Array.from(prox);
      if (!marcados.length) break;
    }
    return saida;
  };

  const resultado: Jornada[] = [];
  const vistas = new Set<string>();
  const juntar = (js: Jornada[]) => {
    for (const j of js) {
      const sig = j.rides.map((r) => `${ix.padroes[r.pat].routeIdx}:${ix.padroes[r.pat].tripId[r.t]}`).join('>');
      if (vistas.has(sig)) continue;
      // nunca duas viagens seguidas da mesma linha
      let repete = false;
      for (let i = 1; i < j.rides.length; i++) if (ix.padroes[j.rides[i].pat].routeIdx === ix.padroes[j.rides[i - 1].pat].routeIdx) repete = true;
      if (repete) continue;
      vistas.add(sig); resultado.push(j);
    }
  };

  const primeiras = correr(new Set());
  juntar(primeiras);
  // Alternativas: volta a pesquisar sem cada uma das linhas do melhor percurso
  const melhor = primeiras.length ? primeiras[primeiras.length - 1] : null;
  if (melhor) {
    const linhas = Array.from(new Set(melhor.rides.map((r) => ix.padroes[r.pat].routeIdx)));
    const ja = new Set<number>();
    for (const ri of linhas.slice(0, 3)) {
      if (Date.now() > prazo) break;
      ja.add(ri);
      const alt = correr(new Set([ri]));
      juntar(alt);
      // e a seguir sem o conjunto das linhas já excluídas e das do melhor alternativo
      if (alt.length && Date.now() < prazo) {
        const al = alt[alt.length - 1];
        const lin2 = Array.from(new Set(al.rides.map((r) => ix.padroes[r.pat].routeIdx))).filter((x) => x !== ri);
        if (lin2.length) juntar(correr(new Set([ri, lin2[0]])));
      }
    }
  }
  return resultado;
}
