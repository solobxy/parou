import { ExternalSourceAdapter, NormalizedTransitEvent } from '../types';
import { OccurrenceType, SeverityLevel, TransportMode } from '../../../types';

/**
 * Estrutura representativa de um artigo ou notícia de trânsito/transportes em Portugal.
 */
export interface NewsFeedArticle {
  article_id: string;
  source_outlet: string; // Ex: "Lusa", "RTP Notícias", "Notícias ao Minuto"
  headline: string;
  body: string;
  url: string;
  published_time: string;
  tags: string[];
  location_hint?: string;
  operator_hint?: string;
}

export interface NewsFeedPayload {
  source: string;
  total_articles: number;
  articles: NewsFeedArticle[];
}

export class NewsFeedAdapter implements ExternalSourceAdapter<NewsFeedPayload> {
  sourceType = 'NEWS_FEED' as const;
  sourceName: string;

  constructor(sourceName = 'Feed Notícias Trânsito & Mobilidade') {
    this.sourceName = sourceName;
  }

  async fetchRaw(endpointUrl?: string): Promise<NewsFeedPayload> {
    return {
      source: 'Noticiário Nacional de Trânsito e Mobilidade',
      total_articles: 0,
      articles: [],
    };
  }

  async normalize(raw: NewsFeedPayload): Promise<NormalizedTransitEvent[]> {
    if (!raw?.articles || !Array.isArray(raw.articles)) {
      return [];
    }

    return raw.articles.map((art) => {
      const type = this.detectType(art.headline + ' ' + art.body);
      const severity = this.detectSeverity(art.headline + ' ' + art.body);
      const { district, concelho } = this.extractLocation(art.location_hint || art.headline + ' ' + art.body);
      const operator = art.operator_hint || this.extractOperator(art.headline + ' ' + art.body);
      const mode = this.detectMode(operator);
      const timestamp = new Date(art.published_time).getTime() || Date.now();

      return {
        id: `ext-news-${art.article_id}`,
        sourceType: this.sourceType,
        sourceName: `${this.sourceName} (${art.source_outlet})`,
        sourceUrl: art.url,
        externalId: art.article_id,
        title: art.headline,
        description: art.body,
        type,
        severity,
        district,
        concelho,
        locationDetails: art.location_hint || district,
        operator,
        mode,
        timestamp,
        publishedAt: this.formatRelativeTime(timestamp),
        status: 'Ativa',
        isVerifiedSource: true,
        rawPayload: art as unknown as Record<string, unknown>,
      };
    });
  }

  validate(event: NormalizedTransitEvent): boolean {
    return Boolean(event.id && event.title && event.description && event.timestamp > 0);
  }

  private detectType(text: string): OccurrenceType {
    const t = text.toLowerCase();
    if (t.includes('acidente') || t.includes('colisão') || t.includes('despiste')) return 'ACIDENTE';
    if (t.includes('greve') || t.includes('paralisação')) return 'GREVE';
    if (t.includes('avaria') || t.includes('falha técnica') || t.includes('elétrica')) return 'AVARIA';
    if (t.includes('obra') || t.includes('trabalho de via')) return 'OBRAS';
    if (t.includes('corte') || t.includes('interrupção')) return 'CORTE';
    if (t.includes('atraso') || t.includes('fila')) return 'ATRASOS';
    return 'SERVICO_PUBLICO';
  }

  private detectSeverity(text: string): SeverityLevel {
    const t = text.toLowerCase();
    if (t.includes('corte') || t.includes('aparatoso') || t.includes('paralisa') || t.includes('grave')) {
      return 'Grave';
    }
    if (t.includes('atrasos') || t.includes('filas') || t.includes('condiciona')) {
      return 'Moderada';
    }
    return 'Informação';
  }

  private extractOperator(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('metro do porto')) return 'Metro do Porto';
    if (t.includes('metro de lisboa')) return 'Metro de Lisboa';
    if (t.includes('cp') || t.includes('comboios')) return 'CP - Comboios de Portugal';
    if (t.includes('carris')) return 'Carris';
    if (t.includes('stcp')) return 'STCP';
    if (t.includes('fertagus')) return 'Fertagus';
    if (t.includes('brisa')) return 'Brisa Autoestradas';
    if (t.includes('transtejo')) return 'Transtejo Soflusa';
    return 'Tráfego Rodoviário Geral';
  }

  private detectMode(operator: string): TransportMode {
    const op = operator.toLowerCase();
    if (op.includes('metro')) return 'Metro';
    if (op.includes('cp') || op.includes('comboio') || op.includes('fertagus')) return 'Comboio';
    if (op.includes('carris') || op.includes('stcp') || op.includes('bus')) return 'Autocarro';
    if (op.includes('transtejo')) return 'Barco';
    return 'Autocarro';
  }

  private extractLocation(text: string): { district: string; concelho: string } {
    const t = text.toLowerCase();
    if (t.includes('porto') || t.includes('trindade')) return { district: 'Porto', concelho: 'Porto' };
    if (t.includes('alverca') || t.includes('vila franca de xira')) return { district: 'Lisboa', concelho: 'Vila Franca de Xira' };
    if (t.includes('braga')) return { district: 'Braga', concelho: 'Braga' };
    if (t.includes('coimbra')) return { district: 'Coimbra', concelho: 'Coimbra' };
    if (t.includes('faro') || t.includes('algarve')) return { district: 'Faro', concelho: 'Faro' };
    if (t.includes('setúbal')) return { district: 'Setúbal', concelho: 'Setúbal' };
    return { district: 'Lisboa', concelho: 'Lisboa' };
  }

  private formatRelativeTime(ts: number): string {
    const diff = Math.round((Date.now() - ts) / (60 * 1000));
    if (diff < 2) return 'agora mesmo';
    if (diff < 60) return `há ${diff} min`;
    return `há ${Math.floor(diff / 60)}h`;
  }
}
