import { 
  NormalizedTransitService, 
  GlobalAvailabilityAuditReport, 
  RouteAvailabilityAuditEntry,
  TransitServiceStatus,
  GtfsCalendarRecord,
  GtfsCalendarDateException
} from '../types/transit';
import { fetchAvailabilityAudit } from './transitApi';

/**
 * PAROU.PT - Módulo de Auditoria Sistemática de Disponibilidade GTFS
 * 
 * Valida rigorosamente a consistência de disponibilidade de serviços de transporte público:
 * 1. Compara service_ids ativos com o calendário base (dias da semana, datas início/fim).
 * 2. Aplica as exceções oficiais de calendar_dates.txt (tipo 1 = adicionado / feriados com serviço; tipo 2 = suprimido).
 * 3. Valida a existência de paragens e partidas reais em stop_times.
 * 4. Garante que carreiras com horários programados NUNCA sejam erroneamente marcadas como 'Sem serviço',
 *    'Sem Informação' ou 'Interrompido' na interface do utilizador.
 */

export interface ServiceIntegrityCheckResult {
  serviceId: string;
  lineCode: string;
  lineName: string;
  operator: string;
  operatorId: string;
  direction: 'Ida' | 'Volta';
  originalStatus: TransitServiceStatus;
  recommendedStatus: TransitServiceStatus;
  hasScheduledTrips: boolean;
  hasUpcomingDepartures: boolean;
  hasStops: boolean;
  verifiedDeparturesCount: number;
  verifiedStopsCount: number;
  firstDeparture?: string;
  discrepancyDetected: boolean;
  discrepancyReason?: string;
  severity: 'OK' | 'AVISO' | 'ERRO_GRAVE';
}

export interface BatchAuditSummary {
  totalServicesChecked: number;
  validActiveServices: number;
  servicesWithDiscrepancy: number;
  correctedServicesCount: number;
  anomalies: Array<{
    serviceId: string;
    lineCode: string;
    operator: string;
    direction: string;
    reason: string;
    originalStatus: string;
    correctedStatus: string;
  }>;
  verdict: 'Passou' | 'Atenção' | 'Falhou';
  auditTimestamp: string;
}

// Feriados Nacionais Portugueses Fixos e Móveis (Referência para Auditoria de Calendários)
export const PORTUGAL_NATIONAL_HOLIDAYS_YYYYMMDD: Record<string, string> = {
  '20260101': 'Ano Novo',
  '20260403': 'Sexta-Feira Santa',
  '20260405': 'Páscoa',
  '20260425': 'Dia da Liberdade',
  '20260501': 'Dia do Trabalhador',
  '20260604': 'Corpo de Deus',
  '20260610': 'Dia de Portugal',
  '20260815': 'Assunção de Nossa Senhora',
  '20261005': 'Implantação da República',
  '20261101': 'Dia de Todos os Santos',
  '20261201': 'Restauração da Independência',
  '20261208': 'Imaculada Conceição',
  '20261225': 'Natal',
};

/**
 * Normaliza e formata horários GTFS que ultrapassem as 24h (ex: 24:15 -> 00:15 do dia seguinte)
 */
export function formatGtfsTime(timeStr?: string): string {
  if (!timeStr) return '';
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];

  if (isNaN(hours)) return timeStr;

  if (hours >= 24) {
    hours = hours % 24;
    return `${String(hours).padStart(2, '0')}:${minutes} (+1d)`;
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Verifica se uma data YYYY-MM-DD ou YYYYMMDD é feriado nacional em Portugal
 */
export function isPortugalHoliday(dateInput: string): boolean {
  const cleanDate = dateInput.replace(/-/g, '');
  return Boolean(PORTUGAL_NATIONAL_HOLIDAYS_YYYYMMDD[cleanDate]);
}

/**
 * Validação sistemática de um service_id contra calendário e exceções de calendar_dates
 */
export function isServiceIdActiveOnDate(
  serviceId: string,
  targetDateYyyyMmDd: string,
  calendar?: GtfsCalendarRecord,
  exceptions?: GtfsCalendarDateException[]
): boolean {
  const cleanDate = targetDateYyyyMmDd.replace(/-/g, '');

  // 1. Verificar exceções específicas em calendar_dates (precedência máxima)
  if (exceptions && exceptions.length > 0) {
    const specificException = exceptions.find(
      (e) => e.service_id === serviceId && e.date === cleanDate
    );
    if (specificException) {
      // 1 = Serviço adicionado para esta data específica (mesmo que fora do calendário base)
      if (specificException.exception_type === 1) return true;
      // 2 = Serviço suprimido para esta data específica
      if (specificException.exception_type === 2) return false;
    }
  }

  // 2. Se não houver calendário base, confiar em exceções tipo 1
  if (!calendar) {
    return false;
  }

  // 3. Verificar intervalo de vigência [start_date, end_date]
  if (cleanDate < calendar.start_date || cleanDate > calendar.end_date) {
    return false;
  }

  // 4. Determinar dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  const y = parseInt(cleanDate.substring(0, 4), 10);
  const m = parseInt(cleanDate.substring(4, 6), 10) - 1;
  const d = parseInt(cleanDate.substring(6, 8), 10);
  const dayOfWeek = new Date(Date.UTC(y, m, d)).getUTCDay();

  switch (dayOfWeek) {
    case 0: return calendar.sunday;
    case 1: return calendar.monday;
    case 2: return calendar.tuesday;
    case 3: return calendar.wednesday;
    case 4: return calendar.thursday;
    case 5: return calendar.friday;
    case 6: return calendar.saturday;
    default: return false;
  }
}

/**
 * AUDITORIA DE INTEGRIDADE DE SERVIÇO INDIVIDUAL:
 * Avalia se o status de exibição é coerente com as viagens e partidas programadas no GTFS.
 */
export function verifyServiceStatusIntegrity(
  service: NormalizedTransitService,
  targetDate?: string
): ServiceIntegrityCheckResult {
  const hasNextDep = Boolean(service.next_departure?.time);
  const upcomingCount = Array.isArray(service.upcoming_departures) ? service.upcoming_departures.length : 0;
  const stopsCount = Array.isArray(service.stops) ? service.stops.length : 0;
  
  const hasScheduledTrips = hasNextDep || upcomingCount > 0;
  const hasStops = stopsCount > 0;

  const currentStatus: TransitServiceStatus = service.service_status || 'Normal';
  let recommendedStatus: TransitServiceStatus = currentStatus;
  let discrepancyDetected = false;
  let discrepancyReason: string | undefined = undefined;
  let severity: 'OK' | 'AVISO' | 'ERRO_GRAVE' = 'OK';

  // REGRA DE OURO DA AUDITORIA:
  // Se existem partidas e viagens programadas autênticas para a data, a linha NUNCA pode ser exibida
  // como "Sem serviço" ou "Sem Informação", exceto se houver um alerta explícito oficial de greve/supressão total.
  const hasOfficialFullStrikeAlert = Array.isArray(service.alerts) && service.alerts.some((a) => {
    const title = (a.title || '').toLowerCase();
    const desc = (a.description || '').toLowerCase();
    const isStrike = title.includes('greve') || desc.includes('greve') || title.includes('supressão total');
    return isStrike && a.severity === 'severe';
  });

  if (hasScheduledTrips && (currentStatus === 'Sem Informação' || currentStatus === 'Interrompido')) {
    if (!hasOfficialFullStrikeAlert) {
      discrepancyDetected = true;
      recommendedStatus = 'Normal';
      severity = 'ERRO_GRAVE';
      discrepancyReason = `Discrepância Crítica: A carreira ${service.line_code} possui ${upcomingCount + (hasNextDep ? 1 : 0)} partidas oficiais ativas no GTFS, mas foi erradamente rotulada como '${currentStatus}'.`;
    }
  } else if (!hasScheduledTrips && currentStatus === 'Normal' && !service.realtime_info?.has_realtime) {
    // Se a linha não tem qualquer partida hoje e não há veículo em tempo real ativo
    discrepancyDetected = true;
    recommendedStatus = 'Sem Informação';
    severity = 'AVISO';
    discrepancyReason = `Aviso de Calendário: Carreira ${service.line_code} não regista viagens programadas para ${targetDate || 'hoje'}, devendo indicar ausência de serviço.`;
  }

  // Linhas perturbadas por obras ou alterações parciais mantêm 'Perturbado'
  if (Array.isArray(service.alerts) && service.alerts.some(a => a.severity === 'warning' || a.severity === 'severe') && !hasOfficialFullStrikeAlert) {
    if (recommendedStatus === 'Normal') {
      recommendedStatus = 'Perturbado';
    }
  }

  return {
    serviceId: service.id,
    lineCode: service.line_code,
    lineName: service.line_name,
    operator: service.operator_name,
    operatorId: service.operator_id,
    direction: service.direction === 'Volta' ? 'Volta' : 'Ida',
    originalStatus: currentStatus,
    recommendedStatus,
    hasScheduledTrips,
    hasUpcomingDepartures: upcomingCount > 0,
    hasStops,
    verifiedDeparturesCount: upcomingCount + (hasNextDep ? 1 : 0),
    verifiedStopsCount: stopsCount,
    firstDeparture: service.next_departure?.time || service.upcoming_departures?.[0]?.time,
    discrepancyDetected,
    discrepancyReason,
    severity,
  };
}

/**
 * NORMALIZADOR AUTOMÁTICO DE ESTADO DE SERVIÇO:
 * Retorna uma cópia do serviço com o estado corrigido caso tenha sido falsamente marcado como 'Sem serviço'.
 */
export function normalizeServiceStatus(
  service: NormalizedTransitService,
  targetDate?: string
): NormalizedTransitService {
  const audit = verifyServiceStatusIntegrity(service, targetDate);

  if (!audit.discrepancyDetected || audit.recommendedStatus === audit.originalStatus) {
    return service;
  }

  return {
    ...service,
    service_status: audit.recommendedStatus,
    status_message: audit.recommendedStatus === 'Normal'
      ? 'Serviço regular ativo com horários oficiais GTFS'
      : audit.recommendedStatus === 'Perturbado'
      ? service.status_message || 'Serviço condicionado com partidas ativas'
      : service.status_message || 'Sem partidas programadas para a data selecionada',
  };
}

/**
 * AUDITORIA EM LOTE DE SERVIÇOS (ex: resultados de pesquisa ou catálogo):
 * Higieniza todos os serviços para garantir que a UI nunca apresente falsos "Sem serviço".
 */
export function auditBatchServices(
  services: NormalizedTransitService[],
  targetDate?: string
): {
  services: NormalizedTransitService[];
  summary: BatchAuditSummary;
} {
  const anomalies: BatchAuditSummary['anomalies'] = [];
  const normalizedList: NormalizedTransitService[] = [];
  let validActiveCount = 0;
  let correctedCount = 0;

  for (const rawService of services) {
    const audit = verifyServiceStatusIntegrity(rawService, targetDate);

    if (audit.hasScheduledTrips) {
      validActiveCount++;
    }

    if (audit.discrepancyDetected) {
      anomalies.push({
        serviceId: audit.serviceId,
        lineCode: audit.lineCode,
        operator: audit.operator,
        direction: audit.direction,
        reason: audit.discrepancyReason || 'Inconsistência de disponibilidade detectada',
        originalStatus: audit.originalStatus,
        correctedStatus: audit.recommendedStatus,
      });

      if (audit.recommendedStatus !== audit.originalStatus) {
        correctedCount++;
      }
    }

    normalizedList.push(normalizeServiceStatus(rawService, targetDate));
  }

  const verdict: BatchAuditSummary['verdict'] = 
    anomalies.some(a => a.originalStatus === 'Sem Informação' || a.originalStatus === 'Interrompido')
      ? 'Atenção'
      : anomalies.length > 0
      ? 'Atenção'
      : 'Passou';

  return {
    services: normalizedList,
    summary: {
      totalServicesChecked: services.length,
      validActiveServices: validActiveCount,
      servicesWithDiscrepancy: anomalies.length,
      correctedServicesCount: correctedCount,
      anomalies,
      verdict,
      auditTimestamp: new Date().toISOString(),
    },
  };
}

// Cache local em memória para o relatório global de auditoria
let cachedGlobalReport: { report: GlobalAvailabilityAuditReport; timestamp: number } | null = null;
const AUDIT_CACHE_TTL_MS = 60_000; // 60 segundos

/**
 * OBTÉM E VALIDA O RELATÓRIO GLOBAL DE DISPONIBILIDADE:
 * Consulta a API de auditoria de disponibilidade (/api/transit/audit/availability)
 * e atesta a conformidade das regras de integridade nacional.
 */
export async function getGlobalAvailabilityAudit(
  customDate?: string,
  options?: { forceRefresh?: boolean }
): Promise<{
  report: GlobalAvailabilityAuditReport;
  verdict: 'Passou' | 'Falhou';
  summaryMessage: string;
}> {
  const now = Date.now();
  if (
    !options?.forceRefresh && 
    !customDate && 
    cachedGlobalReport && 
    now - cachedGlobalReport.timestamp < AUDIT_CACHE_TTL_MS
  ) {
    return {
      report: cachedGlobalReport.report,
      verdict: cachedGlobalReport.report.verdict,
      summaryMessage: cachedGlobalReport.report.verdict === 'Passou'
        ? 'Todos os operadores e serviços GTFS auditados com 0 anomalias de indisponibilidade.'
        : 'Foram detectadas anomalias em rotas GTFS no relatório de auditoria.',
    };
  }

  const report = await fetchAvailabilityAudit(customDate);

  if (!customDate) {
    cachedGlobalReport = {
      report,
      timestamp: now,
    };
  }

  const isApproved = 
    report.verdict === 'Passou' && 
    report.anomalies_detected.lines_incorrectly_marked_out_of_service === 0 &&
    report.anomalies_detected.lines_without_trips_showing_departures === 0 &&
    report.active_routes_count > 0;

  return {
    report,
    verdict: isApproved ? 'Passou' : 'Falhou',
    summaryMessage: isApproved
      ? `Auditoria aprovada: ${report.active_routes_count} rotas ativas com viagens hoje sem qualquer falsa marcação de "Sem serviço".`
      : `Auditoria reprovada: ${report.anomalies_detected.lines_incorrectly_marked_out_of_service} falsos "Sem serviço" detectados.`,
  };
}

/**
 * Validação rápida de rota específica pelo seu identificador ou carreira
 */
export function validateRouteScheduledAvailability(
  routeId: string,
  auditReport: GlobalAvailabilityAuditReport
): RouteAvailabilityAuditEntry | undefined {
  if (!auditReport?.sample_routes) return undefined;

  return auditReport.sample_routes.find((r) => {
    return (
      r.route_id === routeId ||
      r.route.toLowerCase().includes(routeId.toLowerCase()) ||
      r.route.startsWith(routeId)
    );
  });
}
