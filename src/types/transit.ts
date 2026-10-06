export type TransitTransportMode = 'Autocarro' | 'Metro' | 'Comboio' | 'Barco' | 'Elétrico' | 'Funicular';

export type TransitDataClassification = 'Programado' | 'Tempo Real' | 'Alerta Oficial';

export type TransitServiceStatus = 'Normal' | 'Atrasado' | 'Perturbado' | 'Interrompido' | 'Sem Informação';

export interface TransitStopItem {
  id: string;
  name: string;
  sequence: number;
  locality?: string;
  municipality?: string;
  scheduled_time?: string; // HH:mm
  arrival_time?: string; // HH:mm
  offset_minutes?: number; // Minutes from departure at stop 1
  realtime_eta_minutes?: number;
}

export interface TransitDepartureItem {
  time: string; // HH:mm
  scheduled_time: string; // HH:mm
  is_realtime: boolean;
  delay_minutes?: number; // e.g. +3, -1
  vehicle_id?: string;
  trip_id?: string;
  service_id?: string;
  direction_id?: number | string;
  headsign?: string;
  stop_id?: string;
  status: 'No Horário' | 'Atrasado' | 'Adiantado' | 'Cancelado' | 'Desconhecido';
  aviso_horario?: string;
}

export interface GtfsCalendarRecord {
  service_id: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  start_date: string; // YYYYMMDD
  end_date: string; // YYYYMMDD
}

export interface GtfsCalendarDateException {
  service_id: string;
  date: string; // YYYYMMDD
  exception_type: 1 | 2; // 1 = added, 2 = removed
}

export interface GtfsAuditFeedReport {
  operator_id: string;
  operator_name: string;
  source_id: string;
  routes_count: number;
  trips_count: number;
  stop_times_count: number;
  valid_departures_count: number;
  duplicate_departures_count: number;
  orphan_trip_ids: number;
  orphan_stop_ids: number;
  invalid_service_ids: number;
  impossible_times_count: number;
  artificial_sequences_detected: boolean;
  calendar_rules_count: number;
  calendar_exceptions_count: number;
  status: 'Aprovado' | 'Rejeitado' | 'Aviso';
  audit_timestamp: string;
  sample_valid_trips: Array<{
    trip_id: string;
    route_code: string;
    departure_time: string;
    destination: string;
    service_id: string;
  }>;
}

export interface GtfsGlobalAuditReport {
  total_feeds: number;
  approved_feeds: number;
  rejected_feeds: number;
  total_routes: number;
  total_trips: number;
  total_stop_times: number;
  total_valid_departures: number;
  total_duplicates: number;
  total_artificial_sequences: number;
  feeds: GtfsAuditFeedReport[];
  timestamp: string;
}

export interface TransitVehiclePosition {
  vehicle_id: string;
  agency_id?: string;
  agency_name?: string;
  line_code?: string;
  line_name?: string;
  line_color?: string;
  line_text_color?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number; // km/h
  current_status?: string;
  trip_id?: string;
  stop_id?: string;
  stop_name?: string;
  eta_seconds?: number;
  eta_at?: number;
  timestamp: string;
}

export interface TransitOfficialAlert {
  id: string;
  title: string;
  description: string;
  cause?: string;
  effect?: string;
  severity: 'info' | 'warning' | 'severe';
  url?: string;
  published_at?: string;
  affected_routes?: string[];
  affected_stops?: string[];
}

export interface NormalizedTransitService {
  id: string;
  line_code: string;
  line_name: string;
  operator_id: string;
  operator_name: string;
  transport_mode: TransitTransportMode;
  region: string;
  municipalities: string[];
  origin: string;
  destination: string;
  direction: 'Ida' | 'Volta' | 'Circular';
  color?: string;
  text_color?: string;
  frequency_minutes?: number;
  duration_estimate_minutes?: number;
  service_status: TransitServiceStatus;
  status_message?: string;
  
  // Stops sequence
  stops: TransitStopItem[];
  
  // Departures (strictly distinguishing scheduled vs realtime)
  next_departure?: TransitDepartureItem;
  upcoming_departures: TransitDepartureItem[];
  
  // Realtime info (ONLY if verified technical feed exists)
  realtime_info?: {
    has_realtime: boolean;
    source_format: 'GTFS-RT' | 'API' | 'SIRI';
    delay_minutes?: number;
    eta_minutes?: number;
    trip_status?: 'Em circulação' | 'Atrasado' | 'Cancelado' | 'Desvio de rota';
    active_vehicles?: TransitVehiclePosition[];
    last_ping?: string;
  };

  // Official Alerts from operator
  alerts: TransitOfficialAlert[];
  
  // Data classification tag
  data_classification: TransitDataClassification;
  
  // Source metadata
  source_id: string;
  source_url: string;
  last_updated: string;
}

export interface TransitSearchQuery {
  query?: string;
  origin?: string;
  destination?: string;
  stop?: string;
  operator?: string;
  line?: string;
  transport_mode?: string;
  region?: string;
  municipality?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  only_realtime?: boolean;
}

export interface TransitSourceRegistryEntry {
  source_id: string;
  id?: string;
  operator: string;
  operador?: string;
  region: string;
  região?: string;
  modes: TransitTransportMode[];
  modos?: TransitTransportMode[];
  source_url: string;
  url?: string;
  source_type: 'GTFS' | 'GTFS-RT' | 'API' | 'SIRI' | 'NeTEx' | 'RSS' | 'Página Oficial';
  tipo?: 'GTFS' | 'GTFS-RT' | 'API' | 'SIRI' | 'NeTEx' | 'RSS' | 'Página Oficial';
  realtime_available: boolean;
  realtime?: boolean;
  alerts_available: boolean;
  alerts?: boolean;
  auth_required: boolean;
  sync_status: 'Online' | 'Offline' | 'Fonte em falta' | 'Horário expirado' | 'Erro HTTP' | 'Degradado' | 'Pendente';
  status?: string;
  last_update: string;
  last_sync?: string;
  records_count: number;
  last_error?: string | null;
  error?: string | null;

  // Detailed source metrics & audit
  imported_lines: number;
  imported_stops: number;
  imported_trips: number;
  validity_start?: string;
  validity_end?: string;
  received_vehicles: number;
  presented_vehicles: number;
  received_alerts: number;
  discard_reasons?: string[];
}

// -------------------------------------------------------------
// NORMALIZED PAROU TRANSIT DATA MODELS
// Operator, Route, Trip, Stop, StopTime, Vehicle, VehiclePosition, ETA, ServiceAlert
// -------------------------------------------------------------

export interface ParouOperator {
  id: string; // e.g. "metrolisboa", "cp", "carris", "carris_metropolitana"
  source_id: string;
  original_id: string;
  name: string;
  url: string;
  timezone: string;
  phone?: string;
  lang?: string;
}

export interface ParouRoute {
  id: string;
  source_id: string;
  original_id: string;
  operator_id: string;
  operator_name: string;
  short_name: string;
  long_name: string;
  type: TransitTransportMode;
  color?: string;
  text_color?: string;
  region: string;
  municipalities: string[];
}

export interface ParouTrip {
  id: string;
  source_id: string;
  original_id: string;
  route_id: string;
  service_id: string;
  headsign: string;
  direction_id: 0 | 1;
  block_id?: string;
  wheelchair_accessible?: number;
}

export interface ParouStop {
  id: string;
  source_id: string;
  original_id: string;
  name: string;
  lat: number;
  lon: number;
  zone_id?: string;
  url?: string;
  location_type?: number;
  parent_station?: string;
  wheelchair_boarding?: number;
  locality?: string;
  district?: string;
}

export interface ParouStopTime {
  trip_id: string;
  stop_id: string;
  arrival_time: string; // HH:mm:ss (or >24h)
  departure_time: string; // HH:mm:ss (or >24h)
  arrival_secs: number; // seconds from midnight
  departure_secs: number; // seconds from midnight
  stop_sequence: number;
  stop_headsign?: string;
  pickup_type?: number;
  drop_off_type?: number;
}

export interface ParouVehicle {
  id: string;
  source_id: string;
  label?: string;
  license_plate?: string;
}

export interface ParouVehiclePosition {
  vehicle_id: string;
  source_id: string;
  trip_id?: string;
  route_id?: string;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
  current_status?: string;
  stop_id?: string;
  timestamp: string;
}

export interface ParouETA {
  trip_id: string;
  stop_id: string;
  eta_seconds?: number;
  eta_time?: string;
  is_realtime: boolean;
  delay_minutes?: number;
  status: 'No Horário' | 'Atrasado' | 'Adiantado' | 'Cancelado' | 'Desconhecido';
}

export interface ParouServiceAlert {
  id: string;
  source_id: string;
  cause?: string;
  effect?: string;
  header_text: string;
  description_text: string;
  severity: 'info' | 'warning' | 'severe';
  active_period?: { start?: string; end?: string };
  informed_routes?: string[];
  informed_stops?: string[];
}

export interface DiscoveredOperator {
  operator_id: string;
  operator_name: string;
  authority: string;
  region: string;
  municipalities: string[];
  transport_types: TransitTransportMode[];
  official_url: string;
  data_url: string;
  source_type: 'GTFS' | 'GTFS-RT' | 'SIRI' | 'NeTEx' | 'REST_API' | 'RSS' | 'OFFICIAL_PAGE';
  gtfs_available: boolean;
  gtfs_rt_available: boolean;
  siri_available: boolean;
  netex_available: boolean;
  api_available: boolean;
  realtime_available: boolean;
  alerts_available: boolean;
  last_checked: string;
  last_successful_sync: string | null;
  validation_status: 'valid' | 'invalid' | 'pending';
  sync_status: 'synced' | 'degraded' | 'error' | 'idle';
  error?: string | null;
  routes_count?: number;
  stops_count?: number;
  active_vehicles_count?: number;
}

export interface DiscoveredSource {
  id: string;
  name: string;
  portal_name: 'NAP_IMT' | 'IMT_CONCESSIONS' | 'TML_GO_HUB' | 'PORTO_DIGITAL' | 'OPERATOR_DIRECT';
  url: string;
  format: 'GTFS' | 'GTFS-RT' | 'SIRI' | 'NeTEx' | 'REST_API' | 'RSS' | 'OFFICIAL_PAGE';
  priority: number; // 1 (highest) to 8
  is_valid: boolean;
  last_probed: string;
  error?: string | null;
}

export interface OperatorAuditItem {
  operator: string;
  operator_id: string;
  source: string;
  authority: string;
  region: string;
  vehicles_received: number;
  vehicles_displayed: number;
  routes: number;
  stops: number;
  realtime: boolean;
  eta: boolean;
  alerts: boolean;
  last_update: string;
  error: string | null;
  discard_reason?: string | null;
}

export interface NationalAggregatorDiagnosticReport {
  total_operators_discovered: number;
  total_sources_discovered: number;
  sources_valid: number;
  sources_error: number;
  operators_with_gtfs: number;
  operators_with_realtime: number;
  operators_with_eta: number;
  vehicles_realtime_received: number;
  vehicles_realtime_displayed: number;
  routes_imported: number;
  stops_imported: number;
  last_sync: string;
  operators_audit: OperatorAuditItem[];
}

export interface RouteAvailabilityAuditEntry {
  operator: string;
  route: string;
  route_id: string;
  direction: string;
  direction_id: number;
  date: string;
  active_service_ids: string[];
  valid_trips: number;
  valid_departures: number;
  next_departure?: string;
  status: 'Ativo' | 'Sem serviço hoje' | 'Sem viagens' | 'Aviso';
  ui_status: 'Normal' | 'Sem Informação' | 'Interrompido';
  discrepancy?: string;
}

export interface GlobalAvailabilityAuditReport {
  timestamp: string;
  date: string;
  day_of_week: number;
  total_operators_audited: number;
  total_routes_audited: number;
  active_routes_count: number;
  routes_without_trips_today: number;
  anomalies_detected: {
    routes_with_zero_trips: number;
    routes_with_invalid_service_id: number;
    trips_outside_calendar: number;
    incorrect_calendar_dates: number;
    stop_times_without_trip: number;
    trips_without_stop_times: number;
    duplicate_departures: number;
    artificially_generated_departures: number;
    lines_incorrectly_marked_out_of_service: number;
    lines_without_trips_showing_departures: number;
  };
  sample_routes: RouteAvailabilityAuditEntry[];
  verdict: 'Passou' | 'Falhou';
}
