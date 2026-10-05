export type TransportMode = 'Autocarro' | 'Metro' | 'Comboio' | 'Barco' | 'Funicular' | 'Elétrico';

export type CatalogSourceType = 'GTFS' | 'GTFS-RT' | 'API' | 'SIRI' | 'NeTEx' | 'RSS' | 'Página Oficial';

export type CatalogValidationStatus = 'Ativa' | 'A verificar' | 'Sem dados' | 'Erro de ligação';

export type CatalogSyncStatus = 'Online' | 'Offline' | 'Pendente' | 'Erro HTTP';

export type NetworkScope = 'Metropolitana' | 'Nacional' | 'Municipal' | 'Intermunicipal' | 'Regional' | 'Insular';

export interface TransitCatalogEntry {
  id: string;
  official_name: string;
  short_name: string;
  authority: string; // TML, AMP, IMT, Município, CIM, etc.
  region: string;
  municipalities: string[];
  transport_modes: TransportMode[];
  network_scope: NetworkScope;
  lines_count_estimate?: number;
  network_description: string;
  official_website: string;

  // Data Source Layer (prepared for automated synchronization)
  source: string;
  source_url: string;
  source_type: CatalogSourceType;
  format: string;
  realtime_available: boolean; // SIM/NÃO strictly verified
  alerts_available: boolean;   // SIM/NÃO strictly verified
  last_update: string;
  validation_status: CatalogValidationStatus;
  sync_status: CatalogSyncStatus;
  sync_http_code?: number;
  sync_error_detail?: string;
  last_checked_at: string;

  // Official registry reference (NAP Portugal, dados.gov.pt, etc.)
  registry_ref?: {
    portal_name: string;
    portal_url: string;
    dataset_id?: string;
  };
}

export interface CatalogFilterState {
  searchQuery: string;
  region: string;
  transportMode: string;
  sourceType: string;
  onlyRealtime: boolean;
  onlyAlerts: boolean;
  onlyActive: boolean;
}

export interface CatalogStats {
  totalOperators: number;
  activeSources: number;
  realtimeConfirmedCount: number;
  alertsAvailableCount: number;
  regionsCount: number;
  municipalitiesCoveredCount: number;
}
