// =====================================================================================
// PAROU.PT — Planeador de viagens ("Para onde vais?")
//
// Calcula percursos reais com os horários da base (GTFS): viagens diretas e com até três
// transbordos (na mesma paragem ou noutra a poucos metros), a partir das paragens a que se
// chega a pé da origem e do destino. Só usa serviços que funcionam hoje. O motor principal é o
// RAPTOR em memória (planeadorIndice.ts); enquanto o índice não está pronto, usa-se a pesquisa
// SQL de diretas + um transbordo (mais abaixo).
//
// A UNIR não tem horários na base (a AMP só responde a ligações de Portugal): o servidor
// devolve as ligações diretas possíveis (linha, sentido, paragens) e a app completa-as com o
// horário da AMP pedido pelo telemóvel.
// =====================================================================================
import { DateTime } from 'luxon';
import { getDatabase, getActiveServiceIds, getAllFeeds } from './db/gtfsDatabase';
import type { TransitRouteOption, RouteLeg, CandidatoUnir, HibridaUnir, PonteUnir, DuplaUnir, CadeiaUnir, LigacaoUnir } from '../types/perto';
import { indicePronto, procurar, paragensProximas, type Indice, type Jornada } from './planeadorIndice';

export type { CandidatoUnir };

const ZONA = 'Europe/Lisbon';
const RAIO_A_PE = 900; // metros até às paragens de partida e chegada
const MAX_PARAGENS = 30;
const JANELA_DIRETA = 2 * 3600; // procura partidas nas próximas 2 h
const JANELA_PERNA1 = 75 * 60;
const JANELA_PERNA2 = 3 * 3600;
const RAIO_TRANSBORDO = 300;
const MARGEM_TRANSBORDO = 2 * 60;
const M_POR_MIN = 75; // ~4,5 km/h
const DESVIO_RUAS = 1.3; // a pé não se anda em linha reta
const RAIO_LONGE = 1500; // alcance a pé, só quando não há nada mais perto
const RAIO_TRANSBORDO_UNIR = 330; // metros a pé entre a paragem onde se sai e a paragem da UNIR onde se entra
const MIN_ESPERA_UNIR = 10; // espera média (min) por uma UNIR, só para escolher entre candidatas

type Modo = NonNullable<RouteLeg['transportMode']>;

interface Paragem { id: string; feed: string; nome: string; lat: number; lon: number; dist: number; minutos: number }
interface Linha { short: string; long: string; tipo: number; cor: string; feed: string }
interface Perna {
  trip: string; route: string; feed: string; destinoViagem: string;
  de: string; para: string; parte: number; chega: number; paragens: number; sa?: number; sb?: number;
}

function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, p = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * p) / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function minutosAPe(metros: number): number {
  return Math.max(1, Math.round((metros * DESVIO_RUAS) / M_POR_MIN));
}
function hm(segs: number): string {
  const s = ((Math.round(segs) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
function marcas(n: number) { return Array.from({ length: n }, () => '?').join(','); }

function paragensPerto(lat: number, lon: number, raio = RAIO_A_PE, max = MAX_PARAGENS, feedsSemViagens?: Set<string>): Paragem[] {
  const dLat = raio / 111000;
  const dLon = raio / (111000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const rows = getDatabase().prepare(`
    SELECT stop_id, feed_id, stop_name, stop_lat, stop_lon FROM stops
    WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ? AND COALESCE(location_type, 0) = 0
  `).all(lat - dLat, lat + dLat, lon - dLon, lon + dLon) as Array<{ stop_id: string; feed_id: string; stop_name: string; stop_lat: number; stop_lon: number }>;
  return rows
    .filter((r) => !feedsSemViagens || !feedsSemViagens.has(r.feed_id))
    .map((r) => { const d = distM(lat, lon, r.stop_lat, r.stop_lon); return { id: r.stop_id, feed: r.feed_id, nome: r.stop_name, lat: r.stop_lat, lon: r.stop_lon, dist: d, minutos: minutosAPe(d) }; })
    .filter((p) => p.dist <= raio)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, max);
}

/** Serviços ativos por operador num dia (cache da chamada) */
/** Viagens da Carris Metropolitana do feed "cmh": passam a usar as paragens e o operador da API */
function normalizarCmh(r: { de: string; para: string; feed: string }) {
  if (r.feed !== 'cmh') return;
  if (r.de.startsWith('cmh:')) r.de = `cm:${r.de.slice(4)}`;
  if (r.para.startsWith('cmh:')) r.para = `cm:${r.para.slice(4)}`;
  r.feed = 'carris_metropolitana';
}

function servicosDoDia(dataStr: string, diaSemana: string) {
  const cache = new Map<string, Set<string>>();
  return (feed: string) => {
    let s = cache.get(feed);
    if (!s) { s = getActiveServiceIds(feed, dataStr, diaSemana); cache.set(feed, s); }
    return s;
  };
}

function modoDaLinha(l: Linha | undefined, modoFeed: string | undefined): Modo {
  const mf = String(modoFeed || '').toLowerCase();
  if (mf.includes('metro')) return 'Metro';
  if (mf.includes('comboio')) return 'Comboio';
  if (mf.includes('barco')) return 'Barco';
  switch (l?.tipo) {
    case 0: case 5: case 7: return 'Elétrico';
    case 1: return 'Metro';
    case 2: return 'Comboio';
    case 4: return 'Barco';
    default: return 'Autocarro';
  }
}

/** As viagens de transporte (com horas) de um percurso do motor em memória */
function pernasDeJornada(ix: Indice, j: Jornada): Perna[] {
  return j.rides.map((r) => {
    const pd = ix.padroes[r.pat], nS = pd.stops.length, o = r.t * nS;
    return {
      trip: pd.tripId[r.t], route: pd.route, feed: pd.feedSaida, destinoViagem: String(pd.headsign[r.t] || '').trim(),
      de: ix.stopId[pd.stops[r.b]], para: ix.stopId[pd.stops[r.a]], parte: pd.dep[o + r.b], chega: pd.arr[o + r.a] || pd.dep[o + r.b],
      paragens: r.a - r.b, sa: pd.seq[o + r.b], sb: pd.seq[o + r.a],
    };
  });
}

/** Os troços a pé ligam o ponto de partida/chegada às paragens de embarque e desembarque */
export function ligarTrocosAPe(legs: RouteLeg[], origem: { lat: number; lon: number }, destino: { lat: number; lon: number }): void {
  let atual: { lat: number; lon: number } = origem;
  legs.forEach((l, i) => {
    if (l.mode === 'TRANSIT') {
      const ps = l.pontos;
      if (ps && ps.length) atual = ps[ps.length - 1];
      return;
    }
    const prox = legs.slice(i + 1).find((x) => x.mode === 'TRANSIT' && x.pontos && x.pontos.length);
    const fim = prox ? prox.pontos![0] : destino;
    l.pontos = [{ lat: atual.lat, lon: atual.lon }, { lat: fim.lat, lon: fim.lon }];
  });
}

export interface RespostaPlano {
  routes: TransitRouteOption[];
  unir: CandidatoUnir[];
  /** Viagem normal + UNIR (o destino só tem paragens da UNIR, ou a UNIR é preciso para lá chegar) */
  hibridas?: HibridaUnir[];
  /** UNIR primeiro, depois o resto (a origem só tem paragens da UNIR) */
  pontes?: PonteUnir[];
  /** Duas linhas da UNIR com transbordo entre elas (as horas vêm da AMP) */
  duplas?: DuplaUnir[];
  /** Três linhas da UNIR seguidas (só quando nem uma ligação direta nem duas linhas chegam lá) */
  cadeias?: CadeiaUnir[];
  /** Combinações gerais com a UNIR (qualquer mistura de linhas normais e da UNIR); só no modo `nivel` */
  ligacoes?: LigacaoUnir[];
  originCoords: { lat: number; lon: number };
  destCoords: { lat: number; lon: number };
  destName: string;
  /** Só quando não há resposta nenhuma por falta de paragens com horários: metros até à mais próxima (-1 = nenhuma a menos de 8 km) */
  longe?: { origem?: number; destino?: number };
}

// Índice das paragens da UNIR por célula (~170 m) e por linha, para encontrar linhas que se cruzam
interface PassoUnir { route: string; sentido: number; seq: number; id: string; nome: string; lat: number; lon: number }
interface IndiceUnir {
  t: number;
  celulas: Map<string, PassoUnir[]>;
  linhas: Map<string, PassoUnir[]>;
  /** Em que linhas (e em que posição de cada uma) passa cada paragem */
  porParagem: Map<string, Array<{ k: string; i: number }>>;
  info: Map<string, PassoUnir>;
  /** Paragens (sem repetir) por célula */
  celulasP: Map<string, string[]>;
}
let indiceUnirCache: IndiceUnir | null = null;
const CEL_LAT = 0.0015, CEL_LON = 0.002;
const chaveCel = (lat: number, lon: number) => `${Math.floor(lat / CEL_LAT)}:${Math.floor(lon / CEL_LON)}`;
function indiceUnir(): IndiceUnir {
  if (indiceUnirCache && Date.now() - indiceUnirCache.t < 6 * 3600_000) return indiceUnirCache;
  const rows = getDatabase().prepare(
    `SELECT sr.route_id AS route, sr.direction_id AS sentido, sr.stop_sequence AS seq, sr.stop_id AS id, s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
     FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id WHERE s.feed_id = 'unir'`,
  ).all() as unknown as PassoUnir[];
  const celulas = new Map<string, PassoUnir[]>(), linhas = new Map<string, PassoUnir[]>();
  const porParagem = new Map<string, Array<{ k: string; i: number }>>(), info = new Map<string, PassoUnir>(), celulasP = new Map<string, string[]>();
  for (const r of rows) {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    const c = chaveCel(r.lat, r.lon);
    if (!celulas.has(c)) celulas.set(c, []);
    celulas.get(c)!.push(r);
    const k = `${r.route}|${r.sentido}`;
    if (!linhas.has(k)) linhas.set(k, []);
    linhas.get(k)!.push(r);
    if (!info.has(r.id)) {
      info.set(r.id, r);
      if (!celulasP.has(c)) celulasP.set(c, []);
      celulasP.get(c)!.push(r.id);
    }
  }
  for (const [k, l] of linhas) {
    l.sort((a, b) => a.seq - b.seq);
    l.forEach((passo, i) => {
      if (!porParagem.has(passo.id)) porParagem.set(passo.id, []);
      porParagem.get(passo.id)!.push({ k, i });
    });
  }
  indiceUnirCache = { t: Date.now(), celulas, linhas, porParagem, info, celulasP };
  return indiceUnirCache;
}

export async function planearViagem(
  oLat: number, oLon: number, dLat: number, dLon: number, destNome: string, agora: Date = new Date(),
  extras: { ponte?: boolean; /** 0, 1 ou 2: profundidade de uma viagem que continua depois de uma linha da UNIR (modo geral) */ nivel?: number } = {},
): Promise<RespostaPlano> {
  const db = getDatabase();
  const feeds = new Map(getAllFeeds().map((f: any) => [f.id, f]));
  const nomeOperador = (feed: string) => String(feeds.get(feed)?.operator_name || feed.toUpperCase());
  const lis = DateTime.fromJSDate(agora).setZone(ZONA);
  const meiaNoite = lis.startOf('day');
  const agoraSegs = lis.hour * 3600 + lis.minute * 60 + lis.second;
  const epocaMeiaNoite = Math.floor(meiaNoite.toSeconds());
  const distTotal = distM(oLat, oLon, dLat, dLon);

  const opcoes: Array<TransitRouteOption & { _chegada: number; _pontos: number; _assinatura: string; _saida?: number }> = [];

  // ------------------------------------------------------------------ a pé
  if (distTotal <= 1600) {
    const min = minutosAPe(distTotal);
    opcoes.push({
      id: 'a-pe', type: 'least_walking', title: 'A pé', badgeLabel: 'A pé',
      totalDurationMinutes: min, departureTime: hm(agoraSegs), arrivalTime: hm(agoraSegs + min * 60),
      walkingDistanceMeters: Math.round(distTotal * DESVIO_RUAS), walkingMinutes: min, transfersCount: 0,
      legs: [{ mode: 'WALK', instruction: `Ir a pé até ${destNome}`, durationMinutes: min, distanceMeters: Math.round(distTotal * DESVIO_RUAS) }],
      realtimeStatus: 'PROGRAMADO', realtimeLabel: 'A pé', relevantAlerts: [],
      _chegada: agoraSegs + min * 60, _pontos: agoraSegs + min * 60, _assinatura: 'a-pe',
    });
  }

  // A UNIR não tem horários na base (vêm da AMP pelo telemóvel). A Carris Metropolitana tem: as
  // viagens estão no feed "cmh" com paragens "cmh:<id>" iguais às "cm:<id>" da API (ver parou-dados).
  const semViagens = new Set<string>(['unir']);
  let O = paragensPerto(oLat, oLon, RAIO_A_PE, MAX_PARAGENS, semViagens);
  let D = paragensPerto(dLat, dLon, RAIO_A_PE, MAX_PARAGENS, semViagens);
  const porId = new Map<string, Paragem>();
  let minO = new Map(O.map((p) => [p.id, p.minutos]));
  let minD = new Map(D.map((p) => [p.id, p.minutos]));
  const registarParagens = () => {
    porId.clear();
    O.forEach((p) => porId.set(`o:${p.id}`, p));
    D.forEach((p) => porId.set(`d:${p.id}`, p));
    minO = new Map(O.map((p) => [p.id, p.minutos]));
    minD = new Map(D.map((p) => [p.id, p.minutos]));
  };
  registarParagens();

  // Dias de serviço: hoje e, de madrugada, as viagens de ontem depois da meia-noite (24:xx)
  const dias: Array<{ desvio: number; ativo: (feed: string) => Set<string> }> = [
    { desvio: 0, ativo: servicosDoDia(lis.toFormat('yyyyMMdd'), lis.toFormat('cccc').toLowerCase()) },
  ];
  if (agoraSegs < 5 * 3600) {
    const ontem = lis.minus({ days: 1 });
    dias.push({ desvio: 86400, ativo: servicosDoDia(ontem.toFormat('yyyyMMdd'), ontem.toFormat('cccc').toLowerCase()) });
  }

  const linhasCache = new Map<string, Linha>();
  const linha = (route: string): Linha | undefined => {
    if (linhasCache.has(route)) return linhasCache.get(route);
    const r = db.prepare('SELECT route_short_name, route_long_name, route_type, route_color, feed_id FROM routes WHERE route_id = ?').get(route.startsWith('cmh:') ? `cm:${route.slice(4)}` : route) as any;
    const l = r ? { short: String(r.route_short_name || r.route_long_name || ''), long: String(r.route_long_name || ''), tipo: Number(r.route_type ?? 3), cor: r.route_color ? `#${String(r.route_color).replace(/^#/, '')}` : '#111111', feed: r.feed_id } : undefined;
    linhasCache.set(route, l as Linha);
    return l;
  };
  const nomeParagem = new Map<string, string>();
  const nomeDe = (id: string) => {
    if (!nomeParagem.has(id)) nomeParagem.set(id, String((db.prepare('SELECT stop_name FROM stops WHERE stop_id = ?').get(id) as any)?.stop_name || ''));
    return nomeParagem.get(id)!;
  };

  const pernaTransito = (p: Perna, desvio: number): RouteLeg => {
    const l = linha(p.route);
    const modo = modoDaLinha(l, feeds.get(p.feed)?.mode);
    const de = nomeDe(p.de), para = nomeDe(p.para);
    // Chip curto: a CP usa nomes de serviço longos ("Linha de Braga")
    const codigo = p.feed === 'cp' ? 'CP' : (l?.short || '').length > 6 ? (l?.short || '').slice(0, 5) : (l?.short || '');
    return {
      _perna: p,
      mode: 'TRANSIT',
      instruction: `Apanhar ${modo === 'Metro' ? 'o metro' : modo === 'Comboio' ? 'o comboio' : modo === 'Barco' ? 'o barco' : 'a linha'} ${p.feed === 'cp' ? `(${l?.short || l?.long || 'CP'})` : (l?.short || '')} às ${hm(p.parte - desvio)} em ${de}${p.destinoViagem ? `, sentido ${p.destinoViagem}` : ''}; sair em ${para} (${p.paragens} ${p.paragens === 1 ? 'paragem' : 'paragens'}) às ${hm(p.chega - desvio)}`,
      transportMode: modo,
      lineCode: codigo,
      lineName: l?.long || l?.short || '',
      lineColor: l?.cor,
      operatorName: nomeOperador(p.feed),
      fromStopName: de,
      toStopName: para,
      stopsCount: p.paragens,
      durationMinutes: Math.max(1, Math.round((p.chega - p.parte) / 60)),
      isRealtime: false,
      departureTime: hm(p.parte - desvio),
      arrivalTime: hm(p.chega - desvio),
    } as RouteLeg;
  };

  let janela = 3 * 3600; // até onde se procuram partidas (o resto do dia e a manhã seguinte, se não houver nada)
  const executar = () => {
  if (O.length && D.length) {
    const comCmh = (ps: Paragem[]) => ps.flatMap((p) => (p.id.startsWith('cm:') ? [p.id, `cmh:${p.id.slice(3)}`] : [p.id]));
    const idsO = comCmh(O), idsD = comCmh(D);
    // -------------------------------------------------------------- motor em memória (vários transbordos)
    let feito = false;
    const ix = indicePronto();
    if (ix) {
      try {
        const destinos = new Map<number, number>();
        for (const p of D) { const i = ix.stopIdx.get(p.id); if (i !== undefined) destinos.set(i, p.minutos * 60); }
        for (const dia of dias) {
          const base = agoraSegs + dia.desvio;
          const origens: Array<{ stop: number; t: number }> = [];
          for (const p of O) { const i = ix.stopIdx.get(p.id); if (i !== undefined) origens.push({ stop: i, t: base + p.minutos * 60 }); }
          if (!origens.length || !destinos.size) continue;
          const jornadas = procurar(ix, { origens, destinos, ativo: dia.ativo, maxK: 4, limiteSaida: base + janela, orcamentoMs: janela > 3 * 3600 ? 2000 : 2500 });
          for (const j of jornadas) {
            const pernas: Perna[] = pernasDeJornada(ix, j);
            const primeira = pernas[0], ultima = pernas[pernas.length - 1];
            const andarO = minO.get(primeira.de) || 1, andarD = minD.get(ultima.para) || 1;
            const legs: RouteLeg[] = [
              { mode: 'WALK', instruction: `Ir a pé até ${nomeDe(primeira.de)}`, durationMinutes: andarO, distanceMeters: Math.round((porId.get(`o:${primeira.de}`)?.dist || 0) * DESVIO_RUAS) },
            ];
            let metrosAPe = (porId.get(`o:${primeira.de}`)?.dist || 0) + (porId.get(`d:${ultima.para}`)?.dist || 0);
            let andarTotal = andarO + andarD;
            pernas.forEach((pn, i) => {
              if (i > 0) {
                const ant = pernas[i - 1];
                if (ant.para !== pn.de) {
                  const a = ix.stopIdx.get(ant.para), b = ix.stopIdx.get(pn.de);
                  const m = a !== undefined && b !== undefined ? distM(ix.lat[a], ix.lon[a], ix.lat[b], ix.lon[b]) : 0;
                  const min = Math.max(1, minutosAPe(m));
                  legs.push({ mode: 'WALK', instruction: `Ir a pé até ${nomeDe(pn.de)} (transbordo)`, durationMinutes: min, distanceMeters: Math.round(m * DESVIO_RUAS) });
                  metrosAPe += m; andarTotal += min;
                }
              }
              legs.push(pernaTransito(pn, dia.desvio));
            });
            legs.push({ mode: 'WALK', instruction: `Ir a pé até ${destNome}`, durationMinutes: andarD, distanceMeters: Math.round((porId.get(`d:${ultima.para}`)?.dist || 0) * DESVIO_RUAS) });
            const chegada = ultima.chega + andarD * 60 - dia.desvio;
            const trocas = pernas.length - 1;
            opcoes.push({
              id: `${trocas ? 't' : 'd'}-${pernas.map((x) => x.trip).join('-')}-${primeira.de}-${ultima.para}`,
              type: trocas ? 'fewest_transfers' : 'fastest', title: trocas ? 'Com transbordo' : 'Direto',
              badgeLabel: trocas ? `${trocas} ${trocas === 1 ? 'transbordo' : 'transbordos'}` : 'Direto',
              totalDurationMinutes: Math.round((chegada - agoraSegs) / 60),
              departureTime: hm(primeira.parte - dia.desvio - andarO * 60), arrivalTime: hm(chegada),
              walkingDistanceMeters: Math.round(metrosAPe * DESVIO_RUAS), walkingMinutes: andarTotal, transfersCount: trocas,
              legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário programado', relevantAlerts: [],
              _saida: primeira.parte - dia.desvio - andarO * 60,
              _chegada: chegada, _pontos: chegada + trocas * 6 * 60, // com transbordos, o que distingue um percurso são as viagens a seguir à primeira (o mesmo comboio apanhado a partir de várias linhas é uma só opção)
              _assinatura: pernas.length > 1 ? `M:${pernas.slice(1).map((x) => x.route).join('>')}` : pernas[0].route,
            });
          }
        }
        feito = true;
      } catch (err: any) {
        console.warn('[Planeador] motor em memória falhou, a usar SQL:', err?.message || err);
        for (let i = opcoes.length - 1; i >= 0; i--) if (opcoes[i].id !== 'a-pe') opcoes.splice(i, 1);
      }
    }

    if (!feito) for (const dia of dias) {
      const base = agoraSegs + dia.desvio;
      // -------------------------------------------------------------- diretas
      const diretas = db.prepare(`
        SELECT a.trip_id AS trip, a.stop_id AS de, a.departure_secs AS parte, b.stop_id AS para, b.arrival_secs AS chega,
               b.stop_sequence - a.stop_sequence AS n, a.stop_sequence AS sa, b.stop_sequence AS sb, t.route_id AS route, t.service_id AS sv, t.feed_id AS feed, t.trip_headsign AS hs
        FROM stop_times a INDEXED BY idx_stop_times_stop
        JOIN stop_times b INDEXED BY idx_stop_times_trip_seq ON b.trip_id = a.trip_id AND b.stop_sequence > a.stop_sequence
        JOIN trips t ON t.trip_id = a.trip_id
        WHERE a.stop_id IN (${marcas(idsO.length)}) AND a.departure_secs BETWEEN ? AND ? AND a.pickup_type != 1
          AND b.stop_id IN (${marcas(idsD.length)})
      `).all(...idsO, base, base + JANELA_DIRETA, ...idsD) as any[];
      for (const r of diretas) {
        if (!dia.ativo(r.feed).has(r.sv)) continue;
        normalizarCmh(r);
        const andarO = minO.get(r.de) || 1, andarD = minD.get(r.para) || 1;
        if (r.parte < base + andarO * 60 - 30) continue; // não dá para chegar à paragem a tempo
        const chegada = (r.chega || r.parte) + andarD * 60 - dia.desvio;
        const perna: Perna = { trip: r.trip, route: r.route, feed: r.feed, destinoViagem: String(r.hs || '').trim(), de: r.de, para: r.para, parte: r.parte, chega: r.chega || r.parte, paragens: r.n, sa: r.sa, sb: r.sb };
        const saida = r.parte - dia.desvio - andarO * 60;
        opcoes.push({
          id: `d-${r.trip}-${r.de}-${r.para}`, type: 'fastest', title: 'Direto', badgeLabel: 'Direto',
          totalDurationMinutes: Math.round((chegada - agoraSegs) / 60),
          departureTime: hm(saida), arrivalTime: hm(chegada),
          walkingDistanceMeters: Math.round(((porId.get(`o:${r.de}`)?.dist || 0) + (porId.get(`d:${r.para}`)?.dist || 0)) * DESVIO_RUAS),
          walkingMinutes: andarO + andarD, transfersCount: 0,
          legs: [
            { mode: 'WALK', instruction: `Ir a pé até ${nomeDe(r.de)}`, durationMinutes: andarO, distanceMeters: Math.round((porId.get(`o:${r.de}`)?.dist || 0) * DESVIO_RUAS) },
            pernaTransito(perna, dia.desvio),
            { mode: 'WALK', instruction: `Ir a pé até ${destNome}`, durationMinutes: andarD, distanceMeters: Math.round((porId.get(`d:${r.para}`)?.dist || 0) * DESVIO_RUAS) },
          ],
          realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário programado', relevantAlerts: [],
          _chegada: chegada, _pontos: chegada, _assinatura: r.route,
        });
      }

      // -------------------------------------------------------------- um transbordo
      const perna1 = db.prepare(`
        SELECT a.trip_id AS trip, a.stop_id AS de, a.departure_secs AS parte, b.stop_id AS para, b.arrival_secs AS chega,
               b.stop_sequence - a.stop_sequence AS n, a.stop_sequence AS sa, b.stop_sequence AS sb, t.route_id AS route, t.service_id AS sv, t.feed_id AS feed, t.trip_headsign AS hs
        FROM stop_times a INDEXED BY idx_stop_times_stop
        JOIN stop_times b INDEXED BY idx_stop_times_trip_seq ON b.trip_id = a.trip_id AND b.stop_sequence > a.stop_sequence
        JOIN trips t ON t.trip_id = a.trip_id
        WHERE a.stop_id IN (${marcas(idsO.length)}) AND a.departure_secs BETWEEN ? AND ? AND a.pickup_type != 1
      `).all(...idsO, base, base + JANELA_PERNA1) as any[];
      // Melhor chegada a cada paragem intermédia
      const chegaA = new Map<string, Perna>();
      for (const r of perna1) {
        if (!dia.ativo(r.feed).has(r.sv)) continue;
        normalizarCmh(r);
        const andarO = minO.get(r.de) || 1;
        if (r.parte < base + andarO * 60 - 30) continue;
        const ch = (r.chega || r.parte);
        const atual = chegaA.get(r.para);
        // a contar com o tempo a pé até à paragem de partida (sair mais tarde é melhor, a igual chegada)
        if (!atual || ch < atual.chega || (ch === atual.chega && r.parte > atual.parte)) {
          chegaA.set(r.para, { trip: r.trip, route: r.route, feed: r.feed, destinoViagem: String(r.hs || '').trim(), de: r.de, para: r.para, parte: r.parte, chega: ch, paragens: r.n, sa: r.sa, sb: r.sb });
        }
      }
      const perna2 = db.prepare(`
        SELECT a.trip_id AS trip, a.stop_id AS de, a.departure_secs AS parte, b.stop_id AS para, b.arrival_secs AS chega,
               b.stop_sequence - a.stop_sequence AS n, a.stop_sequence AS sa, b.stop_sequence AS sb, t.route_id AS route, t.service_id AS sv, t.feed_id AS feed, t.trip_headsign AS hs
        FROM stop_times b INDEXED BY idx_stop_times_stop
        JOIN stop_times a INDEXED BY idx_stop_times_trip_seq ON a.trip_id = b.trip_id AND a.stop_sequence < b.stop_sequence
        JOIN trips t ON t.trip_id = b.trip_id
        WHERE b.stop_id IN (${marcas(idsD.length)}) AND b.departure_secs BETWEEN ? AND ? AND a.pickup_type != 1
      `).all(...idsD, base + 5 * 60, base + JANELA_PERNA2) as any[];
      const partemDe = new Map<string, Perna[]>();
      for (const r of perna2) {
        if (!dia.ativo(r.feed).has(r.sv)) continue;
        normalizarCmh(r);
        const l = partemDe.get(r.de) || [];
        l.push({ trip: r.trip, route: r.route, feed: r.feed, destinoViagem: String(r.hs || '').trim(), de: r.de, para: r.para, parte: r.parte, chega: r.chega || r.parte, paragens: r.n, sa: r.sa, sb: r.sb });
        partemDe.set(r.de, l);
      }
      if (chegaA.size && partemDe.size) {
        // Coordenadas das paragens de transbordo (para trocar de paragem a pé)
        const ids = Array.from(new Set([...chegaA.keys(), ...partemDe.keys()]));
        const coords = new Map<string, { lat: number; lon: number }>();
        for (let i = 0; i < ids.length; i += 500) {
          const parte = ids.slice(i, i + 500);
          for (const r of db.prepare(`SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_id IN (${marcas(parte.length)})`).all(...parte) as any[]) {
            coords.set(r.stop_id, { lat: r.stop_lat, lon: r.stop_lon });
          }
        }
        const grelha = new Map<string, string[]>();
        const celula = (lat: number, lon: number) => `${Math.floor(lat / 0.003)}:${Math.floor(lon / 0.004)}`;
        for (const id of partemDe.keys()) {
          const c = coords.get(id);
          if (!c) continue;
          const k = celula(c.lat, c.lon);
          grelha.set(k, [...(grelha.get(k) || []), id]);
        }
        for (const l of partemDe.values()) l.sort((a, b) => a.parte - b.parte);
        const melhorPorCombo = new Map<string, { p1: Perna; p2: Perna; andar: number; metros: number; chegada: number }>();
        for (const [x, p1] of chegaA) {
          const c = coords.get(x);
          if (!c) continue;
          const cy = Math.floor(c.lat / 0.003), cx = Math.floor(c.lon / 0.004);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            for (const y of grelha.get(`${cy + dy}:${cx + dx}`) || []) {
              const cyC = coords.get(y)!;
              const metros = x === y ? 0 : distM(c.lat, c.lon, cyC.lat, cyC.lon);
              if (metros > RAIO_TRANSBORDO) continue;
              const andar = x === y ? 0 : minutosAPe(metros);
              const pronto = p1.chega + andar * 60 + MARGEM_TRANSBORDO;
              for (const p2 of partemDe.get(y)!) {
                if (p2.parte < pronto) continue;
                if (p2.route === p1.route || p2.trip === p1.trip) continue;
                const chegada = p2.chega + (minD.get(p2.para) || 1) * 60 - dia.desvio;
                const combo = `${p1.route}>${p2.route}`;
                const atual = melhorPorCombo.get(combo);
                if (!atual || chegada < atual.chegada) melhorPorCombo.set(combo, { p1, p2, andar, metros, chegada });
                break; // a primeira que dá é a melhor para esta paragem
              }
            }
          }
        }
        for (const [combo, m] of melhorPorCombo) {
          const andarO = minO.get(m.p1.de) || 1, andarD = minD.get(m.p2.para) || 1;
          const legs: RouteLeg[] = [
            { mode: 'WALK', instruction: `Ir a pé até ${nomeDe(m.p1.de)}`, durationMinutes: andarO, distanceMeters: Math.round((porId.get(`o:${m.p1.de}`)?.dist || 0) * DESVIO_RUAS) },
            pernaTransito(m.p1, dia.desvio),
          ];
          if (m.andar > 0) legs.push({ mode: 'WALK', instruction: `Ir a pé até ${nomeDe(m.p2.de)} (transbordo)`, durationMinutes: m.andar, distanceMeters: Math.round(m.metros * DESVIO_RUAS) });
          legs.push(pernaTransito(m.p2, dia.desvio));
          legs.push({ mode: 'WALK', instruction: `Ir a pé até ${destNome}`, durationMinutes: andarD, distanceMeters: Math.round((porId.get(`d:${m.p2.para}`)?.dist || 0) * DESVIO_RUAS) });
          const saida = m.p1.parte - dia.desvio - andarO * 60;
          const metrosAPe = (porId.get(`o:${m.p1.de}`)?.dist || 0) + m.metros + (porId.get(`d:${m.p2.para}`)?.dist || 0);
          opcoes.push({
            id: `t-${m.p1.trip}-${m.p2.trip}`, type: 'fewest_transfers', title: 'Com transbordo', badgeLabel: '1 transbordo',
            totalDurationMinutes: Math.round((m.chegada - agoraSegs) / 60),
            departureTime: hm(saida), arrivalTime: hm(m.chegada),
            walkingDistanceMeters: Math.round(metrosAPe * DESVIO_RUAS), walkingMinutes: andarO + m.andar + andarD, transfersCount: 1,
            legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário programado', relevantAlerts: [],
            _chegada: m.chegada, _pontos: m.chegada + 6 * 60, _assinatura: combo,
          });
        }
      }
    }
  }
  };
  executar();
  // Sem nada em transporte a menos de ~900 m a pé de cada lado: tenta com mais caminhada (até ~1,5 km),
  // como faz o Google Maps ("801 e depois 19 min a pé"). As paragens e os minutos a pé ficam à vista.
  if (!opcoes.some((o) => o.id !== 'a-pe')) {
    const O2 = paragensPerto(oLat, oLon, RAIO_LONGE, MAX_PARAGENS, semViagens);
    const D2 = paragensPerto(dLat, dLon, RAIO_LONGE, MAX_PARAGENS, semViagens);
    if (O2.length > O.length || D2.length > D.length) {
      O = O2; D = D2;
      registarParagens();
      executar();
    }
  }

  // Nada nas próximas 3 h (o último serviço já passou, linha pouco frequente, fim de semana…): alarga a procura ao
  // resto do dia e à manhã seguinte, para a pessoa saber quando há a próxima ligação (a hora aparece na opção).
  if (!opcoes.some((o) => o.id !== 'a-pe') && indicePronto()) {
    janela = 16 * 3600;
    const amanha = lis.plus({ days: 1 });
    dias.push({ desvio: -86400, ativo: servicosDoDia(amanha.toFormat('yyyyMMdd'), amanha.toFormat('cccc').toLowerCase()) });
    executar();
  }

  // ------------------------------------------------------------------ escolha das melhores
  // Ordena pela hora de chegada (cada transbordo "custa" 6 min) e evita repetir a mesma linha
  opcoes.sort((a, b) => a._pontos - b._pontos);
  const escolhidas: typeof opcoes = [];
  const vistas = new Set<string>();
  // Não vale a pena mostrar opções muito piores do que a melhor (chegam bem mais tarde)
  const melhorChegada = Math.min(...opcoes.filter((o) => o.id !== 'a-pe').map((o) => o._chegada));
  const tolerancia = Number.isFinite(melhorChegada) ? Math.max(20 * 60, 0.5 * (melhorChegada - agoraSegs)) : 0;
  for (const o of opcoes) {
    if (vistas.has(o._assinatura)) continue;
    if (o.id !== 'a-pe' && Number.isFinite(melhorChegada) && o._chegada - melhorChegada > tolerancia) continue;
    // Transbordos que não ganham nada à melhor direta não interessam
    const melhorDireta = escolhidas.find((e) => e.transfersCount === 0 && e.id !== 'a-pe');
    if (o.transfersCount > 0 && melhorDireta && o._chegada >= melhorDireta._chegada - 3 * 60) continue;
    vistas.add(o._assinatura);
    escolhidas.push(o);
    if (escolhidas.length >= 4) break;
  }
  // Mostra-se por ordem de chegada: a que chega primeiro vai à frente (a igualdade, a com menos transbordos)
  escolhidas.sort((a, b) => a._chegada - b._chegada || a.transfersCount - b.transfersCount);
  // Percursos para desenhar no mapa (só das opções escolhidas): as paragens de cada viagem e os troços a pé
  const qPontos = db.prepare(
    `SELECT s.stop_lat AS lat, s.stop_lon AS lon, s.stop_name AS nome FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
     WHERE st.trip_id = ? AND st.stop_sequence BETWEEN ? AND ? ORDER BY st.stop_sequence`,
  );
  for (const o of escolhidas) {
    for (const l of o.legs as any[]) {
      const p: Perna | undefined = l._perna;
      delete l._perna;
      if (l.mode === 'TRANSIT' && p?.sa != null && p?.sb != null) {
        try {
          l.pontos = (qPontos.all(p.trip, p.sa, p.sb) as Array<{ lat: number; lon: number; nome: string }>)
            .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
        } catch { /* sem desenho, o resto funciona */ }
      }
    }
    ligarTrocosAPe(o.legs, { lat: oLat, lon: oLon }, { lat: dLat, lon: dLon });
  }

  const melhor = escolhidas.filter((o) => o.id !== 'a-pe')[0];
  const routes = escolhidas.map(({ _chegada, _pontos, _assinatura, _saida, ...resto }) => {
    // Só aparecem quando a viagem sai ou chega noutro dia (0 = hoje): "Sair amanhã às 07:10"
    const o: typeof resto = { ...resto };
    if (o.id !== 'a-pe') {
      const dc = Math.floor(_chegada / 86400), ds = _saida !== undefined ? Math.floor(_saida / 86400) : 0;
      if (dc > 0) o.arrivalDayOffset = dc;
      if (ds > 0) o.departureDayOffset = ds;
    }
    if (melhor && o.id === melhor.id) return { ...o, badgeLabel: o.transfersCount ? `Mais rápido · ${o.transfersCount} ${o.transfersCount === 1 ? 'transbordo' : 'transbordos'}` : 'Mais rápido' };
    return o;
  });

  // ------------------------------------------------------------------ UNIR (o telemóvel completa)
  const unir: CandidatoUnir[] = [];
  const uO = paragensPerto(oLat, oLon, RAIO_A_PE, 400).filter((p) => p.feed === 'unir').slice(0, 25);
  const uD = paragensPerto(dLat, dLon, RAIO_A_PE, 400).filter((p) => p.feed === 'unir').slice(0, 25);
  const queAnteriores = db.prepare(
    'SELECT stop_id AS id, stop_sequence AS seq FROM stop_routes WHERE route_id = ? AND direction_id = ? AND stop_sequence > ? AND stop_sequence < ? ORDER BY stop_sequence DESC LIMIT 3',
  );
  const quePercurso = db.prepare(
    `SELECT s.stop_lat AS lat, s.stop_lon AS lon, s.stop_name AS nome FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
     WHERE sr.route_id = ? AND sr.direction_id = ? AND sr.stop_sequence BETWEEN ? AND ? ORDER BY sr.stop_sequence`,
  );
  /** Paragens anteriores a `sb` e percurso entre `sa` e `sb`, para a app completar a hora da UNIR e desenhar a linha */
  const detalheLinhaUnir = (route: string, sentido: number, sa: number, sb: number) => ({
    anteriores: (queAnteriores.all(route, sentido, sa, sb) as Array<{ id: string; seq: number }>)
      .map((a) => ({ codigo: a.id.replace(/^unir:/, ''), passos: sb - a.seq })),
    pontos: (quePercurso.all(route, sentido, sa, sb) as Array<{ lat: number; lon: number; nome: string }>)
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)),
  });
  try {
    if (uO.length && uD.length) {
      const rows = db.prepare(`
        SELECT a.route_id AS route, a.direction_id AS sentido, a.stop_id AS de, a.stop_sequence AS sa, b.stop_id AS para, b.stop_sequence AS sb
        FROM stop_routes a JOIN stop_routes b ON b.route_id = a.route_id AND b.direction_id = a.direction_id AND b.stop_sequence > a.stop_sequence
        WHERE a.stop_id IN (${marcas(uO.length)}) AND b.stop_id IN (${marcas(uD.length)})
      `).all(...uO.map((p) => p.id), ...uD.map((p) => p.id)) as Array<{ route: string; sentido: number; de: string; sa: number; para: string; sb: number }>;
      const mO = new Map(uO.map((p) => [p.id, p])), mD = new Map(uD.map((p) => [p.id, p]));
      const melhor = new Map<string, { r: typeof rows[0]; custo: number }>();
      for (const r of rows) {
        const custo = mO.get(r.de)!.minutos + mD.get(r.para)!.minutos + (r.sb - r.sa) * 0.8;
        const k = `${r.route}|${r.sentido}`;
        const a = melhor.get(k);
        if (!a || custo < a.custo) melhor.set(k, { r, custo });
      }
      for (const { r } of Array.from(melhor.values()).sort((a, b) => a.custo - b.custo).slice(0, 5)) {
        const l = linha(r.route);
        const po = mO.get(r.de)!, pd = mD.get(r.para)!;
        unir.push({
          ...detalheLinhaUnir(r.route, r.sentido, r.sa, r.sb),
          linha: l?.short || r.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: r.sentido, paragens: r.sb - r.sa,
          origem: { codigo: r.de.replace(/^unir:/, ''), nome: po.nome, metros: Math.round(po.dist * DESVIO_RUAS), minutos: po.minutos },
          destino: { codigo: r.para.replace(/^unir:/, ''), nome: pd.nome, metros: Math.round(pd.dist * DESVIO_RUAS), minutos: pd.minutos },
        });
      }
    }
  } catch (err: any) {
    console.warn('[Planeador] UNIR:', err?.message || err);
  }

  // ------------------------------------------------------------------ UNIR em qualquer combinação (modo geral)
  // A UNIR não tem horários aqui, por isso entra na pesquisa com tempos ESTIMADOS (espera média + ~90 s por paragem) só para
  // DESCOBRIR combinações: qualquer mistura de linhas normais (com horas reais) e da UNIR. Cada combinação é partida na
  // primeira linha da UNIR: [viagem normal até lá] + [linha da UNIR] + [o que falta]. A app pede a hora real da UNIR à AMP
  // e volta a perguntar ao servidor como continuar a partir de onde se sai (até 3 níveis).
  const modoLig = extras.nivel !== undefined;
  const nivelLig = Math.max(0, Math.min(2, extras.nivel ?? 0));
  const ligacoes: LigacaoUnir[] = [];
  const emTransitoReg = routes.filter((r) => r.id !== 'a-pe');
  const aPeReg = emTransitoReg.length ? Math.min(...emTransitoReg.map((r) => r.walkingMinutes)) : 0;
  const fracoReg = !emTransitoReg.length || aPeReg > 9 || emTransitoReg[0].transfersCount > 0 || emTransitoReg[0].totalDurationMinutes > 45;
  if (modoLig && (fracoReg || uO.length || uD.length)) {
    try {
      const ix = indicePronto();
      const dia = dias[0];
      if (ix) {
        const base = agoraSegs + dia.desvio;
        const oAll = paragensPerto(oLat, oLon, RAIO_A_PE, 45);
        const dAll = paragensPerto(dLat, dLon, RAIO_A_PE, 45);
        const mOa = new Map(oAll.map((p) => [p.id, p])), mDa = new Map(dAll.map((p) => [p.id, p]));
        const origens: Array<{ stop: number; t: number }> = [];
        for (const p of oAll) { const i = ix.stopIdx.get(p.id); if (i !== undefined) origens.push({ stop: i, t: base + p.minutos * 60 }); }
        const destinosS = new Map<number, number>();
        for (const p of dAll) { const i = ix.stopIdx.get(p.id); if (i !== undefined) destinosS.set(i, p.minutos * 60); }
        if (origens.length && destinosS.size) {
          const js = procurar(ix, { origens, destinos: destinosS, ativo: dia.ativo, maxK: 4, limiteSaida: base + 3 * 3600, orcamentoMs: 900, sint: true });
          // pior chegada que ainda interessa: quando o percurso normal é bom, só se for melhor; senão, com a folga habitual
          const limiteLig = Number.isFinite(melhorChegada) ? melhorChegada + (fracoReg ? (10 + Math.min(10, Math.max(0, aPeReg - 9) * 0.75)) * 60 : -3 * 60) : Infinity;
          const qNome = db.prepare('SELECT stop_name AS nome, stop_lat AS lat, stop_lon AS lon FROM stops WHERE stop_id = ?');
          const infoParagem = (id: string) => {
            const r = qNome.get(id) as { nome: string; lat: number; lon: number } | undefined;
            return { nome: String(r?.nome || ''), lat: Number(r?.lat), lon: Number(r?.lon) };
          };
          const qPontosL = db.prepare(
            `SELECT s.stop_lat AS lat, s.stop_lon AS lon, s.stop_name AS nome FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
             WHERE st.trip_id = ? AND st.stop_sequence BETWEEN ? AND ? ORDER BY st.stop_sequence`,
          );
          const candidatas = js
            .filter((j) => j.rides.some((r) => ix.padroes[r.pat].freq))
            .sort((a, b) => a.chegada - b.chegada || a.k - b.k);
          const vistas = new Set<string>();
          const maximo = nivelLig === 0 ? 5 : nivelLig === 1 ? 3 : 2;
          for (const j of candidatas) {
            if (ligacoes.length >= maximo) break;
            if (j.chegada - dia.desvio > limiteLig) continue;
            const m = j.rides.findIndex((r) => ix.padroes[r.pat].freq);
            const ru = j.rides[m];
            const fim = m === j.rides.length - 1;
            if (!fim && nivelLig >= 2) continue; // no último nível só cabem ligações que chegam ao destino
            const pu = ix.padroes[ru.pat];
            const idB = ix.stopId[pu.stops[ru.b]], idA = ix.stopId[pu.stops[ru.a]];
            const sig = `${j.rides.slice(0, m).map((r) => ix.padroes[r.pat].tripId[r.t]).join('>')}|${pu.route}|${pu.dir}|${idB}|${idA}|${fim}`;
            if (vistas.has(sig)) continue;
            vistas.add(sig);
            const pB = infoParagem(idB), pA = infoParagem(idA);
            const l = linha(pu.route);

            // viagem normal até à paragem onde se apanha a UNIR (se a houver)
            let prefixo: TransitRouteOption | undefined, chegadaEpoch: number | undefined, transbordo: { lat: number; lon: number; nome: string } | undefined;
            let origemU: CandidatoUnir['origem'];
            if (m > 0) {
              const pernas = pernasDeJornada(ix, { ...j, rides: j.rides.slice(0, m) });
              const prim = pernas[0], ult = pernas[pernas.length - 1];
              const po = mOa.get(prim.de);
              const andarO = Math.max(1, po?.minutos || 1);
              const legs: RouteLeg[] = [
                { mode: 'WALK', instruction: `Ir a pé até ${nomeDe(prim.de)}`, durationMinutes: andarO, distanceMeters: Math.round((po?.dist || 0) * DESVIO_RUAS) },
              ];
              let metrosAPe = po?.dist || 0, andarTotal = andarO;
              pernas.forEach((pn, i) => {
                if (i > 0) {
                  const ant = pernas[i - 1];
                  if (ant.para !== pn.de) {
                    const a = ix.stopIdx.get(ant.para), b = ix.stopIdx.get(pn.de);
                    const mt = a !== undefined && b !== undefined ? distM(ix.lat[a], ix.lon[a], ix.lat[b], ix.lon[b]) : 0;
                    const min = Math.max(1, minutosAPe(mt));
                    legs.push({ mode: 'WALK', instruction: `Ir a pé até ${nomeDe(pn.de)} (transbordo)`, durationMinutes: min, distanceMeters: Math.round(mt * DESVIO_RUAS) });
                    metrosAPe += mt; andarTotal += min;
                  }
                }
                legs.push(pernaTransito(pn, dia.desvio));
              });
              for (const lg of legs as any[]) {
                const pn: Perna | undefined = lg._perna;
                delete lg._perna;
                if (lg.mode === 'TRANSIT' && pn?.sa != null && pn?.sb != null) {
                  try { lg.pontos = (qPontosL.all(pn.trip, pn.sa, pn.sb) as Array<{ lat: number; lon: number }>).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)); } catch { /* sem desenho */ }
                }
              }
              const xi = ix.stopIdx.get(ult.para);
              const xLat = xi !== undefined ? ix.lat[xi] : pB.lat, xLon = xi !== undefined ? ix.lon[xi] : pB.lon;
              ligarTrocosAPe(legs, { lat: oLat, lon: oLon }, { lat: xLat, lon: xLon });
              const chegada = ult.chega - dia.desvio;
              const trocas = pernas.length - 1;
              prefixo = {
                id: `lp-${pernas.map((x) => x.trip).join('-')}-${ult.para}`,
                type: 'fewest_transfers', title: trocas ? 'Com transbordo' : 'Direto',
                badgeLabel: trocas ? `${trocas} ${trocas === 1 ? 'transbordo' : 'transbordos'}` : 'Direto',
                totalDurationMinutes: Math.max(1, Math.round((chegada - agoraSegs) / 60)),
                departureTime: hm(prim.parte - dia.desvio - andarO * 60), arrivalTime: hm(chegada),
                walkingDistanceMeters: Math.round(metrosAPe * DESVIO_RUAS), walkingMinutes: andarTotal, transfersCount: trocas,
                legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário programado', relevantAlerts: [],
              };
              chegadaEpoch = epocaMeiaNoite + chegada;
              transbordo = { lat: xLat, lon: xLon, nome: nomeDe(ult.para) };
              const mt = distM(xLat, xLon, pB.lat, pB.lon);
              origemU = { codigo: idB.replace(/^unir:/, ''), nome: pB.nome, metros: Math.round(mt * DESVIO_RUAS), minutos: mt < 15 ? 0 : minutosAPe(mt), lat: pB.lat, lon: pB.lon };
            } else {
              const po = mOa.get(idB);
              origemU = { codigo: idB.replace(/^unir:/, ''), nome: pB.nome, metros: Math.round((po?.dist || 0) * DESVIO_RUAS), minutos: po?.minutos ?? 0, lat: pB.lat, lon: pB.lon };
            }
            const pdD = fim ? mDa.get(idA) : undefined;
            const destinoU: CandidatoUnir['destino'] = fim
              ? { codigo: idA.replace(/^unir:/, ''), nome: pA.nome, metros: Math.round((pdD?.dist || 0) * DESVIO_RUAS), minutos: pdD?.minutos ?? 0, lat: pA.lat, lon: pA.lon }
              : { codigo: idA.replace(/^unir:/, ''), nome: pA.nome, metros: 0, minutos: 0, lat: pA.lat, lon: pA.lon };
            const candidato: CandidatoUnir = {
              ...detalheLinhaUnir(pu.route, pu.dir ?? 0, pu.fseq![ru.b], pu.fseq![ru.a]),
              linha: l?.short || pu.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: pu.dir ?? 0, paragens: ru.a - ru.b,
              origem: origemU, destino: destinoU,
            };
            ligacoes.push({
              ...(prefixo ? { prefixo, chegadaEpoch, transbordo } : {}),
              candidato, ponto: { lat: pA.lat, lon: pA.lon, nome: pA.nome }, fim,
              estimativa: Math.max(1, Math.round((j.chegada - dia.desvio - agoraSegs) / 60)),
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[Planeador] combinações gerais:', err?.message || err);
    }
  }

  // ------------------------------------------------------------------ UNIR + resto da rede (híbridas)
  // Perto do destino (ou da origem) só há paragens da UNIR, que não têm horários no servidor, e nenhuma
  // ligação direta serve: junta-se uma viagem normal (STCP, Metro, CP…) com uma linha da UNIR, nos dois
  // sentidos. A viagem normal vem calculada com horas; a UNIR é completada pelo telemóvel com a AMP.
  const hibridas: HibridaUnir[] = [];
  const pontes: PonteUnir[] = [];
  const emTransito = routes.filter((r) => r.id !== 'a-pe');
  // Só se procura quando o que há não é bom: nada em transporte, a pé mais de ~9 min (a UNIR pode ficar mais perto), com transbordos ou demorado
  const acessoFraco = !emTransito.length || Math.min(...emTransito.map((r) => r.walkingMinutes)) > 9
    || emTransito[0].transfersCount > 0 || emTransito[0].totalDurationMinutes > 45; // também quando o melhor percurso é lento ou com transbordos
  // Entra se chegar até 10 min depois do melhor percurso normal: o telemóvel mostra as duas e a pessoa escolhe
  // e mais ainda quando o melhor percurso normal obriga a andar muito a pé (cada minuto a pé a mais de 9 vale ~45 s de folga, até +10 min):
  // uma UNIR que poupa 10–15 min de caminhada compensa chegar um pouco mais tarde.
  const aPeMelhor = emTransito.length ? Math.min(...emTransito.map((r) => r.walkingMinutes)) : 0;
  const folgaHibrida = (10 + Math.min(10, Math.max(0, aPeMelhor - 9) * 0.75)) * 60;
  const limiteHibrida = Number.isFinite(melhorChegada) ? melhorChegada + folgaHibrida : Infinity;
  if (!modoLig && acessoFraco && (uO.length || uD.length)) {
    const ix = indicePronto();
    const prazo = Date.now() + 2500;
    if (ix) {
      const mDx = new Map(uD.map((p) => [p.id, p]));
      const mOx = new Map(uO.map((p) => [p.id, p]));
      const origensDo = (lista: Paragem[], t0: number) => {
        const out: Array<{ stop: number; t: number }> = [];
        for (const p of lista) { const i = ix.stopIdx.get(p.id); if (i !== undefined) out.push({ stop: i, t: t0 + p.minutos * 60 }); }
        return out;
      };
      const caminhoParaUnir = () => {
        // Linhas da UNIR que passam perto do destino: a paragem mais próxima por linha e sentido
        const rows = db.prepare(`SELECT route_id AS route, direction_id AS sentido, stop_id AS para, stop_sequence AS sb FROM stop_routes WHERE stop_id IN (${marcas(uD.length)})`)
          .all(...uD.map((p) => p.id)) as Array<{ route: string; sentido: number; para: string; sb: number }>;
        const porLinha = new Map<string, { route: string; sentido: number; para: string; sb: number; minutos: number }>();
        for (const r of rows) {
          const p = mDx.get(r.para); if (!p) continue;
          const k = `${r.route}|${r.sentido}`;
          const a = porLinha.get(k);
          if (!a || p.minutos < a.minutos) porLinha.set(k, { ...r, minutos: p.minutos });
        }
        const linhasSel = Array.from(porLinha.values()).sort((a, b) => a.minutos - b.minutos).slice(0, 8);
        if (!linhasSel.length) return [];
        const qBordos = db.prepare(
          `SELECT sr.stop_id AS id, sr.stop_sequence AS seq, s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
           FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
           WHERE sr.route_id = ? AND sr.direction_id = ? AND sr.stop_sequence < ? AND sr.stop_sequence >= ? ORDER BY sr.stop_sequence`,
        );
        type Bordo = { linha: typeof linhasSel[0]; id: string; seq: number; nome: string; lat: number; lon: number; xs: Array<{ idx: number; dist: number }> };
        const bordos: Bordo[] = [];
        const alvos = new Set<number>();
        for (const l of linhasSel) {
          for (const b of qBordos.all(l.route, l.sentido, l.sb, l.sb - 45) as Array<{ id: string; seq: number; nome: string; lat: number; lon: number }>) {
            if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
            const xs = paragensProximas(ix, b.lat, b.lon, RAIO_TRANSBORDO_UNIR).slice(0, 6);
            if (!xs.length) continue;
            bordos.push({ linha: l, id: b.id, seq: b.seq, nome: b.nome, lat: b.lat, lon: b.lon, xs });
            xs.forEach((x) => alvos.add(x.idx));
          }
        }
        if (!bordos.length) return [];
        const cands: Array<{ custo: number; b: Bordo; x: { idx: number; dist: number }; j: Jornada; dia: typeof dias[0] }> = [];
        for (const dia of dias) {
          const base = agoraSegs + dia.desvio;
          const origens = origensDo(O, base);
          if (!origens.length) continue;
          const todos = new Map<number, Jornada[]>();
          procurar(ix, {
            origens, destinos: new Map(Array.from(alvos, (i) => [i, 0] as [number, number])), ativo: dia.ativo,
            maxK: 3, limiteSaida: base + 2 * 3600, orcamentoMs: Math.max(400, prazo - Date.now()), todosAlvos: todos,
          });
          for (const b of bordos) for (const x of b.xs) {
            const js = todos.get(x.idx);
            if (!js) continue;
            let melhor: Jornada | null = null, melhorV = Infinity;
            for (const j of js) { const v = j.chegada + (j.rides.length - 1) * 360; if (v < melhorV) { melhorV = v; melhor = j; } }
            if (!melhor) continue;
            // hora estimada de chegada ao destino: (cada transbordo pesa 6 min), a pé até à UNIR, espera média, viagem, a pé até lá
            const custo = melhorV + minutosAPe(x.dist) * 60 + MIN_ESPERA_UNIR * 60 + (b.linha.sb - b.seq) * 90 + b.linha.minutos * 60;
            cands.push({ custo, b, x, j: melhor, dia });
          }
        }
        cands.sort((a, b) => a.custo - b.custo);
        const porLinhaN = new Map<string, number>();
        const porTransbordoN = new Map<number, number>();
        const vistos = new Set<string>();
        const escolhidas: typeof cands = [];
        for (const c of cands) {
          // só interessa se chegar antes do melhor percurso normal (que pode ser mau: muito a pé, muita espera)
          if (c.custo - c.dia.desvio > limiteHibrida) continue;
          const k = `${c.b.linha.route}|${c.b.linha.sentido}`;
          const sig = `${k}|${c.x.idx}`;
          if (vistos.has(sig) || (porLinhaN.get(k) || 0) >= 2 || (porTransbordoN.get(c.x.idx) || 0) >= 2) continue;
          vistos.add(sig);
          porLinhaN.set(k, (porLinhaN.get(k) || 0) + 1);
          porTransbordoN.set(c.x.idx, (porTransbordoN.get(c.x.idx) || 0) + 1);
          escolhidas.push(c);
          if (escolhidas.length >= 4) break;
        }
        const qPontos = db.prepare(
          `SELECT s.stop_lat AS lat, s.stop_lon AS lon, s.stop_name AS nome FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
           WHERE st.trip_id = ? AND st.stop_sequence BETWEEN ? AND ? ORDER BY st.stop_sequence`,
        );
        const saida: HibridaUnir[] = [];
        for (const c of escolhidas) {
          const pernas = pernasDeJornada(ix, c.j);
          const prim = pernas[0];
          const andarO = minO.get(prim.de) || 1;
          const legs: RouteLeg[] = [
            { mode: 'WALK', instruction: `Ir a pé até ${nomeDe(prim.de)}`, durationMinutes: andarO, distanceMeters: Math.round((porId.get(`o:${prim.de}`)?.dist || 0) * DESVIO_RUAS) },
          ];
          let metrosAPe = porId.get(`o:${prim.de}`)?.dist || 0;
          let andarTotal = andarO;
          pernas.forEach((pn, i) => {
            if (i > 0) {
              const ant = pernas[i - 1];
              if (ant.para !== pn.de) {
                const a = ix.stopIdx.get(ant.para), b = ix.stopIdx.get(pn.de);
                const m = a !== undefined && b !== undefined ? distM(ix.lat[a], ix.lon[a], ix.lat[b], ix.lon[b]) : 0;
                const min = Math.max(1, minutosAPe(m));
                legs.push({ mode: 'WALK', instruction: `Ir a pé até ${nomeDe(pn.de)} (transbordo)`, durationMinutes: min, distanceMeters: Math.round(m * DESVIO_RUAS) });
                metrosAPe += m; andarTotal += min;
              }
            }
            legs.push(pernaTransito(pn, c.dia.desvio));
          });
          for (const l of legs as any[]) {
            const pn: Perna | undefined = l._perna;
            delete l._perna;
            if (l.mode === 'TRANSIT' && pn?.sa != null && pn?.sb != null) {
              try { l.pontos = (qPontos.all(pn.trip, pn.sa, pn.sb) as Array<{ lat: number; lon: number }>).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)); } catch { /* sem desenho */ }
            }
          }
          const xLat = ix.lat[c.x.idx], xLon = ix.lon[c.x.idx];
          ligarTrocosAPe(legs, { lat: oLat, lon: oLon }, { lat: xLat, lon: xLon });
          const chegada = c.j.chegada - c.dia.desvio;
          const trocas = pernas.length - 1;
          const bd = c.b, lnh = bd.linha;
          const l = linha(lnh.route), pd = mDx.get(lnh.para)!;
          saida.push({
            prefixo: {
              id: `hp-${pernas.map((x) => x.trip).join('-')}-${ix.stopId[c.x.idx]}`,
              type: 'fewest_transfers', title: trocas ? 'Com transbordo' : 'Direto',
              badgeLabel: trocas ? `${trocas} ${trocas === 1 ? 'transbordo' : 'transbordos'}` : 'Direto',
              totalDurationMinutes: Math.max(1, Math.round((chegada - agoraSegs) / 60)),
              departureTime: hm(prim.parte - c.dia.desvio - andarO * 60), arrivalTime: hm(chegada),
              walkingDistanceMeters: Math.round(metrosAPe * DESVIO_RUAS), walkingMinutes: andarTotal, transfersCount: trocas,
              legs, realtimeStatus: 'PROGRAMADO', realtimeLabel: 'Horário programado', relevantAlerts: [],
            },
            chegadaEpoch: epocaMeiaNoite + chegada,
            transbordo: { lat: xLat, lon: xLon, nome: nomeDe(ix.stopId[c.x.idx]) },
            candidato: {
              ...detalheLinhaUnir(lnh.route, lnh.sentido, bd.seq, lnh.sb),
              linha: l?.short || lnh.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: lnh.sentido, paragens: lnh.sb - bd.seq,
              origem: { codigo: bd.id.replace(/^unir:/, ''), nome: bd.nome, metros: Math.round(c.x.dist * DESVIO_RUAS), minutos: minutosAPe(c.x.dist), lat: bd.lat, lon: bd.lon },
              destino: { codigo: lnh.para.replace(/^unir:/, ''), nome: pd.nome, metros: Math.round(pd.dist * DESVIO_RUAS), minutos: pd.minutos, lat: pd.lat, lon: pd.lon },
            },
          });
        }
        return saida;
      };

      const comecarNaUnir = () => {
        // Linhas da UNIR que passam perto da origem: a paragem mais próxima por linha e sentido
        const rows = db.prepare(`SELECT route_id AS route, direction_id AS sentido, stop_id AS de, stop_sequence AS sa FROM stop_routes WHERE stop_id IN (${marcas(uO.length)})`)
          .all(...uO.map((p) => p.id)) as Array<{ route: string; sentido: number; de: string; sa: number }>;
        const porLinha = new Map<string, { route: string; sentido: number; de: string; sa: number; minutos: number }>();
        for (const r of rows) {
          const p = mOx.get(r.de); if (!p) continue;
          const k = `${r.route}|${r.sentido}`;
          const a = porLinha.get(k);
          if (!a || p.minutos < a.minutos) porLinha.set(k, { ...r, minutos: p.minutos });
        }
        const linhasSel = Array.from(porLinha.values()).sort((a, b) => a.minutos - b.minutos).slice(0, 10);
        const qSeg = db.prepare(
          `SELECT sr.stop_id AS id, sr.stop_sequence AS seq, s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
           FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
           WHERE sr.route_id = ? AND sr.direction_id = ? AND sr.stop_sequence > ? AND sr.stop_sequence <= ? ORDER BY sr.stop_sequence`,
        );
        type Saida = { id: string; seq: number; nome: string; lat: number; lon: number; ys: Array<{ idx: number; dist: number }> };
        const dia = dias[0];
        const base = agoraSegs + dia.desvio;
        const destinos = new Map<number, number>();
        for (const p of D) { const i = ix.stopIdx.get(p.id); if (i !== undefined) destinos.set(i, p.minutos * 60); }
        // Para cada linha, TODAS as paragens a jusante (até 60) onde se pode sair e continuar noutra rede a pé; uma só pesquisa
        // por linha com todas elas como pontos de partida (cada uma com a hora a que se lá chega: espera média + ~90 s por paragem
        // + a pé até à paragem com horários). Assim a saída mais curta (2–3 paragens) conta tanto como a mais longa.
        const achados: Array<{ est: number; linha: typeof linhasSel[0]; p: Saida }> = [];
        for (const l of linhasSel) {
          if (Date.now() > prazo) break;
          const pts: Array<{ s: Saida }> = [];
          for (const s of qSeg.all(l.route, l.sentido, l.sa, l.sa + 60) as Array<{ id: string; seq: number; nome: string; lat: number; lon: number }>) {
            if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
            if (distM(s.lat, s.lon, dLat, dLon) > distTotal + 300) continue; // não serve afastar-se do destino
            const ys = paragensProximas(ix, s.lat, s.lon, RAIO_TRANSBORDO_UNIR).slice(0, 8);
            if (!ys.length) continue;
            pts.push({ s: { ...s, ys } });
          }
          if (!pts.length) continue;
          const porY = new Map<number, { t: number; p: Saida }>();
          for (const { s } of pts) {
            const tUnir = base + l.minutos * 60 + MIN_ESPERA_UNIR * 60 + (s.seq - l.sa) * 90;
            for (const y of s.ys) {
              const t = tUnir + minutosAPe(y.dist) * 60;
              const a = porY.get(y.idx);
              if (!a || t < a.t) porY.set(y.idx, { t, p: s });
            }
          }
          const origens = Array.from(porY, ([stop, v]) => ({ stop, t: v.t }));
          const tMax = origens.reduce((m, o) => Math.max(m, o.t), 0);
          const js = procurar(ix, { origens, destinos, ativo: dia.ativo, maxK: 3, limiteSaida: tMax + 3 * 3600, orcamentoMs: Math.max(150, Math.min(450, prazo - Date.now())) });
          let melhorL: { est: number; p: Saida } | null = null;
          for (const j of js) {
            if (!j.rides.length) continue;
            const r0 = j.rides[0];
            const o = porY.get(ix.padroes[r0.pat].stops[r0.b]);
            if (!o) continue;
            const est = j.chegada + (j.rides.length - 1) * 360; // cada transbordo pesa 6 min
            if (!melhorL || est < melhorL.est) melhorL = { est, p: o.p };
          }
          if (melhorL) achados.push({ est: melhorL.est, linha: l, p: melhorL.p });
        }
        achados.sort((a, b) => a.est - b.est);
        // Só interessam as que chegam perto do melhor percurso normal (que pode ser mau: muita caminhada); linhas diferentes
        const vistas = new Set<string>();
        const saidas: typeof achados = [];
        for (const c of achados) {
          if (c.est > limiteHibrida) break;
          if (vistas.has(c.linha.route)) continue;
          vistas.add(c.linha.route);
          saidas.push(c);
          if (saidas.length >= 3) break;
        }
        return saidas.map(({ linha: lnh, p }): PonteUnir => {
          const l = linha(lnh.route), po = mOx.get(lnh.de)!;
          return {
            ponto: { lat: p.lat, lon: p.lon, nome: p.nome },
            candidato: {
              ...detalheLinhaUnir(lnh.route, lnh.sentido, lnh.sa, p.seq),
              linha: l?.short || lnh.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: lnh.sentido, paragens: p.seq - lnh.sa,
              origem: { codigo: lnh.de.replace(/^unir:/, ''), nome: po.nome, metros: Math.round(po.dist * DESVIO_RUAS), minutos: po.minutos, lat: po.lat, lon: po.lon },
              destino: { codigo: p.id.replace(/^unir:/, ''), nome: p.nome, metros: 0, minutos: 0, lat: p.lat, lon: p.lon },
            },
          };
        });
      };

      try { if (O.length && uD.length) hibridas.push(...caminhoParaUnir()); } catch (err: any) { console.warn('[Planeador] híbridas (fim):', err?.message || err); }
      try { if (D.length && uO.length && extras.ponte !== false) pontes.push(...comecarNaUnir()); } catch (err: any) { console.warn('[Planeador] híbridas (início):', err?.message || err); }
    }
  }

  // ------------------------------------------------------------------ UNIR + UNIR (+ UNIR): linhas encadeadas
  // Quando nenhuma linha da UNIR liga os dois lados mas duas (ou três) se encontram a poucos metros umas das outras.
  // O servidor acha a cadeia (não tem os horários da UNIR: estima ~90 s por paragem e uma espera média por linha);
  // a AMP dá as horas reais, cada linha a contar da chegada da anterior.
  const duplas: DuplaUnir[] = [];
  const cadeias: CadeiaUnir[] = [];
  if (!modoLig && acessoFraco && unir.length === 0 && uO.length && uD.length) {
    try {
      const iu = indiceUnir();
      const ESPERA = MIN_ESPERA_UNIR * 60, POR_PARAGEM = 90, ALCANCE = 60;
      const prazoCadeias = Date.now() + 1500;
      const mOu = new Map(uO.map((p) => [p.id, p])), mDu = new Map(uD.map((p) => [p.id, p]));
      const vizCache = new Map<string, Array<{ s: PassoUnir; d: number }>>();
      const vizinhas = (s: PassoUnir) => {
        let v = vizCache.get(s.id);
        if (v) return v;
        v = [];
        const cy = Math.floor(s.lat / CEL_LAT), cx = Math.floor(s.lon / CEL_LON);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          for (const id of iu.celulasP.get(`${cy + dy}:${cx + dx}`) || []) {
            const o = iu.info.get(id)!;
            const d = id === s.id ? 0 : distM(s.lat, s.lon, o.lat, o.lon);
            if (d <= RAIO_TRANSBORDO_UNIR) v.push({ s: o, d });
          }
        }
        vizCache.set(s.id, v);
        return v;
      };
      // Rótulo: a melhor maneira (mais barata, em segundos desde a partida) de sair de um autocarro da UNIR numa paragem
      type Rotulo = { custo: number; k: string; i: number; j: number; emb: PassoUnir; ant: Rotulo | null; ks: string[]; rotas: string[] };
      const longeDemais = (p: PassoUnir) => distM(p.lat, p.lon, dLat, dLon) > distTotal + 2500;

      // Nível 1: linhas que passam perto da origem (a paragem mais perto por linha e sentido)
      const linhasO = new Map<string, { k: string; i: number; p: Paragem }>();
      for (const po of uO) for (const { k, i } of iu.porParagem.get(po.id) || []) {
        const a = linhasO.get(k);
        if (!a || po.minutos < a.p.minutos) linhasO.set(k, { k, i, p: po });
      }
      const melhorEm = new Map<string, number>(); // custo mínimo já conhecido por paragem, em qualquer nível
      let nivel = new Map<string, Rotulo>();
      for (const A of Array.from(linhasO.values()).sort((x, y) => x.p.minutos - y.p.minutos).slice(0, 10)) {
        const linhaA = iu.linhas.get(A.k)!;
        const emb = linhaA[A.i];
        for (let j = A.i + 1; j < linhaA.length && j <= A.i + ALCANCE; j++) {
          const st = linhaA[j];
          if (longeDemais(st)) continue;
          const custo = A.p.minutos * 60 + ESPERA + (j - A.i) * POR_PARAGEM;
          const ex = nivel.get(st.id);
          if (!ex || custo < ex.custo) nivel.set(st.id, { custo, k: A.k, i: A.i, j, emb, ant: null, ks: [A.k], rotas: [emb.route] });
        }
      }
      for (const [id, r] of nivel) melhorEm.set(id, r.custo);

      type Chegada = { custo: number; r: Rotulo; n: number };
      const chegadas: Chegada[] = [];
      const recolher = (n: number, niv: Map<string, Rotulo>) => {
        for (const [id, r] of niv) {
          const pd = mDu.get(id);
          if (pd) chegadas.push({ custo: r.custo + pd.minutos * 60, r, n });
        }
      };
      const expandir = (anterior: Map<string, Rotulo>) => {
        const novo = new Map<string, Rotulo>();
        for (const [sid, lab] of anterior) {
          if (Date.now() > prazoCadeias) break;
          const sOut = iu.info.get(sid)!;
          for (const { s: n, d } of vizinhas(sOut)) {
            const andar = d < 15 ? 0 : minutosAPe(d) * 60;
            for (const { k, i } of iu.porParagem.get(n.id) || []) {
              const linhaB = iu.linhas.get(k)!;
              if (lab.rotas.includes(linhaB[i].route)) continue; // não voltar a uma linha já usada
              for (let j = i + 1; j < linhaB.length && j <= i + ALCANCE; j++) {
                const st = linhaB[j];
                const custo = lab.custo + andar + ESPERA + (j - i) * POR_PARAGEM;
                const conhecido = melhorEm.get(st.id);
                if (conhecido !== undefined && conhecido <= custo) continue; // já se chega aqui mais depressa (com menos linhas)
                const ex = novo.get(st.id);
                if (ex && ex.custo <= custo) continue;
                if (longeDemais(st)) continue;
                novo.set(st.id, { custo, k, i, j, emb: linhaB[i], ant: lab, ks: [...lab.ks, k], rotas: [...lab.rotas, linhaB[i].route] });
              }
            }
          }
        }
        for (const [id, r] of novo) { const c = melhorEm.get(id); if (c === undefined || r.custo < c) melhorEm.set(id, r.custo); }
        return novo;
      };

      nivel = expandir(nivel); // 2 linhas
      recolher(2, nivel);
      const duplasAchadas = chegadas.filter((c) => c.n === 2).length;
      if (duplasAchadas < 2 && Date.now() < prazoCadeias) {
        nivel = expandir(nivel); // 3 linhas
        recolher(3, nivel);
      }

      // Cadeia → CandidatoUnir por linha
      const montar = (c: Chegada) => {
        const rotulos: Rotulo[] = [];
        for (let r: Rotulo | null = c.r; r; r = r.ant) rotulos.unshift(r);
        const pernas: CandidatoUnir[] = [];
        const transbordos: Array<{ lat: number; lon: number; nome: string }> = [];
        rotulos.forEach((r, m) => {
          const linhaR = iu.linhas.get(r.k)!;
          const emb = linhaR[r.i], des = linhaR[r.j];
          const l = linha(emb.route);
          const ultimo = m === rotulos.length - 1;
          const prox = ultimo ? null : rotulos[m + 1].emb;
          let origem: CandidatoUnir['origem'];
          if (m === 0) {
            const po = mOu.get(emb.id)!;
            origem = { codigo: emb.id.replace(/^unir:/, ''), nome: po.nome, metros: Math.round(po.dist * DESVIO_RUAS), minutos: po.minutos, lat: po.lat, lon: po.lon };
          } else {
            origem = { codigo: emb.id.replace(/^unir:/, ''), nome: emb.nome, metros: 0, minutos: 0, lat: emb.lat, lon: emb.lon };
          }
          let destino: CandidatoUnir['destino'];
          if (prox) {
            const metros = distM(des.lat, des.lon, prox.lat, prox.lon);
            destino = { codigo: des.id.replace(/^unir:/, ''), nome: des.nome, metros: Math.round(metros * DESVIO_RUAS), minutos: metros < 15 ? 0 : minutosAPe(metros), lat: des.lat, lon: des.lon };
            transbordos.push({ lat: prox.lat, lon: prox.lon, nome: prox.nome });
          } else {
            const pd = mDu.get(des.id)!;
            destino = { codigo: des.id.replace(/^unir:/, ''), nome: pd.nome, metros: Math.round(pd.dist * DESVIO_RUAS), minutos: pd.minutos, lat: pd.lat, lon: pd.lon };
          }
          pernas.push({
            ...detalheLinhaUnir(emb.route, emb.sentido, emb.seq, des.seq),
            linha: l?.short || emb.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: emb.sentido, paragens: r.j - r.i,
            origem, destino,
          });
        });
        return { pernas, transbordos };
      };

      chegadas.sort((x, y) => x.custo - y.custo);
      const vistosC = new Set<string>();
      for (const c of chegadas) {
        if (agoraSegs + c.custo > limiteHibrida) break;
        const sig = c.r.ks.join('>');
        if (vistosC.has(sig)) continue;
        vistosC.add(sig);
        const { pernas, transbordos } = montar(c);
        if (c.n === 2) { if (duplas.length < 4) duplas.push({ transbordo: transbordos[0], a: pernas[0], b: pernas[1] }); }
        else if (cadeias.length < 3) cadeias.push({ pernas, transbordos });
        if (duplas.length >= 4 && cadeias.length >= 3) break;
      }
    } catch (err: any) {
      console.warn('[Planeador] UNIR+UNIR:', err?.message || err);
    }
  }

  // Sem resposta nenhuma: se for por não haver paragens com horários por perto, diz-se (e a que distância ficam)
  let longe: RespostaPlano['longe'];
  if (!routes.some((r) => r.id !== 'a-pe') && !unir.length && !hibridas.length && !pontes.length && !duplas.length && !cadeias.length && !ligacoes.length) {
    try {
      const medir = (lat: number, lon: number, perto: boolean) => (perto ? undefined : Math.round(paragensPerto(lat, lon, 8000, 1, semViagens)[0]?.dist ?? -1));
      const l = { origem: medir(oLat, oLon, O.length > 0 || uO.length > 0), destino: medir(dLat, dLon, D.length > 0 || uD.length > 0) };
      if (l.origem !== undefined || l.destino !== undefined) longe = l;
    } catch { /* sem este pormenor, a mensagem fica genérica */ }
  }

  return { routes, unir, hibridas, pontes, duplas, cadeias, ...(modoLig ? { ligacoes } : {}), ...(longe ? { longe } : {}), originCoords: { lat: oLat, lon: oLon }, destCoords: { lat: dLat, lon: dLon }, destName: destNome };
}
