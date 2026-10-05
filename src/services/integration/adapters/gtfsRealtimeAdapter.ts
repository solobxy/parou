import { ExternalSourceAdapter, NormalizedTransitEvent } from '../types';
import { OccurrenceType, SeverityLevel, TransportMode } from '../../../types';

/**
 * Enums oficiais da especificação GTFS-Realtime (Google / MobilityData)
 */
export enum GtfsRtCause {
  UNKNOWN_CAUSE = 1,
  OTHER_CAUSE = 2,
  TECHNICAL_PROBLEM = 3,
  STRIKE = 4,
  DEMONSTRATION = 5,
  ACCIDENT = 6,
  HOLIDAY = 7,
  WEATHER = 8,
  MAINTENANCE = 9,
  CONSTRUCTION = 10,
  POLICE_ACTIVITY = 11,
  MEDICAL_EMERGENCY = 12,
}

export enum GtfsRtEffect {
  NO_SERVICE = 1,
  REDUCED_SERVICE = 2,
  SIGNIFICANT_DELAYS = 3,
  DETOUR = 4,
  ADDITIONAL_SERVICE = 5,
  MODIFIED_SERVICE = 6,
  OTHER_EFFECT = 7,
  UNKNOWN_EFFECT = 8,
  STOP_MOVED = 9,
}

export interface GtfsRtTranslatedString {
  translation: { text: string; language?: string }[];
}

export interface GtfsRtEntitySelector {
  agency_id?: string;
  route_id?: string;
  route_type?: number;
  stop_id?: string;
  trip_id?: string;
}

export interface GtfsRtAlert {
  active_period?: { start?: number; end?: number }[];
  informed_entity: GtfsRtEntitySelector[];
  cause?: GtfsRtCause;
  effect?: GtfsRtEffect;
  url?: GtfsRtTranslatedString;
  header_text: GtfsRtTranslatedString;
  description_text: GtfsRtTranslatedString;
}

export interface GtfsRtFeedEntity {
  id: string;
  is_deleted?: boolean;
  alert?: GtfsRtAlert;
  trip_update?: {
    trip: { trip_id: string; route_id: string };
    delay?: number;
  };
}

export interface GtfsRtFeedMessage {
  header: {
    gtfs_realtime_version: string;
    incrementality?: number;
    timestamp: number;
  };
  entity: GtfsRtFeedEntity[];
}

export class GtfsRealtimeAdapter implements ExternalSourceAdapter<GtfsRtFeedMessage> {
  sourceType = 'GTFS_REALTIME' as const;
  sourceName: string;

  constructor(sourceName = 'Feed GTFS-Realtime Oficial') {
    this.sourceName = sourceName;
  }

  async fetchRaw(endpointUrl?: string): Promise<GtfsRtFeedMessage> {
    // Quando a API real for ativada (consumindo Protobuf/JSON binário):
    // if (endpointUrl) {
    //   const response = await fetch(endpointUrl);
    //   const buffer = await response.arrayBuffer();
    //   return FeedMessage.decode(new Uint8Array(buffer));
    // }

    // Simulação com dados representativos de operadores portugueses:
    return {
      header: {
        gtfs_realtime_version: '2.0',
        timestamp: Math.floor(Date.now() / 1000),
      },
      entity: [
        {
          id: 'gtfs-rt-alert-001',
          alert: {
            cause: GtfsRtCause.TECHNICAL_PROBLEM,
            effect: GtfsRtEffect.SIGNIFICANT_DELAYS,
            informed_entity: [
              { agency_id: 'PT-CP', route_id: 'CP-LINHA-DO-NORTE', route_type: 2 },
            ],
            header_text: {
              translation: [{ text: 'Supressão parcial na Linha do Norte por falha na sinalização', language: 'pt' }],
            },
            description_text: {
              translation: [{ text: 'Comboios suburbanos e regionais entre Entroncamento e Santarém circulam com atrasos médios de 30 minutos.', language: 'pt' }],
            },
            active_period: [
              { start: Math.floor(Date.now() / 1000) - 1800, end: Math.floor(Date.now() / 1000) + 7200 },
            ],
          },
        },
        {
          id: 'gtfs-rt-alert-002',
          alert: {
            cause: GtfsRtCause.CONSTRUCTION,
            effect: GtfsRtEffect.DETOUR,
            informed_entity: [
              { agency_id: 'PT-STCP', route_id: 'STCP-205', route_type: 3 },
            ],
            header_text: {
              translation: [{ text: 'Desvio de trânsito na linha 205 junto à Circunvalação', language: 'pt' }],
            },
            description_text: {
              translation: [{ text: 'Trabalhos de pavimentação noturnos obrigam ao desvio pela Rua de Francos. Três paragens temporariamente desativadas.', language: 'pt' }],
            },
          },
        },
      ],
    };
  }

  async normalize(raw: GtfsRtFeedMessage): Promise<NormalizedTransitEvent[]> {
    if (!raw?.entity || !Array.isArray(raw.entity)) {
      return [];
    }

    const events: NormalizedTransitEvent[] = [];

    for (const ent of raw.entity) {
      if (ent.is_deleted || !ent.alert) continue;

      const alert = ent.alert;
      const title = this.extractTranslation(alert.header_text);
      const description = this.extractTranslation(alert.description_text);

      const type = this.mapGtfsCauseToType(alert.cause);
      const severity = this.mapGtfsEffectToSeverity(alert.effect);

      const firstEntity = alert.informed_entity?.[0];
      const agencyId = firstEntity?.agency_id || 'PT-TRANSIT';
      const routeId = firstEntity?.route_id || '';
      const mode = this.mapRouteTypeToMode(firstEntity?.route_type);

      const { district, concelho } = this.inferLocationFromAgencyAndText(agencyId, `${title} ${description}`);

      const timestamp = (raw.header?.timestamp ? raw.header.timestamp * 1000 : Date.now());

      events.push({
        id: `ext-gtfs-rt-${ent.id}`,
        sourceType: this.sourceType,
        sourceName: `${this.sourceName} (${agencyId})`,
        externalId: ent.id,
        title,
        description,
        type,
        severity,
        district,
        concelho,
        locationDetails: routeId ? `Linha/Rota: ${routeId}` : district,
        operator: this.getAgencyDisplayName(agencyId),
        operatorCode: agencyId.replace('PT-', ''),
        mode,
        affectedLines: routeId ? [routeId] : [],
        timestamp,
        publishedAt: 'em tempo real',
        status: 'Ativa',
        isVerifiedSource: true,
        rawPayload: ent as unknown as Record<string, unknown>,
      });
    }

    return events;
  }

  validate(event: NormalizedTransitEvent): boolean {
    return Boolean(event.id && event.title && event.operator && event.timestamp > 0);
  }

  private extractTranslation(trans?: GtfsRtTranslatedString): string {
    if (!trans?.translation || trans.translation.length === 0) return 'Sem descrição';
    const pt = trans.translation.find((t) => t.language?.toLowerCase() === 'pt');
    return pt?.text || trans.translation[0].text;
  }

  private mapGtfsCauseToType(cause?: GtfsRtCause): OccurrenceType {
    switch (cause) {
      case GtfsRtCause.ACCIDENT:
        return 'ACIDENTE';
      case GtfsRtCause.TECHNICAL_PROBLEM:
      case GtfsRtCause.MAINTENANCE:
        return 'AVARIA';
      case GtfsRtCause.STRIKE:
      case GtfsRtCause.DEMONSTRATION:
        return 'GREVE';
      case GtfsRtCause.CONSTRUCTION:
        return 'OBRAS';
      case GtfsRtCause.POLICE_ACTIVITY:
      case GtfsRtCause.MEDICAL_EMERGENCY:
        return 'CORTE';
      default:
        return 'ATRASOS';
    }
  }

  private mapGtfsEffectToSeverity(effect?: GtfsRtEffect): SeverityLevel {
    switch (effect) {
      case GtfsRtEffect.NO_SERVICE:
        return 'Grave';
      case GtfsRtEffect.SIGNIFICANT_DELAYS:
      case GtfsRtEffect.REDUCED_SERVICE:
        return 'Moderada';
      default:
        return 'Informação';
    }
  }

  private mapRouteTypeToMode(routeType?: number): TransportMode {
    switch (routeType) {
      case 0:
        return 'Elétrico';
      case 1:
        return 'Metro';
      case 2:
        return 'Comboio';
      case 3:
        return 'Autocarro';
      case 4:
        return 'Barco';
      default:
        return 'Comboio';
    }
  }

  private getAgencyDisplayName(agencyId: string): string {
    switch (agencyId.toUpperCase()) {
      case 'PT-ML':
        return 'Metro de Lisboa';
      case 'PT-MP':
        return 'Metro do Porto';
      case 'PT-CP':
        return 'CP - Comboios de Portugal';
      case 'PT-CARRIS':
        return 'Carris';
      case 'PT-STCP':
        return 'STCP';
      case 'PT-FERTAGUS':
        return 'Fertagus';
      default:
        return agencyId;
    }
  }

  private inferLocationFromAgencyAndText(agencyId: string, text: string): { district: string; concelho: string } {
    if (agencyId.includes('ML') || agencyId.includes('CARRIS')) {
      return { district: 'Lisboa', concelho: 'Lisboa' };
    }
    if (agencyId.includes('MP') || agencyId.includes('STCP')) {
      return { district: 'Porto', concelho: 'Porto' };
    }
    if (text.toLowerCase().includes('santarém')) {
      return { district: 'Santarém', concelho: 'Santarém' };
    }
    if (text.toLowerCase().includes('braga')) {
      return { district: 'Braga', concelho: 'Braga' };
    }
    return { district: 'Lisboa', concelho: 'Lisboa' };
  }
}
