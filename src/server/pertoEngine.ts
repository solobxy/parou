import { 
  calculateDistanceMeters, 
  formatDistance, 
  estimateWalkingMinutes 
} from '../data/portugalTransitStopsGeo';
import { getTmlVehiclesAudited } from './tmlGoHubService';
import { getCentralAlerts } from './centralAlertsEngine';
import { StopsEngine } from './stopsEngine';
import { DepartureEngine } from './departureEngine';
import { RealtimeEngine } from './realtimeEngine';
import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  NextDeparture, 
  TransitRouteOption, 
  RouteLeg, 
  DestinationSuggestion 
} from '../types/perto';
import { CentralAlert } from '../types/alerts';
import { getDatabase, getAllFeeds } from './db/gtfsDatabase';
import { procurarParagens, normalizarParaPesquisa } from './pesquisaParagens';
import { procurarLocais, palavrasDaPesquisa, correspondencia, pontuar } from './pesquisaLocais';

// ========================================================
// 1. NEARBY TRANSIT DATA (ALL REAL GTFS STOPS & LIVE VEHICLES)
// ========================================================

export async function getNearbyTransitData(
  userLat: number,
  userLon: number,
  radiusMeters: number = 500
): Promise<{
  stops: NearbyStopItem[];
  vehicles: NearbyVehicleItem[];
  alerts: CentralAlert[];
  radiusMeters: number;
  timestamp: string;
}> {
  // Always query real database stops with the exact GPS coordinates without caching
  const nearbyUnified = await StopsEngine.getNearbyUnifiedStops(userLat, userLon, radiusMeters, 1000);
  const now = new Date();

  // Enrich top stops with next departures
  const enrichedStops = await Promise.all(
    nearbyUnified.map(async (stop, idx) => {
      if (idx < 25) {
        const depResult = await DepartureEngine.nextDepartures(stop, now, 5);
        return {
          ...stop,
          departures: depResult.departures,
          status_notice: depResult.status_notice,
          has_realtime: depResult.has_realtime,
        };
      }
      return {
        ...stop,
        departures: [],
        status_notice: undefined,
        has_realtime: false,
      };
    })
  );

  const [liveVehicles, allAlerts] = await Promise.all([
    RealtimeEngine.getLiveVehicles().catch(() => []),
    getCentralAlerts().catch(() => []),
  ]);

  const mappedStops: NearbyStopItem[] = enrichedStops.map((stop) => {
    const distM = Math.round(calculateDistanceMeters(userLat, userLon, stop.lat, stop.lon));
    const formattedDist = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
    const walkMins = Math.max(1, Math.round(distM / 80));

    const rawMode = (stop.modes[0] || '').toLowerCase();
    let primaryMode = 'Autocarro';
    if (rawMode.includes('metro') || rawMode.includes('subway') || rawMode.includes('tram') || rawMode.includes('mst')) {
      primaryMode = 'Metro';
    } else if (rawMode.includes('comboio') || rawMode.includes('train') || rawMode.includes('rail') || rawMode.includes('fertagus') || rawMode.includes('cp')) {
      primaryMode = 'Comboio';
    } else if (rawMode.includes('barco') || rawMode.includes('ferry') || rawMode.includes('fluvial')) {
      primaryMode = 'Barco';
    }

    const opName = stop.operators[0] || 'Transportes';

    const nextDeps: NextDeparture[] = (stop.departures || []).map((d) => ({
      lineCode: d.route_short_name || d.route_id,
      lineName: d.route_long_name || d.route_short_name || '',
      lineColor: d.route_color || '#3b82f6',
      destination: d.headsign || 'Terminal',
      operatorName: d.operator_name || opName,
      operatorId: d.feed_id,
      // Para abrir o percurso da linha (paragens por ordem) ao tocar na partida
      tripId: d.trip_id,
      routeId: d.route_id,
      stopId: d.stop_id,
      transportMode: primaryMode as any,
      departureTime: d.display_text,
      displayText: d.display_text,
      scheduledTime: d.scheduled_time,
      etaMinutes: Math.max(0, Math.round((d.dep_epoch_secs - Math.floor(Date.now() / 1000)) / 60)),
      departureMinutes: Math.max(0, Math.round((d.dep_epoch_secs - Math.floor(Date.now() / 1000)) / 60)),
      isRealtime: d.state === 'TEMPO REAL',
      state: d.state,
      statusDescription: d.state_reason || d.state,
      isDelayed: d.is_delayed,
      aviso_horario: d.aviso_horario,
      dep_epoch_secs: d.dep_epoch_secs,
      realtime_epoch_secs: d.realtime_epoch_secs,
    }));

    const lines = (stop.lines && stop.lines.length > 0)
      ? stop.lines.map((l) => ({
          code: l.route_short_name || l.route_id,
          name: l.route_long_name || l.route_short_name,
          color: l.route_color || '#3b82f6',
          destination: '',
        }))
      : nextDeps.map((d) => ({
          code: d.lineCode,
          name: d.lineName,
          color: d.lineColor,
          destination: d.destination,
        }));

    return {
      id: stop.id,
      name: stop.name,
      operatorId: stop.feed_ids[0] || 'transportes',
      operatorName: opName,
      transportMode: primaryMode as any,
      latitude: stop.lat,
      longitude: stop.lon,
      locality: stop.parent_station ? 'Interface Multimodal' : 'Portugal',
      district: 'Portugal',
      distanceMeters: distM,
      formattedDistance: formattedDist,
      walkingMinutes: walkMins,
      lines: lines,
      nextDepartures: nextDeps,
      activeAlerts: [],
      departures: stop.departures || [],
      status_notice: stop.status_notice,
      has_realtime: stop.has_realtime,
    };
  });

  // Filter vehicles within proximity
  const vehicleRadius = Math.max(radiusMeters, 4000);
  const nearbyVehiclesList: NearbyVehicleItem[] = [];

  for (const v of liveVehicles) {
    if (!v.lat || !v.lon) continue;
    const vDist = Math.round(calculateDistanceMeters(userLat, userLon, v.lat, v.lon));
    if (vDist <= vehicleRadius) {
      nearbyVehiclesList.push({
        id: v.id,
        vehicleId: v.id,
        agencyId: v.operator.toLowerCase().replace(/\s+/g, '_'),
        agencyName: v.operator,
        lineCode: v.line_id || 'BUS',
        lineName: `Carreira ${v.line_id}`,
        lineColor: '#0284c7',
        latitude: v.lat,
        longitude: v.lon,
        distanceMeters: vDist,
        formattedDistance: vDist >= 1000 ? `${(vDist / 1000).toFixed(1)} km` : `${vDist} m`,
        bearing: v.bearing,
        speed: v.speed,
        currentStatus: v.speed && v.speed > 5 ? 'Em circulação' : 'Parado',
        statusLabel: v.speed && v.speed > 5 ? 'Em circulação' : 'Parado',
        lastUpdated: String(v.timestamp || ''),
        isRealtime: true,
        etaDescription: 'Em direto',
        hasLiveEta: false,
      });
    }
  }

  mappedStops.sort((a, b) => a.distanceMeters - b.distanceMeters);
  nearbyVehiclesList.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    stops: mappedStops,
    vehicles: nearbyVehiclesList,
    alerts: allAlerts.slice(0, 10),
    radiusMeters,
    timestamp: new Date().toISOString(),
  };
}

// ========================================================
// 2. DESTINATION SEARCH / "PARA ONDE?" (FROM REAL DATABASE)
// ========================================================

export async function searchDestinationSuggestions(
  query: string,
  userLat?: number,
  userLon?: number
): Promise<DestinationSuggestion[]> {
  const cleanQ = (query || '').trim().toLowerCase();
  if (cleanQ.length < 2) return [];

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const placesUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:pt&language=pt&key=${apiKey}${userLat && userLon ? `&location=${userLat},${userLon}&radius=30000` : ''}`;
      const res = await fetch(placesUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.predictions && Array.isArray(data.predictions)) {
          const suggestions: DestinationSuggestion[] = [];
          for (const pred of data.predictions.slice(0, 5)) {
            const geoUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=geometry&key=${apiKey}`;
            const geoRes = await fetch(geoUrl);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData.result?.geometry?.location) {
                const lat = geoData.result.geometry.location.lat;
                const lon = geoData.result.geometry.location.lng;
                const dist = userLat && userLon ? calculateDistanceMeters(userLat, userLon, lat, lon) : undefined;
                suggestions.push({
                  id: `gplace-${pred.place_id}`,
                  title: pred.structured_formatting?.main_text || pred.description,
                  subtitle: pred.structured_formatting?.secondary_text || 'Portugal',
                  latitude: lat,
                  longitude: lon,
                  type: 'PLACE',
                  distanceFromUserMeters: dist,
                });
              }
            }
          }
          if (suggestions.length > 0) {
            return suggestions;
          }
        }
      }
    } catch (err) {
      console.warn('[PAROU Destination Search] Google Places fallback:', err);
    }
  }

  return sugestoesLocais(query, userLat, userLon);
}

/** Nome de cada tipo de local (a app traduz pelo código; este texto é para as versões antigas da app) */
export const NOME_CATEGORIA: Record<string, string> = {
  aeroporto: 'Aeroporto', centro_comercial: 'Centro comercial', grande_armazem: 'Grande armazém', supermercado: 'Supermercado',
  hospital: 'Hospital', clinica: 'Clínica', centro_saude: 'Centro de saúde', universidade: 'Universidade', faculdade: 'Faculdade',
  escola: 'Escola', estadio: 'Estádio', pavilhao: 'Pavilhão', parque: 'Parque', jardim: 'Jardim', parque_aquatico: 'Parque aquático',
  marina: 'Marina', golfe: 'Golfe', reserva: 'Reserva natural', praia: 'Praia', pico: 'Pico', cabo: 'Cabo', zoo: 'Jardim zoológico',
  parque_tematico: 'Parque temático', aquario: 'Aquário', museu: 'Museu', cultura: 'Cultura', atracao: 'Atração', miradouro: 'Miradouro',
  hotel: 'Hotel', alojamento: 'Alojamento', campismo: 'Parque de campismo', castelo: 'Castelo', palacio: 'Palácio', monumento: 'Monumento',
  teatro: 'Teatro', cinema: 'Cinema', biblioteca: 'Biblioteca', mercado: 'Mercado', camara: 'Câmara municipal', tribunal: 'Tribunal',
  policia: 'Polícia', bombeiros: 'Bombeiros', correios: 'Correios', terminal_autocarros: 'Terminal de autocarros',
  terminal_fluvial: 'Terminal fluvial', embaixada: 'Embaixada', servico_publico: 'Serviço público', igreja: 'Igreja',
  cidade: 'Cidade', vila: 'Vila', aldeia: 'Aldeia', bairro: 'Bairro', localidade: 'Localidade', ilha: 'Ilha', praca: 'Praça', rua: 'Rua',
  loja: 'Loja', estacao: 'Estação', paragem: 'Paragem', morada: 'Morada',
};
const LOCALIDADE = new Set(['cidade', 'vila', 'aldeia', 'bairro', 'localidade', 'ilha']);

/** Importância de uma paragem na pesquisa: estações de metro, comboio e barco valem mais do que uma paragem de autocarro */
function importanciaParagem(classe: string, estacao: boolean): number {
  if (classe === 'metro' || classe === 'comboio') return estacao ? 0.62 : 0.58;
  if (classe === 'barco') return 0.52;
  return estacao ? 0.3 : 0.14;
}
function classeDoFeed(modo: string): string {
  const m = String(modo || '').toLowerCase();
  if (/autocarro|trólecar/.test(m)) return 'autocarro';
  if (m.includes('metro')) return 'metro';
  if (m.includes('comboio')) return 'comboio';
  if (m.includes('barco')) return 'barco';
  return 'autocarro';
}
let feedsCache: { t: number; m: Map<string, { nome: string; classe: string }> } | null = null;
function feedsDaPesquisa() {
  if (feedsCache && Date.now() - feedsCache.t < 10 * 60_000) return feedsCache.m;
  const m = new Map<string, { nome: string; classe: string }>();
  try {
    for (const f of getAllFeeds() as any[]) m.set(String(f.id), { nome: String(f.operator_name || f.id), classe: classeDoFeed(f.mode) });
  } catch { /* base a carregar */ }
  if (m.size) feedsCache = { t: Date.now(), m };
  return m;
}
/**
 * Aeroportos: no mapa (OpenStreetMap) o ponto do aeroporto fica no meio das pistas, a 1–3 km da aerogare (Lisboa, Porto).
 * Para ir lá de transportes interessa a entrada: usa-se a paragem com "Aeroporto" no nome mais perto, a estação de metro ou
 * comboio primeiro (Lisboa e Porto: metro Aeroporto, à porta do terminal), senão a paragem de autocarro.
 */
const pontoDoAeroporto = new Map<string, { lat: number; lon: number } | null>();
function entradaDoAeroporto(chave: string, lat: number, lon: number): { lat: number; lon: number } | null {
  if (pontoDoAeroporto.has(chave)) return pontoDoAeroporto.get(chave)!;
  let melhor: { lat: number; lon: number; ordem: number } | null = null;
  try {
    const dLat = 0.036, dLon = 0.036 / Math.cos((lat * Math.PI) / 180);
    const rows = getDatabase().prepare(
      `SELECT stop_lat AS lat, stop_lon AS lon, stop_name AS nome, feed_id AS feed FROM stops
       WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?`,
    ).all(lat - dLat, lat + dLat, lon - dLon, lon + dLon) as Array<{ lat: number; lon: number; nome: string; feed: string }>;
    const feeds = feedsDaPesquisa();
    for (const r of rows) {
      if (!/aeroporto|airport|aerogare/i.test(String(r.nome || ''))) continue;
      const d = Math.hypot((r.lat - lat) * 111_000, (r.lon - lon) * 111_000 * Math.cos((lat * Math.PI) / 180));
      if (d > 4000) continue;
      const classe = feeds.get(String(r.feed))?.classe || 'autocarro';
      // metro e comboio à frente (+10 km), depois o mais perto do ponto do aeroporto
      const ordem = d + (classe === 'metro' || classe === 'comboio' ? 0 : 10_000);
      if (!melhor || ordem < melhor.ordem) melhor = { lat: r.lat, lon: r.lon, ordem };
    }
  } catch { /* base a carregar: fica o ponto do mapa */ }
  const res = melhor ? { lat: melhor.lat, lon: melhor.lon } : null;
  if (melhor || pontoDoAeroporto.size < 200) pontoDoAeroporto.set(chave, res);
  return res;
}

const nomeOperadorCurto = (nome: string) => nome.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^Comboios de Portugal$/i, 'CP').trim();

/**
 * Sugestões de destino: locais (centros comerciais, hospitais, praias, ruas…), estações e paragens, pela mesma pontuação
 * (texto + importância + distância). Moradas com número de porta e pesquisas sem resultados bons vão também ao Photon
 * (OpenStreetMap), com pouco tempo de espera.
 */
export async function sugestoesLocais(query: string, userLat?: number, userLon?: number, max = 8): Promise<DestinationSuggestion[]> {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const comLocal = Number.isFinite(userLat) && Number.isFinite(userLon) && !(userLat === 0 && userLon === 0);
  const qNorm = normalizarParaPesquisa(q);
  const palavras = palavrasDaPesquisa(q);
  const pareceMorada = /\d/.test(q) || /\b(rua|r\.|av\.?|avenida|praceta|pra[cç]a|largo|travessa|tv\.?|estrada|alameda|beco|cal[cç]ada|urbaniza[cç][aã]o)\b/i.test(q);
  const comNumero = /\b\d{1,4}[a-z]?\b/i.test(q) && pareceMorada;

  type Cand = DestinationSuggestion & { _pontos: number; _texto: number; _norm: string };
  const cands: Cand[] = [];

  // 1. Locais do OpenStreetMap (na base)
  for (const l of procurarLocais(q, userLat, userLon, 14)) {
    const nomeCat = NOME_CATEGORIA[l.cat] || '';
    const entrada = l.cat === 'aeroporto' ? entradaDoAeroporto(`${l.nome}|${l.lat}|${l.lon}`, l.lat, l.lon) : null;
    cands.push({
      id: `local-${l.id}`,
      title: l.nome,
      subtitle: [nomeCat, l.sitio].filter(Boolean).join(' · ') || 'Portugal',
      latitude: entrada?.lat ?? l.lat, longitude: entrada?.lon ?? l.lon,
      type: LOCALIDADE.has(l.cat) ? 'CITY' : 'PLACE',
      category: l.cat, place: l.sitio || undefined,
      distanceFromUserMeters: l.distancia !== undefined ? Math.round(l.distancia) : undefined,
      _pontos: l.pontos, _texto: l.texto, _norm: normalizarParaPesquisa(l.nome),
    });
  }

  // 2. Estações e paragens: o mesmo nome a poucos metros (um poste por sentido, vários operadores) fica uma só
  const feeds = feedsDaPesquisa();
  const grupos: Array<{ c: Cand; lat: number; lon: number; ops: string[]; classe: string }> = [];
  for (const s of procurarParagens(q, userLat, userLon, 400)) {
    const norm = normalizarParaPesquisa(s.stop_name);
    const f = feeds.get(String(s.feed_id));
    const classe = f?.classe || 'autocarro';
    const estacao = s.location_type === 1;
    let texto = correspondencia(qNorm, palavras, norm);
    if (texto <= 0) texto = 0.4;
    const imp = importanciaParagem(classe, estacao);
    const pontos = pontuar(texto, imp, s.distancia) + (norm === qNorm ? 0.25 : 0); // o nome é exatamente o que se escreveu
    const op = nomeOperadorCurto(f?.nome || String(s.feed_id).replace(/_/g, ' ').toUpperCase());
    const g = grupos.find((x) => x.c._norm === norm && Math.abs(x.lat - s.stop_lat) < 0.004 && Math.abs(x.lon - s.stop_lon) < 0.005);
    if (g) {
      if (!g.ops.includes(op)) g.ops.push(op);
      if (pontos > g.c._pontos) { g.c._pontos = pontos; g.classe = classe; }
      continue;
    }
    if (grupos.length >= 120) continue;
    const ferroviaria = classe === 'metro' || classe === 'comboio' || classe === 'barco';
    grupos.push({
      lat: s.stop_lat, lon: s.stop_lon, ops: [op], classe,
      c: {
        id: `stop-${s.stop_id}`,
        title: s.stop_name,
        subtitle: '',
        latitude: s.stop_lat, longitude: s.stop_lon,
        type: estacao || ferroviaria ? 'STATION' : 'PLACE',
        category: estacao || ferroviaria ? 'estacao' : 'paragem',
        distanceFromUserMeters: comLocal && s.distancia !== undefined ? Math.round(s.distancia) : undefined,
        _pontos: pontos, _texto: texto, _norm: norm,
      },
    });
  }
  for (const g of grupos) {
    // Estação servida por vários operadores (metro, comboio, autocarros): é um nó de transportes, das mais procuradas
    if (g.ops.length >= 2 && (g.classe === 'metro' || g.classe === 'comboio' || g.classe === 'barco')) g.c._pontos += 0.12;
    g.c.place = g.ops.slice(0, 3).join(' · ');
    g.c.subtitle = `${NOME_CATEGORIA[g.c.category as string]} · ${g.c.place}`;
    cands.push(g.c);
  }

  // 3. Moradas (Photon): números de porta, ou quando o resto não encontrou nada parecido com o que se escreveu
  const bons = cands.filter((c) => c._texto >= 0.68).length;
  if (comNumero || bons < 3) {
    const moradas = await procurarMoradas(q, userLat, userLon, comNumero ? 2500 : 1500);
    for (const m of moradas) {
      const norm = normalizarParaPesquisa(m.title);
      let texto = correspondencia(qNorm, palavras, norm);
      if (texto <= 0) texto = comNumero ? 0.7 : 0.35; // o Photon encontra variações que a comparação simples não apanha
      const imp = comNumero && /\d/.test(m.title) ? 0.55 : 0.12;
      cands.push({ ...m, category: 'morada', place: m.subtitle, _texto: texto, _norm: norm, _pontos: pontuar(texto, imp, m.distanceFromUserMeters) });
    }
  }

  // 4. Ordem final, sem repetir o mesmo sítio (o mesmo nome a menos de ~400 m)
  cands.sort((a, b) => b._pontos - a._pontos);
  const finais: Cand[] = [];
  for (const c of cands) {
    if (finais.some((f) => f._norm === c._norm && Math.abs(f.latitude - c.latitude) < 0.004 && Math.abs(f.longitude - c.longitude) < 0.005)) continue;
    finais.push(c);
    if (finais.length >= max) break;
  }
  return finais.map(({ _pontos, _texto, _norm, ...resto }) => resto);
}

// ---------------------------------------------------------------------------
// Moradas: Photon (OpenStreetMap, feito para pesquisa enquanto se escreve). Resultados só de
// Portugal, perto de quem pesquisa primeiro, com cache de 30 min e limite de tempo de 4 s.
// ---------------------------------------------------------------------------
const cacheMoradas = new Map<string, { quando: number; dados: DestinationSuggestion[] }>();
async function procurarMoradas(query: string, userLat?: number, userLon?: number, limiteMs = 4000): Promise<DestinationSuggestion[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return [];
  const zona = userLat && userLon ? `${userLat.toFixed(1)},${userLon.toFixed(1)}` : '';
  const chave = `${q.toLowerCase()}|${zona}`;
  const guardado = cacheMoradas.get(chave);
  if (guardado && Date.now() - guardado.quando < 30 * 60_000) return guardado.dados;
  try {
    const params = new URLSearchParams({ q, limit: '12' });
    if (userLat && userLon) { params.set('lat', String(userLat)); params.set('lon', String(userLon)); params.set('location_bias_scale', '0.3'); }
    // Portugal continental e ilhas
    params.set('bbox', '-31.6,32.3,-6.1,42.2');
    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      headers: { 'User-Agent': 'PAROU.PT/1.0 (https://parou.pt)', Accept: 'application/json' },
      signal: AbortSignal.timeout(limiteMs),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const vistos = new Set<string>();
    const dados: DestinationSuggestion[] = [];
    for (const f of json?.features || []) {
      const p = f?.properties || {};
      const [lon, lat] = f?.geometry?.coordinates || [];
      if (p.countrycode && p.countrycode !== 'PT') continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const rua = p.street || (p.type === 'street' ? p.name : '');
      let titulo = '';
      if (p.housenumber && rua) titulo = `${rua} ${p.housenumber}`;
      else if (p.name) titulo = p.name;
      else if (rua) titulo = rua;
      if (!titulo) continue;
      // Pesquisou um número de porta e só há a rua: mostra o número pedido (fica perto o suficiente)
      const numeroPedido = q.match(/\b(\d{1,4}[a-z]?)\s*$/i)?.[1];
      if (numeroPedido && p.type === 'street' && !p.housenumber) titulo = `${titulo} ${numeroPedido}`;
      const sitio = [p.locality || p.district, p.city || p.county].filter(Boolean)
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i && v !== titulo);
      const subtitulo = [...sitio, p.postcode].filter(Boolean).join(' · ') || 'Portugal';
      const unico = `${titulo.toLowerCase()}|${(p.city || p.county || '').toLowerCase()}`;
      if (vistos.has(unico)) continue;
      vistos.add(unico);
      const eLocalidade = p.osm_key === 'place' && ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'quarter'].includes(p.osm_value);
      dados.push({
        id: `osm-${p.osm_type || ''}${p.osm_id || dados.length}`,
        title: titulo,
        subtitle: subtitulo,
        latitude: lat,
        longitude: lon,
        type: eLocalidade ? 'CITY' : 'PLACE',
        distanceFromUserMeters: userLat && userLon ? Math.round(calculateDistanceMeters(userLat, userLon, lat, lon)) : undefined,
      });
      if (dados.length >= 8) break;
    }
    if (cacheMoradas.size > 2000) cacheMoradas.clear();
    cacheMoradas.set(chave, { quando: Date.now(), dados });
    return dados;
  } catch {
    return [];
  }
}

// (O planeador de viagens está em ./planeador.ts: percursos reais com os horários da base.)
