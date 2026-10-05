import { Occurrence, OccurrenceType, SeverityLevel, TransportMode } from '../../types';

/**
 * Tipos de fontes externas suportadas pelo ecossistema PAROU.PT
 */
export type ExternalSourceType = 
  | 'REST_API'
  | 'GTFS_STATIC'
  | 'GTFS_REALTIME'
  | 'RSS_FEED'
  | 'NEWS_FEED';

/**
 * Formato unificado e normalizado de evento/incidente de transporte
 * independente da fonte original (REST, GTFS-RT, RSS, Notícias).
 */
export interface NormalizedTransitEvent {
  // Identificação e proveniência
  id: string; // ID único e determinístico gerado a partir do conteúdo/fonte
  sourceType: ExternalSourceType;
  sourceName: string; // Ex: "Carris Metropolitana REST", "CP Avisos RSS", "Metro Lisboa GTFS-RT"
  sourceUrl?: string; // Link direto para a fonte original ou artigo
  externalId?: string; // ID fornecido pelo sistema de origem (ex: alert_id, guid)

  // Dados centrais do evento
  title: string;
  description: string;
  type: OccurrenceType; // ACIDENTE | ATRASOS | AVARIA | GREVE | OBRAS | CORTE | SERVICO_PUBLICO
  severity: SeverityLevel; // Grave | Moderada | Informação

  // Localização geográfica e administrativa
  district: string; // Ex: "Lisboa", "Porto", "Braga", "Coimbra"
  concelho: string; // Ex: "Sintra", "Matosinhos", "Almada"
  locationDetails: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };

  // Operador e linhas afetadas
  operator: string; // Ex: "Metro de Lisboa", "CP - Comboios de Portugal", "Carris"
  operatorCode?: string; // Ex: "ML", "CP", "CARRIS"
  mode: TransportMode; // Metro | Comboio | Autocarro | Barco | Elétrico
  affectedLines?: string[]; // Ex: ["Linha Azul", "728", "Linha de Sintra"]
  affectedStops?: string[]; // Estações/paragens afetadas

  // Temporalidade
  timestamp: number; // Unix timestamp em ms
  startTime?: number; // Início previsto ou registado
  endTime?: number; // Fim previsto da perturbação
  publishedAt: string; // String amigável em pt-PT (ex: "há 10 min", "Hoje às 14:30")

  // Estado e verificação
  status: 'Ativa' | 'Em resolução' | 'Resolvida';
  isVerifiedSource: boolean; // True para fontes oficiais de operadores ou autoridades
  rawPayload?: Record<string, unknown>; // Preservação do payload original para auditoria/debug
}

/**
 * Contrato base para todos os adaptadores de fontes externas.
 */
export interface ExternalSourceAdapter<TRaw = unknown> {
  sourceType: ExternalSourceType;
  sourceName: string;
  
  /**
   * Obtém os dados brutos da fonte externa (ou gera mock para testes offline).
   */
  fetchRaw(endpointUrl?: string): Promise<TRaw>;

  /**
   * Converte e normaliza os dados brutos no modelo unificado NormalizedTransitEvent.
   */
  normalize(raw: TRaw): Promise<NormalizedTransitEvent[]>;

  /**
   * Valida se um evento normalizado possui os campos obrigatórios.
   */
  validate(event: NormalizedTransitEvent): boolean;
}

/**
 * Definição configurável de uma fonte externa registada no sistema.
 */
export interface ExternalSourceConfig {
  id: string;
  name: string;
  type: ExternalSourceType;
  endpointUrl: string;
  enabled: boolean;
  pollingIntervalSeconds: number; // Intervalo recomendado de consulta
  operatorCode?: string;
  adapter: ExternalSourceAdapter<unknown>;
}
