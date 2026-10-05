import { 
  NormalizedTransitEvent, 
  ExternalSourceConfig, 
  ExternalSourceType 
} from './types';
import { Occurrence } from '../../types';
import { RestApiAdapter } from './adapters/restAdapter';
import { GtfsStaticAdapter } from './adapters/gtfsAdapter';
import { GtfsRealtimeAdapter } from './adapters/gtfsRealtimeAdapter';
import { RssFeedAdapter } from './adapters/rssAdapter';
import { NewsFeedAdapter } from './adapters/newsAdapter';

/**
 * Gestor e orquestrador unificado de fontes externas para o PAROU.PT.
 * Centraliza o pipeline de ingestão, normalização, desduplicação e conversão.
 */
export class ExternalSourcesManager {
  private sources: Map<string, ExternalSourceConfig> = new Map();

  constructor() {
    this.registerDefaultSources();
  }

  /**
   * Regista as fontes padrão do ecossistema de transportes de Portugal.
   */
  private registerDefaultSources() {
    // 1. Fonte REST API (Portal de Operadores)
    this.registerSource({
      id: 'src-rest-operators',
      name: 'Portal REST de Operadores Urbanos',
      type: 'REST_API',
      endpointUrl: 'https://api.transporlis.pt/v1/alerts',
      enabled: true,
      pollingIntervalSeconds: 60,
      adapter: new RestApiAdapter('Transporlis / Operadores AML & AMP'),
    });

    // 2. Fonte GTFS-Realtime (Feed Oficial)
    this.registerSource({
      id: 'src-gtfs-rt-national',
      name: 'Feed Nacional GTFS-Realtime',
      type: 'GTFS_REALTIME',
      endpointUrl: 'https://dados.gov.pt/gtfs-rt/feed.pb',
      enabled: true,
      pollingIntervalSeconds: 30,
      adapter: new GtfsRealtimeAdapter('GTFS-Realtime Nacional (CP/Metro/STCP)'),
    });

    // 3. Fonte GTFS Estático (Horários e Trabalhos Programados)
    this.registerSource({
      id: 'src-gtfs-static-calendar',
      name: 'GTFS Estático - Trabalhos de Via',
      type: 'GTFS_STATIC',
      endpointUrl: 'https://dados.gov.pt/gtfs/static.zip',
      enabled: true,
      pollingIntervalSeconds: 86400,
      adapter: new GtfsStaticAdapter('GTFS Estático Portugal'),
    });

    // 4. Fonte RSS (Avisos CP e Operadores)
    this.registerSource({
      id: 'src-rss-cp',
      name: 'Feed RSS Avisos CP',
      type: 'RSS_FEED',
      endpointUrl: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos/rss',
      enabled: true,
      pollingIntervalSeconds: 120,
      operatorCode: 'CP',
      adapter: new RssFeedAdapter('Avisos ao Passageiro CP', 'CP - Comboios de Portugal', 'CP'),
    });

    // 5. Fonte de Notícias (Agências de Informação e Noticiários de Trânsito)
    this.registerSource({
      id: 'src-news-traffic',
      name: 'Noticiário de Trânsito e Mobilidade',
      type: 'NEWS_FEED',
      endpointUrl: 'https://api.lusa.pt/transito/feed.json',
      enabled: true,
      pollingIntervalSeconds: 300,
      adapter: new NewsFeedAdapter('Notícias Nacionais de Mobilidade'),
    });
  }

  /**
   * Adiciona ou atualiza uma fonte de dados externa no gestor.
   */
  public registerSource(config: ExternalSourceConfig): void {
    this.sources.set(config.id, config);
  }

  /**
   * Retorna a lista de fontes configuradas.
   */
  public getRegisteredSources(): ExternalSourceConfig[] {
    return Array.from(this.sources.values());
  }

  /**
   * Consulta e normaliza eventos de TODAS as fontes ativas num único array unificado.
   */
  public async fetchAllEvents(): Promise<NormalizedTransitEvent[]> {
    const promises: Promise<NormalizedTransitEvent[]>[] = [];

    for (const source of this.sources.values()) {
      if (!source.enabled) continue;

      promises.push(
        source.adapter
          .fetchRaw(source.endpointUrl)
          .then((raw) => source.adapter.normalize(raw))
          .then((events) => events.filter((e) => source.adapter.validate(e)))
          .catch((err) => {
            console.warn(`[ExternalSourcesManager] Erro na fonte ${source.name}:`, err);
            return [];
          })
      );
    }

    const nestedResults = await Promise.all(promises);
    const flatResults = nestedResults.flat();

    return this.deduplicateEvents(flatResults);
  }

  /**
   * Consulta eventos filtrando por tipo de fonte externa (REST, GTFS_RT, RSS, etc.).
   */
  public async fetchEventsBySourceType(type: ExternalSourceType): Promise<NormalizedTransitEvent[]> {
    const all = await this.fetchAllEvents();
    return all.filter((ev) => ev.sourceType === type);
  }

  /**
   * Consulta eventos filtrando por operador.
   */
  public async fetchEventsByOperator(operatorNameOrCode: string): Promise<NormalizedTransitEvent[]> {
    const all = await this.fetchAllEvents();
    const query = operatorNameOrCode.toLowerCase();
    return all.filter(
      (ev) =>
        ev.operator.toLowerCase().includes(query) ||
        (ev.operatorCode && ev.operatorCode.toLowerCase() === query)
    );
  }

  /**
   * Desduplicação inteligente baseada em título similar e mesmo operador.
   */
  public deduplicateEvents(events: NormalizedTransitEvent[]): NormalizedTransitEvent[] {
    const seen = new Set<string>();
    const deduplicated: NormalizedTransitEvent[] = [];

    for (const event of events) {
      // Cria uma chave de impressão digital simplificada
      const fingerprint = `${event.operator.toLowerCase()}_${event.district.toLowerCase()}_${event.title.substring(0, 30).toLowerCase()}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        deduplicated.push(event);
      }
    }

    // Ordenação cronológica (mais recentes primeiro)
    return deduplicated.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Converte um evento normalizado externo diretamente no modelo interno Occurrence do PAROU.PT.
   * Permite que fontes externas alimentem o mapa e a lista de ocorrências da comunidade.
   */
  public convertToOccurrence(event: NormalizedTransitEvent): Occurrence {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      severity: event.severity,
      district: event.district,
      concelho: event.concelho,
      locationDetails: event.locationDetails,
      companyOrService: event.operator,
      reportedAt: event.publishedAt,
      timestamp: event.timestamp,
      commentsCount: 0,
      imagesCount: 0,
      status: event.status,
      upvotes: 1,
      confirmationsCount: 1,
      unconfirmedCount: 0,
      isCommunityVerified: event.isVerifiedSource,
      authorName: `Fonte Oficial (${event.sourceName})`,
    };
  }
}

// Instância singleton do serviço de integração
export const externalSourcesManager = new ExternalSourcesManager();

// Re-exportações de tipos e adaptadores
export * from './types';
export { RestApiAdapter } from './adapters/restAdapter';
export { GtfsStaticAdapter } from './adapters/gtfsAdapter';
export { GtfsRealtimeAdapter } from './adapters/gtfsRealtimeAdapter';
export { RssFeedAdapter } from './adapters/rssAdapter';
export { NewsFeedAdapter } from './adapters/newsAdapter';
