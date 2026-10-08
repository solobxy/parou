import { TransitLine, TransitFilter, ScheduleStatus, TransportMode } from '../types';
import { 
  NormalizedTransitService, 
  TransitSearchQuery, 
  TransitSourceRegistryEntry,
  NationalAggregatorDiagnosticReport,
  DiscoveredOperator,
  DiscoveredSource
} from '../types/transit';

export * from '../types/transit';
export * from './transitAudit';

/**
 * Real-world Portuguese Transit Service.
 * Strictly adheres to real data: NO fake departure times or invented delays.
 * Real data is provided by official feeds (Carris Metropolitana GTFS-RT, Metro de Lisboa, etc.).
 */

export async function searchTransitRealtime(
  params: TransitSearchQuery,
  signal?: AbortSignal
): Promise<{
  results: NormalizedTransitService[];
  total: number;
  sources_registry: TransitSourceRegistryEntry[];
  timestamp: number;
}> {
  const queryParams = new URLSearchParams();
  if (params.query) queryParams.set('query', params.query);
  if (params.origin) queryParams.set('origin', params.origin);
  if (params.destination) queryParams.set('destination', params.destination);
  if (params.stop) queryParams.set('stop', params.stop);
  if (params.operator && params.operator !== 'Todos') queryParams.set('operator', params.operator);
  if (params.line) queryParams.set('line', params.line);
  if (params.transport_mode && params.transport_mode !== 'Todos') queryParams.set('transport_mode', params.transport_mode);
  if (params.region && params.region !== 'Todas') queryParams.set('region', params.region);
  if (params.municipality && params.municipality !== 'Todos') queryParams.set('municipality', params.municipality);
  if (params.date) queryParams.set('date', params.date);
  if (params.time) queryParams.set('time', params.time);
  if (params.only_realtime) queryParams.set('only_realtime', 'true');

  const url = `/api/transit/search?${queryParams.toString()}`;

  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      const res = await fetch(url, { 
        signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!res.ok) {
        throw new Error(`Falha ao obter horários (${res.status})`);
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const text = await res.text();
        if (text.startsWith('<')) {
          console.warn('[Transit API] Resposta HTML recebida da pesquisa de horários em vez de JSON');
          return {
            results: [],
            total: 0,
            sources_registry: [],
            timestamp: Date.now(),
          };
        }
        throw new Error(`Resposta não-JSON (${res.status} ${ct})`);
      }
      return await res.json();
    } catch (err: any) {
      if (signal?.aborted || err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
        throw err;
      }
      if (attempts >= 2) {
        console.warn('[Transit API] Falha na obtenção de horários após tentativas:', err?.message);
        return {
          results: [],
          total: 0,
          sources_registry: [],
          timestamp: Date.now(),
        };
      }
      await new Promise(r => setTimeout(r, 350));
    }
  }

  return {
    results: [],
    total: 0,
    sources_registry: [],
    timestamp: Date.now(),
  };
}

export async function fetchTransitSources(): Promise<{
  sources: TransitSourceRegistryEntry[];
  total: number;
  timestamp: number;
}> {
  try {
    const res = await fetch('/api/transit/sources', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Falha ao obter registo de fontes (${res.status})`);
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { sources: [], total: 0, timestamp: Date.now() };
    }
    return await res.json();
  } catch (err) {
    console.warn('[Transit API] Erro ao carregar fontes:', err);
    return { sources: [], total: 0, timestamp: Date.now() };
  }
}

export async function fetchTransitLineDetail(id: string): Promise<NormalizedTransitService> {
  const res = await fetch(`/api/transit/line/${encodeURIComponent(id)}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Linha não encontrada (${res.status})`);
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Resposta inválida ao obter detalhes da linha (${res.status})`);
  }
  return res.json();
}

export async function fetchAvailabilityAudit(date?: string): Promise<import('../types/transit').GlobalAvailabilityAuditReport> {
  const url = date ? `/api/transit/audit/availability?date=${encodeURIComponent(date)}` : '/api/transit/audit/availability';
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Falha ao obter relatório de auditoria (${res.status})`);
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Resposta inválida ao obter auditoria (${res.status})`);
  }
  return res.json();
}

// ==========================================
// TML GO HUB API CONSUMER (OFFICIAL)
// Direct consumption of /api/transit/tml/*
// ==========================================

export interface TmlDiagnosticData {
  timestamp: string;
  agencies_received: number;
  vehicles_received: number;
  vehicles_valid: number;
  vehicles_discarded: number;
  vehicles_presented: number;
  discard_reasons: Record<string, number>;
  lines_received: number;
  stops_received: number;
  etas_received: number;
  alerts_received: number;
  api_errors: Array<{ endpoint: string; message: string; timestamp: string }>;
  agencies_summary: Array<{
    code: string;
    name: string;
    positions_enabled: boolean;
    eta_enabled: boolean;
    gtfs_enabled: boolean;
    service_alerts_enabled: boolean;
    active_vehicles_count: number;
  }>;
}

export interface TmlLiveVehicle {
  id: string;
  vehicle_id: string;
  license_plate?: string | null;
  agency_id: string;
  agency_name: string;
  line_code: string;
  line_name?: string;
  line_color?: string;
  line_text_color?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number; // km/h
  current_status: string;
  trip_id?: string;
  stop_id?: string;
  stop_name?: string;
  eta_seconds?: number;
  eta_at?: number;
  last_updated: string;
}

export async function fetchTmlDiagnostic(): Promise<TmlDiagnosticData> {
  const res = await fetch('/api/transit/tml/diagnostic');
  if (!res.ok) {
    throw new Error(`Falha ao obter diagnóstico TML (${res.status})`);
  }
  return res.json();
}

export async function fetchTmlVehicles(filters?: {
  minLat?: number;
  maxLat?: number;
  minLon?: number;
  maxLon?: number;
  agency?: string;
  line?: string;
}): Promise<{
  vehicles: TmlLiveVehicle[];
  total_received: number;
  total_valid: number;
  total_discarded: number;
  total_presented: number;
  discard_reasons: Record<string, number>;
  timestamp: string;
}> {
  const params = new URLSearchParams();
  if (filters?.minLat) params.set('minLat', String(filters.minLat));
  if (filters?.maxLat) params.set('maxLat', String(filters.maxLat));
  if (filters?.minLon) params.set('minLon', String(filters.minLon));
  if (filters?.maxLon) params.set('maxLon', String(filters.maxLon));
  if (filters?.agency && filters.agency !== 'Todos') params.set('agency', filters.agency);
  if (filters?.line) params.set('line', filters.line);

  const res = await fetch(`/api/transit/tml/vehicles?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Falha ao obter veículos realtime (${res.status})`);
  }
  return res.json();
}

export async function fetchTmlAgencies(): Promise<{ agencies: any[]; total: number }> {
  const res = await fetch('/api/transit/tml/agencies');
  if (!res.ok) {
    throw new Error(`Falha ao obter agências TML (${res.status})`);
  }
  return res.json();
}

export async function fetchTmlAlerts(): Promise<{ alerts: any[]; total: number }> {
  const res = await fetch('/api/transit/tml/alerts');
  if (!res.ok) {
    throw new Error(`Falha ao obter alertas TML (${res.status})`);
  }
  return res.json();
}

export interface UnirVehicleAuditItem {
  operador_recebido: string;
  agency_id: string;
  agency_name: string;
  route_id: string;
  route_short_name: string;
  trip_id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  posicao_recebida: boolean;
  eta_recebida: boolean;
  eta_seconds?: number;
  stop_id?: string;
  stop_name?: string;
  apresentada_no_parou: boolean;
  motivo_descarte: string | null;
}

export interface UnirDiagnosticReport {
  timestamp: string;
  operadores_unir_registados: number;
  operadores_unir: Array<{ id: string; code: string; name: string; active_vehicles: number }>;
  veiculos_recebidos: number;
  viagens_recebidas: number;
  linhas_recebidas: number;
  linha_8003_encontrada: boolean;
  linha_8006_encontrada: boolean;
  veiculos_8003: number;
  veiculos_8006: number;
  veiculos_descartados: number;
  motivo_descarte: string;
  veiculos_auditados: UnirVehicleAuditItem[];
}

export async function fetchUnirDiagnostic(): Promise<UnirDiagnosticReport> {
  const res = await fetch('/api/transit/tml/unir-diagnostic');
  if (!res.ok) {
    throw new Error(`Falha ao obter diagnóstico UNIR (${res.status})`);
  }
  return res.json();
}

export async function fetchNationalDiagnostic(): Promise<NationalAggregatorDiagnosticReport> {
  const res = await fetch('/api/transit/diagnostic/national');
  if (!res.ok) {
    throw new Error(`Falha ao obter diagnóstico nacional (${res.status})`);
  }
  return res.json();
}

export async function fetchDiscoveredOperators(): Promise<{ operators: DiscoveredOperator[]; total: number }> {
  const res = await fetch('/api/transit/discovery/operators');
  if (!res.ok) {
    throw new Error(`Falha ao obter operadores descobertos (${res.status})`);
  }
  return res.json();
}

export async function fetchDiscoveredSources(): Promise<{ sources: DiscoveredSource[]; total: number }> {
  const res = await fetch('/api/transit/discovery/sources');
  if (!res.ok) {
    throw new Error(`Falha ao obter fontes descobertas (${res.status})`);
  }
  return res.json();
}

export async function triggerDiscoverySync(): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/transit/discovery/sync', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Falha ao acionar sincronização nacional (${res.status})`);
  }
  return res.json();
}

const CITY_TO_DISTRICT: Record<string, string> = {
  lisboa: 'Lisboa',
  porto: 'Porto',
  braga: 'Braga',
  coimbra: 'Coimbra',
  setúbal: 'Setúbal',
  setubal: 'Setúbal',
  faro: 'Faro',
  aveiro: 'Aveiro',
};

// Official real Metro lines of Portugal (with real official portals, no fake minute departures)
const OFFICIAL_TRANSIT_LINES: TransitLine[] = [
  {
    id: 'ml-azul',
    code: 'Linha Azul',
    name: 'Linha da Gaivota',
    direction: 'Reboleira ↔ Santa Apolónia',
    city: 'Lisboa',
    district: 'Lisboa',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro de Lisboa',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metropolitano de Lisboa.',
    color: '#0072CE',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [], // Strictly no fake departures
  },
  {
    id: 'ml-amarela',
    code: 'Linha Amarela',
    name: 'Linha do Girassol',
    direction: 'Odivelas ↔ Rato',
    city: 'Lisboa',
    district: 'Lisboa',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro de Lisboa',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metropolitano de Lisboa.',
    color: '#F4B223',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
  {
    id: 'ml-verde',
    code: 'Linha Verde',
    name: 'Linha da Caravela',
    direction: 'Telheiras ↔ Cais do Sodré',
    city: 'Lisboa',
    district: 'Lisboa',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro de Lisboa',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metropolitano de Lisboa.',
    color: '#00843D',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
  {
    id: 'ml-vermelha',
    code: 'Linha Vermelha',
    name: 'Linha do Oriente',
    direction: 'São Sebastião ↔ Aeroporto',
    city: 'Lisboa',
    district: 'Lisboa',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro de Lisboa',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metropolitano de Lisboa.',
    color: '#DA291C',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
  {
    id: 'mp-linha-a',
    code: 'Linha A',
    name: 'Linha Azul (Metro do Porto)',
    direction: 'Estádio do Dragão ↔ Senhor de Matosinhos',
    city: 'Porto',
    district: 'Porto',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro do Porto',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metro do Porto.',
    color: '#0072CE',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
  {
    id: 'mp-linha-b',
    code: 'Linha B',
    name: 'Linha Vermelha (Metro do Porto)',
    direction: 'Estádio do Dragão ↔ Póvoa de Varzim',
    city: 'Porto',
    district: 'Porto',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro do Porto',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metro do Porto.',
    color: '#DC2626',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
  {
    id: 'mp-linha-d',
    code: 'Linha D',
    name: 'Linha Amarela (Metro do Porto)',
    direction: 'Hospital São João ↔ Santo Ovídio / Vila d’Este',
    city: 'Porto',
    district: 'Porto',
    serviceType: 'Linha de Metro / Subterrâneo',
    operator: 'Metro do Porto',
    mode: 'Metro',
    status: 'Normal',
    statusMessage: 'Consultar estado em direto no portal oficial do Metro do Porto.',
    color: '#EAB308',
    lastUpdated: 'Fonte Oficial',
    nextDepartures: [],
  },
];

export async function fetchTransitLines(filters?: Partial<TransitFilter>): Promise<TransitLine[]> {
  // If no filters or empty, return official lines catalog without fake times
  let results = [...OFFICIAL_TRANSIT_LINES];

  // Try to enrich with real Carris Metropolitana GTFS-RT alerts if available from local server
  try {
    const res = await fetch('/api/public-sources/preview');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.occurrences)) {
        // Map any real transit alerts from Carris Metropolitana into TransitLine status
        const cmAlerts = data.occurrences.filter((o: any) => o.companyOrService === 'Carris Metropolitana');
        if (cmAlerts.length > 0) {
          const cmLines: TransitLine[] = cmAlerts.slice(0, 10).map((a: any) => ({
            id: a.id,
            code: a.locationDetails || 'Alerta GTFS-RT',
            name: a.title,
            direction: a.locationDetails || 'Área Metropolitana de Lisboa',
            city: a.concelho || 'Lisboa',
            district: a.district || 'Lisboa',
            serviceType: 'Autocarros & Rodoviário',
            operator: 'Carris Metropolitana',
            mode: 'Autocarro',
            status: a.severity === 'Grave' ? 'Interrompido' : 'Atrasado',
            statusMessage: a.description,
            color: '#FBBF24',
            lastUpdated: 'GTFS-Realtime Oficial',
            nextDepartures: [],
          }));
          results = [...results, ...cmLines];
        }
      }
    }
  } catch (err) {
    // Graceful fallback: return official catalog without fake data
  }

  if (!filters) return results;

  // 1. Filter: Distrito
  if (filters.distrito && filters.distrito !== 'Todos') {
    const dLower = filters.distrito.toLowerCase().trim();
    results = results.filter((line) => {
      const lineDist = (line.district || CITY_TO_DISTRICT[line.city.toLowerCase()] || line.city).toLowerCase();
      return lineDist.includes(dLower) || dLower.includes(lineDist);
    });
  }

  // 2. Filter: Concelho
  if (filters.concelho && filters.concelho !== 'Todos') {
    const cLower = filters.concelho.toLowerCase().trim();
    results = results.filter((line) => {
      const fullText = `${line.name} ${line.code} ${line.direction} ${line.city} ${line.operator}`.toLowerCase();
      return fullText.includes(cLower) || line.city.toLowerCase() === cLower;
    });
  }

  // 3. Filter: Cidade
  const cidadeVal = filters.cidade || filters.city;
  if (cidadeVal && cidadeVal !== 'Todas') {
    const cLower = cidadeVal.toLowerCase().trim();
    results = results.filter((line) => line.city.toLowerCase() === cLower);
  }

  // 4. Filter: Operador
  const opVal = filters.operador || filters.operator;
  if (opVal && opVal !== 'Todos') {
    const opNorm = opVal.toLowerCase().trim();
    results = results.filter((line) => {
      const lineOp = line.operator.toLowerCase();
      return lineOp.includes(opNorm) || opNorm.includes(lineOp);
    });
  }

  // 5. Filter: Tipo de Transporte (Mode)
  const modeVal = filters.tipoTransporte || filters.mode;
  if (modeVal && modeVal !== 'Todos') {
    const mLower = modeVal.toLowerCase().trim();
    results = results.filter((line) => {
      if (mLower.includes('rodoviário') || mLower.includes('rodoviario')) {
        return line.mode === 'Autocarro';
      }
      return line.mode.toLowerCase().includes(mLower) || mLower.includes(line.mode.toLowerCase());
    });
  }

  // 6. Filter: Search Query
  if (filters.searchQuery && filters.searchQuery.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    results = results.filter((line) => {
      return (
        line.code.toLowerCase().includes(q) ||
        line.name.toLowerCase().includes(q) ||
        line.direction.toLowerCase().includes(q) ||
        line.operator.toLowerCase().includes(q) ||
        line.city.toLowerCase().includes(q) ||
        (line.district && line.district.toLowerCase().includes(q)) ||
        (line.statusMessage && line.statusMessage.toLowerCase().includes(q))
      );
    });
  }

  return results;
}

export async function fetchTransitLineById(id: string): Promise<TransitLine | null> {
  const all = await fetchTransitLines();
  return all.find((l) => l.id === id) || null;
}

export function inferServiceType(line: TransitLine): string {
  if (line.serviceType) return line.serviceType;
  if (line.mode === 'Metro') return 'Linha de Metro / Subterrâneo';
  if (line.mode === 'Barco') return 'Fluvial / Travessias';
  if (line.operator.includes('CP')) {
    if (line.name.includes('Intercidades') || line.name.includes('Alfa')) return 'Intercidades / Longo Curso';
    if (line.name.includes('Regional')) return 'Regional / Inter-regional';
    return 'Urbano';
  }
  if (line.operator.includes('Carris Metropolitana')) return 'Suburbano';
  return 'Urbano';
}

export function getAvailableTransitCities(): string[] {
  return ['Todas', 'Lisboa', 'Porto', 'Braga', 'Coimbra', 'Setúbal', 'Faro', 'Aveiro'];
}

export function getAvailableTransitOperators(): string[] {
  return [
    'Todos',
    'Metro de Lisboa',
    'Metro do Porto',
    'CP - Comboios de Portugal',
    'Carris',
    'STCP',
    'Fertagus',
    'Transtejo Soflusa',
    'Carris Metropolitana',
    'TUB (Braga)',
    'SMTUC (Coimbra)',
    'Próximo (Faro)',
    'AveiroBus',
  ];
}

export function getAvailableTransitModes(): { label: string; mode: string }[] {
  return [
    { label: 'Todos', mode: 'Todos' },
    { label: 'Metro', mode: 'Metro' },
    { label: 'Comboio', mode: 'Comboio' },
    { label: 'Autocarro', mode: 'Autocarro' },
    { label: 'Barco', mode: 'Barco' },
    { label: 'Elétrico', mode: 'Elétrico' },
  ];
}

// Re-export structured Portuguese Transit Operators & GTFS helpers
export {
  PORTUGAL_OPERATORS,
  getOperatorById,
  getOperatorsByCity,
  getOperatorsByRegion,
  getOperatorsByMode,
  searchOperators,
  getGtfsAgenciesCatalog
} from '../data/operatorsData';

// Re-export External Sources Integration Manager
export { externalSourcesManager } from './integration';
export type { NormalizedTransitEvent, ExternalSourceType, ExternalSourceConfig } from './integration/types';

// ==========================================
// UNIFIED LINES API CLIENT (HORÁRIOS ENGINE)
// ==========================================

export interface ApiLineItem {
  id: string;
  code: string;
  name: string;
  color: string;
  mode: string;
  operator: string;
  operator_id: string;
  feed_id: string;
  aviso_horario?: string;
  nearest_stop?: {
    id: string;
    name: string;
    distance_meters: number;
    lat: number;
    lon: number;
  };
  destinations?: string[];
  departures?: Array<{
    direction_id: number;
    destination: string;
    time: string;
    state: 'Tempo Real' | 'Programado' | 'Suprimido' | 'Sem dados';
    countdown_minutes: number;
    displayText: string;
    aviso_horario?: string;
    /** Paragem de onde parte esta partida */
    stop_name?: string;
  }>;
}

export interface ApiLineDetail extends ApiLineItem {
  directions: Array<{
    direction_id: number;
    headsign: string;
    stops: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      sequence: number;
      next_arrival?: string;
    }>;
  }>;
  vehicles: Array<{
    id: string;
    lat: number;
    lon: number;
    bearing?: number;
    speed?: number;
    timestamp?: string;
    trip_id?: string;
  }>;
}

export interface ApiStopDeparture {
  line_id: string;
  line_code: string;
  line_name: string;
  color: string;
  mode: string;
  operator: string;
  destination: string;
  scheduled_time: string;
  actual_time?: string;
  state: 'Tempo Real' | 'Programado' | 'Suprimido' | 'Sem dados';
  countdown_minutes: number;
  delay_minutes?: number;
  displayText: string;
  aviso_horario?: string;
}

export async function fetchLinesNear(
  lat: number,
  lon: number,
  radius = 500,
  signal?: AbortSignal
): Promise<{ lines: ApiLineItem[]; isLoading: boolean; message?: string }> {
  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/lines?near=${lat},${lon}&r=${radius}`, { signal: reqSignal });
  if (!res.ok) throw new Error(`Falha ao obter linhas próximas (${res.status})`);
  const data = await res.json();
  return {
    lines: data.lines || [],
    isLoading: Boolean(data.isLoading || data.status === 'loading'),
    message: data.message,
  };
}

export async function fetchLinesByIds(ids: string[], signal?: AbortSignal): Promise<ApiLineItem[]> {
  if (ids.length === 0) return [];
  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/lines?ids=${encodeURIComponent(ids.join(','))}`, { signal: reqSignal });
  if (!res.ok) throw new Error(`Falha ao obter linhas por IDs (${res.status})`);
  const data = await res.json();
  return data.lines || [];
}

export async function searchAllLines(
  q?: string,
  mode?: string,
  page = 1,
  signal?: AbortSignal
): Promise<{ lines: ApiLineItem[]; total: number; page: number; total_pages: number; isLoading?: boolean; message?: string }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (mode && mode !== 'Todos') params.set('mode', mode);
  params.set('page', String(page));
  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/lines?${params.toString()}`, { signal: reqSignal });
  if (!res.ok) throw new Error(`Falha ao pesquisar linhas (${res.status})`);
  const data = await res.json();
  return {
    lines: data.lines || [],
    total: data.total || 0,
    page: data.page || page,
    total_pages: data.total_pages || 1,
    isLoading: Boolean(data.isLoading || data.status === 'loading'),
    message: data.message,
  };
}

export async function fetchLineDetail(id: string, signal?: AbortSignal): Promise<ApiLineDetail> {
  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/lines/${encodeURIComponent(id)}`, { signal: reqSignal });
  if (!res.ok) throw new Error(`Falha ao obter detalhes da linha (${res.status})`);
  return await res.json();
}

export async function fetchStopDepartures(stopId: string, n = 5, signal?: AbortSignal): Promise<{ stop_id: string; stop_name: string; departures: ApiStopDeparture[] }> {
  const reqSignal = signal || AbortSignal.timeout(15000);
  const res = await fetch(`/api/stops/${encodeURIComponent(stopId)}/departures?n=${n}`, { signal: reqSignal });
  if (!res.ok) throw new Error(`Falha ao obter partidas da paragem (${res.status})`);
  return await res.json();
}

