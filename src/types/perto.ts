import { TransportMode } from './index';
import { CentralAlert } from './alerts';

export interface NextDeparture {
  lineCode: string;
  lineName: string;
  lineColor: string;
  destination: string;
  operatorName: string;
  operatorId: string;
  transportMode: TransportMode;
  departureTime: string; // e.g. "14:32" or "Em 4 min"
  etaMinutes: number;
  isRealtime: boolean; // true = Realtime feed; false = Programado
  statusDescription: string; // "Em circulação ao vivo", "No horário programado", "+4 min de atraso"
  vehicleId?: string;
  aviso_horario?: string;
  dep_epoch_secs?: number;
  realtime_epoch_secs?: number;
}

export interface NearbyStopItem {
  id: string;
  name: string;
  operatorId: string;
  operatorName: string;
  transportMode: 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Elétrico';
  latitude: number;
  longitude: number;
  locality: string;
  district: string;
  distanceMeters: number;
  formattedDistance: string; // "120 m" or "1.4 km"
  walkingMinutes: number;
  lines: Array<{
    code: string;
    name: string;
    color: string;
    destination: string;
    frequencyMinutes: number;
  }>;
  nextDepartures: NextDeparture[];
  activeAlerts: CentralAlert[];
  isFavorite?: boolean;
  wheelchairAccessible?: boolean;
}

export interface NearbyVehicleItem {
  id: string;
  vehicleId: string;
  agencyId: string;
  agencyName: string;
  lineCode: string;
  lineName?: string;
  lineColor?: string;
  destination?: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  formattedDistance: string;
  bearing?: number;
  speed?: number; // km/h
  currentStatus: string;
  statusLabel: string;
  stopName?: string;
  etaDescription: string; // "Chegada em 3 min" or "ETA indisponível"
  hasLiveEta: boolean;
  lastUpdated: string;
  isRealtime: true;
}

export interface RouteLeg {
  mode: 'WALK' | 'TRANSIT';
  instruction: string;
  transportMode?: 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Elétrico';
  lineCode?: string;
  lineName?: string;
  lineColor?: string;
  operatorName?: string;
  fromStopName?: string;
  toStopName?: string;
  stopsCount?: number;
  durationMinutes: number;
  distanceMeters?: number;
  isRealtime?: boolean;
  departureTime?: string;
  arrivalTime?: string;
}

export interface TransitRouteOption {
  id: string;
  type: 'fastest' | 'fewest_transfers' | 'least_walking';
  title: string;
  badgeLabel: string;
  totalDurationMinutes: number;
  departureTime: string;
  arrivalTime: string;
  walkingDistanceMeters: number;
  walkingMinutes: number;
  transfersCount: number;
  legs: RouteLeg[];
  realtimeStatus: 'TEMPO_REAL' | 'PROGRAMADO';
  realtimeLabel: string;
  relevantAlerts: string[];
}

export interface DestinationSuggestion {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: 'STATION' | 'STOP' | 'PLACE' | 'CITY';
  transportMode?: TransportMode;
  distanceFromUserMeters?: number;
}
