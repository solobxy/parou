import { TransportMode } from './index';

export type FavoriteCategory = 'transportes' | 'paragens' | 'rotas' | 'locais';

export type FavoriteType =
  | 'operador'
  | 'linha'
  | 'transporte'
  | 'paragem'
  | 'estacao'
  | 'rota'
  | 'local'
  | 'destino'
  | 'regiao'
  | 'cidade';

export interface FavoriteItem {
  id: string; // Deterministic unique id, e.g. "op-carris-metropolitana", "line-ml-azul", "stop-ml-mp", "route-cais-belem", "place-rossio", "city-porto"
  type: FavoriteType;
  category: FavoriteCategory;
  title: string;
  subtitle?: string;
  // Operator / Transit line metadata
  operatorId?: string;
  operatorName?: string;
  lineCode?: string;
  lineName?: string;
  lineColor?: string;
  transportMode?: TransportMode;
  // Geo coordinates
  latitude?: number;
  longitude?: number;
  locality?: string;
  district?: string;
  // Route metadata
  routeOrigin?: string;
  routeDestination?: string;
  routeOriginCoords?: { lat: number; lon: number };
  routeDestCoords?: { lat: number; lon: number };
  estimatedMinutes?: number;
  // Timestamps
  addedAt: number;
  updatedAt?: number;
}

export interface FavoriteLiveStatus {
  id: string;
  isRealtime: boolean;
  status: 'Normal' | 'Atrasos' | 'Perturbação' | 'Interrompido' | 'Indisponível';
  nextDepartureTime?: string;
  etaMinutes?: number;
  /** A partida real (da linha perto de ti), para formatar como nas outras listas */
  nextDeparture?: { time: string; state?: string; countdown_minutes?: number; displayText?: string; stop_name?: string };
  /** Paragem de onde sai a próxima partida */
  stopName?: string;
  delayMinutes?: number;
  statusDescription?: string;
  activeAlertsCount: number;
  alertsSummary?: string[];
  lastUpdated: string;
}
