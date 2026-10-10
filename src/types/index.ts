export type OccurrenceType = 
  | 'ACIDENTE'
  | 'ATRASOS'
  | 'AVARIA'
  | 'GREVE'
  | 'OBRAS'
  | 'CORTE'
  | 'SERVICO_PUBLICO';

export type SeverityLevel = 'Grave' | 'Moderada' | 'Informação';

export type VerificationStatus = 'Reportado' | 'Confirmado' | 'Em verificação' | 'Resolvido';

export type ConfidenceRating = 'Alta' | 'Média' | 'Inicial';

export interface OccurrenceSourceItem {
  name: string;
  type?: 'OFICIAL' | 'CONCESSIONARIA' | 'COMUNIDADE' | 'IMPRENSA' | 'API' | 'RSS';
  url?: string;
  isOfficial?: boolean;
  timestamp?: number;
}

export interface Occurrence {
  id: string;
  title: string;
  description: string;
  type: OccurrenceType;
  severity: SeverityLevel;
  district: string;
  concelho: string;
  locationDetails: string;
  companyOrService?: string;
  transporte?: string; // alias for companyOrService
  isPublicSource?: boolean;
  reportedAt: string; // e.g. "há 12 min"
  timestamp: number;
  updatedAt?: number; // Exact last update / confirmation timestamp
  commentsCount: number;
  imagesCount: number;
  imageUrl?: string;
  isBreaking?: boolean;
  status: 'Ativa' | 'Em resolução' | 'Resolvida' | 'Em análise' | 'Ocultada';
  verificationStatus?: VerificationStatus; // 'Reportado' | 'Confirmado' | 'Em verificação' | 'Resolvido'
  confidenceScore?: number; // 0 to 100 percentage
  confidenceLevel?: ConfidenceRating; // 'Alta' | 'Média' | 'Inicial'
  sourcesList?: OccurrenceSourceItem[]; // Provenance sources validating this alert
  upvotes?: number;
  confirmationsCount?: number;
  unconfirmedCount?: number;
  confirmedBy?: string[];
  unconfirmedBy?: string[];
  reportsCount?: number;
  reportedBy?: string[];
  isCommunityVerified?: boolean;
  authorId?: string;
  authorName?: string;
  sourceName?: string; // e.g. "Proteção Civil (ANEPC)", "Metro de Lisboa", "CP - Comboios de Portugal", "Carris Metropolitana (GTFS-RT)"
  sourceType?: 'API' | 'RSS' | 'GTFS_RT' | 'OFFICIAL_PAGE';
  sourceUrl?: string; // Link to official source or portal
  sourceFetchedAt?: number; // Exact fetch/sync timestamp
  externalId?: string; // Unique external source identifier to prevent duplicates
}

export interface UserProfile {
  userId: string;
  uid?: string;
  displayName: string;
  email: string;
  photoURL?: string;
  reputationPoints: number;
  reportsCount: number;
  badge: string;
  createdAt: number;
  pioneiro?: boolean; // conta criada até ao fim de 2026
  avatar?: import('../utils/avatarCatalogo').ConfigAvatar;
  operador?: string; // conta oficial de um operador (respostas marcadas como oficiais)
  proximaPeca?: { nome: string; falta: number } | null;
}

export interface DistrictData {
  id: string;
  name: string;
  count: number;
  center: { x: number; y: number }; // Relative coordinates for map SVG placement
  pathD?: string; // Optional custom SVG path
}

export interface FilterState {
  distrito: string;
  concelho: string;
  cidade: string;
  operador: string;
  servico: string;
  tipoTransporte: string;
  categoria: string;
  searchQuery: string;
  linha?: string;
  // Backward compatibility aliases
  transporte?: string;
  tipo?: string;
}

// Transit & Schedules Types
export type TransportMode = 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Elétrico';

export type ScheduleStatus = 'Normal' | 'Atrasado' | 'Interrompido';

export interface ScheduledDeparture {
  id: string;
  time: string; // e.g. "14:25"
  expectedTime?: string; // e.g. "14:38" if delayed
  destination: string;
  platform?: string;
  status: ScheduleStatus;
  delayMinutes?: number;
  statusDetails?: string;
}

export interface TransitLine {
  id: string;
  code: string; // e.g. "Linha Azul", "728", "U-2104"
  name: string;
  direction: string; // e.g. "Santa Apolónia ↔ Reboleira"
  city: string; // e.g. "Lisboa", "Porto", "Braga", "Coimbra", "Setúbal", "Faro", "Aveiro"
  district?: string; // e.g. "Lisboa", "Porto", "Setúbal", "Braga"
  serviceType?: string; // e.g. "Urbano", "Suburbano", "Regional", "Intercidades / Longo Curso", "Fluvial", "Expresso"
  operator: string; // e.g. "Metro de Lisboa", "Metro do Porto", "CP - Comboios de Portugal", "Carris", "STCP", "Fertagus", "Transtejo Soflusa"
  mode: TransportMode;
  status: ScheduleStatus;
  statusMessage?: string;
  nextDepartures: ScheduledDeparture[];
  frequencyMinutes?: number;
  lastUpdated?: string;
  color?: string; // Hex or theme color for line badge
}

export interface TransitFilter {
  distrito?: string;
  concelho?: string;
  city?: string;
  cidade?: string;
  operator?: string;
  operador?: string;
  service?: string;
  servico?: string;
  mode?: string;
  tipoTransporte?: string;
  status?: string;
  categoria?: string;
  searchQuery: string;
}

// ==========================================
// RECLAMAÇÕES & AVALIAÇÕES COMUNITÁRIAS
// ==========================================

export interface Complaint {
  id: string;
  title: string;
  text: string;
  companyOrService: string;
  company?: string; // alias
  serviceType?: string;
  rating?: number; // 1 a 5 estrelas (opcional)
  district: string;
  concelho?: string;
  locationDetails?: string;
  incidentDate?: string;
  timestamp: number;
  authorId?: string;
  authorName: string;
  status: 'Pública' | 'Respondida' | 'Em análise' | 'Ocultada' | 'Publicada';
  commentsCount: number;
  upvotes: number;
  upvoters?: string[];
  upvotedBy?: string[];
  reportsCount: number;
  reportedBy?: string[];
  isOpinion: boolean; // Flag clara para distinguir opiniões de ocorrências factuais em tempo real
}

export interface ComplaintComment {
  id: string;
  complaintId: string;
  text: string;
  authorId?: string;
  authorName: string;
  timestamp: number;
}


// ==========================================
// OPERADORES DE TRANSPORTE & INTEGRAÇÃO GTFS
// ==========================================

export type OperatorServiceStatus = 'Operacional' | 'Condicionado' | 'Gravemente Afetado';

export interface OperatorLineSummary {
  id: string;
  code: string; // e.g. "Linha Azul", "728", "AP-123"
  name: string;
  origin: string;
  destination: string;
  mode: TransportMode;
  status: ScheduleStatus;
  color?: string;
  routeTypeGtfs?: number; // GTFS route_type: 0=Tram, 1=Subway, 2=Rail, 3=Bus, 4=Ferry
}

export interface GtfsAgencyConfig {
  agencyId: string; // GTFS agency_id standard
  agencyName: string;
  agencyUrl: string;
  agencyTimezone: string; // e.g. "Europe/Lisbon"
  agencyLang?: string; // e.g. "pt"
  agencyPhone?: string;
  staticGtfsFeedUrl?: string; // URL for standard static GTFS zip
  gtfsRtServiceAlertsUrl?: string; // Protocol Buffer / JSON endpoint for GTFS-RT Alerts
  gtfsRtTripUpdatesUrl?: string; // Protocol Buffer / JSON endpoint for Trip Updates
  gtfsRtVehiclePositionsUrl?: string; // Protocol Buffer / JSON endpoint for Vehicle Positions
  apiDocumentationUrl?: string;
  isOpenDataAvailable: boolean;
}

export interface TransitOperator {
  id: string; // Unique slug identifier (e.g. "metro-de-lisboa")
  code: string; // Short acronym (e.g. "ML", "MP", "CP", "CARRIS", "STCP", "FERTAGUS")
  name: string; // Official brand name
  legalName?: string; // Formal company name
  city: string; // Primary city (e.g. "Lisboa", "Porto", "Braga", "Coimbra")
  region: string; // Administrative region (e.g. "Área Metropolitana de Lisboa", "Região Norte")
  coverageArea: string[]; // Concelhos or zones served
  transportModes: TransportMode[]; // Transport modes operated
  website: string; // Official website URL
  alertsUrl?: string; // URL for real-time disruption warnings/notices
  contactPhone?: string;
  customerSupportEmail?: string;
  status: OperatorServiceStatus; // Overall health status
  statusDescription: string; // Detailed current summary of disruptions/normalcy
  activeIncidentsCount: number; // Current active complaints/reports on PAROU.PT
  lastStatusUpdate: string; // Timestamp or human text (e.g. "há 2 min")
  lines: OperatorLineSummary[]; // Catalog of primary lines/routes
  gtfsConfig: GtfsAgencyConfig; // GTFS & Real-time API configuration
}

// Notification System Types
export interface NotificationPreferences {
  enabled: boolean;
  selectedDistrict: string; // 'Todas' or specific district (e.g. 'Lisboa', 'Porto', 'Setúbal', etc.)
  districts?: string[];
  importantTransportOnly: boolean; // Greves, cortes de via, linhas paradas
  severeOnly: boolean; // Apenas ocorrências 'Grave'
  soundEnabled: boolean; // Efeito sonoro
  pushSubscribed: boolean; // Preparação Web Push PWA
}

export interface NotificationLogItem {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  reportId?: string;
  occurrenceId?: string;
  type?: OccurrenceType;
  district?: string;
  read: boolean;
}

// Public Official Sources & Ingestion System Types
export type PublicSourceType = 'API' | 'RSS' | 'GTFS_RT' | 'OFFICIAL_PAGE';

export interface PublicSourceConfig {
  id: string;
  name: string;
  category: 'Emergência & Trânsito' | 'Ferrovia' | 'Metro & Urbano' | 'Autocarros & Rodoviário' | 'Meteorologia';
  type: PublicSourceType;
  endpointUrl: string;
  officialPortalUrl: string;
  description: string;
  updateFrequency: string; // e.g. "Tempo Real (~2 min)", "A cada 5 min"
  coverageArea: string; // e.g. "Portugal Continental", "Área Metropolitana de Lisboa", "Nacional"
  status: 'online' | 'degraded' | 'syncing' | 'offline' | 'a_verificar';
  lastSyncedAt?: number;
  lastImportedCount?: number;
  totalImportedCount?: number;
  lastError?: string;
  lastStatusCode?: number;
  pollingIntervalSeconds?: number; // 30-60s for realtime, 300s (5 min) default
  enabled: boolean;
}

export interface IngestionSyncResult {
  success: boolean;
  timestamp: number;
  sourcesProcessed: number;
  newOccurrencesCreated: number;
  existingOccurrencesUpdated: number;
  details: {
    sourceId: string;
    sourceName: string;
    type: PublicSourceType;
    status: 'success' | 'warning' | 'error';
    itemsFetched: number;
    itemsImported: number;
    error?: string;
  }[];
}

