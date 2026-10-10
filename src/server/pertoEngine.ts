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
import { searchStopsInDb, getDatabase } from './db/gtfsDatabase';

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
          frequencyMinutes: 10,
        }))
      : nextDeps.map((d) => ({
          code: d.lineCode,
          name: d.lineName,
          color: d.lineColor,
          destination: d.destination,
          frequencyMinutes: 10,
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

  // Moradas, ruas e locais (OpenStreetMap, via Photon) em paralelo com as paragens da base
  const pedidoMoradas = procurarMoradas(query, userLat, userLon);

  // Search real stops in SQLite database
  const dbStops = searchStopsInDb(cleanQ, 20);
  const results: DestinationSuggestion[] = dbStops.map((s) => {
    const dist = userLat && userLon && s.stop_lat && s.stop_lon
      ? Math.round(calculateDistanceMeters(userLat, userLon, s.stop_lat, s.stop_lon))
      : undefined;

    return {
      id: `stop-${s.stop_id}`,
      title: s.stop_name,
      subtitle: `${s.feed_id.toUpperCase()} • Portugal`,
      latitude: s.stop_lat,
      longitude: s.stop_lon,
      type: s.location_type === 1 ? 'STATION' : 'PLACE',
      distanceFromUserMeters: dist,
    };
  });

  if (userLat && userLon) {
    results.sort((a, b) => (a.distanceFromUserMeters || 999999) - (b.distanceFromUserMeters || 999999));
  }

  const moradas = await pedidoMoradas;
  if (!moradas.length) return results.slice(0, 10);
  // Se a pesquisa tem cara de morada (número, "rua", "av."…), as moradas vêm primeiro; senão alternam
  const pareceMorada = /\d|\b(rua|r\.|av\.?|avenida|praceta|pra[cç]a|largo|travessa|tv\.?|estrada|alameda|beco|calçada|cal[cç]\.|urbaniza[cç][aã]o|bairro|lugar)\b/i.test(query);
  const paragens = results.slice(0, pareceMorada ? 4 : 6);
  const misturado: DestinationSuggestion[] = pareceMorada
    ? [...moradas.slice(0, 6), ...paragens]
    : [...moradas.slice(0, 3), ...paragens, ...moradas.slice(3, 5)];
  return misturado.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Moradas: Photon (OpenStreetMap, feito para pesquisa enquanto se escreve). Resultados só de
// Portugal, perto de quem pesquisa primeiro, com cache de 30 min e limite de tempo de 4 s.
// ---------------------------------------------------------------------------
const cacheMoradas = new Map<string, { quando: number; dados: DestinationSuggestion[] }>();
async function procurarMoradas(query: string, userLat?: number, userLon?: number): Promise<DestinationSuggestion[]> {
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
      signal: AbortSignal.timeout(4000),
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
