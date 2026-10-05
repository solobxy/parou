export type CentralAlertType =
  | 'greve'
  | 'interrupção'
  | 'atraso significativo'
  | 'alteração de horário'
  | 'alteração de percurso'
  | 'paragem encerrada'
  | 'linha suspensa'
  | 'desvio'
  | 'obras'
  | 'reforço de serviço'
  | 'novo horário'
  | 'cancelamento'
  | 'outros alertas oficiais';

export type CentralAlertStatus = 'Futuro' | 'Ativo' | 'Terminado' | 'Cancelado';

export interface CentralAlert {
  id: string;
  external_id: string;
  tipo: CentralAlertType;
  título: string;
  descrição: string;
  operador: string;
  linhas: string[];
  paragens: string[];
  região: string;
  municípios: string[];
  start_datetime: string;
  end_datetime?: string | null;
  published_datetime: string;
  source: string;
  source_url: string;
  last_update: string;
  status: CentralAlertStatus;
  // Metadata for deduplication & severity
  content_hash?: string;
  severity?: 'Grave' | 'Moderada' | 'Informativo';
}

export interface AlertCenterDiagnostic {
  future_alerts_count: number;
  active_alerts_count: number;
  ended_alerts_count: number;
  cancelled_alerts_count: number;
  total_alerts_count: number;
  last_sync: string;
  sources_error_count: number;
  sources_error_list: Array<{ source: string; error: string; last_attempt: string }>;
  notifications_sent_count: number;
  duplicates_avoided_count: number;
}

export interface AlertPreferences {
  enabledTypes: Record<CentralAlertType, boolean>;
  favoriteOperators: string[];
  favoriteRegions: string[];
  favoriteMunicipalities: string[];
  favoriteLines: string[];
  favoriteStops: string[];
  notifyOnlyFavorites: boolean;
  pushNotificationsEnabled: boolean;
  notifyFutureStrikes: boolean;
  notifyStrikeStart: boolean;
  notifyInterruptions: boolean;
  notifyImportantChanges: boolean;
  notifyScheduleChanges: boolean;
}

export const ALL_CENTRAL_ALERT_TYPES: CentralAlertType[] = [
  'greve',
  'interrupção',
  'atraso significativo',
  'alteração de horário',
  'alteração de percurso',
  'paragem encerrada',
  'linha suspensa',
  'desvio',
  'obras',
  'reforço de serviço',
  'novo horário',
  'cancelamento',
  'outros alertas oficiais',
];

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  enabledTypes: {
    'greve': true,
    'interrupção': true,
    'atraso significativo': true,
    'alteração de horário': true,
    'alteração de percurso': true,
    'paragem encerrada': true,
    'linha suspensa': true,
    'desvio': true,
    'obras': true,
    'reforço de serviço': true,
    'novo horário': true,
    'cancelamento': true,
    'outros alertas oficiais': true,
  },
  favoriteOperators: [],
  favoriteRegions: [],
  favoriteMunicipalities: [],
  favoriteLines: [],
  favoriteStops: [],
  notifyOnlyFavorites: false,
  pushNotificationsEnabled: false,
  notifyFutureStrikes: true,
  notifyStrikeStart: true,
  notifyInterruptions: true,
  notifyImportantChanges: true,
  notifyScheduleChanges: true,
};
