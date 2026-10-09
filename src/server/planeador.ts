// =====================================================================================
// PAROU.PT — Planeador de viagens ("Para onde vais?")
//
// Calcula percursos reais com os horários da base (GTFS): viagens diretas e com um
// transbordo (na mesma paragem ou noutra a poucos metros), a partir das paragens a que se
// chega a pé da origem e do destino. Só usa serviços que funcionam hoje.
//
// A UNIR não tem horários na base (a AMP só responde a ligações de Portugal): o servidor
// devolve as ligações diretas possíveis (linha, sentido, paragens) e a app completa-as com o
// horário da AMP pedido pelo telemóvel.
// =====================================================================================
import { DateTime } from 'luxon';
import { getDatabase, getActiveServiceIds, getAllFeeds } from './db/gtfsDatabase';
import type { TransitRouteOption, RouteLeg } from '../types/perto';

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

type Modo = NonNullable<RouteLeg['transportMode']>;

interface Paragem { id: string; feed: string; nome: string; lat: number; lon: number; dist: number; minutos: number }
interface Linha { short: string; long: string; tipo: number; cor: string; feed: string }
interface Perna {
  trip: string; route: string; feed: string; destinoViagem: string;
  de: string; para: string; parte: number; chega: number; paragens: number; sa?: number; sb?: number;
}

export interface CandidatoUnir {
  linha: string; nome: string; cor: string; sentido: number; paragens: number;
  origem: { codigo: string; nome: string; metros: number; minutos: number };
  destino: { codigo: string; nome: string; metros: number; minutos: number };
  anteriores?: Array<{ codigo: string; passos: number }>;
  pontos?: Array<{ lat: number; lon: number; nome?: string }>;
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

export async function planearViagem(
  oLat: number, oLon: number, dLat: number, dLon: number, destNome: string, agora: Date = new Date(),
): Promise<{ routes: TransitRouteOption[]; unir: CandidatoUnir[]; originCoords: { lat: number; lon: number }; destCoords: { lat: number; lon: number }; destName: string }> {
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

  const semViagens = new Set<string>(['unir', 'carris_metropolitana']);
  const O = paragensPerto(oLat, oLon, RAIO_A_PE, MAX_PARAGENS, semViagens);
  const D = paragensPerto(dLat, dLon, RAIO_A_PE, MAX_PARAGENS, semViagens);
  const porId = new Map<string, Paragem>();
  O.forEach((p) => porId.set(`o:${p.id}`, p));
  D.forEach((p) => porId.set(`d:${p.id}`, p));
  const minO = new Map(O.map((p) => [p.id, p.minutos]));
  const minD = new Map(D.map((p) => [p.id, p.minutos]));

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
    const r = db.prepare('SELECT route_short_name, route_long_name, route_type, route_color, feed_id FROM routes WHERE route_id = ?').get(route) as any;
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

  if (O.length && D.length) {
    const idsO = O.map((p) => p.id), idsD = D.map((p) => p.id);
    for (const dia of dias) {
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

  // ------------------------------------------------------------------ escolha das melhores
  // Ordena pela hora de chegada (cada transbordo "custa" 6 min) e evita repetir a mesma linha
  opcoes.sort((a, b) => a._pontos - b._pontos);
  const escolhidas: typeof opcoes = [];
  const vistas = new Set<string>();
  for (const o of opcoes) {
    if (vistas.has(o._assinatura)) continue;
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
    if (melhor && o.id === melhor.id) return { ...o, badgeLabel: o.transfersCount ? 'Mais rápido · 1 transbordo' : 'Mais rápido' };
    return o;
  });

  // ------------------------------------------------------------------ UNIR (o telemóvel completa)
  const unir: CandidatoUnir[] = [];
  try {
    const uO = paragensPerto(oLat, oLon, RAIO_A_PE, 400).filter((p) => p.feed === 'unir').slice(0, 25);
    const uD = paragensPerto(dLat, dLon, RAIO_A_PE, 400).filter((p) => p.feed === 'unir').slice(0, 25);
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
      const queAnteriores = db.prepare(
        'SELECT stop_id AS id, stop_sequence AS seq FROM stop_routes WHERE route_id = ? AND direction_id = ? AND stop_sequence > ? AND stop_sequence < ? ORDER BY stop_sequence DESC LIMIT 3',
      );
      const quePercurso = db.prepare(
        `SELECT s.stop_lat AS lat, s.stop_lon AS lon, s.stop_name AS nome FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
         WHERE sr.route_id = ? AND sr.direction_id = ? AND sr.stop_sequence BETWEEN ? AND ? ORDER BY sr.stop_sequence`,
      );
      for (const { r } of Array.from(melhor.values()).sort((a, b) => a.custo - b.custo).slice(0, 5)) {
        const l = linha(r.route);
        const po = mO.get(r.de)!, pd = mD.get(r.para)!;
        const anteriores = (queAnteriores.all(r.route, r.sentido, r.sa, r.sb) as Array<{ id: string; seq: number }>)
          .map((a) => ({ codigo: a.id.replace(/^unir:/, ''), passos: r.sb - a.seq }));
        const pontos = (quePercurso.all(r.route, r.sentido, r.sa, r.sb) as Array<{ lat: number; lon: number; nome: string }>)
          .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
        unir.push({
          anteriores,
          pontos,
          linha: l?.short || r.route.replace(/^unir:/, ''), nome: l?.long || '', cor: l?.cor || '#CE9926', sentido: r.sentido, paragens: r.sb - r.sa,
          origem: { codigo: r.de.replace(/^unir:/, ''), nome: po.nome, metros: Math.round(po.dist * DESVIO_RUAS), minutos: po.minutos },
          destino: { codigo: r.para.replace(/^unir:/, ''), nome: pd.nome, metros: Math.round(pd.dist * DESVIO_RUAS), minutos: pd.minutos },
        });
      }
    }
  } catch (err: any) {
    console.warn('[Planeador] UNIR:', err?.message || err);
  }

  return { routes, unir, originCoords: { lat: oLat, lon: oLon }, destCoords: { lat: dLat, lon: dLon }, destName: destNome };
}
