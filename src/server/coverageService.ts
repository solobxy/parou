import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DateTime } from 'luxon';
import { CoverageReport, NetworkChecklistItem, FeedItem, TestResult } from '../types/coverage';
import { getAllFeeds, getFeedCalendarBounds, logFetch, getAppState } from './db/gtfsDatabase';
import { EXPECTED_NETWORKS } from './gtfsSeedRegistry';
import { isIngestionRunning } from './gtfsIngestionService';
import { getManifestFeedsMap, getManifestData, getEstadoDadosProntos } from './dadosProntos';

const execAsync = promisify(exec);

// In-memory cache for live test connection results
const testResultsMap = new Map<string, TestResult>();

// Mapeamento oficial de URLs diretos para ficheiro GTFS (.zip)
export const DIRECT_GTFS_ZIP_URLS: Record<string, string> = {
  // Carris Metropolitana excluída temporariamente (Regra 4)
  metro_lisboa: 'https://www.metrolisboa.pt/google_transit/googleTransit.zip',
  cp: 'https://publico.cp.pt/gtfs/gtfs.zip',
  fertagus: 'https://www.fertagus.pt/GTFSTMLzip/Fertagus_GTFS.zip',
  transtejo_soflusa: 'https://files.mobilitydatabase.org/mdb-2921/latest.zip',
  mts: 'https://mts.pt/imt/MTS-20240129.zip',
  tcb_barreiro: 'https://backend.tcbarreiro.pt/download-gtfs',
  stcp: 'https://dadosabertos.cm-porto.pt/dataset/71490e40-9e19-11f1-84ed-6abdb6d5cf34/resource/51340c18-0ef5-4895-b099-cf7247ea54f4/download/gtfs_feed.zip',
  metro_porto: 'https://files.mobilitydatabase.org/mdb-2357/latest.zip',
  unir: 'https://files.mobilitydatabase.org/mdb-2550/latest.zip',
  tub_braga: 'https://www.tub.pt/developer/gtfs/feed/tub.zip',
  guimabus: 'https://map.mobility.ubiwhere.com/dataset/ee6d46e4-9f19-4f4a-ab93-1a3cd69df349/resource/08f1ee6c-2d3f-4fb3-a861-5d6fb347a6d4/download/gtfs_gui.zip',
  tuba_barcelos: 'https://map.mobility.ubiwhere.com/dataset/1842a15c-1aec-4f65-8e29-e57c8b4cbd74/resource/a595ee4b-bf86-4323-b1f4-7e3b3eb00e5e/download/gtfs_bar.zip',
  mobiave: 'https://map.mobility.ubiwhere.com/dataset/fe6015e4-86c7-437a-8d31-10759fe21a1d/resource/7ac67ef8-015c-42e8-9546-f6f0be956270/download/gtfs_vnf.zip',
  mobiave_famalicao: 'https://map.mobility.ubiwhere.com/dataset/fe6015e4-86c7-437a-8d31-10759fe21a1d/resource/7ac67ef8-015c-42e8-9546-f6f0be956270/download/gtfs_vnf.zip',
  smtuc: 'https://files.mobilitydatabase.org/mdb-2992/latest.zip',
  smtuc_coimbra: 'https://files.mobilitydatabase.org/mdb-2992/latest.zip',
  vamus: 'https://files.mobilitydatabase.org/tld-4315/latest.zip',
  vamus_algarve: 'https://files.mobilitydatabase.org/tld-4315/latest.zip',
  proximo_faro: 'https://files.mobilitydatabase.org/tld-4321/latest.zip',
  giro: 'https://files.mobilitydatabase.org/tld-4320/latest.zip',
  giro_albufeira: 'https://files.mobilitydatabase.org/tld-4320/latest.zip',
  sobe_desce_tavira: 'https://files.mobilitydatabase.org/tld-4322/latest.zip',
  sobe_e_desce_tavira: 'https://files.mobilitydatabase.org/tld-4322/latest.zip',
  horarios_funchal: 'https://www.horariosdofunchal.pt/googletransit.zip',
  'mdb-1272': 'https://files.mobilitydatabase.org/mdb-1272/latest.zip',
  'tld-4257': 'https://files.mobilitydatabase.org/tld-4257/latest.zip',
  'tld-4316': 'https://files.mobilitydatabase.org/tld-4316/latest.zip',
  'tld-4317': 'https://files.mobilitydatabase.org/tld-4317/latest.zip',
  'tld-4318': 'https://files.mobilitydatabase.org/tld-4318/latest.zip',
  'tld-4319': 'https://files.mobilitydatabase.org/tld-4319/latest.zip',
  'tld-7825': 'https://files.mobilitydatabase.org/tld-7825/latest.zip',
  'tld-7876': 'https://files.mobilitydatabase.org/tld-7876/latest.zip',
  'tld-7877': 'https://files.mobilitydatabase.org/tld-7877/latest.zip',
  flixbus_pt: 'https://gtfs.gis.flix.tech/gtfs_generic_eu.zip',
};

// Fontes concretas de telemetria em tempo real (URL/API real) ou "não integrado"
export const CONCRETE_REALTIME_SOURCES: Record<string, string> = {
  carris_metropolitana: 'https://api.carrismetropolitana.pt/v2',
  stcp: 'https://dadosabertos.cm-porto.pt/api/3/action/datastore_search',
  unir: 'https://paragens.amp.pt/geoserver/paragens/ows',
  metro_lisboa: 'https://api.metrolisboa.pt',
};

/**
 * 1. "Testar ligação" faz download do ficheiro GTFS (.zip) e confirma que é um GTFS válido.
 */
export async function testFeedConnection(feedId: string, customUrl?: string): Promise<TestResult> {
  const targetUrl = customUrl || DIRECT_GTFS_ZIP_URLS[feedId] || '';
  if (!targetUrl || !targetUrl.startsWith('http')) {
    const res: TestResult = {
      tested_at: new Date().toISOString(),
      success: false,
      valid_gtfs: false,
      message: 'URL inválido ou inexistente para teste.',
    };
    testResultsMap.set(feedId, res);
    return res;
  }

  const startTime = Date.now();
  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'PAROU-Coverage-Tester/1.0 (Linux; x86_64)',
        'Accept': 'application/zip, application/octet-stream, */*',
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    const durationMs = Date.now() - startTime;
    const httpStatus = resp.status;

    if (!resp.ok) {
      const res: TestResult = {
        tested_at: new Date().toISOString(),
        success: false,
        valid_gtfs: false,
        http_status: httpStatus,
        duration_ms: durationMs,
        message: `Falha no download: HTTP ${httpStatus} ${resp.statusText || 'Erro no servidor'}`,
      };
      testResultsMap.set(feedId, res);
      logFetch({
        feed_id: feedId,
        url: targetUrl,
        http_status: httpStatus,
        bytes: 0,
        duration_ms: durationMs,
        timestamp: res.tested_at,
        message: res.message,
      });
      return res;
    }

    // Inspeciona os ficheiros contidos no ZIP via streaming direto para disco
    const tempPath = `/tmp/test_feed_${feedId.replace(/[^a-z0-9]/g, '_')}_${Date.now()}.zip`;
    if (!resp.body) {
      throw new Error('Corpo de resposta HTTP vazio');
    }

    const fileStream = fs.createWriteStream(tempPath);
    await pipeline(Readable.fromWeb(resp.body as any), fileStream);

    const stat = fs.statSync(tempPath);
    const bytes = stat.size;

    // Confirma cabeçalho ZIP a partir do disco: PK\x03\x04
    const fd = fs.openSync(tempPath, 'r');
    const headerBuf = Buffer.alloc(4);
    fs.readSync(fd, headerBuf, 0, 4, 0);
    fs.closeSync(fd);

    if (bytes < 4 || headerBuf[0] !== 0x50 || headerBuf[1] !== 0x4B) {
      try { fs.unlinkSync(tempPath); } catch {}
      const res: TestResult = {
        tested_at: new Date().toISOString(),
        success: false,
        valid_gtfs: false,
        http_status: httpStatus,
        bytes,
        duration_ms: durationMs,
        message: `Ficheiro descarregado (${bytes} bytes) não é um arquivo .zip válido.`,
      };
      testResultsMap.set(feedId, res);
      logFetch({
        feed_id: feedId,
        url: targetUrl,
        http_status: httpStatus,
        bytes,
        duration_ms: durationMs,
        timestamp: res.tested_at,
        message: res.message,
      });
      return res;
    }

    let filesFound: string[] = [];
    try {
      const { stdout } = await execAsync(`unzip -Z1 "${tempPath}"`, { timeout: 10000 });
      filesFound = stdout.split('\n').map((s) => s.trim().replace(/^.*[/\\]/, '')).filter(Boolean);
    } catch {
      let textStr = '';
      try {
        const handle = await fs.promises.open(tempPath, 'r');
        const chunk = Buffer.alloc(65536);
        const { bytesRead } = await handle.read(chunk, 0, 65536, 0);
        await handle.close();
        textStr = chunk.subarray(0, bytesRead).toString('utf-8');
      } catch {}
      const potential = ['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'];
      filesFound = potential.filter((p) => textStr.includes(p));
    } finally {
      try {
        await fs.promises.unlink(tempPath);
      } catch {}
    }

    const standardGtfsFiles = ['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'];
    const matchedGtfs = filesFound.filter((f) => standardGtfsFiles.includes(f.toLowerCase()));
    const isValidGtfs = matchedGtfs.length >= 2 || filesFound.some((f) => f.toLowerCase() === 'stops.txt' || f.toLowerCase() === 'routes.txt');

    const sizeMb = (bytes / (1024 * 1024)).toFixed(2);
    const sizeKb = Math.round(bytes / 1024);
    const sizeDisplay = bytes >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

    const res: TestResult = {
      tested_at: new Date().toISOString(),
      success: isValidGtfs,
      valid_gtfs: isValidGtfs,
      http_status: httpStatus,
      bytes,
      duration_ms: durationMs,
      files_found: matchedGtfs.length > 0 ? matchedGtfs : filesFound.slice(0, 10),
      message: isValidGtfs
        ? `GTFS válido (${sizeDisplay}, ${durationMs}ms): ${matchedGtfs.join(', ')}`
        : `Arquivo .zip descarregado (${sizeDisplay}) mas sem tabelas GTFS essenciais.`,
    };

    testResultsMap.set(feedId, res);
    logFetch({
      feed_id: feedId,
      url: targetUrl,
      http_status: httpStatus,
      bytes,
      duration_ms: durationMs,
      timestamp: res.tested_at,
      message: res.message,
    });
    return res;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const res: TestResult = {
      tested_at: new Date().toISOString(),
      success: false,
      valid_gtfs: false,
      duration_ms: durationMs,
      message: `Erro na ligação: ${err.message || 'Falha de rede ou timeout'}`,
    };
    testResultsMap.set(feedId, res);
    logFetch({
      feed_id: feedId,
      url: targetUrl,
      http_status: 0,
      bytes: 0,
      duration_ms: durationMs,
      timestamp: res.tested_at,
      message: res.message,
      error_details: err.message,
    });
    return res;
  }
}

export function getCoverageReport(): CoverageReport {
  const rawFeeds = getAllFeeds();
  const calendarBounds = getFeedCalendarBounds();
  const manifestFeeds = getManifestFeedsMap();

  // Data atual em Portugal (agency_timezone Europe/Lisbon)
  const todayLisbon = DateTime.now().setZone('Europe/Lisbon').toISODate() || new Date().toISOString().slice(0, 10);
  const todayClean = todayLisbon.replace(/-/g, '');

  const feeds: FeedItem[] = rawFeeds.map((f) => {
    let status = f.status;
    let progress = f.progress || '';
    let lastError = f.last_error;

    // 1. URL direto do ficheiro GTFS (.zip)
    const directZipUrl = DIRECT_GTFS_ZIP_URLS[f.id] || (f.url && f.url.endsWith('.zip') ? f.url : (f.latest_url || f.url));

    // 2. Validade: prioridade máxima à validade (valid_until) do manifest.json do parou-dados (Regra 5)
    const mFeed = manifestFeeds.get(f.id)
      || manifestFeeds.get(f.id.replace(/_/g, '-'))
      || manifestFeeds.get(f.id.replace(/-/g, '_'));

    const bounds = calendarBounds.get(f.id);
    const validFrom = mFeed?.valid_from || bounds?.firstDay || f.valid_from || undefined;
    let validUntil = mFeed?.valid_until || bounds?.lastDay || f.valid_until || undefined;

    // Fallbacks para operadores cuja validade expirada está documentada
    if (!validUntil && f.id === 'tuba_barcelos') validUntil = '2024-12-31';
    if (!validUntil && (f.id === 'mobiave' || f.id === 'mobiave_famalicao')) validUntil = '2025-12-31';

    if (mFeed?.last_error && !lastError) {
      lastError = mFeed.last_error;
    }

    const linesCount = mFeed?.lines ?? f.lines_count;
    const stopsCount = mFeed?.stops ?? f.stops_count;
    const tripsCount = mFeed?.trips ?? f.trips_count;

    // 3. Aviso "Desatualizado" quando a validade (último dia com serviço) já passou - aplica-se a qualquer feed
    const validUntilClean = validUntil ? validUntil.replace(/\D/g, '').slice(0, 8) : '';
    const isExpired = Boolean(validUntilClean && validUntilClean < todayClean);

    // 4. Tempo real: fonte concreta (URL/API) ou "não integrado"
    const concreteRealtime = CONCRETE_REALTIME_SOURCES[f.id] || (f.feed_type === 'gtfs_rt' && f.url ? f.url : 'não integrado');

    // Estado da importação real
    if (linesCount > 0 && stopsCount > 0) {
      if (isExpired) {
        status = 'Desatualizado' as any;
        progress = 'horário desatualizado';
      } else {
        status = 'OK';
        progress = progress || 'Importado com sucesso';
      }
    } else {
      if (f.status === 'ERROR' || lastError) {
        status = 'ERROR';
      } else if (f.status === 'queued' || f.status === 'downloading' || f.status === 'parsing' || f.status === 'A aguardar') {
        status = f.status;
      } else {
        status = 'SEM DADOS' as any;
        progress = progress || 'Sem viagens ou paragens importadas';
      }
    }

    return {
      ...f,
      lines_count: linesCount,
      stops_count: stopsCount,
      trips_count: tripsCount,
      url: directZipUrl,
      valid_from: validFrom,
      valid_until: validUntil,
      is_expired: isExpired,
      realtime_entities: concreteRealtime,
      realtime_source: concreteRealtime,
      status,
      progress,
      last_error: lastError,
      last_test: testResultsMap.get(f.id),
    };
  });

  // 5. Os totais do topo contam estes estados reais
  const okFeeds = feeds.filter((f) => f.lines_count > 0 && f.status !== 'ERROR');
  const expiredFeeds = feeds.filter((f) => f.is_expired);
  const realtimeFeeds = feeds.filter((f) => f.realtime_source && f.realtime_source !== 'não integrado');
  const errorFeeds = feeds.filter((f) => f.status === 'ERROR' || f.status === 'falhou');

  const totals = {
    totalFeeds: feeds.length,
    totalLines: feeds.reduce((acc, f) => acc + (f.lines_count || 0), 0),
    totalStops: feeds.reduce((acc, f) => acc + (f.stops_count || 0), 0),
    totalTrips: feeds.reduce((acc, f) => acc + (f.trips_count || 0), 0),
    activeRealtimeCount: realtimeFeeds.length,
    errorCount: errorFeeds.length,
    expiredCount: expiredFeeds.length,
    okCount: okFeeds.length,
  };

  // Map of feeds by normalized name or id for checklist matching
  const feedMapByName = new Map<string, FeedItem>();
  for (const f of feeds) {
    feedMapByName.set(f.operator_name.toLowerCase(), f);
    feedMapByName.set(f.id.toLowerCase(), f);
  }

  // Build Expected Networks Checklist com estado real
  const checklist: NetworkChecklistItem[] = [];

  for (const exp of EXPECTED_NETWORKS) {
    let matched = feedMapByName.get(exp.name.toLowerCase()) || feedMapByName.get(exp.defaultSeedId.toLowerCase());
    if (!matched) {
      for (const [key, f] of feedMapByName.entries()) {
        if (key.includes(exp.name.toLowerCase()) || exp.name.toLowerCase().includes(key)) {
          matched = f;
          break;
        }
      }
    }

    const isCovered = Boolean(matched && (matched.lines_count > 0 || matched.stops_count > 0) && matched.status !== 'ERROR');
    let details = 'Sem dados na base de dados';
    if (matched) {
      const datesStr = matched.valid_from && matched.valid_until 
        ? `${matched.valid_from} até ${matched.valid_until}` 
        : (matched.valid_until || 'validade não declarada');
      const rtStr = matched.realtime_source && matched.realtime_source !== 'não integrado' 
        ? `Tempo real: ${matched.realtime_source}` 
        : 'Tempo real: não integrado';
      
      if (matched.is_expired) {
        details = `Aviso: horário desatualizado (${datesStr}) — ${matched.lines_count} carreiras, ${matched.stops_count} paragens, ${matched.trips_count} viagens. ${rtStr}`;
      } else if (matched.lines_count > 0 || matched.stops_count > 0) {
        details = `${matched.lines_count} carreiras, ${matched.stops_count} paragens, ${matched.trips_count} viagens. Validade: ${datesStr}. ${rtStr}`;
      } else {
        details = matched.last_error || matched.progress || 'Sem rotas importadas na base de dados';
      }
    }

    checklist.push({
      name: exp.name,
      mode: exp.mode,
      isCovered,
      status: matched ? (matched.is_expired ? 'Desatualizado' : matched.status) : 'NOT_CONFIGURED',
      feedId: matched?.id,
      details,
    });
  }

  const workerProgress = getAppState<any>('worker_progress');
  const isRunning = isIngestionRunning();
  const dadosProntos = getEstadoDadosProntos();

  return {
    totals,
    feeds,
    checklist,
    lastSync: new Date().toISOString(),
    dataset_built_at: dadosProntos.dataset_built_at,
    loadingStatus: dadosProntos,
    ingestion: {
      isRunning: isRunning || dadosProntos.isLoading,
      workerProgress: {
        ...(workerProgress || {}),
        ...dadosProntos,
        dataset_built_at: dadosProntos.dataset_built_at,
      },
    },
  };
}
