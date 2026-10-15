import { TransportMode } from './index';
import { CentralAlert } from './alerts';

export interface NextDeparture {
  lineCode: string;
  lineName: string;
  lineColor: string;
  destination: string;
  operatorName: string;
  operatorId: string;
  /** Viagem, linha e paragem da partida (para abrir o percurso da linha) */
  tripId?: string;
  routeId?: string;
  stopId?: string;
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
    frequencyMinutes?: number;
  }>;
  nextDepartures: NextDeparture[];
  activeAlerts: CentralAlert[];
  /** Sentido (destinos) quando há várias paragens com o mesmo nome */
  direction?: string;
  /** Fim de linha: só chegam veículos, nada parte daqui */
  arrivalsOnly?: boolean;
  isFavorite?: boolean;
  wheelchairAccessible?: boolean;
  /** Códigos UNIR da AMP (ex. "vng:255"): as partidas são pedidas à AMP pelo telemóvel */
  unirIds?: string[];
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
  /** Para desenhar no mapa: paragens do percurso (embarque → desembarque) ou os dois extremos do troço a pé */
  pontos?: PontoRota[];
  /** Troço de transporte: o desenho da estrada (ou do carril) entre o embarque e o desembarque, em polilinha codificada; sem ele a app une as paragens em linha reta */
  caminho?: string;
}

export interface PontoRota { lat: number; lon: number; nome?: string }

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
  /** Instante (epoch em segundos) em que se chega ao fim; usado para encadear viagens (UNIR + resto) */
  chegadaEpoch?: number;
  /** Dias (0 = hoje) até a viagem sair / chegar; só vem preenchido quando não é hoje */
  departureDayOffset?: number;
  arrivalDayOffset?: number;
}

/** Ligação direta da UNIR encontrada pelo servidor (linha, sentido e paragens); a hora vem da AMP */
export interface CandidatoUnir {
  linha: string;
  nome: string;
  cor: string;
  sentido: number;
  paragens: number;
  origem: { codigo: string; nome: string; metros: number; minutos: number; lat?: number; lon?: number };
  destino: { codigo: string; nome: string; metros: number; minutos: number; lat?: number; lon?: number };
  /** Paragens imediatamente antes do destino, na mesma linha e sentido (a AMP não lista chegadas ao fim da linha) */
  anteriores?: Array<{ codigo: string; passos: number }>;
  /** Paragens da linha entre a origem e o destino, para desenhar o percurso no mapa */
  pontos?: PontoRota[];
}

/**
 * Viagem em transporte com horário (STCP, Metro, CP…) até uma paragem perto de uma paragem da UNIR e,
 * a seguir, uma linha da UNIR até ao destino. O servidor calcula a primeira parte; a hora da UNIR vem da AMP
 * (pelo telemóvel) e conta a partir do instante de chegada ao transbordo.
 */
export interface HibridaUnir {
  /** Do ponto de partida até ao transbordo (sem a parte a pé até à paragem da UNIR) */
  prefixo: TransitRouteOption;
  /** Instante (epoch, s) em que se chega ao transbordo */
  chegadaEpoch: number;
  transbordo: PontoRota;
  /** Origem = paragem da UNIR a seguir ao transbordo; destino = a que fica perto do destino final */
  candidato: CandidatoUnir;
}

/**
 * Começa na UNIR (a origem só tem paragens da UNIR perto): linha da UNIR até uma paragem onde se
 * continua em transporte. A app calcula o resto a partir de `ponto`, à hora a que a UNIR chega lá.
 */
export interface PonteUnir {
  candidato: CandidatoUnir;
  ponto: PontoRota;
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

/**
 * Duas linhas da UNIR que se cruzam (ou passam a poucos metros uma da outra): a app pede a hora das duas à AMP,
 * a segunda a contar da chegada da primeira. `a.destino` é o local onde se sai (a pé até à paragem de `b`) e
 * `b.origem` a paragem onde se entra na segunda linha.
 */
export interface DuplaUnir {
  a: CandidatoUnir;
  b: CandidatoUnir;
  transbordo: PontoRota;
}

/**
 * Três linhas da UNIR seguidas (quando nem uma nem duas chegam ao destino): a app pede as horas à AMP, cada linha
 * a contar da chegada da anterior. `transbordos[i]` é a paragem onde se entra na linha `pernas[i + 1]`.
 */
export interface CadeiaUnir {
  pernas: CandidatoUnir[];
  transbordos: PontoRota[];
}

/**
 * Combinação geral com a UNIR: [viagem normal até lá] + [uma linha da UNIR] + [o que falta, calculado a partir de onde se sai].
 * Cobre qualquer mistura (normal→UNIR, UNIR→normal, UNIR→UNIR, normal→UNIR→normal…): a app pede a hora da UNIR à AMP
 * e, se não chegar ao destino (`fim` falso), volta a perguntar ao servidor como continuar a partir de `ponto`.
 */
export interface LigacaoUnir {
  /** Do ponto de partida até onde se apanha a UNIR (já com horas); ausente quando se começa logo na UNIR */
  prefixo?: TransitRouteOption;
  /** Instante (epoch, s) em que o prefixo chega a `transbordo` */
  chegadaEpoch?: number;
  transbordo?: PontoRota;
  candidato: CandidatoUnir;
  /** Onde se sai da UNIR (se `fim`, é a paragem perto do destino final) */
  ponto: PontoRota;
  /** A linha da UNIR já chega ao destino final */
  fim: boolean;
  /** Duração total estimada (min) com horas estimadas da UNIR; só para ordenar */
  estimativa: number;
}
