import { runAutoDiscovery } from '../gtfsDiscoveryService';
import { ingestAllFeedsSequentially, ingestGtfsZipFeed, ingestCarrisMetropolitanaApi } from '../gtfsIngestionService';
import { ingestUnirQiHoras } from '../unirQiHorasService';
import { getFeedById, getDatabase, upsertFeed, commitWorkerDatabase, saveDatabaseBackup } from '../db/gtfsDatabase';
import { SEED_FEEDS } from '../gtfsSeedRegistry';
import { seedMetroOfficialData } from '../seedMetroSchedule';

/**
 * PAROU.PT - Background Feed Ingestion Worker (Child Process)
 * 
 * Sole process allowed to write to the SQLite database.
 * Operates on a temporary database file (gtfs.db.tmp) and only swaps
 * into gtfs.db when a feed or batch completes without errors.
 * Maintains gtfs.db.bak as a backup of the last known good database.
 */

let isBusy = false;

function initWorkerDatabase() {
  try {
    getDatabase(); // initializes gtfs.db.tmp with schema if needed
    for (const seed of SEED_FEEDS) {
      const existing = getFeedById(seed.id);
      if (!existing) {
        upsertFeed(seed);
      }
    }
    try {
      seedMetroOfficialData();
    } catch (err) {
      console.warn('[Worker Seed] Aviso:', err);
    }
    commitWorkerDatabase();
  } catch (err: any) {
    console.warn('[Worker Init DB] Aviso:', err?.message || err);
  }
}

const skipArg = process.argv.find((a) => a.startsWith('--skip-feeds='));
const initialSkipFeeds = skipArg
  ? new Set(skipArg.replace('--skip-feeds=', '').split(',').filter(Boolean))
  : new Set<string>();

async function executeAll(extraSkipFeeds?: Set<string>) {
  if (isBusy) {
    console.log('[Worker] Ingestão já em execução, pedido ignorado.');
    return;
  }
  isBusy = true;
  try {
    console.log('[Worker] A verificar base de dados de trabalho...');
    initWorkerDatabase();

    console.log('[Worker] A executar auto-descoberta de feeds em segundo plano...');
    await runAutoDiscovery();

    console.log('[Worker] A executar ingestão sequencial de todos os feeds (do mais pequeno ao maior)...');
    const combinedSkip = new Set([...initialSkipFeeds, ...(extraSkipFeeds || [])]);
    await ingestAllFeedsSequentially(combinedSkip);

    console.log('[Worker] Ciclo de ingestão em segundo plano concluído.');
  } catch (err: any) {
    console.error('[Worker] Erro no ciclo de ingestão:', err?.message || err);
  } finally {
    isBusy = false;
    if (process.send) {
      process.send({ type: 'INGESTION_COMPLETED', timestamp: new Date().toISOString() });
    }
  }
}

async function executeSingle(feedId: string) {
  console.log(`[Worker] A processar feed individual: ${feedId}...`);
  try {
    initWorkerDatabase();
    if (feedId === 'carris_metropolitana') {
      await ingestCarrisMetropolitanaApi();
    } else if (feedId === 'unir') {
      await ingestUnirQiHoras();
    } else {
      const feed = getFeedById(feedId);
      if (feed && feed.feed_type === 'gtfs') {
        await ingestGtfsZipFeed(feed);
      }
    }
    commitWorkerDatabase(feedId);
    console.log(`[Worker] Feed ${feedId} processado e gravado com sucesso.`);
  } catch (err: any) {
    console.error(`[Worker] Erro ao processar feed ${feedId}:`, err?.message || err);
  }
}

// IPC Listener
process.on('message', async (msg: any) => {
  if (!msg || typeof msg !== 'object') return;

  switch (msg.action) {
    case 'INGEST_ALL':
      await executeAll(msg.skipFeeds ? new Set(msg.skipFeeds) : undefined);
      break;
    case 'INGEST_SINGLE':
      if (msg.feedId) await executeSingle(msg.feedId);
      break;
    case 'RUN_DISCOVERY':
      try {
        await runAutoDiscovery();
      } catch (err: any) {
        console.warn('[Worker] Erro na auto-descoberta:', err?.message);
      }
      break;
    default:
      break;
  }
});

// If started with --run-now, start initial ingestion immediately
if (process.argv.includes('--run-now')) {
  setTimeout(() => {
    executeAll().catch((err) => console.error('[Worker Auto-Start Error]:', err));
  }, 500);
}

console.log('[Worker] Background Feed Ingestion Worker ativo (PID:', process.pid, ')');
