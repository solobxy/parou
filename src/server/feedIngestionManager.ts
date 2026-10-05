import { fork, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reloadDatabaseConnection } from './db/gtfsDatabase';
import { IngestionProgressState } from './gtfsIngestionService';

/**
 * PAROU.PT - Feed Ingestion Manager
 * 
 * Spawns and manages the dedicated background worker child process.
 * The HTTP server never blocks; all ingestion tasks run in the worker.
 */

let workerChild: ChildProcess | null = null;
let isStopping = false;
let memoryProgress: IngestionProgressState | null = null;
let lastProgressTimestamp = Date.now();
let currentOperatingFeedId: string | null = null;
let currentOperatingName: string | null = null;
const failedFeedIds = new Set<string>();
let watchdogTimer: NodeJS.Timeout | null = null;

const WATCHDOG_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (Requirement 3)

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(currentDir, 'workers', 'feedIngestionWorker.ts');

export function getLatestWorkerProgress(): IngestionProgressState | null {
  return memoryProgress;
}

function startWatchdog(): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(async () => {
    if (!workerChild || workerChild.killed || !memoryProgress?.isLoading) {
      return;
    }

    const elapsed = Date.now() - lastProgressTimestamp;
    if (elapsed >= WATCHDOG_TIMEOUT_MS) {
      const stuckId = currentOperatingFeedId;
      const stuckName = currentOperatingName || stuckId || 'desconhecido';
      console.warn(`[Vigilância Ingestão] ALERTA: Sem progresso há mais de 10 minutos no operador ${stuckName} (${stuckId}). A terminar worker (PID: ${workerChild.pid})...`);

      // 1. Marca esse operador como "falhou" no Registo de Fontes (Requirement 3)
      if (stuckId) {
        failedFeedIds.add(stuckId);
        try {
          const { getDatabase } = await import('./db/gtfsDatabase');
          const db = getDatabase();
          db.prepare(`
            UPDATE feeds SET
              status = 'falhou',
              progress = 'falhou: Tempo limite excedido (10 min)',
              last_error = 'Vigilância: inatividade superior a 10 minutos sem progresso',
              last_fetch_at = ?
            WHERE id = ?
          `).run(new Date().toISOString(), stuckId);
          console.log(`[Vigilância Ingestão] Operador ${stuckId} marcado como 'falhou' no Registo de Fontes.`);
        } catch (err: any) {
          console.error('[Vigilância Ingestão] Erro ao marcar operador como falhou:', err?.message || err);
        }
      }

      // 2. Termina o worker
      try {
        workerChild.kill('SIGKILL');
      } catch {}
      workerChild = null;

      // 3. Começa um worker novo a partir do operador seguinte (Requirement 3)
      console.log('[Vigilância Ingestão] A iniciar novo worker a partir do operador seguinte...');
      setTimeout(() => {
        if (!isStopping) {
          startBackgroundWorker(Array.from(failedFeedIds));
        }
      }, 1500);
    }
  }, 15000);
}

export function startBackgroundWorker(skipFeeds?: string[]): void {
  if (workerChild && !workerChild.killed) {
    return;
  }

  if (skipFeeds) {
    for (const id of skipFeeds) failedFeedIds.add(id);
  }

  lastProgressTimestamp = Date.now();
  startWatchdog();

  try {
    const skipArgs = failedFeedIds.size > 0
      ? [`--skip-feeds=${Array.from(failedFeedIds).join(',')}`]
      : [];

    // Fork the worker with current Node execArgv (preserving --import tsx)
    workerChild = fork(workerPath, ['--run-now', ...skipArgs], {
      execArgv: process.execArgv,
      env: {
        ...process.env,
        IS_WORKER: 'true',
      },
      stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
    });

    console.log(`[Ingestion Manager] Worker em segundo plano iniciado com sucesso (PID: ${workerChild.pid})`);

    workerChild.on('message', (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      lastProgressTimestamp = Date.now();

      if (msg.type === 'DATABASE_UPDATED') {
        console.log('[Ingestion Manager] Base de dados atualizada pelo worker. A recarregar ligação só-leitura...');
        reloadDatabaseConnection();
      } else if (msg.type === 'INGESTION_PROGRESS') {
        if (msg.currentFeedId) currentOperatingFeedId = msg.currentFeedId;
        if (msg.currentOperator) currentOperatingName = msg.currentOperator;
        memoryProgress = {
          isLoading: Boolean(msg.isLoading),
          totalOperators: Number(msg.totalOperators || 0),
          loadedOperators: Number(msg.loadedOperators || 0),
          currentOperator: msg.currentOperator || '',
          currentFeedId: msg.currentFeedId || '',
          message: msg.message || '',
          updatedAt: msg.updatedAt || new Date().toISOString(),
        };
      } else if (msg.type === 'INGESTION_COMPLETED') {
        console.log('[Ingestion Manager] Notificação recebida: ciclo de ingestão concluído.');
        currentOperatingFeedId = null;
        currentOperatingName = null;
        reloadDatabaseConnection();
        if (memoryProgress) {
          memoryProgress.isLoading = false;
        }
      }
    });

    workerChild.on('exit', (code, signal) => {
      console.warn(`[Ingestion Manager] Worker terminou (código ${code}, sinal ${signal}).`);
      workerChild = null;

      // Auto-restart worker if not intentionally stopping
      if (!isStopping) {
        console.log('[Ingestion Manager] A reiniciar worker em 5 segundos...');
        setTimeout(() => {
          if (!isStopping) startBackgroundWorker(Array.from(failedFeedIds));
        }, 5000);
      }
    });

    workerChild.on('error', (err) => {
      console.error('[Ingestion Manager] Erro no worker:', err?.message || err);
    });
  } catch (err: any) {
    console.error('[Ingestion Manager] Falha ao arrancar worker:', err?.message || err);
  }
}

export function triggerIngestAll(): void {
  if (workerChild && workerChild.connected) {
    workerChild.send({ action: 'INGEST_ALL' });
  } else {
    startBackgroundWorker();
  }
}

export function triggerIngestSingle(feedId: string): void {
  if (workerChild && workerChild.connected) {
    workerChild.send({ action: 'INGEST_SINGLE', feedId });
  } else {
    startBackgroundWorker();
  }
}

export function triggerDiscovery(): void {
  if (workerChild && workerChild.connected) {
    workerChild.send({ action: 'RUN_DISCOVERY' });
  } else {
    startBackgroundWorker();
  }
}

export function stopBackgroundWorker(): void {
  isStopping = true;
  if (workerChild) {
    try {
      workerChild.kill('SIGTERM');
    } catch {}
    workerChild = null;
  }
}
