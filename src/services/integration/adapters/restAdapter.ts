import { ExternalSourceAdapter, NormalizedTransitEvent } from '../types';
import { OccurrenceType, SeverityLevel, TransportMode } from '../../../types';

/**
 * Estrutura representativa de uma resposta REST JSON de operadores (ex: Carris Metropolitana, Transporlis).
 */
export interface RestIncidentItem {
  id: string;
  agency_id: string;
  agency_name: string;
  title: string;
  summary: string;
  category: string; // "ACCIDENT", "DELAY", "BREAKDOWN", "ROADWORKS", "STRIKE"
  severity_code: 'HIGH' | 'MEDIUM' | 'LOW';
  district: string;
  municipality: string;
  location_name: string;
  transport_mode: 'SUBWAY' | 'TRAIN' | 'BUS' | 'FERRY' | 'TRAM';
  affected_routes: string[];
  created_at: string; // ISO 8601
  status: 'ACTIVE' | 'RESOLVING' | 'CLOSED';
  source_reference_url?: string;
  coordinates?: { lat: number; lng: number };
}

export interface RestAlertsPayload {
  version: string;
  timestamp: string;
  count: number;
  incidents: RestIncidentItem[];
}

export class RestApiAdapter implements ExternalSourceAdapter<RestAlertsPayload> {
  sourceType = 'REST_API' as const;
  sourceName: string;

  constructor(sourceName = 'Portal REST Operadores de Portugal') {
    this.sourceName = sourceName;
  }

  async fetchRaw(endpointUrl?: string): Promise<RestAlertsPayload> {
    // Quando a API real for ativada:
    // if (endpointUrl) {
    //   const res = await fetch(endpointUrl);
    //   return await res.json();
    // }

    // Simulação robusta para testes locais sem chamadas HTTP externas:
    return {
      version: '1.2.0',
      timestamp: new Date().toISOString(),
      count: 2,
      incidents: [
        {
          id: 'rest-inc-901',
          agency_id: 'CM',
          agency_name: 'Carris Metropolitana',
          title: 'Supressão parcial na linha 4701 por condicionamento na A2',
          summary: 'Acidente junto à saída de Corroios causa filas de 4 km e atrasos médios de 25 min no sentido Sul-Norte.',
          category: 'ACCIDENT',
          severity_code: 'HIGH',
          district: 'Setúbal',
          municipality: 'Almada',
          location_name: 'A2 km 11, Nó de Corroios',
          transport_mode: 'BUS',
          affected_routes: ['4701', '4702'],
          created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
          source_reference_url: 'https://www.carrismetropolitana.pt/avisos/4701',
          coordinates: { lat: 38.6475, lng: -9.1558 },
        },
        {
          id: 'rest-inc-902',
          agency_id: 'ML',
          agency_name: 'Metro de Lisboa',
          title: 'Atrasos no nó de ligação do Campo Grande',
          summary: 'Falha momentânea no aparelho de mudança de via causa circulação lenta na Linha Amarela.',
          category: 'BREAKDOWN',
          severity_code: 'MEDIUM',
          district: 'Lisboa',
          municipality: 'Lisboa',
          location_name: 'Estação Campo Grande',
          transport_mode: 'SUBWAY',
          affected_routes: ['Linha Amarela'],
          created_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
          status: 'ACTIVE',
          source_reference_url: 'https://www.metrolisboa.pt/viajar/estado-das-linhas/',
          coordinates: { lat: 38.7602, lng: -9.1578 },
        },
      ],
    };
  }

  async normalize(raw: RestAlertsPayload): Promise<NormalizedTransitEvent[]> {
    if (!raw?.incidents || !Array.isArray(raw.incidents)) {
      return [];
    }

    return raw.incidents.map((inc) => {
      const type = this.mapCategoryToType(inc.category);
      const severity = this.mapSeverity(inc.severity_code);
      const mode = this.mapTransportMode(inc.transport_mode);
      const timestamp = new Date(inc.created_at).getTime() || Date.now();

      return {
        id: `ext-rest-${inc.agency_id.toLowerCase()}-${inc.id}`,
        sourceType: this.sourceType,
        sourceName: `${this.sourceName} (${inc.agency_name})`,
        sourceUrl: inc.source_reference_url,
        externalId: inc.id,
        title: inc.title,
        description: inc.summary,
        type,
        severity,
        district: inc.district,
        concelho: inc.municipality,
        locationDetails: inc.location_name,
        coordinates: inc.coordinates ? { latitude: inc.coordinates.lat, longitude: inc.coordinates.lng } : undefined,
        operator: inc.agency_name,
        operatorCode: inc.agency_id,
        mode,
        affectedLines: inc.affected_routes,
        timestamp,
        publishedAt: this.formatRelativeTime(timestamp),
        status: inc.status === 'ACTIVE' ? 'Ativa' : inc.status === 'RESOLVING' ? 'Em resolução' : 'Resolvida',
        isVerifiedSource: true,
        rawPayload: inc as unknown as Record<string, unknown>,
      };
    });
  }

  validate(event: NormalizedTransitEvent): boolean {
    return Boolean(
      event.id &&
      event.title &&
      event.description &&
      event.district &&
      event.operator &&
      event.timestamp > 0
    );
  }

  private mapCategoryToType(cat: string): OccurrenceType {
    switch (cat.toUpperCase()) {
      case 'ACCIDENT':
        return 'ACIDENTE';
      case 'DELAY':
        return 'ATRASOS';
      case 'BREAKDOWN':
        return 'AVARIA';
      case 'STRIKE':
        return 'GREVE';
      case 'ROADWORKS':
      case 'CONSTRUCTION':
        return 'OBRAS';
      case 'CLOSURE':
        return 'CORTE';
      default:
        return 'SERVICO_PUBLICO';
    }
  }

  private mapSeverity(sev: string): SeverityLevel {
    switch (sev.toUpperCase()) {
      case 'HIGH':
        return 'Grave';
      case 'MEDIUM':
        return 'Moderada';
      default:
        return 'Informação';
    }
  }

  private mapTransportMode(m: string): TransportMode {
    switch (m.toUpperCase()) {
      case 'SUBWAY':
        return 'Metro';
      case 'TRAIN':
        return 'Comboio';
      case 'BUS':
        return 'Autocarro';
      case 'FERRY':
        return 'Barco';
      case 'TRAM':
        return 'Elétrico';
      default:
        return 'Autocarro';
    }
  }

  private formatRelativeTime(ts: number): string {
    const diff = Math.round((Date.now() - ts) / (60 * 1000));
    if (diff < 2) return 'agora mesmo';
    if (diff < 60) return `há ${diff} min`;
    return `há ${Math.floor(diff / 60)}h`;
  }
}
