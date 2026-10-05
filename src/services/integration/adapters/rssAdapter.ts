import { ExternalSourceAdapter, NormalizedTransitEvent } from '../types';
import { OccurrenceType, SeverityLevel, TransportMode } from '../../../types';

/**
 * Representação de itens num canal RSS 2.0 / Atom de avisos de operadores.
 */
export interface RssFeedItem {
  guid: string;
  title: string;
  link: string;
  description: string;
  pubDate: string; // Ex: "Wed, 30 Sep 2026 14:10:00 GMT"
  category?: string;
  author?: string;
}

export interface RssFeedChannel {
  title: string;
  link: string;
  description: string;
  language: string;
  lastBuildDate: string;
  items: RssFeedItem[];
}

export class RssFeedAdapter implements ExternalSourceAdapter<RssFeedChannel> {
  sourceType = 'RSS_FEED' as const;
  sourceName: string;
  operatorName: string;
  operatorCode: string;

  constructor(
    sourceName = 'Feed RSS Avisos ao Público',
    operatorName = 'CP - Comboios de Portugal',
    operatorCode = 'CP'
  ) {
    this.sourceName = sourceName;
    this.operatorName = operatorName;
    this.operatorCode = operatorCode;
  }

  async fetchRaw(endpointUrl?: string): Promise<RssFeedChannel> {
    // Quando ligar ao endpoint real (utilizando parser DOM / xml2js):
    // const res = await fetch(endpointUrl);
    // const xmlText = await res.text();
    // parseXml(xmlText);

    return {
      title: 'Avisos e Perturbações - CP',
      link: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos',
      description: 'Avisos em tempo real da circulação ferroviária nacional',
      language: 'pt-pt',
      lastBuildDate: new Date().toUTCString(),
      items: [
        {
          guid: 'cp-aviso-2026-8812',
          title: 'Greve convocada por sindicatos ferroviários para a próxima sexta-feira',
          link: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos/greve-nacional',
          description: 'Prevêem-se fortes perturbações na circulação de comboios Urbanos, Regionais e Alfa Pendular. Serviços mínimos decretados pelo Tribunal Arbitral.',
          pubDate: new Date(Date.now() - 45 * 60 * 1000).toUTCString(),
          category: 'Greves',
        },
        {
          guid: 'cp-aviso-2026-8813',
          title: 'Atrasos no Ramal de Tomar devido a trabalhos na infraestrutura',
          link: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos/ramal-tomar',
          description: 'Trabalhos urgentes na catenária obrigam a transbordo rodoviário entre Lamarosa e Tomar.',
          pubDate: new Date(Date.now() - 90 * 60 * 1000).toUTCString(),
          category: 'Obras',
        },
      ],
    };
  }

  async normalize(raw: RssFeedChannel): Promise<NormalizedTransitEvent[]> {
    if (!raw?.items || !Array.isArray(raw.items)) {
      return [];
    }

    return raw.items.map((item) => {
      const type = this.detectOccurrenceType(item.title, item.description, item.category);
      const severity = this.detectSeverity(item.title, item.description);
      const { district, concelho } = this.extractLocation(item.title + ' ' + item.description);
      const timestamp = new Date(item.pubDate).getTime() || Date.now();

      return {
        id: `ext-rss-${this.operatorCode.toLowerCase()}-${item.guid}`,
        sourceType: this.sourceType,
        sourceName: `${this.sourceName} (${this.operatorName})`,
        sourceUrl: item.link,
        externalId: item.guid,
        title: item.title,
        description: item.description,
        type,
        severity,
        district,
        concelho,
        locationDetails: district,
        operator: this.operatorName,
        operatorCode: this.operatorCode,
        mode: this.detectMode(this.operatorName),
        timestamp,
        publishedAt: this.formatRelativeTime(timestamp),
        status: 'Ativa',
        isVerifiedSource: true,
        rawPayload: item as unknown as Record<string, unknown>,
      };
    });
  }

  validate(event: NormalizedTransitEvent): boolean {
    return Boolean(event.id && event.title && event.operator && event.timestamp > 0);
  }

  private detectOccurrenceType(title: string, desc: string, category?: string): OccurrenceType {
    const full = `${title} ${desc} ${category || ''}`.toLowerCase();
    if (full.includes('greve') || full.includes('paralisação')) return 'GREVE';
    if (full.includes('acidente') || full.includes('colisão') || full.includes('atropelamento')) return 'ACIDENTE';
    if (full.includes('obra') || full.includes('trabalho') || full.includes('manutenção')) return 'OBRAS';
    if (full.includes('avaria') || full.includes('catenária') || full.includes('sinalização')) return 'AVARIA';
    if (full.includes('corte') || full.includes('interrupção') || full.includes('suprimido')) return 'CORTE';
    if (full.includes('atraso') || full.includes('demora')) return 'ATRASOS';
    return 'SERVICO_PUBLICO';
  }

  private detectSeverity(title: string, desc: string): SeverityLevel {
    const full = `${title} ${desc}`.toLowerCase();
    if (full.includes('greve') || full.includes('corte total') || full.includes('suspensa') || full.includes('interrupção')) {
      return 'Grave';
    }
    if (full.includes('atrasos') || full.includes('condicionamento') || full.includes('transbordo')) {
      return 'Moderada';
    }
    return 'Informação';
  }

  private detectMode(operator: string): TransportMode {
    const op = operator.toLowerCase();
    if (op.includes('metro')) return 'Metro';
    if (op.includes('cp') || op.includes('ferrovia') || op.includes('fertagus')) return 'Comboio';
    if (op.includes('carris') || op.includes('stcp') || op.includes('tub') || op.includes('bus')) return 'Autocarro';
    if (op.includes('transtejo') || op.includes('soflusa') || op.includes('barco')) return 'Barco';
    return 'Autocarro';
  }

  private extractLocation(text: string): { district: string; concelho: string } {
    const t = text.toLowerCase();
    if (t.includes('tomar') || t.includes('santarém')) return { district: 'Santarém', concelho: 'Tomar' };
    if (t.includes('porto') || t.includes('campanhã') || t.includes('são bento')) return { district: 'Porto', concelho: 'Porto' };
    if (t.includes('braga') || t.includes('guimarães')) return { district: 'Braga', concelho: 'Braga' };
    if (t.includes('coimbra')) return { district: 'Coimbra', concelho: 'Coimbra' };
    if (t.includes('faro') || t.includes('algarve') || t.includes('tunes')) return { district: 'Faro', concelho: 'Faro' };
    if (t.includes('setúbal') || t.includes('almada')) return { district: 'Setúbal', concelho: 'Setúbal' };
    return { district: 'Lisboa', concelho: 'Lisboa' };
  }

  private formatRelativeTime(ts: number): string {
    const diff = Math.round((Date.now() - ts) / (60 * 1000));
    if (diff < 2) return 'agora mesmo';
    if (diff < 60) return `há ${diff} min`;
    return `há ${Math.floor(diff / 60)}h`;
  }
}
