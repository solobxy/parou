import express, { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import dotenv from 'dotenv';
import {
  classifyOccurrenceText,
  extractLocationFromText,
  identifyOperatorFromText,
  detectDuplicateOccurrence,
  summarizeOccurrenceText,
  analyzeOccurrenceAllInOne,
} from './src/server/deterministicNlpEngine';
import { INITIAL_TRANSIT_CATALOG } from './src/data/nationalTransitCatalog';
import { TransitCatalogEntry } from './src/types/catalog';
import { searchNormalizedTransit, TRANSIT_SOURCE_REGISTRY, getServiceById } from './src/server/transitEngine';
import { 
  aggregateNationalTransitServices, 
  getNationalServiceById 
} from './src/server/transitAggregatorEngine';
import { LinesEngine } from './src/server/linesEngine';
import { registarRotasDadosUtilizador } from './src/server/dadosUtilizador';
import { registarRotasComunidade, importarOcorrenciasPublicas } from './src/server/comunidade/rotas';
import { registarRotasEstatisticas } from './src/server/estatisticas';
import { registarRotasPush } from './src/server/avisosPush';
import { planearViagem } from './src/server/planeador';
import { registarPaginasSeo } from './src/server/seo/paginas';
import { paginaDaApp } from './src/server/seo/spa';
import { registarIndexNow } from './src/server/seo/indexnow';
import { iniciarFogos, obterIncidentes } from './src/server/fogosEngine';
import { getAllFeeds, logFetch, reloadDatabaseConnection, getSentidoParagem } from './src/server/db/gtfsDatabase';
import { iniciarDadosProntos, getEstadoDadosProntos, isDadosProntosPronto, atualizarDados, getManifestFeedsMap } from './src/server/dadosProntos';
import {
  getMasterSourceRegistry,
  syncAllOfficialGtfs,
  syncCarrisMetropolitanaApi
} from './src/server/gtfsStreamEngine';
import { 
  getDiscoveredOperators, 
  getDiscoveredSources, 
  runNationalSourceDiscovery, 
  getNationalAggregatorDiagnosticReport 
} from './src/server/sourceDiscoveryEngine';
import { 
  getTmlAgencies, 
  getTmlLines, 
  getTmlAlerts, 
  getTmlVehiclesAudited, 
  getLatestDiagnosticReport,
  getUnirDiagnosticReport
} from './src/server/tmlGoHubService';
import { getStcpLiveVehicles } from './src/server/portoOpenDataService';
import { 
  getCentralAlerts, 
  getCentralAlertsDiagnostic, 
  runCentralAlertsSync,
  incrementNotificationCounter 
} from './src/server/centralAlertsEngine';
import { RealtimeEngine } from './src/server/realtimeEngine';
import { obterAlertas, aquecerAlertas, obterCamadasMapa } from './src/server/alertasEngine';
import {
  getNearbyTransitData,
  searchDestinationSuggestions,
} from './src/server/pertoEngine';

dotenv.config();
// Enforce DISABLE_HMR in AI Studio runtime to disable WebSocket HMR
process.env.DISABLE_HMR = 'true';

const app = express();
app.use(compression());
// Ninguém pode meter a PAROU dentro de outro site (proteção contra cliques enganadores)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  next();
});
app.use(express.json({ limit: '2mb' }));

// Proteção contra abusos (robôs a pedir sem parar ou uma app com um erro em ciclo): limite
// generoso por endereço IP. Nas redes móveis muitas pessoas partilham o mesmo IP, por isso
// o limite é alto; uma pessoa normal faz umas dezenas de pedidos por minuto.
const LIMITE_POR_MINUTO = Number(process.env.PAROU_LIMITE_API || 1500);
const contagemIp = new Map<string, number>();
let janelaIp = Date.now();
const avisadosIp = new Set<string>();
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const agora = Date.now();
  if (agora - janelaIp > 60_000) { contagemIp.clear(); avisadosIp.clear(); janelaIp = agora; }
  const remoto = req.socket.remoteAddress || '';
  const local = remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1';
  const ip = (local ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || remoto;
  const n = (contagemIp.get(ip) || 0) + 1;
  contagemIp.set(ip, n);
  if (n > LIMITE_POR_MINUTO) {
    if (!avisadosIp.has(ip)) { avisadosIp.add(ip); console.warn(`[Limite] Demasiados pedidos de ${ip.replace(/\d+$/, 'x')}`); }
    res.setHeader('Retry-After', '30');
    return res.status(429).json({ erro: 'Demasiados pedidos. Tenta daqui a pouco.' });
  }
  next();
});

// Rotas de administração e diagnóstico: só com a chave de administração (ver /etc/parou.env).
// Sem chave configurada ficam todas fechadas. A chave vem no cabeçalho x-parou-admin ou em ?chave=.
// Guarda-se no servidor só o resumo SHA-256 da chave (PAROU_ADMIN_HASH), nunca a chave em si.
const CHAVE_ADMIN = String(process.env.PAROU_ADMIN_TOKEN || '').trim();
const RESUMO_ADMIN = String(process.env.PAROU_ADMIN_HASH || '').trim().toLowerCase();
const ROTAS_ADMIN: Array<[string, RegExp]> = [
  ['POST', /^\/api\/(public-sources\/sync|transit-catalog\/probe|transit\/discovery\/sync|central-alerts\/sync|coverage\/.+|feeds\/.+|diagnostico-unir\/paragens)\/?$/],
  ['GET', /^\/api\/(estatisticas\/resumo|transit\/diagnostic\/national|transit\/tml\/diagnostic|transit\/tml\/unir-diagnostic|central-alerts\/diagnostic|coverage\/logs|transit\/audit\/availability)\/?$/],
  ['GET', /^\/(debug\/.*|diagnostico-unir)\/?$/],
];
function pedidoDeAdmin(req: Request): boolean {
  const dada = String(req.headers['x-parou-admin'] || req.query.chave || '');
  if (dada.length < 16) return false;
  const resumoDado = crypto.createHash('sha256').update(dada).digest('hex');
  const esperado = RESUMO_ADMIN.length === 64
    ? RESUMO_ADMIN
    : CHAVE_ADMIN.length >= 16 ? crypto.createHash('sha256').update(CHAVE_ADMIN).digest('hex') : '';
  if (!esperado) return false;
  return crypto.timingSafeEqual(Buffer.from(resumoDado), Buffer.from(esperado));
}
app.use((req: Request, res: Response, next: NextFunction) => {
  const protegida = ROTAS_ADMIN.some(([m, re]) => m === req.method && re.test(req.path));
  if (!protegida || pedidoDeAdmin(req)) return next();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(403).json({ erro: 'Só para administração.' });
});
// IndexNow (Bing e outros): avisa das páginas novas quando o parou.pt já aponta para aqui
registarIndexNow(app);
// Cópia de segurança dos favoritos de cada telemóvel (ver src/server/dadosUtilizador.ts)
registarRotasDadosUtilizador(app);
// Contas, favoritos na conta, ocorrências da comunidade e reclamações (antes estavam no Firebase)
registarRotasComunidade(app, { eAdmin: pedidoDeAdmin });
// Contagem anónima de utilizadores (só a administração vê os números)
registarRotasEstatisticas(app, { eAdmin: pedidoDeAdmin });
// Notificações push (greves, avisos de mau tempo, perturbações graves), mesmo com a app fechada
registarRotasPush(app);
// Páginas públicas para os motores de pesquisa: linhas, paragens, operadores, greves e sitemaps
registarPaginasSeo(app);
// App Android (Trusted Web Activity): prova ao Android que a app pt.parou.app é do parou.pt,
// para abrir em ecrã inteiro sem barra do browser. A chave de envio está aqui; a chave da
// Google Play (assinatura da app) junta-se pela variável ANDROID_SHA256_EXTRA (separadas por vírgula).
const SHA256_ANDROID = [
  '13:BD:79:AE:A8:96:4D:FF:FD:7E:D3:12:46:F5:59:3A:C6:5D:5F:65:90:9C:C0:CB:56:FD:FA:60:EE:DE:27:3B',
  ...String(process.env.ANDROID_SHA256_EXTRA || '').split(',').map((x) => x.trim()).filter(Boolean),
];
app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'pt.parou.app', sha256_cert_fingerprints: SHA256_ANDROID },
  }]);
});

// Erros do browser (sem dados pessoais): ficam no registo do servidor para serem corrigidos
let errosNaUltimaHora = 0;
setInterval(() => { errosNaUltimaHora = 0; }, 3600_000);
app.post('/api/erros', (req: Request, res: Response) => {
  try {
    if (errosNaUltimaHora++ < 300) {
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const limpo = (v: unknown, n: number) => String(v ?? '').replace(/[\r\n]+/g, ' ⏎ ').slice(0, n);
      console.warn(`[Erro no browser] ${limpo(corpo.tipo, 20)} | ${limpo(corpo.pagina, 80)} | ${limpo(corpo.mensagem, 300)} | ${limpo(corpo.extra, 600)} | ${limpo(corpo.ua, 120)}`);
    }
  } catch {}
  res.status(204).end();
});

// Incêndios e ocorrências da Proteção Civil (Fogos.pt): atualizados em segundo plano
iniciarFogos();
app.get('/api/incendios', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(obterIncidentes());
});

// ==========================================
// 0. HEALTH CHECK (Responde 200 de imediato para verificações de URL e probes Cloud Run)
// ==========================================
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

const cliPortIndex = process.argv.indexOf('--port');
const cliPort = cliPortIndex !== -1 ? parseInt(process.argv[cliPortIndex + 1], 10) : NaN;
const port = !isNaN(cliPort)
  ? cliPort
  : (process.env.PORT ? Number(process.env.PORT) : 3000);

// ==========================================
// 1. CLASSIFICAR OCORRÊNCIA POR CATEGORIA (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/classify', (req: Request, res: Response) => {
  const { title, description } = req.body;
  if (!title && !description) {
    return res.status(400).json({ error: 'Título ou descrição são obrigatórios.' });
  }
  const result = classifyOccurrenceText(title || '', description || '');
  return res.json(result);
});

// ==========================================
// 2. EXTRAIR CIDADE E LOCALIZAÇÃO ESPECÍFICA (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/extract-location', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Texto para análise é obrigatório.' });
  }
  const result = extractLocationFromText(text);
  return res.json(result);
});

// ==========================================
// 3. IDENTIFICAR EMPRESA OU SERVIÇO AFETADO (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/identify-operator', (req: Request, res: Response) => {
  const { text, location } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Texto para análise é obrigatório.' });
  }
  const result = identifyOperatorFromText(text, location);
  return res.json(result);
});

// ==========================================
// 4. DETECTAR OCORRÊNCIAS DUPLICADAS (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/detect-duplicates', (req: Request, res: Response) => {
  const { newIncident, existingIncidents } = req.body;
  if (!newIncident || !Array.isArray(existingIncidents)) {
    return res.status(400).json({ error: 'newIncident e existingIncidents são obrigatórios.' });
  }
  const result = detectDuplicateOccurrence(newIncident, existingIncidents);
  return res.json(result);
});

// ==========================================
// 5. RESUMIR DESCRIÇÕES LONGAS (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/summarize', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Texto para resumo é obrigatório.' });
  }
  const result = summarizeOccurrenceText(text);
  return res.json(result);
});

// ==========================================
// 6. ANÁLISE INTEGRADA ALL-IN-ONE (Determinístico - Zero IA)
// ==========================================
app.post('/api/ai/analyze-occurrence', (req: Request, res: Response) => {
  const { title, description } = req.body;
  if (!title && !description) {
    return res.status(400).json({ error: 'Título ou descrição são obrigatórios.' });
  }
  const result = analyzeOccurrenceAllInOne(title || '', description || '');
  return res.json(result);
});

// ==========================================
// 7. FONTES PÚBLICAS & INGESTION ENGINE
// ==========================================
import { 
  REGISTERED_PUBLIC_SOURCES, 
  runAllPublicSourcesIngestion,
  ingestCarrisMetropolitana
} from './src/server/ingestionEngine';

// List all registered public sources with audited health status, real URLs, timestamps & errors
app.get('/api/public-sources', (req: Request, res: Response) => {
  return res.json({
    sources: REGISTERED_PUBLIC_SOURCES,
    totalSources: REGISTERED_PUBLIC_SOURCES.length,
    timestamp: Date.now(),
  });
});

// Run live ingestion across all categories (GTFS-RT, APIs, RSS, Official Pages)
app.post('/api/public-sources/sync', async (req: Request, res: Response) => {
  try {
    console.log('[Ingestion Engine] A iniciar sincronização auditada de fontes públicas...');
    const startTime = Date.now();
    const { result, occurrences } = await runAllPublicSourcesIngestion();
    const durationMs = Date.now() - startTime;

    console.log(`[Ingestion Engine] Concluído em ${durationMs}ms. ${occurrences.length} ocorrências reais.`);
    // As ocorrências das fontes oficiais entram na base da comunidade aqui, no servidor
    const { added, updated } = importarOcorrenciasPublicas(occurrences);
    return res.json({
      success: true,
      result,
      occurrences,
      added,
      updated,
      durationMs,
    });
  } catch (error: any) {
    console.error('[Ingestion Engine] Erro na sincronização:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao sincronizar dados das fontes públicas.',
      details: error?.message,
    });
  }
});

// Preview normalized live data without writing
app.get('/api/public-sources/preview', async (req: Request, res: Response) => {
  try {
    const { result, occurrences } = await runAllPublicSourcesIngestion();
    return res.json({ result, occurrences });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao recolher antevisão de fontes públicas.' });
  }
});

// ==========================================
// CATÁLOGO NACIONAL DE TRANSPORTES (PAROU.PT)
// Base oficial de operadores, redes e fontes de transporte em Portugal
// ==========================================
let transitCatalogState: TransitCatalogEntry[] = [...INITIAL_TRANSIT_CATALOG];

async function probeSingleCatalogEntry(entry: TransitCatalogEntry): Promise<TransitCatalogEntry> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(entry.source_url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PAROU-PT-Catalog-Validator/2.0',
        'Accept': '*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const isOk = res.status >= 200 && res.status < 400;
    return {
      ...entry,
      sync_status: isOk ? 'Online' : 'Offline',
      validation_status: isOk ? 'Ativa' : 'Erro de ligação',
      sync_http_code: res.status,
      sync_error_detail: isOk ? undefined : `HTTP ${res.status}: ${res.statusText}`,
      last_checked_at: new Date().toISOString(),
      last_update: isOk ? new Date().toISOString() : entry.last_update,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return {
      ...entry,
      sync_status: 'Offline',
      validation_status: 'Erro de ligação',
      sync_http_code: 0,
      sync_error_detail: error.name === 'AbortError' ? 'Tempo de ligação esgotado (timeout 4.5s)' : (error.message || 'Falha de rede/DNS'),
      last_checked_at: new Date().toISOString(),
    };
  }
}

async function probeAllCatalogEntries(): Promise<void> {
  const promises = transitCatalogState.map((entry) => probeSingleCatalogEntry(entry));
  transitCatalogState = await Promise.all(promises);
}

// O estado que interessa a quem usa a app é "temos os horários deste operador?" (e não se o
// site do operador respondeu): vem do manifesto da base de horários.
const FEED_DO_CATALOGO: Record<string, string | null> = {
  'carris-metropolitana': 'carris_metropolitana',
  'metro-lisboa': 'metro_lisboa',
  'unir-mobilidade': 'unir',
  'stcp': 'stcp',
  'metro-porto': 'metro_porto',
  'carris-lisboa': 'carris',
  'cp-comboios': 'cp',
  'fertagus': 'fertagus',
  'transtejo-soflusa': 'transtejo_soflusa',
  'tcb-barreiro': 'tcb_barreiro',
  'tub-braga': 'tub_braga',
  'smtuc-coimbra': 'smtuc',
  'horarios-funchal': 'horarios_funchal',
  'vamus-algarve': 'vamus',
  'guimabus': 'guimabus',
  'mobilis-leiria': null,
  'mobicascais': 'mdb-1272',
  'muv-viana': null,
  'tut-torres-vedras': null,
  'covilha-mobilidade': null,
};
function catalogoComEstadoDosDados(): any[] {
  const feeds = getManifestFeedsMap();
  if (!feeds || feeds.size === 0) return transitCatalogState;
  return transitCatalogState.map((c: any) => {
    if (!(c.id in FEED_DO_CATALOGO)) return c; // portais de dados: fica o teste ao site
    const feedId = FEED_DO_CATALOGO[c.id];
    const f = feedId ? feeds.get(feedId) : null;
    const ok = Boolean(f && String(f.status || '').toUpperCase() === 'OK' && Number(f.stops || 0) > 0);
    return { ...c, sync_status: ok ? 'Online' : 'Pendente' };
  });
}

// Obter catálogo completo com estados de validação em tempo real
app.get('/api/transit-catalog', (req: Request, res: Response) => {
  const catalogo = catalogoComEstadoDosDados();
  return res.json({
    catalog: catalogo,
    total: catalogo.length,
    activeCount: catalogo.filter(c => c.sync_status === 'Online').length,
    realtimeCount: catalogo.filter(c => c.realtime_available).length,
    alertsCount: catalogo.filter(c => c.alerts_available).length,
    timestamp: Date.now(),
  });
});

// Testar ao vivo todas as fontes ou uma fonte específica por ID
app.post('/api/transit-catalog/probe', async (req: Request, res: Response) => {
  const { operatorId } = req.body || {};
  try {
    if (operatorId) {
      const idx = transitCatalogState.findIndex(c => c.id === operatorId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Operador não encontrado no catálogo.' });
      }
      const updated = await probeSingleCatalogEntry(transitCatalogState[idx]);
      transitCatalogState[idx] = updated;
      return res.json({ success: true, entry: catalogoComEstadoDosDados()[idx] });
    } else {
      await probeAllCatalogEntries();
      return res.json({
        success: true,
        catalog: catalogoComEstadoDosDados(),
        activeCount: catalogoComEstadoDosDados().filter(c => c.sync_status === 'Online').length,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao validar fontes do catálogo.', details: err.message });
  }
});

// ==========================================
// MOTOR REAL DE TRANSPORTES E HORÁRIOS (PAROU.PT)
// Normalizador multimodal: TML, UNIR, STCP, Metro, CP, Fertagus, TTSL, etc.
// ==========================================

// API: Pesquisa de Horários Normalizados em Portugal
app.get('/api/transit/search', async (req: Request, res: Response) => {
  try {
    if (!isDadosProntosPronto()) {
      const estado = getEstadoDadosProntos();
      return res.json({
        status: 'loading',
        isLoading: true,
        message: estado.message || 'A carregar horários…',
        totalOperators: estado.totalOperators,
        loadedOperators: estado.loadedOperators,
        results: [],
        total: 0,
        sources_registry: [],
        timestamp: Date.now(),
      });
    }

    const {
      query,
      origin,
      destination,
      stop,
      operator,
      line,
      transport_mode,
      region,
      municipality,
      date,
      time,
      only_realtime,
    } = req.query;

    const data = await aggregateNationalTransitServices({
      query: typeof query === 'string' ? query : undefined,
      origin: typeof origin === 'string' ? origin : undefined,
      destination: typeof destination === 'string' ? destination : undefined,
      stop: typeof stop === 'string' ? stop : undefined,
      operator: typeof operator === 'string' ? operator : undefined,
      line: typeof line === 'string' ? line : undefined,
      transport_mode: typeof transport_mode === 'string' ? transport_mode : undefined,
      region: typeof region === 'string' ? region : undefined,
      municipality: typeof municipality === 'string' ? municipality : undefined,
      date: typeof date === 'string' ? date : undefined,
      time: typeof time === 'string' ? time : undefined,
      only_realtime: only_realtime === 'true',
    });

    return res.json({
      results: data.services,
      services: data.services,
      total: data.total,
      sources_registry: data.registry,
      timestamp: data.timestamp,
    });
  } catch (error: any) {
    console.error('[Transit Search API] Erro ao pesquisar horários:', error);
    return res.json({
      results: [],
      services: [],
      total: 0,
      sources_registry: [],
      timestamp: new Date().toISOString(),
    });
  }
});

// ==========================================
// SOURCE DISCOVERY ENGINE & NATIONAL DIAGNOSTIC
// ==========================================

// API: Operadores Descobertos Nacionalmente (NAP / IMT, TML Hub, Porto Digital)
app.get('/api/transit/discovery/operators', (req: Request, res: Response) => {
  const operators = getDiscoveredOperators();
  return res.json({
    operators,
    total: operators.length,
    timestamp: new Date().toISOString(),
  });
});

// API: Fontes de Dados Descobertas
app.get('/api/transit/discovery/sources', (req: Request, res: Response) => {
  const sources = getDiscoveredSources();
  return res.json({
    sources,
    total: sources.length,
    timestamp: new Date().toISOString(),
  });
});

// API: Executar Descoberta e Validação de Fontes
app.post('/api/transit/discovery/sync', async (req: Request, res: Response) => {
  try {
    const result = await runNationalSourceDiscovery();
    return res.json({
      success: true,
      message: 'Descoberta nacional de operadores e fontes concluída com sucesso.',
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao executar descoberta de fontes.', details: err.message });
  }
});

// API: Relatório de Diagnóstico Admin Nacional (12 Colunas por Operador)
app.get('/api/transit/diagnostic/national', async (req: Request, res: Response) => {
  try {
    const report = await getNationalAggregatorDiagnosticReport();
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao gerar relatório de diagnóstico nacional.', details: err.message });
  }
});

// API: Registo de Fontes de Transporte (Expandido por fonte oficial com métricas completas e totais nacionais)

app.get('/api/transit/sources', async (req: Request, res: Response) => {
  const feeds = getAllFeeds();

  let liveVehiclesList: any[] = [];
  let alertsList: any[] = [];
  try {
    liveVehiclesList = await RealtimeEngine.getLiveVehicles();
  } catch {}
  try {
    alertsList = await getCentralAlerts();
  } catch {}

  const sources = feeds.map((f) => {
    const fId = (f.id || '').toLowerCase();
    const fName = (f.operator_name || '').toLowerCase();

    const opVehicles = liveVehiclesList.filter((v) => {
      const vOp = (v.operator || '').toLowerCase();
      if (!vOp) return false;
      if (fId === 'carris_metropolitana' && (vOp.includes('carris metropolitana') || vOp === 'cm')) return true;
      if (fId === 'stcp' && vOp.includes('stcp')) return true;
      return vOp.includes(fId) || (fName.length > 3 && vOp.includes(fName));
    }).length;

    const opAlerts = alertsList.filter((a) => {
      const aOp = (a.operador || a.operator || '').toLowerCase();
      if (!aOp) return false;
      if (fId === 'carris_metropolitana' && (aOp.includes('carris metropolitana') || aOp === 'cm')) return true;
      if (fId === 'stcp' && aOp.includes('stcp')) return true;
      return aOp.includes(fId) || (fName.length > 3 && aOp.includes(fName));
    }).length;

    return {
      source_id: f.id,
      id: f.id,
      operator: f.operator_name,
      operador: f.operator_name,
      region: f.source_origin === 'seed' ? 'Nacional / Regional' : 'Descoberta Automática',
      região: f.source_origin === 'seed' ? 'Nacional / Regional' : 'Descoberta Automática',
      modes: [f.mode],
      modos: [f.mode],
      source_url: f.url,
      url: f.url,
      feed_url: f.latest_url || f.url,
      source_type: (f.feed_type === 'api' ? 'API' : 'GTFS') as any,
      realtime_available: Boolean(f.realtime_entities && f.realtime_entities !== 'Nenhum'),
      alerts_available: Boolean(f.realtime_entities?.includes('Alertas')),
      auth_required: Boolean(f.auth_type && f.auth_type !== 'none'),
      sync_status: (f.status === 'OK'
        ? 'Online'
        : f.status === 'horário expirado'
        ? 'Horário expirado'
        : f.status === 'A aguardar' || f.status === 'queued'
        ? 'Pendente'
        : 'Offline') as any,
      status: f.status,
      estado: f.status,
      status_type: f.status,
      records_count: f.lines_count || 0,
      imported_lines: f.lines_count || 0,
      imported_stops: f.stops_count || 0,
      imported_trips: f.trips_count || 0,
      routes_count: f.lines_count || 0,
      stops_count: f.stops_count || 0,
      trips_count: f.trips_count || 0,
      validity_start: f.valid_from,
      validity_end: f.valid_until,
      valid_from: f.valid_from,
      valid_until: f.valid_until,
      progress: f.progress || f.status,
      received_vehicles: opVehicles,
      presented_vehicles: opVehicles,
      received_alerts: opAlerts,
      last_update: f.last_ok || f.last_fetch_at || new Date().toISOString(),
      last_updated: f.last_ok || f.last_fetch_at,
      last_ok: f.last_ok,
      last_error: f.last_error,
    };
  });

  const totals = {
    total_operators: sources.length,
    total_lines: sources.reduce((a, s) => a + (s.routes_count || 0), 0),
    total_stops: sources.reduce((a, s) => a + (s.stops_count || 0), 0),
    total_trips: sources.reduce((a, s) => a + (s.trips_count || 0), 0),
    ok_count: sources.filter((s) => s.status === 'OK').length,
    expired_count: sources.filter((s) => s.status === 'horário expirado').length,
  };

  return res.json({
    sources,
    totals,
    total: sources.length,
    loading_status: getEstadoDadosProntos(),
    timestamp: Date.now(),
  });
});

app.get('/api/transit/loading-status', (_req: Request, res: Response) => {
  return res.json(getEstadoDadosProntos());
});

// ==========================================
// LINES & HORÁRIOS UNIFIED ENGINE (REQUIREMENT 5)
// ==========================================
app.get('/api/lines', async (req: Request, res: Response) => {
  try {
    if (!isDadosProntosPronto()) {
      const estado = getEstadoDadosProntos();
      return res.json({
        status: 'loading',
        isLoading: true,
        message: estado.message || 'A carregar horários…',
        totalOperators: estado.totalOperators,
        loadedOperators: estado.loadedOperators,
        lines: [],
        total: 0,
        page: 1,
        total_pages: 1,
      });
    }

    const near = req.query.near as string | undefined;
    const ids = req.query.ids as string | undefined;
    const q = req.query.q as string | undefined;
    const mode = req.query.mode as string | undefined;
    const page = Number(req.query.page) || 1;
    const r = Number(req.query.r) || 500;

    if (near) {
      const [latStr, lonStr] = near.split(',');
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: 'Parâmetro near inválido. Use near=lat,lon' });
      }
      const lines = await LinesEngine.getLinesNear(lat, lon, r);
      return res.json({ lines, total: lines.length });
    }

    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      const lines = await LinesEngine.getLinesByIds(idList);
      return res.json({ lines, total: lines.length });
    }

    const result = await LinesEngine.searchLines(q, mode, page, 50);
    return res.json(result);
  } catch (err: any) {
    console.error('[API /api/lines] Erro:', err);
    return res.status(500).json({ error: 'Erro ao consultar linhas.', details: err.message });
  }
});

app.get('/api/lines/:id', async (req: Request, res: Response) => {
  try {
    if (!isDadosProntosPronto()) {
      return res.status(503).json({
        status: 'loading',
        isLoading: true,
        message: 'A carregar horários…',
      });
    }
    const line = await LinesEngine.getLineDetail(req.params.id);
    if (!line) {
      return res.status(404).json({ error: 'Linha não encontrada.' });
    }
    return res.json(line);
  } catch (err: any) {
    console.error('[API /api/lines/:id] Erro:', err);
    return res.status(500).json({ error: 'Erro ao obter detalhe da linha.', details: err.message });
  }
});

app.get('/api/stops/:id/departures', async (req: Request, res: Response) => {
  try {
    if (!isDadosProntosPronto()) {
      return res.json({
        status: 'loading',
        isLoading: true,
        message: 'A carregar horários…',
        stop_id: req.params.id,
        stop_name: '',
        departures: [],
      });
    }
    const limit = Number(req.query.n) || 5;
    const departures = await LinesEngine.getStopDepartures(req.params.id, limit);
    return res.json(departures);
  } catch (err: any) {
    console.error('[API /api/stops/:id/departures] Erro:', err);
    return res.status(500).json({ error: 'Erro ao obter partidas da paragem.', details: err.message });
  }
});

// API: Detalhe de uma Linha / Serviço Específico
app.get('/api/transit/line/:id', (req: Request, res: Response) => {
  const line = getNationalServiceById(req.params.id) || getServiceById(req.params.id);
  if (!line) {
    return res.status(404).json({ error: 'Linha de transporte não encontrada.' });
  }
  return res.json(line);
});

// API: Auditoria Global de Disponibilidade de Serviços e Deteção de Discrepâncias
app.get('/api/transit/audit/availability', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const { auditAllRoutesAvailability } = await import('./src/server/gtfsAuditorEngine');
    const report = await auditAllRoutesAvailability(typeof date === 'string' ? date : undefined);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao executar auditoria global de disponibilidade.', details: err.message });
  }
});

// ==========================================
// TML GO HUB OFFICIAL ENDPOINTS & AUDIT
// Direct connection to https://go.tmlmobilidade.pt/hub/api/v1
// ==========================================

// TML GO Hub: Diagnóstico Interno do Sistema de Transportes
app.get('/api/transit/tml/diagnostic', async (req: Request, res: Response) => {
  try {
    const { diagnostic } = await getTmlVehiclesAudited();
    return res.json(diagnostic);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao gerar relatório de diagnóstico TML GO Hub.', details: err.message });
  }
});

// TML GO Hub: Diagnóstico Crítico UNIR Realtime (AMP)
app.get('/api/transit/tml/unir-diagnostic', async (req: Request, res: Response) => {
  try {
    const unirReport = await getUnirDiagnosticReport();
    return res.json(unirReport);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao gerar diagnóstico UNIR.', details: err.message });
  }
});

// TML GO Hub & STCP Realtime: Veículos Realtime Auditados (Sem limites artificiais)
app.get('/api/transit/tml/vehicles', async (req: Request, res: Response) => {
  try {
    // Parallel fetch with complete operator fault isolation (Requirement 3 & 4)
    const [tmlResult, stcpResult] = await Promise.allSettled([
      getTmlVehiclesAudited(),
      getStcpLiveVehicles(),
    ]);

    const vehicles: any[] = tmlResult.status === 'fulfilled' ? tmlResult.value.vehicles : [];
    const diagnostic = tmlResult.status === 'fulfilled' ? tmlResult.value.diagnostic : {
      timestamp: new Date().toISOString(),
      vehicles_received: 0,
      vehicles_valid: 0,
      vehicles_discarded: 0,
      discard_reasons: {},
    };

    let allVehicles = [...vehicles];

    // STCP Realtime buses (Porto Open Data: urban-platform-bus-location)
    if (stcpResult.status === 'fulfilled' && Array.isArray(stcpResult.value)) {
      for (const b of stcpResult.value) {
        allVehicles.push({
          id: b.id,
          vehicle_id: b.vehicle_id,
          agency_id: 'stcp',
          agency_name: 'STCP (Porto)',
          line_code: b.line,
          line_name: `Linha ${b.line}`,
          line_color: '#187EC2',
          line_text_color: '#FFFFFF',
          latitude: b.lat,
          longitude: b.lon,
          bearing: b.bearing,
          speed: b.speed,
          current_status: 'IN_TRANSIT_TO',
          last_updated: new Date(b.timestamp * 1000).toISOString(),
        } as any);
      }
    }

    // Optional viewport / bounds filtering if requested by map
    const { minLat, maxLat, minLon, maxLon, agency, line } = req.query;
    let filtered = allVehicles;

    if (minLat && maxLat && minLon && maxLon) {
      const minLt = Number(minLat);
      const maxLt = Number(maxLat);
      const minLn = Number(minLon);
      const maxLn = Number(maxLon);
      filtered = filtered.filter(v => v.latitude >= minLt && v.latitude <= maxLt && v.longitude >= minLn && v.longitude <= maxLn);
    }

    if (agency && typeof agency === 'string' && agency !== 'Todos') {
      filtered = filtered.filter(v => v.agency_name.toLowerCase().includes(agency.toLowerCase()) || v.agency_id === agency);
    }

    if (line && typeof line === 'string') {
      filtered = filtered.filter(v => v.line_code.toLowerCase().includes(line.toLowerCase()));
    }

    return res.json({
      vehicles: filtered,
      total_received: diagnostic.vehicles_received + (allVehicles.length - vehicles.length),
      total_valid: diagnostic.vehicles_valid + (allVehicles.length - vehicles.length),
      total_discarded: diagnostic.vehicles_discarded,
      total_presented: filtered.length,
      discard_reasons: diagnostic.discard_reasons,
      timestamp: diagnostic.timestamp,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter veículos em tempo real.', details: err.message });
  }
});

// TML GO Hub: Agências Oficiais e Capacidades
app.get('/api/transit/tml/agencies', async (req: Request, res: Response) => {
  try {
    const agencies = await getTmlAgencies();
    return res.json({ agencies, total: agencies.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter agências da TML.', details: err.message });
  }
});

// TML GO Hub: Todas as Linhas da Rede (Sem cortes artificiais)
app.get('/api/transit/tml/lines', async (req: Request, res: Response) => {
  try {
    const lines = await getTmlLines();
    return res.json({ lines, total: lines.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter linhas da rede TML.', details: err.message });
  }
});

// TML GO Hub: Alertas Oficiais de Serviço
app.get('/api/transit/tml/alerts', async (req: Request, res: Response) => {
  try {
    const alerts = await getTmlAlerts();
    return res.json({ alerts, total: alerts.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter alertas da TML.', details: err.message });
  }
});

// ==========================================
// PAROU.PT — ALERTAS (tempo, avisos IPMA, feriados, greves, perturbações, notícias)
// ==========================================
app.get('/api/alertas', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const area = typeof req.query.area === 'string' ? req.query.area.toUpperCase().slice(0, 4) : undefined;
    const valido = Number.isFinite(lat) && Number.isFinite(lon) && lat > 29 && lat < 44 && lon > -32 && lon < -5;
    const dados = await obterAlertas(valido ? { lat, lon } : { area });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(dados);
  } catch (err: any) {
    console.error('[Alertas API] Erro:', err);
    return res.status(500).json({ error: 'Não foi possível obter os alertas.' });
  }
});
app.get('/api/mapa', async (_req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await obterCamadasMapa());
  } catch (err: any) {
    console.error('[Mapa API] Erro:', err?.message || err);
    res.status(500).json({ error: 'Não foi possível obter o mapa.' });
  }
});
aquecerAlertas();

// ==========================================
// PAROU.PT — CENTRO DE ALERTAS
// Sistema central de alertas auditados
// ==========================================
app.get('/api/central-alerts', async (req: Request, res: Response) => {
  try {
    const { status, tipo, operador, regiao, municipio, linha, search } = req.query;
    const alerts = await getCentralAlerts({
      status: typeof status === 'string' ? (status as any) : undefined,
      tipo: typeof tipo === 'string' ? (tipo as any) : undefined,
      operador: typeof operador === 'string' ? operador : undefined,
      regiao: typeof regiao === 'string' ? regiao : undefined,
      municipio: typeof municipio === 'string' ? municipio : undefined,
      linha: typeof linha === 'string' ? linha : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
    return res.json({
      alerts,
      total: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Central Alerts API] Erro ao obter alertas:', err);
    return res.status(500).json({ error: 'Erro ao consultar Centro de Alertas.', details: err.message });
  }
});

app.get('/api/central-alerts/diagnostic', (req: Request, res: Response) => {
  try {
    const diagnostic = getCentralAlertsDiagnostic();
    return res.json(diagnostic);
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter diagnóstico de alertas.', details: err.message });
  }
});

app.post('/api/central-alerts/sync', async (req: Request, res: Response) => {
  try {
    const syncRes = await runCentralAlertsSync();
    return res.json({ success: true, ...syncRes });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao sincronizar alertas.', details: err.message });
  }
});

app.post('/api/central-alerts/notify-sent', (req: Request, res: Response) => {
  incrementNotificationCounter();
  return res.json({ success: true });
});

// ==========================================
// PAROU PERTO - NEARBY TRANSIT & MOBILITY API (ALL FEEDS UNIFIED)
// ==========================================
app.get('/api/transit/nearby', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!isDadosProntosPronto()) {
      const estado = getEstadoDadosProntos();
      return res.json({
        status: 'loading',
        isLoading: true,
        message: estado.message || 'A carregar horários…',
        totalOperators: estado.totalOperators,
        loadedOperators: estado.loadedOperators,
        stops: [],
        vehicles: [],
        alerts: [],
        radiusMeters: Number(req.query.radius) || 500,
        timestamp: new Date().toISOString(),
      });
    }

    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = Number(req.query.radius) || 500;

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Parâmetros de latitude e longitude inválidos.' });
    }

    let nearbyStops = await StopsEngine.getNearbyUnifiedStops(lat, lon, radius, 1000);
    // Em zonas com poucas paragens, se não houver nenhuma no raio pedido alarga até 2 km e
    // depois 3 km, para mostrar sempre as mais próximas (com a distância real a pé).
    let raioUsado = radius;
    for (const raio of [2000, 3000]) {
      if (nearbyStops.length > 0 || raio <= raioUsado) continue;
      nearbyStops = await StopsEngine.getNearbyUnifiedStops(lat, lon, raio, 1000);
      raioUsado = raio;
    }
    const now = new Date();

    // Enrich top 8 stops with real departures from nextDepartures in parallel, retain all others
    const topStops = nearbyStops.slice(0, 8);
    const otherStops = nearbyStops.slice(8);

    const [enrichedTopStops, liveVehicles, allAlerts] = await Promise.all([
      Promise.all(
        topStops.map(async (stop) => {
          try {
            const depResult = await DepartureEngine.nextDepartures(stop, now, 5);
            return {
              ...stop,
              departures: depResult.departures,
              status_notice: depResult.status_notice,
              has_realtime: depResult.has_realtime,
            };
          } catch {
            return {
              ...stop,
              departures: [],
              status_notice: undefined,
              has_realtime: false,
            };
          }
        })
      ),
      comPrazo(RealtimeEngine.getLiveVehicles(), 1500, []),
      comPrazo(getCentralAlerts(), 1500, []),
    ]);

    const enrichedOtherStops = otherStops.map((stop) => ({
      ...stop,
      departures: [],
      status_notice: undefined,
      has_realtime: false,
    }));

    const enrichedStops = [...enrichedTopStops, ...enrichedOtherStops];

    // Format stops to exact NearbyStopItem contract expected by PertoView
    const mappedStops = enrichedStops.map((stop) => {
      const distM = Math.round(StopsEngine.calculateDistanceMeters(lat, lon, stop.lat, stop.lon));
      const formattedDist = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
      const walkMins = Math.max(1, Math.round(distM / 80));

      const rawMode = (stop.modes[0] || '').toLowerCase();
      let primaryMode = 'Autocarro';
      if (rawMode.includes('metro') || rawMode.includes('subway') || rawMode.includes('tram') || rawMode.includes('mst')) {
        primaryMode = 'Metro';
      } else if (rawMode.includes('comboio') || rawMode.includes('train') || rawMode.includes('rail') || rawMode.includes('fertagus') || rawMode.includes('cp')) {
        primaryMode = 'Comboio';
      } else if (rawMode.includes('barco') || rawMode.includes('ferry') || rawMode.includes('fluvial')) {
        primaryMode = 'Barco';
      }

      const opName = stop.operators[0] || 'Transportes';

      const nextDeps = (stop.departures || []).map((d) => ({
        lineCode: d.route_short_name || d.route_id,
        lineName: d.route_long_name || d.route_short_name || '',
        lineColor: d.route_color || '#3b82f6',
        destination: d.headsign || 'Terminal',
        operatorName: d.operator_name || opName,
        operatorId: d.feed_id,
        tripId: d.trip_id,
        stopId: d.stop_id,
        transportMode: primaryMode as any,
        departureTime: d.display_text,
        displayText: d.display_text,
        scheduledTime: d.scheduled_time,
        expectedTime: d.is_realtime && d.realtime_time ? d.realtime_time : undefined,
        etaMinutes: Math.max(0, Math.round(((d.is_realtime && d.realtime_epoch_secs ? d.realtime_epoch_secs : d.dep_epoch_secs) - Math.floor(Date.now() / 1000)) / 60)),
        departureMinutes: Math.max(0, Math.round(((d.is_realtime && d.realtime_epoch_secs ? d.realtime_epoch_secs : d.dep_epoch_secs) - Math.floor(Date.now() / 1000)) / 60)),
        isRealtime: d.state === 'TEMPO REAL',
        state: d.state,
        statusDescription: d.state_reason || d.state,
        isDelayed: d.is_delayed,
      }));

      // Calculate real frequency between departures of the same line if multiple departures exist
      const lineDeparturesMap = new Map<string, number[]>();
      for (const d of (stop.departures || [])) {
        const code = d.route_short_name || d.route_id;
        if (code && d.dep_epoch_secs) {
          const list = lineDeparturesMap.get(code) || [];
          list.push(d.dep_epoch_secs);
          lineDeparturesMap.set(code, list);
        }
      }
      const lineFrequencyMap = new Map<string, number>();
      for (const [code, times] of lineDeparturesMap.entries()) {
        if (times.length >= 2) {
          times.sort((a, b) => a - b);
          let totalDiff = 0;
          for (let k = 1; k < times.length; k++) {
            totalDiff += (times[k] - times[k - 1]);
          }
          const avgIntervalMins = Math.round((totalDiff / (times.length - 1)) / 60);
          if (avgIntervalMins > 0 && avgIntervalMins <= 180) {
            lineFrequencyMap.set(code, avgIntervalMins);
          }
        }
      }

      const lines = (stop.lines && stop.lines.length > 0)
        ? stop.lines.map((l) => {
            const lineCode = l.route_short_name || l.route_id;
            const realFreq = lineFrequencyMap.get(lineCode);
            return {
              code: lineCode,
              name: l.route_long_name || l.route_short_name,
              color: l.route_color || '#3b82f6',
              destination: '',
              ...(realFreq ? { frequencyMinutes: realFreq } : {}),
            };
          })
        : nextDeps.map((d) => {
            const realFreq = lineFrequencyMap.get(d.lineCode);
            return {
              code: d.lineCode,
              name: d.lineName,
              color: d.lineColor,
              destination: d.destination,
              ...(realFreq ? { frequencyMinutes: realFreq } : {}),
            };
          });

      return {
        id: stop.id,
        name: stop.name,
        operatorId: stop.feed_ids[0] || 'transportes',
        operatorName: opName,
        transportMode: primaryMode as any,
        latitude: stop.lat,
        longitude: stop.lon,
        lat: stop.lat,
        lon: stop.lon,
        locality: stop.parent_station ? 'Interface Multimodal' : 'Portugal',
        district: 'Portugal',
        distanceMeters: distM,
        formattedDistance: formattedDist,
        walkingMinutes: walkMins,
        lines: lines,
        nextDepartures: nextDeps,
        activeAlerts: [],
        departures: stop.departures || [],
        status_notice: stop.status_notice,
        has_realtime: stop.has_realtime,
        // UNIR: as partidas são pedidas à AMP pelo telemóvel (o servidor está fora de Portugal)
        ...((stop.member_stop_ids || []).some((m: string) => m.startsWith('unir:'))
          ? { unirIds: (stop.member_stop_ids || []).filter((m: string) => m.startsWith('unir:')).map((m: string) => m.slice(5)) }
          : {}),
      };
    });

    // Paragens com o mesmo nome (uma de cada lado da rua): mostra o sentido de cada uma
    {
      const normalizar = (n: string) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
      const grupos = new Map<string, number[]>();
      mappedStops.forEach((s, i) => {
        const k = normalizar(s.name);
        if (!k) return;
        grupos.set(k, [...(grupos.get(k) || []), i]);
      });
      for (const indices of grupos.values()) {
        if (indices.length < 2) continue;
        const sentidos = indices.map((i) => getSentidoParagem(enrichedStops[i].member_stop_ids || [enrichedStops[i].id]));
        indices.forEach((i, pos) => {
          const meu = sentidos[pos];
          const s: any = mappedStops[i];
          if (meu.soChegadas) {
            s.direction = 'Só chegadas · fim de linha';
            s.arrivalsOnly = true;
            return;
          }
          // Destinos que as outras paragens com o mesmo nome não têm (o que as distingue)
          const dosOutros = new Set(
            sentidos.filter((_, j) => j !== pos).flatMap((o) => o.destinos.map((d) => d.toLowerCase())),
          );
          const proprios = meu.destinos.filter((d) => !dosOutros.has(d.toLowerCase()));
          // UNIR: nos grandes interfaces (ex.: D. João II) há várias paragens com o mesmo nome e
          // muitas linhas; mostra o que distingue esta das outras, mesmo com muitos destinos
          const soUnir = (enrichedStops[i].member_stop_ids || [enrichedStops[i].id]).every((m: string) => m.startsWith('unir:'));
          if (soUnir && proprios.length > 0) {
            s.direction = proprios.slice(0, 2).join(' · ');
            return;
          }
          // Paragens com linhas para muitos lados (ex.: São Bento): o "sentido" confundia mais do que ajudava
          if (meu.destinos.length === 0 || meu.destinos.length >= 4) return;
          s.direction = (proprios.length > 0 ? proprios : meu.destinos).slice(0, 2).join(' · ');
        });
      }
    }

    // Format vehicles to exact NearbyVehicleItem contract expected by PertoView (< 3 km)
    const mappedVehicles = liveVehicles
      .map((v) => {
        const distM = Math.round(StopsEngine.calculateDistanceMeters(lat, lon, v.lat, v.lon));
        return {
          id: v.id,
          vehicleId: v.id,
          agencyId: v.operator.toLowerCase().replace(/\s+/g, '_'),
          agencyName: v.operator,
          lineCode: v.line_id || 'BUS',
          lineName: `Carreira ${v.line_id}`,
          lineColor: '#0284c7',
          latitude: v.lat,
          longitude: v.lon,
          lat: v.lat,
          lon: v.lon,
          distanceMeters: distM,
          formattedDistance: distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`,
          bearing: v.bearing,
          speed: v.speed,
          currentStatus: v.speed && v.speed > 5 ? 'Em circulação' : 'Parado',
          statusLabel: v.speed && v.speed > 5 ? 'Em circulação' : 'Parado',
          timestamp: v.timestamp,
        };
      })
      .filter((v) => v.distanceMeters <= 3000);

    // Filter alerts to ONLY those whose affected stops or routes are inside the radius (Rule 5)
    const nearbyStopIdSet = new Set<string>();
    const nearbyLineCodeSet = new Set<string>();

    enrichedStops.forEach((s) => {
      nearbyStopIdSet.add(s.id);
      s.member_stop_ids.forEach((id) => {
        nearbyStopIdSet.add(id);
        const colonIdx = id.indexOf(':');
        if (colonIdx !== -1) nearbyStopIdSet.add(id.slice(colonIdx + 1));
      });
      (s.lines || []).forEach((l: any) => {
        const code = l.code || l.route_short_name;
        if (code) {
          nearbyLineCodeSet.add(String(code).toLowerCase());
          nearbyLineCodeSet.add(String(code).replace(/[^a-z0-9]/gi, '').toLowerCase());
        }
      });
      (s.departures || []).forEach((d: any) => {
        const code = d.route_short_name || d.lineCode;
        if (code) {
          nearbyLineCodeSet.add(String(code).toLowerCase());
          nearbyLineCodeSet.add(String(code).replace(/[^a-z0-9]/gi, '').toLowerCase());
        }
      });
    });

    // Códigos de linha repetem-se entre operadores (ex.: a linha 3506 da Carris Metropolitana, no
    // Seixal, e linhas da UNIR na Maia): um aviso só vale perto se o operador dele também serve aqui
    const normOperador = (t: unknown) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const operadoresPerto = new Set<string>();
    enrichedStops.forEach((s: any) => (s.operators || []).forEach((o: string) => { const n = normOperador(o); if (n) operadoresPerto.add(n); }));
    const operadorServeAqui = (operador: unknown) => {
      const n = normOperador(operador);
      if (!n) return true; // aviso sem operador: não há como excluir
      for (const o of operadoresPerto) if (o.includes(n) || n.includes(o)) return true;
      return false;
    };

    const nearbyAlerts = allAlerts.filter((alert: any) => {
      if (Array.isArray(alert.paragens) && alert.paragens.length > 0 && operadorServeAqui(alert.operador)) {
        if (alert.paragens.some((p: string) => nearbyStopIdSet.has(p) || nearbyStopIdSet.has(`stop-${p}`))) {
          return true;
        }
      }
      if (Array.isArray(alert.linhas) && alert.linhas.length > 0 && operadorServeAqui(alert.operador)) {
        if (
          alert.linhas.some((l: string) => {
            const clean = String(l).toLowerCase();
            const cleanAlnum = clean.replace(/[^a-z0-9]/gi, '');
            return nearbyLineCodeSet.has(clean) || nearbyLineCodeSet.has(cleanAlnum);
          })
        ) {
          return true;
        }
      }
      return false;
    });

    return res.json({
      // Fins de linha (só chegadas) vão para o fim: não servem para apanhar transporte
      stops: [...mappedStops.filter((s: any) => !s.arrivalsOnly), ...mappedStops.filter((s: any) => s.arrivalsOnly)],
      vehicles: mappedVehicles,
      alerts: nearbyAlerts,
      radiusMeters: raioUsado,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err?.message?.includes('malformed')) {
      console.warn('[Nearby Transit API] Anomalia na imagem da base de dados detetada. A recarregar ligação só-leitura...');
      reloadDatabaseConnection();
    } else {
      console.warn('[Nearby Transit API] Aviso na obtenção de transportes próximos:', err?.message || err);
    }
    // Requirement 3: Um erro num operador nunca pode fazer falhar o Perto nem o mapa inteiros
    return res.json({
      stops: [],
      vehicles: [],
      alerts: [],
      radiusMeters: Number(req.query.radius) || 500,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/transit/destinations', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '');
    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lon = req.query.lon ? Number(req.query.lon) : undefined;

    const suggestions = await searchDestinationSuggestions(q, lat, lon);
    return res.json({ suggestions, total: suggestions.length });
  } catch (err: any) {
    console.error('[Destinations API] Erro:', err);
    return res.status(500).json({ error: 'Erro ao pesquisar destinos.', message: err.message });
  }
});

app.get('/api/transit/plan-route', async (req: Request, res: Response) => {
  try {
    const originLat = Number(req.query.originLat);
    const originLon = Number(req.query.originLon);
    const destLat = Number(req.query.destLat);
    const destLon = Number(req.query.destLon);
    const destName = String(req.query.destName || 'Destino');

    if (isNaN(originLat) || isNaN(originLon) || isNaN(destLat) || isNaN(destLon)) {
      return res.status(400).json({ error: 'Coordenadas de origem ou destino inválidas.' });
    }

    const t0 = Date.now();
    // Partir a outra hora (opcional): ?quando=2026-10-12T08:30 (hora de Lisboa) ou ISO completo
    const quandoTxt = typeof req.query.quando === 'string' ? req.query.quando : '';
    let quando = new Date();
    if (quandoTxt) {
      const d = DateTime.fromISO(quandoTxt, { zone: 'Europe/Lisbon' });
      if (d.isValid) quando = d.toJSDate();
    }
    const routeData = await planearViagem(originLat, originLon, destLat, destLon, destName, quando);
    console.log(`[Planeador] ${routeData.routes.length} percursos + ${routeData.unir.length} UNIR em ${Date.now() - t0} ms`);
    return res.json(routeData);
  } catch (err: any) {
    console.error('[Plan Route API] Erro:', err);
    return res.status(500).json({ error: 'Erro ao planear rota de transporte público.', message: err.message });
  }
});

// Automated Polling System:
// - 60s for realtime feeds (Carris Metropolitana GTFS-RT, Central Alerts)
// - 300s (5 min) default for general feeds (IPMA, RSS, Metro)
function startScheduledPolling() {
  console.log('[Polling Engine] Agendador iniciado: 60s para fontes tempo-real (GTFS-RT, Alertas Centrais) e 5 min por defeito para as restantes.');

  // Immediate probe of lightweight public sources & alerts on server startup
  setTimeout(async () => {
    try {
      console.log('[Polling Engine] Probing inicial de fontes públicas em curso...');
      await runAllPublicSourcesIngestion();
      console.log('[Catalog Engine] Probing inicial do catálogo nacional de transportes...');
      await probeAllCatalogEntries();
      console.log('[Central Alerts] Probing inicial do Centro de Alertas...');
      await runCentralAlertsSync();
    } catch (err) {
      console.warn('[Polling Engine] Probing inicial aviso:', err);
    }
  }, 1000);

  // Periodic catalog re-verification (every 10 minutes)
  setInterval(async () => {
    try {
      console.log('[Catalog Engine] Revalidação periódica do catálogo nacional de transportes...');
      await probeAllCatalogEntries();
    } catch (err) {
      console.warn('[Catalog Engine] Revalidação catálogo aviso:', err);
    }
  }, 10 * 60 * 1000);

  // Realtime polling (every 60 seconds)
  setInterval(async () => {
    try {
      await syncCarrisMetropolitanaApi();
      await ingestCarrisMetropolitana();
      await runCentralAlertsSync();
    } catch (err) {
      console.warn('[Polling Engine 60s GTFS-RT] Aviso:', err);
    }
  }, 60 * 1000);

  // General feeds polling (every 300 seconds / 5 min)
  setInterval(async () => {
    try {
      console.log('[Polling Engine 5 min] Sincronização periódica geral das fontes...');
      await runAllPublicSourcesIngestion();
    } catch (err) {
      console.warn('[Polling Engine 5 min] Aviso:', err);
    }
  }, 5 * 60 * 1000);
}

// ==========================================
// SEO TECHNICAL ENDPOINTS: robots.txt & sitemap.xml
// ==========================================
app.get('/robots.txt', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  // Só o parou.pt aparece no Google (o endereço de teste do servidor não)
  const host = String(req.headers.host || '').toLowerCase();
  if (host && !/(^|\.)parou\.pt(:\d+)?$/.test(host) && !host.startsWith('localhost')) {
    return res.send('User-agent: *\nDisallow: /\n');
  }
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /debug/\nDisallow: /pesquisa\nDisallow: /_estado\nDisallow: /*?reportId=\n\nSitemap: https://parou.pt/sitemap.xml\n`);
});

// Diagnóstico da UNIR: os servidores da AMP não aceitam ligações do nosso servidor (fora de
// Portugal). Esta página testa, a partir do telemóvel de quem a abre (em Portugal), que formas
// tem o browser de ler os dados da AMP (CORS, JSONP, imagens do mapa) e envia o resultado.
app.get('/diagnostico-unir', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Diagnóstico UNIR | PAROU</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#111}li{margin:8px 0}.ok{color:#1F7A3A;font-weight:700}.mau{color:#D92D20;font-weight:700}code{font-size:12px;word-break:break-all}</style></head><body>
<h1>Diagnóstico UNIR (4)</h1><p>Deixa esta página aberta até aparecer <b>Concluído</b> (menos de 1 minuto). O resultado é enviado automaticamente para a PAROU.</p><ol id="r"></ol>
<script>
const r=document.getElementById('r');
function linha(t,ok,extra){const li=document.createElement('li');li.innerHTML=t+': <span class="'+(ok?'ok':'mau')+'">'+(ok?'OK':'FALHOU')+'</span>'+(extra?'<br><code>'+String(extra).replace(/</g,'&lt;').slice(0,160)+'</code>':'');r.appendChild(li);}
const rel={versao:4,quando:new Date().toISOString(),ua:navigator.userAgent,horarios:{}};
async function ler(u,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms||12000);try{const x=await fetch(u,{signal:c.signal});const tx=await x.text();return {ok:true,status:x.status,texto:tx};}catch(e){return {ok:false,erro:String(e)};}finally{clearTimeout(t);}}
(async()=>{
  const hoje=new Date();const d=hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0')+'-'+String(hoje.getDate()).padStart(2,'0');
  const ids=['smf:869','869','7090','vng:255','255','1217','smf%3A869','SMF869','smf_869'];
  let algum=false;
  for(const id of ids){const u='https://paragens.amp.pt/acarto2/get_horarios_prg?dia='+d+'&id='+id;const x=await ler(u);const bom=x.ok&&x.status===200&&!/inv.lido|erro/i.test(x.texto.slice(0,200))&&x.texto.length>60;
    rel.horarios[id]=x.ok?{status:x.status,tam:x.texto.length,texto:x.texto.slice(0,bom?60000:400)}:{erro:x.erro};if(bom)algum=true;
    linha('Partidas com o código '+decodeURIComponent(id),bom,x.ok?x.texto.slice(0,120):x.erro);}
  // Outros formatos de data
  if(!algum){for(const dia of [d.replace(/-/g,''),d.split('-').reverse().join('-')]){const x=await ler('https://paragens.amp.pt/acarto2/get_horarios_prg?dia='+dia+'&id=smf:869');rel.horarios['data_'+dia]=x.ok?{status:x.status,texto:x.texto.slice(0,3000)}:{erro:x.erro};}}
  try{const x=await fetch('/api/diagnostico-unir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rel)});linha('Resultado enviado à PAROU',x.ok);}catch(e){linha('Resultado enviado à PAROU',false,String(e));}
  const li=document.createElement('li');li.innerHTML='<b>Concluído.</b> Podes fechar a página e avisar o Claude.';r.appendChild(li);
})();
</script></body></html>`);
});

// Relatórios enviados pela página de diagnóstico (sem dados pessoais). Guarda só os 12 mais recentes.
function guardarDiagnostico(prefixo: string, txt: string) {
  const pasta = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, `${prefixo}-${Date.now()}.json`), txt);
  const re = new RegExp(`^${prefixo}-\\d+\\.json$`);
  const antigos = fs.readdirSync(pasta).filter((f) => re.test(f)).sort().reverse().slice(12);
  for (const f of antigos) { try { fs.unlinkSync(path.join(pasta, f)); } catch {} }
}
app.post('/api/diagnostico-unir', (req: Request, res: Response) => {
  try {
    const txt = JSON.stringify(req.body || {}).slice(0, 50_000);
    guardarDiagnostico('diag-unir', txt);
    console.log(`[Diag UNIR] relatório recebido (${txt.length} bytes)`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});
app.post('/api/diagnostico-unir/paragens', (req: Request, res: Response) => {
  try {
    const f = Array.isArray(req.body?.features) ? req.body.features : [];
    if (!f.length) return res.status(400).json({ ok: false });
    const txt = JSON.stringify({ quando: req.body.quando, features: f });
    guardarDiagnostico('diag-unir-paragens', txt);
    console.log(`[Diag UNIR] ${f.length} paragens recebidas (${txt.length} bytes)`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// (sitemap.xml: ver src/server/seo/paginas.ts — índice com páginas, linhas e paragens)

// ==========================================
// FEED CATALOG, INGESTION & COVERAGE API
// ==========================================
import { getCoverageReport, testFeedConnection } from './src/server/coverageService';
import { getFetchLogs, getFeedById, upsertFeed, getDatabase } from './src/server/db/gtfsDatabase';
import { SEED_FEEDS } from './src/server/gtfsSeedRegistry';
import { seedFeedsIfEmpty } from './src/server/db/gtfsDatabase';
import { triggerIngestAll, triggerIngestSingle, isIngestionRunning } from './src/server/gtfsIngestionService';
const startBackgroundWorker = (): void => {};
const triggerDiscovery = (): void => {};
import { FeedItem } from './src/types/coverage';

// 1. Get full coverage report (table, totals, expected networks checklist)
app.get('/api/coverage', (_req: Request, res: Response) => {
  try {
    const report = getCoverageReport();
    return res.json(report);
  } catch (err: any) {
    console.error('[API /coverage] Erro:', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório de cobertura', details: err?.message });
  }
});

// 1b. Test feed connection & validate GTFS zip (Requirement 1)
app.post('/api/coverage/test-connection', async (req: Request, res: Response) => {
  try {
    const { feedId, url } = req.body;
    if (!feedId && !url) {
      return res.status(400).json({ error: 'feedId ou url é obrigatório para testar ligação.' });
    }
    const result = await testFeedConnection(feedId || 'manual', url);
    return res.json(result);
  } catch (err: any) {
    console.error('[API /coverage/test-connection] Erro:', err);
    return res.status(500).json({ error: 'Erro ao testar ligação', details: err?.message });
  }
});

// 2. Get fetch audit logs (MANDATORY RULE 4: log every fetch URL, status, bytes, duration, time)
app.get('/api/coverage/logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 300);
    const logs = getFetchLogs(limit);
    return res.json({ logs, total: logs.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter logs de fetch', details: err?.message });
  }
});

// 3. Trigger manual re-run of all feeds import
app.post('/api/coverage/reingest-all', async (_req: Request, res: Response) => {
  try {
    void atualizarDados();
    return res.json({ success: true, message: 'A verificar se há dados novos.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao verificar dados novos', details: err?.message });
  }
});

app.post('/api/coverage/run-discovery', async (_req: Request, res: Response) => {
  try {
    void atualizarDados();
    return res.json({ success: true, message: 'A verificar se há dados novos.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao verificar dados novos', details: err?.message });
  }
});

// 4. Manual Add Feed (Form "Adicionar feed": URL, type, operator name, optional key)
app.post('/api/feeds/manual', async (req: Request, res: Response) => {
  try {
    const { url, feed_type, operator_name, mode, key } = req.body;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'URL do feed é obrigatório e deve começar por http/https.' });
    }
    if (!operator_name) {
      return res.status(400).json({ error: 'Nome do operador é obrigatório.' });
    }

    const feedId = `manual_${operator_name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}_${Date.now().toString(36)}`;
    const newFeed: FeedItem = {
      id: feedId,
      operator_name,
      mode: mode || 'Autocarro',
      feed_type: feed_type === 'gtfs_rt' ? 'gtfs_rt' : 'gtfs',
      source_origin: 'manual',
      url,
      auth_key: key || undefined,
      auth_type: key ? 'api_key' : 'none',
      status: 'queued',
      progress: 'queued',
      lines_count: 0,
      stops_count: 0,
      trips_count: 0,
      realtime_entities: feed_type === 'gtfs_rt' ? 'Tempo Real GTFS-RT' : 'Nenhum',
    };

    upsertFeed(newFeed);
    return res.json({ success: true, feed: newFeed });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao adicionar feed manualmente', details: err?.message });
  }
});

// 5. Refresh single feed
app.post('/api/feeds/:id/refresh', async (req: Request, res: Response) => {
  try {
    const feed = getFeedById(req.params.id);
    if (!feed) {
      return res.status(404).json({ error: 'Feed não encontrado no catálogo.' });
    }

    void atualizarDados();
    return res.json({ success: true, message: 'A verificar se há dados novos.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao atualizar feed', details: err?.message });
  }
});

// ==========================================
// DEPARTURES & REAL-TIME API (RULES 1, 2, 3, 5)
// ==========================================
import { StopsEngine } from './src/server/stopsEngine';
import { DepartureEngine, comPrazo } from './src/server/departureEngine';
import { percursoDeViagem, percursoUnir } from './src/server/percursoLinha';
import { DebugEngine } from './src/server/debugEngine';

// 1. Unified Stop Details & Departures (Lists every line and operator serving it)
app.get('/api/transit/stop/:id', async (req: Request, res: Response) => {
  try {
    const stopId = req.params.id;
    const timeParam = typeof req.query.time === 'string' ? req.query.time : undefined;
    // ?linhas=1 (paragem aberta na app): a próxima partida de cada linha + as seguintes
    const umaPorLinha = req.query.linhas === '1';
    const data = await DepartureEngine.nextDepartures(stopId, timeParam || new Date(), 15, { umaPorLinha });
    return res.json(data);
  } catch (err: any) {
    console.error('[API /transit/stop/:id] Erro:', err);
    return res.status(500).json({ error: 'Erro ao obter partidas da paragem', details: err?.message });
  }
});

// Percurso de uma linha (paragens por ordem, com coordenadas e horas) para desenhar no mapa:
//   ?trip=<trip_id>&stop=<paragem de onde parte>            (linhas com horários na base)
//   ?route=<linha UNIR>&stop=<paragem>&sentido=<n>&destino=<texto>   (UNIR)
app.get('/api/transit/percurso', (req: Request, res: Response) => {
  try {
    const txt = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '');
    const stop = txt(req.query.stop);
    const trip = txt(req.query.trip);
    const route = txt(req.query.route);
    const percurso = trip
      ? percursoDeViagem(trip, stop || undefined)
      : route && stop
        ? percursoUnir(route, stop, txt(req.query.sentido) || undefined, txt(req.query.destino) || undefined)
        : null;
    if (!percurso) return res.status(404).json({ error: 'Percurso indisponível para esta linha.' });
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(percurso);
  } catch (err: any) {
    console.error('[API /transit/percurso] Erro:', err);
    return res.status(500).json({ error: 'Erro ao obter o percurso da linha' });
  }
});

// 2. Search / List Unified Stops across ALL feeds
app.get('/api/transit/stops', async (req: Request, res: Response) => {
  try {
    if (!isDadosProntosPronto()) {
      const estado = getEstadoDadosProntos();
      return res.json({
        status: 'loading',
        isLoading: true,
        message: estado.message || 'A carregar horários…',
        totalOperators: estado.totalOperators,
        loadedOperators: estado.loadedOperators,
        stops: [],
        total: 0,
      });
    }
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q) {
      const stops = await StopsEngine.searchUnifiedStops(q, 30);
      return res.json({ stops, total: stops.length });
    }
    const stops = await StopsEngine.getUnifiedStops();
    return res.json({ stops: stops.slice(0, 100), total: stops.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao listar paragens', details: err?.message });
  }
});

// 3. Live Vehicles API (Rule 3 & 4: server cache 15s, vehicles on map only, no invented ETAs)
app.get('/api/transit/vehicles', async (_req: Request, res: Response) => {
  try {
    const vehicles = await RealtimeEngine.getLiveVehicles();
    return res.json({ vehicles, total: vehicles.length, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter veículos em direto', details: err?.message });
  }
});

// 4. Debug Stop API & Inspection View (Rule 5)
// /debug/stop/:id lists each departure with feed, trip_id, scheduled time, real-time time, state and reason
app.get('/debug/stop/:id', async (req: Request, res: Response) => {
  try {
    const stopId = req.params.id;
    const timeParam = typeof req.query.time === 'string' ? req.query.time : undefined;
    const debugData = await DebugEngine.getDebugStopData(stopId, timeParam);

    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      const html = DebugEngine.renderDebugHtml(debugData);
      return res.type('html').send(html);
    }
    return res.json(debugData);
  } catch (err: any) {
    console.error('[Debug Stop API] Erro:', err);
    return res.status(500).json({ error: 'Erro no diagnóstico da paragem', details: err?.message });
  }
});

// 4b. Debug Nearby Stops API & Inspection View (Requirement 1)
// /debug/nearby?lat=&lon=&r= shows status in /coverage, raw DB stops in radius, stops after merge, sent to UI, and dropped reasons
app.get('/debug/nearby', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const r = req.query.r ? Number(req.query.r) : 500;

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Parâmetros lat e lon são obrigatórios e devem ser numéricos.' });
    }

    const debugData = await DebugEngine.getDebugNearbyData(lat, lon, r);

    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      const html = DebugEngine.renderDebugNearbyHtml(debugData);
      return res.type('html').send(html);
    }
    return res.json(debugData);
  } catch (err: any) {
    console.error('[Debug Nearby API] Erro:', err);
    return res.status(500).json({ error: 'Erro no diagnóstico de paragens próximas', details: err?.message });
  }
});

// 5. User Report for Missing Stop or Line (Rule 6)
app.post('/api/reports/missing-stop', async (req: Request, res: Response) => {
  try {
    const { operator, place, details, user_email } = req.body;
    if (!operator || !place) {
      return res.status(400).json({ error: 'Operador e localidade/paragem são obrigatórios.' });
    }
    console.log('[PAROU Reports] Paragem em falta reportada:', { operator, place, details, user_email });
    logFetch({
      feed_id: 'user_report',
      url: `user_report://${encodeURIComponent(operator)}/${encodeURIComponent(place)}`,
      http_status: 200,
      bytes: 0,
      duration_ms: 0,
      timestamp: new Date().toISOString(),
      message: `Reporte de utilizador: Linha/Paragem em falta (${operator} - ${place})`,
      error_details: details || null,
    });
    return res.json({ success: true, message: 'Reporte de paragem/linha em falta submetido com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao submeter reporte', details: err?.message });
  }
});

// ==========================================
// VITE MIDDLEWARE / SPA STATIC HANDLER
// ==========================================
async function startServer() {
  try {
    const distPath = path.resolve(process.cwd(), 'dist');
    const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
    const isProduction = process.env.NODE_ENV === 'production' || hasBuiltDist;

    // 1. In production / built state, serve SPA static assets immediately (0ms blocking)
    if (isProduction) {
      // Ficheiros com nome único (/assets/…-hash) ficam guardados no telemóvel para sempre;
      // a página e o service worker são sempre confirmados (para as atualizações chegarem logo)
      app.use(express.static(distPath, {
        // A página principal passa pelo servidor (metadados certos para cada endereço)
        index: false,
        setHeaders: (res, ficheiro) => {
          if (ficheiro.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (ficheiro.endsWith('sw.js') || ficheiro.endsWith('.html') || ficheiro.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
          else res.setHeader('Cache-Control', 'public, max-age=86400');
        },
      }));
      app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api') || req.path === '/health') return next();
        res.setHeader('Cache-Control', 'no-cache');
        try {
          const r = paginaDaApp(distPath, req.path);
          res.status(r.status).setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(r.html);
        } catch {
          res.sendFile(path.join(distPath, 'index.html'));
        }
      });
    }

    // 2. REQUIREMENT 1: O servidor escuta IMEDIATAMENTE em 0.0.0.0 na porta process.env.PORT antes de qualquer importação
    const httpServer = app.listen(port, '0.0.0.0', () => {
      console.log(`[PAROU.PT Server] A escutar imediatamente em http://0.0.0.0:${port}`);

      // Índice dos horários para o planeador (vários transbordos): constrói-se em segundo plano
      // e volta a verificar-se de vez em quando (a base muda quando entram dados novos).
      setTimeout(() => {
        import('./src/server/planeadorIndice').then((m) => {
          m.indicePronto();
          setInterval(() => { try { m.indicePronto(); } catch { /* tenta na próxima */ } }, 10 * 60 * 1000).unref();
        }).catch((e) => console.warn('[Planeador] índice:', e?.message || e));
      }, 45 * 1000).unref();

      // 3. Em modo dev (se dist não existir), anexa middleware do Vite de forma não-bloqueante
      if (!isProduction) {
        import('vite')
          .then(async ({ createServer: createViteServer }) => {
            try {
              const vite = await createViteServer({
                server: { middlewareMode: true, hmr: false, ws: false },
                appType: 'spa',
              });

              app.get('/@vite/client', async (req: Request, res: Response, next: NextFunction) => {
                try {
                  const clientResult = await vite.transformRequest('/@vite/client');
                  if (clientResult && clientResult.code) {
                    const sanitized = clientResult.code
                      .replace(/console\.error\(`\[vite\] failed to connect to websocket[^\`]*`\);?/g, '')
                      .replace(/console\.error\(`\[vite\] failed to connect to websocket \(\$\{e\}\)\. `\);?/g, '')
                      .replace(/console\.debug\("\[vite\] connecting\.\.\."\);?/g, '')
                      .replace(/console\.info\("\[vite\] Direct websocket connection fallback[^\"]*"\);?/g, '');

                    res.setHeader('Content-Type', 'application/javascript');
                    res.setHeader('Cache-Control', 'no-cache');
                    return res.send(sanitized);
                  }
                } catch {}
                next();
              });

              app.use(vite.middlewares);
            } catch (viteErr: any) {
              console.warn('[Vite Middleware] Aviso no arranque do Vite:', viteErr?.message || viteErr);
            }
          })
          .catch(() => {});
      }

      // 4. REQUIREMENT 1, 2, 3: Verificações de base de dados, restauro, descoberta e carregamentos em segundo plano
      setImmediate(async () => {
        try {
          // Polling engine de tempo real (GTFS-RT, Alertas Centrais)
          try {
            startScheduledPolling();
          } catch (pollingErr: any) {
            console.warn('[Polling Engine] Aviso ao iniciar agendador:', pollingErr?.message || pollingErr);
          }

          // Em produção, a única fonte de horários é o parou-dados (dadosProntos.ts).
          // No arranque NÃO chames startBackgroundWorker nem triggerIngestAll, e remove o recarregamento automático de 24h.
          // O worker de importação só corre se for pedido manualmente na /coverage. (Regra 1)
          try {
            seedFeedsIfEmpty();
            console.log('[PAROU.PT Startup] Gestão de base de dados delegada exclusivamente a parou-dados (dadosProntos).');
          } catch (dbErr: any) {
            console.warn('[Database Startup] Aviso na verificação:', dbErr?.message || dbErr);
          }
        } catch (bgErr: any) {
          console.warn('[Background Startup] Aviso nos serviços em segundo plano:', bgErr?.message || bgErr);
        }
      });
    });

    // O Caddy mantém as ligações abertas até 2 minutos; o Node fecha as inativas ao fim de 5 s por
    // omissão e, quando um POST apanha uma ligação a fechar, o utilizador vê um erro 502.
    httpServer.keepAliveTimeout = 125_000;
    httpServer.headersTimeout = 130_000;

    httpServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[PAROU.PT Server] Porto ${port} já está em utilização por outro processo.`);
      } else {
        console.error('[PAROU.PT Server] Erro no servidor HTTP:', err);
      }
    });

    if (!isProduction) {
      try {
        const { WebSocketServer } = await import('ws');
        const wss = new WebSocketServer({ server: httpServer });
        wss.on('connection', (ws: import('ws').WebSocket) => {
          try {
            ws.send(JSON.stringify({ type: 'connected' }));
          } catch {}
          ws.on('message', (msg: import('ws').RawData) => {
            try {
              const data = JSON.parse(String(msg));
              if (data && data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
              }
            } catch {}
          });
          ws.on('error', () => {});
        });
        wss.on('error', () => {});
      } catch {}
    }
  } catch (fatalErr: any) {
    console.error('[FATAL SERVER START ERROR]:', fatalErr?.message || fatalErr);
  }
}

startServer().catch(err => {
  console.error('[FATAL UNCAUGHT SERVER PROMISE]:', err);
});

iniciarDadosProntos();

process.on('uncaughtException', (err: any) => {
  console.error('[PAROU.PT] Erro não tratado (o servidor continua):', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[PAROU.PT] Promessa rejeitada (o servidor continua):', reason?.message || reason);
});
