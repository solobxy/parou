import { Occurrence, PublicSourceConfig, IngestionSyncResult } from '../types';
import { obterIncidentes } from './fogosEngine';

export const REGISTERED_PUBLIC_SOURCES: PublicSourceConfig[] = [
  {
    id: 'carris_metropolitana_gtfs',
    name: 'Carris Metropolitana (GTFS-RT)',
    category: 'Autocarros & Rodoviário',
    type: 'GTFS_RT',
    endpointUrl: 'https://api.carrismetropolitana.pt/alerts',
    officialPortalUrl: 'https://www.carrismetropolitana.pt',
    description: 'Alertas de serviço em tempo real (GTFS-RT) cobrindo desvios, condicionamentos e cortes de trânsito na Área Metropolitana de Lisboa.',
    updateFrequency: 'Tempo Real (60s)',
    coverageArea: 'Área Metropolitana de Lisboa (18 Municípios)',
    status: 'a_verificar',
    pollingIntervalSeconds: 60,
    enabled: true,
  },
  {
    id: 'ipma_warnings',
    name: 'IPMA - Avisos Meteorológicos',
    category: 'Meteorologia',
    type: 'API',
    endpointUrl: 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json',
    officialPortalUrl: 'https://www.ipma.pt',
    description: 'Avisos meteorológicos oficiais em tempo real para os 18 distritos e ilhas com impacto direto em trânsito e travessias.',
    updateFrequency: 'A cada 5 min',
    coverageArea: 'Nacional (Continente, Açores, Madeira)',
    status: 'a_verificar',
    pollingIntervalSeconds: 300,
    enabled: true,
  },
  {
    id: 'rtp_transito_rss',
    name: 'Notícias & Trânsito Portugal (RSS)',
    category: 'Emergência & Trânsito',
    type: 'RSS',
    endpointUrl: 'https://www.noticiasaominuto.com/rss/auto',
    officialPortalUrl: 'https://www.noticiasaominuto.com/auto',
    description: 'Feed RSS público de alertas de estradas, tráfego, infraestruturas e circulação rodoviária em Portugal.',
    updateFrequency: 'A cada 5 min',
    coverageArea: 'Portugal Continental e Ilhas',
    status: 'a_verificar',
    pollingIntervalSeconds: 300,
    enabled: true,
  },
  {
    id: 'anepc_prociv',
    name: 'Proteção Civil & ANEPC',
    category: 'Emergência & Trânsito',
    type: 'API',
    endpointUrl: 'https://api.fogos.pt/v1/now',
    officialPortalUrl: 'https://prociv.pt',
    description: 'Dados abertos da ANEPC sobre acidentes rodoviários, cortes de via, inundações e operações de socorro em Portugal.',
    updateFrequency: 'A cada 5 min',
    coverageArea: 'Portugal Continental',
    status: 'a_verificar',
    pollingIntervalSeconds: 300,
    enabled: true,
  },
  {
    id: 'metro_lisboa_status',
    name: 'Metro de Lisboa (Estado das Linhas)',
    category: 'Metro & Urbano',
    type: 'OFFICIAL_PAGE',
    endpointUrl: 'https://www.metrolisboa.pt/viajar/estado-das-linhas/',
    officialPortalUrl: 'https://www.metrolisboa.pt',
    description: 'Página oficial de monitorização do estado de circulação das 4 linhas do Metropolitano de Lisboa (Azul, Amarela, Verde e Vermelha).',
    updateFrequency: 'A cada 5 min',
    coverageArea: 'Lisboa, Amadora, Odivelas',
    status: 'a_verificar',
    pollingIntervalSeconds: 300,
    enabled: true,
  },
];

// Updates source runtime health status strictly based on real HTTP probe results
export function updateSourceHealth(
  sourceId: string,
  status: 'online' | 'degraded' | 'offline' | 'a_verificar',
  statusCode?: number,
  error?: string,
  itemsCount?: number
) {
  const source = REGISTERED_PUBLIC_SOURCES.find((s) => s.id === sourceId);
  if (source) {
    source.status = status;
    source.lastSyncedAt = Date.now();
    source.lastStatusCode = statusCode;
    source.lastError = error;
    if (itemsCount !== undefined) {
      source.lastImportedCount = itemsCount;
      source.totalImportedCount = (source.totalImportedCount || 0) + itemsCount;
    }
  }
}

// Normalize district strings into canonical Portuguese districts
const KNOWN_DISTRICTS: Record<string, string> = {
  lisboa: 'Lisboa',
  porto: 'Porto',
  setubal: 'Setúbal',
  setúbal: 'Setúbal',
  braga: 'Braga',
  aveiro: 'Aveiro',
  coimbra: 'Coimbra',
  leiria: 'Leiria',
  santarem: 'Santarém',
  santarém: 'Santarém',
  faro: 'Faro',
  viseu: 'Viseu',
  'viana do castelo': 'Viana do Castelo',
  'vila real': 'Vila Real',
  braganca: 'Bragança',
  bragança: 'Bragança',
  guarda: 'Guarda',
  'castelo branco': 'Castelo Branco',
  portalegre: 'Portalegre',
  evora: 'Évora',
  évora: 'Évora',
  beja: 'Beja',
  açores: 'Região Autónoma dos Açores',
  acores: 'Região Autónoma dos Açores',
  madeira: 'Região Autónoma da Madeira',
};

export function normalizeDistrict(input?: string): string {
  if (!input) return 'Lisboa';
  const clean = input.trim().toLowerCase();
  for (const [key, val] of Object.entries(KNOWN_DISTRICTS)) {
    if (clean.includes(key)) return val;
  }
  return input.trim() || 'Lisboa';
}

// Resilient HTTP fetcher with timeout and real browser user-agent
async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 PAROU.PT/1.0',
        Accept: 'application/json, application/xml, text/xml, text/html, */*',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// ==========================================
// 1. INGESTION: CARRIS METROPOLITANA (GTFS-RT)
// ==========================================
export async function ingestCarrisMetropolitana(): Promise<{
  occurrences: Occurrence[];
  statusCode: number;
  error?: string;
}> {
  const occurrences: Occurrence[] = [];
  try {
    const res = await fetchWithTimeout('https://api.carrismetropolitana.pt/alerts', 8000);
    if (!res.ok) {
      const err = `HTTP ${res.status}: ${res.statusText || 'Erro no servidor Carris Metropolitana'}`;
      updateSourceHealth('carris_metropolitana_gtfs', 'offline', res.status, err, 0);
      return { occurrences: [], statusCode: res.status, error: err };
    }

    const alerts = await res.json();
    if (!Array.isArray(alerts)) {
      updateSourceHealth('carris_metropolitana_gtfs', 'online', 200, undefined, 0);
      return { occurrences: [], statusCode: 200 };
    }

    const now = Date.now();
    for (const alert of alerts.slice(0, 15)) {
      const title =
        alert.header_text?.translation?.[0]?.text?.trim() ||
        (typeof alert.header_text === 'string' ? alert.header_text.trim() : '') ||
        alert.cause ||
        'Condicionamento de Tráfego';

      const description =
        alert.description_text?.translation?.[0]?.text?.trim() ||
        (typeof alert.description_text === 'string' ? alert.description_text.trim() : '') ||
        'Alteração de serviço reportada pelo feed GTFS-RT oficial.';

      const informedRoutes: string[] = [];
      if (Array.isArray(alert.informed_entity)) {
        alert.informed_entity.forEach((e: any) => {
          if (e.route_id) informedRoutes.push(e.route_id);
        });
      }
      const routesStr = informedRoutes.slice(0, 8).join(', ');

      const cause = (alert.cause || '').toUpperCase();
      const effect = (alert.effect || '').toUpperCase();

      const isStrike = cause === 'STRIKE' || title.toLowerCase().includes('greve');
      const isDetour = effect === 'DETOUR' || title.toLowerCase().includes('corte') || title.toLowerCase().includes('desvio');
      const isSevere = isStrike || effect === 'NO_SERVICE' || title.toLowerCase().includes('corte de trânsito');

      let concelho = 'Lisboa';
      const fullText = `${title} ${description}`.toLowerCase();
      const concelhosAML = [
        'vila franca de xira', 'almada', 'sintra', 'cascais', 'amadora',
        'odivelas', 'loures', 'oeiras', 'setúbal', 'barreiro', 'seixal',
        'moita', 'montijo', 'palmela', 'sesimbra', 'alcochete', 'mafra', 'lisboa'
      ];
      for (const c of concelhosAML) {
        if (fullText.includes(c)) {
          concelho = c.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          break;
        }
      }

      const district = ['Setúbal', 'Almada', 'Barreiro', 'Seixal', 'Moita', 'Montijo', 'Palmela', 'Sesimbra', 'Alcochete'].includes(concelho)
        ? 'Setúbal'
        : 'Lisboa';

      const alertId = alert.id || Math.abs(title.split('').reduce((a: number, b: string) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString(36);

      occurrences.push({
        id: `carrismet-${alertId}`,
        title: `[Carris Metropolitana] ${title}`,
        description: `${description} ${routesStr ? `Linhas afetadas: ${routesStr}.` : ''} Município: ${concelho}. Dados oficiais em direto via feed GTFS-Realtime da Carris Metropolitana.`,
        type: isStrike ? 'GREVE' : isDetour ? 'CORTE' : 'ATRASOS',
        severity: isSevere ? 'Grave' : 'Moderada',
        district,
        concelho,
        locationDetails: routesStr ? `Linhas ${routesStr}` : `Rede ${concelho}`,
        companyOrService: 'Carris Metropolitana',
        reportedAt: 'recente',
        timestamp: now,
        commentsCount: 0,
        imagesCount: 0,
        status: 'Ativa',
        isCommunityVerified: true,
        authorName: 'Carris Metropolitana (GTFS-RT)',
        sourceName: 'Carris Metropolitana (GTFS-RT)',
        sourceType: 'GTFS_RT',
        sourceUrl: 'https://www.carrismetropolitana.pt/alertas',
        sourceFetchedAt: now,
        externalId: `carrismet-${alertId}`,
      });
    }

    updateSourceHealth('carris_metropolitana_gtfs', 'online', 200, undefined, occurrences.length);
    return { occurrences, statusCode: 200 };
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha de ligação';
    updateSourceHealth('carris_metropolitana_gtfs', 'offline', 0, errorMsg, 0);
    return { occurrences: [], statusCode: 0, error: errorMsg };
  }
}

// ==========================================
// 2. INGESTION: IPMA METEO WARNINGS (API)
// ==========================================
export async function ingestIPMA(): Promise<{
  occurrences: Occurrence[];
  statusCode: number;
  error?: string;
}> {
  const occurrences: Occurrence[] = [];
  try {
    const res = await fetchWithTimeout(
      'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json',
      8000
    );
    if (!res.ok) {
      const err = `HTTP ${res.status}: ${res.statusText || 'Erro no portal IPMA'}`;
      updateSourceHealth('ipma_warnings', 'offline', res.status, err, 0);
      return { occurrences: [], statusCode: res.status, error: err };
    }

    const json = await res.json();
    const warnings = Array.isArray(json) ? json : [];
    const now = Date.now();

    const areaMap: Record<string, string> = {
      AVR: 'Aveiro', BJA: 'Beja', BRG: 'Braga', BGC: 'Bragança',
      CBO: 'Castelo Branco', CBR: 'Coimbra', EVR: 'Évora', FAR: 'Faro',
      GDA: 'Guarda', LRA: 'Leiria', LSB: 'Lisboa', PTG: 'Portalegre',
      PRT: 'Porto', STR: 'Santarém', STB: 'Setúbal', VCT: 'Viana do Castelo',
      VRL: 'Vila Real', VIS: 'Viseu',
      ACE: 'Região Autónoma dos Açores',
      AOC: 'Região Autónoma dos Açores',
      AOR: 'Região Autónoma dos Açores',
      AÇR: 'Região Autónoma dos Açores',
      MDR: 'Região Autónoma da Madeira'
    };

    const areaLabels: Record<string, string> = {
      ACE: 'Açores (Grupo Central)',
      AOC: 'Açores (Grupo Ocidental)',
      AOR: 'Açores (Grupo Oriental)',
      MDR: 'Madeira',
    };

    const activeWarnings = warnings.filter((w: any) => {
      const level = (w.awarenessLevelID || '').toLowerCase();
      const isActive = !w.endTime || new Date(w.endTime).getTime() > now;
      return isActive && (level === 'yellow' || level === 'orange' || level === 'red');
    });

    for (const w of activeWarnings.slice(0, 15)) {
      const district = areaMap[w.idAreaAviso] || 'Lisboa';
      const areaLabel = areaLabels[w.idAreaAviso] || district;
      const typeName = w.awarenessTypeName || 'Meteorologia Adversa';
      const level = (w.awarenessLevelID || '').toLowerCase();
      const isSevere = level === 'orange' || level === 'red';
      const severityLabel = level === 'red' ? 'Grave' : level === 'orange' ? 'Grave' : 'Moderada';

      const startDateStr = w.startTime ? new Date(w.startTime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
      const endDateStr = w.endTime ? new Date(w.endTime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';

      const alertId = `ipma-${w.idAreaAviso}-${w.awarenessTypeName}-${w.startTime}`.replace(/[^a-zA-Z0-9-]/g, '_');

      occurrences.push({
        id: alertId,
        title: `[IPMA] Aviso ${level === 'red' ? 'Vermelho' : level === 'orange' ? 'Laranja' : 'Amarelo'}: ${typeName} em ${areaLabel}`,
        description: `${w.text || `Aviso meteorológico oficial emitido pelo IPMA para ${areaLabel} devido a ${typeName.toLowerCase()}.`} Período: ${startDateStr} até ${endDateStr}. Pode condicionar circulação rodoviária, pontes e travessias marítimas.`,
        type: 'AVARIA',
        severity: severityLabel,
        district,
        concelho: areaLabel,
        locationDetails: areaLabel,
        companyOrService: 'IPMA - Instituto Português do Mar e da Atmosfera',
        reportedAt: 'recente',
        timestamp: w.startTime ? new Date(w.startTime).getTime() : now,
        commentsCount: 0,
        imagesCount: 0,
        status: 'Ativa',
        isCommunityVerified: true,
        authorName: 'IPMA Oficial',
        sourceName: 'IPMA - Avisos Meteorológicos',
        sourceType: 'API',
        sourceUrl: 'https://www.ipma.pt/pt/otempo/prec-tempo/',
        sourceFetchedAt: now,
        externalId: alertId,
      });
    }

    updateSourceHealth('ipma_warnings', 'online', 200, undefined, occurrences.length);
    return { occurrences, statusCode: 200 };
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao aceder ao IPMA';
    updateSourceHealth('ipma_warnings', 'offline', 0, errorMsg, 0);
    return { occurrences: [], statusCode: 0, error: errorMsg };
  }
}

// ==========================================
// 3. INGESTION: RSS TRAFFIC & ROADS (RSS FEED)
// ==========================================
export async function ingestTrafficNewsRSS(): Promise<{
  occurrences: Occurrence[];
  statusCode: number;
  error?: string;
}> {
  const occurrences: Occurrence[] = [];
  try {
    const res = await fetchWithTimeout('https://www.noticiasaominuto.com/rss/auto', 8000);
    if (!res.ok) {
      const err = `HTTP ${res.status}: ${res.statusText || 'Erro no feed RSS'}`;
      updateSourceHealth('rtp_transito_rss', 'offline', res.status, err, 0);
      return { occurrences: [], statusCode: res.status, error: err };
    }

    const xml = await res.text();
    const now = Date.now();

    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    for (const itemXml of itemMatches.slice(0, 15)) {
      const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemXml.match(/<description>([\s\S]*?)<\/description>/);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : 'https://www.noticiasaominuto.com/auto';
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).getTime() : now;

      const fullText = `${title} ${desc}`.toLowerCase();

      // Only import transit-relevant items (accidents, roads, closures, strikes, tolls)
      const isTrafficRelevant =
        fullText.includes('acidente') ||
        fullText.includes('trânsito') ||
        fullText.includes('transito') ||
        fullText.includes('corte') ||
        fullText.includes('via') ||
        fullText.includes('fila') ||
        fullText.includes('autoestrada') ||
        fullText.includes('a1') ||
        fullText.includes('a2') ||
        fullText.includes('a5') ||
        fullText.includes('ic19') ||
        fullText.includes('vci') ||
        fullText.includes('greve') ||
        fullText.includes('metro') ||
        fullText.includes('comboio');

      if (!isTrafficRelevant) continue;

      let district = 'Lisboa';
      for (const [key, val] of Object.entries(KNOWN_DISTRICTS)) {
        if (fullText.includes(key)) {
          district = val;
          break;
        }
      }

      const isAccident = fullText.includes('acidente') || fullText.includes('colisão') || fullText.includes('despiste');
      const isStrike = fullText.includes('greve');
      const isRoadWork = fullText.includes('obras') || fullText.includes('manutenção');
      const isCut = fullText.includes('cortada') || fullText.includes('corte de via') || fullText.includes('cortado');

      const alertId = `rss-${Math.abs(title.split('').reduce((a: number, b: string) => ((a << 5) - a) + b.charCodeAt(0), 0)).toString(36)}`;

      occurrences.push({
        id: alertId,
        title: `[Trânsito] ${title}`,
        description: `${desc || title} Fonte: Notícias & Trânsito (Feed RSS).`,
        type: isAccident ? 'ACIDENTE' : isStrike ? 'GREVE' : isRoadWork ? 'OBRAS' : isCut ? 'CORTE' : 'ATRASOS',
        severity: isCut || (isAccident && fullText.includes('grave')) ? 'Grave' : 'Moderada',
        district,
        concelho: district,
        locationDetails: district,
        companyOrService: 'Notícias & Trânsito (RSS)',
        reportedAt: 'recente',
        timestamp: isNaN(pubDate) ? now : pubDate,
        commentsCount: 0,
        imagesCount: 0,
        status: 'Ativa',
        isCommunityVerified: true,
        authorName: 'Feed RSS Oficial',
        sourceName: 'Notícias & Trânsito (RSS)',
        sourceType: 'RSS',
        sourceUrl: link,
        sourceFetchedAt: now,
        externalId: alertId,
      });
    }

    updateSourceHealth('rtp_transito_rss', 'online', 200, undefined, occurrences.length);
    return { occurrences, statusCode: 200 };
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao aceder ao feed RSS';
    updateSourceHealth('rtp_transito_rss', 'offline', 0, errorMsg, 0);
    return { occurrences: [], statusCode: 0, error: errorMsg };
  }
}

// ==========================================
// 4. INGESTION: PROTEÇÃO CIVIL & ANEPC (API)
// ==========================================
export async function ingestANEPC(): Promise<{
  occurrences: Occurrence[];
  statusCode: number;
  error?: string;
}> {
  // Usa as ocorrências que o fogosEngine já tem em memória (a API do Fogos.pt só deixa
  // 1 pedido por hora sem chave: pedir aqui a cada 5 min esgotava-o e ficava tudo vazio).
  const { incidentes, atualizado } = obterIncidentes();
  const now = Date.now();
  const occurrences: Occurrence[] = [];
  for (const i of incidentes) {
    if (i.tipo !== 'acidente' && i.tipo !== 'inundacao') continue;
    const district = normalizeDistrict(i.distrito);
    occurrences.push({
      id: `anepc-${i.id}`,
      title: `${i.natureza}: ${i.local || i.concelho}`,
      description: `Ocorrência da Proteção Civil (ANEPC) em ${[i.local, i.concelho, i.distrito].filter(Boolean).join(', ')}. Estado: ${i.estado}. Meios: ${i.meios.humanos} operacionais, ${i.meios.terrestres} veículos${i.meios.aereos ? `, ${i.meios.aereos} meios aéreos` : ''}. Fonte: Fogos.pt.`,
      type: i.tipo === 'acidente' ? 'ACIDENTE' : 'CORTE',
      severity: i.importante || i.meios.humanos > 15 ? 'Grave' : 'Moderada',
      district,
      concelho: i.concelho,
      locationDetails: i.local,
      companyOrService: 'Proteção Civil (ANEPC)',
      reportedAt: 'recente',
      timestamp: i.inicio ? Date.parse(i.inicio) : now,
      commentsCount: 0,
      imagesCount: 0,
      status: 'Ativa',
      isCommunityVerified: true,
      authorName: 'Proteção Civil (ANEPC)',
      sourceName: 'Proteção Civil (via Fogos.pt)',
      sourceType: 'API',
      sourceUrl: 'https://fogos.pt',
      sourceFetchedAt: atualizado ? Date.parse(atualizado) : now,
      externalId: `anepc-${i.id}`,
      latitude: i.lat,
      longitude: i.lon,
    } as Occurrence);
  }
  updateSourceHealth('anepc_prociv', atualizado ? 'online' : 'offline', atualizado ? 200 : 0, atualizado ? undefined : 'À espera da primeira leitura do Fogos.pt', occurrences.length);
  return { occurrences, statusCode: 200 };
}

// ==========================================
// 5. INGESTION: METRO DE LISBOA (PÁGINA OFICIAL)
// ==========================================
export async function ingestMetroLisboa(): Promise<{
  occurrences: Occurrence[];
  statusCode: number;
  error?: string;
}> {
  const occurrences: Occurrence[] = [];
  const now = Date.now();

  try {
    const res = await fetchWithTimeout(
      'https://www.metrolisboa.pt/viajar/estado-das-linhas/',
      8000
    );
    if (!res.ok) {
      const err = `HTTP ${res.status}: ${res.statusText || 'Página oficial inacessível'}`;
      updateSourceHealth('metro_lisboa_status', 'offline', res.status, err, 0);
      return { occurrences: [], statusCode: res.status, error: err };
    }

    const html = await res.text();

    const lines = [
      { code: 'azul', name: 'Linha Azul (Gaivota)' },
      { code: 'amarela', name: 'Linha Amarela (Girassol)' },
      { code: 'verde', name: 'Linha Verde (Caravela)' },
      { code: 'vermelha', name: 'Linha Vermelha (Oriente)' },
    ];

    for (const line of lines) {
      const pattern = new RegExp(`${line.code}[\\s\\S]{1,500}?(perturba|interromp|atraso|avaria|demora|suspens)`, 'i');
      const match = pattern.exec(html);

      if (match) {
        const isInterrupted = /interromp|suspens/i.test(match[1]);
        occurrences.push({
          id: `metrolisboa-${line.code}-${new Date().toISOString().slice(0, 13)}`,
          title: `[Metro de Lisboa] ${line.name}: ${isInterrupted ? 'Circulação Interrompida' : 'Perturbações na Circulação'}`,
          description: `Aviso oficial extraído da página de estado das linhas do Metropolitano de Lisboa. A ${line.name} encontra-se com ${isInterrupted ? 'circulação temporariamente suspensa' : 'perturbações operacionais e tempos de espera acrescidos'}.`,
          type: isInterrupted ? 'CORTE' : 'ATRASOS',
          severity: isInterrupted ? 'Grave' : 'Moderada',
          district: 'Lisboa',
          concelho: 'Lisboa',
          locationDetails: line.name,
          companyOrService: 'Metro de Lisboa',
          reportedAt: 'recente',
          timestamp: now,
          commentsCount: 0,
          imagesCount: 0,
          status: 'Ativa',
          isCommunityVerified: true,
          authorName: 'Metro de Lisboa (Oficial)',
          sourceName: 'Metro de Lisboa (Estado das Linhas)',
          sourceType: 'OFFICIAL_PAGE',
          sourceUrl: 'https://www.metrolisboa.pt/viajar/estado-das-linhas/',
          sourceFetchedAt: now,
          externalId: `metrolisboa-${line.code}-${new Date().toISOString().slice(0, 13)}`,
        });
      }
    }

    updateSourceHealth('metro_lisboa_status', 'online', 200, undefined, occurrences.length);
    return { occurrences, statusCode: 200 };
  } catch (err: any) {
    const errorMsg = err?.message || 'Falha ao aceder à página do Metro de Lisboa';
    updateSourceHealth('metro_lisboa_status', 'offline', 0, errorMsg, 0);
    return { occurrences: [], statusCode: 0, error: errorMsg };
  }
}

// ==========================================
// MASTER AGGREGATOR & SYNC RUNNER
// ==========================================
export async function runAllPublicSourcesIngestion(): Promise<{
  result: IngestionSyncResult;
  occurrences: Occurrence[];
}> {
  const timestamp = Date.now();
  const allOccurrences: Occurrence[] = [];
  const details: IngestionSyncResult['details'] = [];

  // 1. Carris Metropolitana GTFS-RT (Realtime)
  const cmRes = await ingestCarrisMetropolitana();
  allOccurrences.push(...cmRes.occurrences);
  details.push({
    sourceId: 'carris_metropolitana_gtfs',
    sourceName: 'Carris Metropolitana (GTFS-RT)',
    type: 'GTFS_RT',
    status: cmRes.error ? 'error' : 'success',
    itemsFetched: cmRes.occurrences.length,
    itemsImported: cmRes.occurrences.length,
    error: cmRes.error,
  });

  // 2. IPMA Weather Warnings
  const ipmaRes = await ingestIPMA();
  allOccurrences.push(...ipmaRes.occurrences);
  details.push({
    sourceId: 'ipma_warnings',
    sourceName: 'IPMA - Avisos Meteorológicos',
    type: 'API',
    status: ipmaRes.error ? 'error' : 'success',
    itemsFetched: ipmaRes.occurrences.length,
    itemsImported: ipmaRes.occurrences.length,
    error: ipmaRes.error,
  });

  // 3. Notícias & Trânsito RSS
  const rssRes = await ingestTrafficNewsRSS();
  allOccurrences.push(...rssRes.occurrences);
  details.push({
    sourceId: 'rtp_transito_rss',
    sourceName: 'Notícias & Trânsito (RSS)',
    type: 'RSS',
    status: rssRes.error ? 'error' : 'success',
    itemsFetched: rssRes.occurrences.length,
    itemsImported: rssRes.occurrences.length,
    error: rssRes.error,
  });

  // 4. ANEPC / Fogos.pt API
  const anepcRes = await ingestANEPC();
  allOccurrences.push(...anepcRes.occurrences);
  details.push({
    sourceId: 'anepc_prociv',
    sourceName: 'Proteção Civil & ANEPC',
    type: 'API',
    status: anepcRes.error ? 'error' : 'success',
    itemsFetched: anepcRes.occurrences.length,
    itemsImported: anepcRes.occurrences.length,
    error: anepcRes.error,
  });

  // 5. Metro de Lisboa Official Page
  const metroRes = await ingestMetroLisboa();
  allOccurrences.push(...metroRes.occurrences);
  details.push({
    sourceId: 'metro_lisboa_status',
    sourceName: 'Metro de Lisboa (Estado das Linhas)',
    type: 'OFFICIAL_PAGE',
    status: metroRes.error ? 'error' : 'success',
    itemsFetched: metroRes.occurrences.length,
    itemsImported: metroRes.occurrences.length,
    error: metroRes.error,
  });

  // Deduplicate by externalId
  const uniqueMap = new Map<string, Occurrence>();
  for (const occ of allOccurrences) {
    const key = occ.externalId || occ.id;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, occ);
    }
  }

  const finalOccurrences = Array.from(uniqueMap.values());

  const result: IngestionSyncResult = {
    success: true,
    timestamp,
    sourcesProcessed: details.length,
    newOccurrencesCreated: finalOccurrences.length,
    existingOccurrencesUpdated: 0,
    details,
  };

  return { result, occurrences: finalOccurrences };
}
