import { ExternalSourceAdapter, NormalizedTransitEvent } from '../types';
import { TransportMode } from '../../../types';

/**
 * Estrutura representativa de ficheiros de texto do padrão GTFS Estático:
 * agency.txt, routes.txt, calendar.txt, stops.txt
 */
export interface GtfsStaticAgencyRow {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
}

export interface GtfsStaticRouteRow {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number; // 0=Tram, 1=Subway, 2=Rail, 3=Bus, 4=Ferry
  route_color?: string;
}

export interface GtfsStaticScheduledDisruption {
  route_id: string;
  agency_id: string;
  notice_title: string;
  description: string;
  start_date: string; // YYYYMMDD
  end_date: string; // YYYYMMDD
}

export interface GtfsStaticPayload {
  agencies: GtfsStaticAgencyRow[];
  routes: GtfsStaticRouteRow[];
  scheduledDisruptions: GtfsStaticScheduledDisruption[];
}

export class GtfsStaticAdapter implements ExternalSourceAdapter<GtfsStaticPayload> {
  sourceType = 'GTFS_STATIC' as const;
  sourceName: string;

  constructor(sourceName = 'Feed GTFS Estático') {
    this.sourceName = sourceName;
  }

  async fetchRaw(endpointUrl?: string): Promise<GtfsStaticPayload> {
    return {
      agencies: [],
      routes: [],
      scheduledDisruptions: [],
    };
  }

  async normalize(raw: GtfsStaticPayload): Promise<NormalizedTransitEvent[]> {
    if (!raw?.scheduledDisruptions || !Array.isArray(raw.scheduledDisruptions)) {
      return [];
    }

    return raw.scheduledDisruptions.map((dis, idx) => {
      const route = raw.routes.find((r) => r.route_id === dis.route_id);
      const agency = raw.agencies.find((a) => a.agency_id === dis.agency_id);
      const mode = this.mapRouteTypeToMode(route?.route_type);

      return {
        id: `ext-gtfs-static-${dis.agency_id.toLowerCase()}-${dis.route_id.toLowerCase()}-${idx}`,
        sourceType: this.sourceType,
        sourceName: `${this.sourceName} (${agency?.agency_name || dis.agency_id})`,
        externalId: `${dis.route_id}-${dis.start_date}`,
        title: dis.notice_title,
        description: dis.description,
        type: 'OBRAS',
        severity: 'Informação',
        district: 'Lisboa',
        concelho: 'Lisboa',
        locationDetails: route?.route_long_name || dis.route_id,
        operator: agency?.agency_name || dis.agency_id,
        operatorCode: dis.agency_id.replace('PT-', ''),
        mode,
        affectedLines: [route?.route_short_name || dis.route_id],
        timestamp: Date.now(),
        publishedAt: 'calendário programado',
        status: 'Ativa',
        isVerifiedSource: true,
        rawPayload: dis as unknown as Record<string, unknown>,
      };
    });
  }

  validate(event: NormalizedTransitEvent): boolean {
    return Boolean(event.id && event.title && event.operator);
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
        return 'Autocarro';
    }
  }
}
