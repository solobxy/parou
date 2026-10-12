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
import type { TransitRouteOption, RouteLeg, CandidatoUnir, HibridaUnir, PonteUnir } from '../types/perto';
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
  originCoords: { lat: number; lon: number };
  destCoords: { lat: number; lon: number };
  destName: string;
}

export async function planearViagem(
  oLat: number, oLon: number, dLat: number, dLon: number, destNome: string, agora: Date = new Date(),
  extras: { ponte?: boolean } = {},
): Promise<RespostaPlano> {
  const db = getDatabase();
  const feeds = new Map(getAllFeeds().map((f: any) => [f.id, f]));
  const nomeOperador = (feed: string) => String(feeds.get(feed)?.operator_name || feed.toUpperCase());
  const lis = DateTime.fromJSDate(agora).setZone(ZONA);
  const meiaNoite = lis.startOf('day');
  const agoraSegs = lis.hour * 3600 + lis.minute * 60 + lis.second;
  const epocaMeiaNoite = Math.floor(meiaNoite.toSeconds());
  const distTotal = distM(oLat, oLon, dLat, dLon);

  const opcoes: Array<TransitRouteOption & { _chegada: number; _pontos: number; _assinatura: string }> = [];

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
          const jornadas = procurar(ix, { origens, destinos, ativo: dia.ativo, maxK: 4, limiteSaida: base + 3 * 3600, orcamentoMs: 2500 });
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
  const routes = escolhidas.map(({ _chegada, _pontos, _assinatura, ...o }) => {
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

  // ------------------------------------------------------------------ UNIR + resto da rede (híbridas)
  // Perto do destino (ou da origem) só há paragens da UNIR, que não têm horários no servidor, e nenhuma
  // ligação direta serve: junta-se uma viagem normal (STCP, Metro, CP…) com uma linha da UNIR, nos dois
  // sentidos. A viagem normal vem calculada com horas; a UNIR é completada pelo telemóvel com a AMP.
  const hibridas: HibridaUnir[] = [];
  const pontes: PonteUnir[] = [];
  const emTransito = routes.filter((r) => r.id !== 'a-pe');
  // Só se procura quando o que há não é bom: nada em transporte, ou a pé mais de ~9 min (a UNIR pode ficar mais perto)
  const acessoFraco = !emTransito.length || Math.min(...emTransito.map((r) => r.walkingMinutes)) > 9;
  if (acessoFraco && unir.length === 0 && (uO.length || uD.length)) {
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
        const vistos = new Set<string>();
        const escolhidas: typeof cands = [];
        for (const c of cands) {
          const k = `${c.b.linha.route}|${c.b.linha.sentido}`;
          const sig = `${k}|${c.x.idx}`;
          if (vistos.has(sig) || (porLinhaN.get(k) || 0) >= 2) continue;
          vistos.add(sig);
          porLinhaN.set(k, (porLinhaN.get(k) || 0) + 1);
          escolhidas.push(c);
          if (escolhidas.length >= 5) break;
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
        const linhasSel = Array.from(porLinha.values()).sort((a, b) => a.minutos - b.minutos).slice(0, 6);
        const qSeg = db.prepare(
          `SELECT sr.stop_id AS id, sr.stop_sequence AS seq, s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
           FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
           WHERE sr.route_id = ? AND sr.direction_id = ? AND sr.stop_sequence > ? AND sr.stop_sequence <= ? ORDER BY sr.stop_sequence`,
        );
        const pts: Array<{ linha: typeof linhasSel[0]; id: string; seq: number; nome: string; lat: number; lon: number; ys: Array<{ idx: number; dist: number }>; dDest: number }> = [];
        for (const l of linhasSel) {
          for (const s of qSeg.all(l.route, l.sentido, l.sa, l.sa + 45) as Array<{ id: string; seq: number; nome: string; lat: number; lon: number }>) {
            if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
            const ys = paragensProximas(ix, s.lat, s.lon, RAIO_TRANSBORDO_UNIR).slice(0, 8);
            if (!ys.length) continue;
            const dDest = distM(s.lat, s.lon, dLat, dLon);
            if (dDest > distTotal) continue; // não serve afastar-se do destino
            pts.push({ linha: l, id: s.id, seq: s.seq, nome: s.nome, lat: s.lat, lon: s.lon, ys, dDest });
          }
        }
        // os mais perto do destino primeiro, sem repetir zonas
        pts.sort((a, b) => a.dDest - b.dDest);
        const sel: typeof pts = [];
        for (const p of pts) {
          if (sel.some((q) => distM(q.lat, q.lon, p.lat, p.lon) < 500)) continue;
          sel.push(p);
          if (sel.length >= 8) break;
        }
        const dia = dias[0];
        const base = agoraSegs + dia.desvio;
        const destinos = new Map<number, number>();
        for (const p of D) { const i = ix.stopIdx.get(p.id); if (i !== undefined) destinos.set(i, p.minutos * 60); }
        const verificadas: Array<{ est: number; p: typeof pts[0] }> = [];
        for (const p of sel) {
          if (Date.now() > prazo) break;
          // a viagem em UNIR demora; a seguir continua-se a partir das paragens perto de onde se sai
          const tEst = base + p.linha.minutos * 60 + MIN_ESPERA_UNIR * 60 + (p.seq - p.linha.sa) * 90;
          const origens = p.ys.map((y) => ({ stop: y.idx, t: tEst + minutosAPe(y.dist) * 60 }));
          const js = procurar(ix, { origens, destinos, ativo: dia.ativo, maxK: 3, limiteSaida: tEst + 3 * 3600, orcamentoMs: 250 });
          if (!js.length) continue;
          verificadas.push({ est: Math.min(...js.map((j) => j.chegada)), p });
        }
        verificadas.sort((a, b) => a.est - b.est);
        return verificadas.slice(0, 3).map(({ p }): PonteUnir => {
          const lnh = p.linha;
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

  return { routes, unir, hibridas, pontes, originCoords: { lat: oLat, lon: oLon }, destCoords: { lat: dLat, lon: dLon }, destName: destNome };
}
