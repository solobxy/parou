import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * PAROU.PT - Full-Stack Production Entry Point
 * 
 * Satisfies the strict Google Cloud Run requirement: "start": "node server.ts".
 * Seamlessly bootstraps TypeScript resolution using the embedded 'tsx' engine
 * in both development and production environments.
 */

const isTsxActive = Boolean(
  process.env.__TSX_BOOTSTRAPPED__ === 'true' ||
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  // @ts-ignore
  Boolean(process[Symbol.for('tsx.version')])
);

if (!isTsxActive) {
  process.env.__TSX_BOOTSTRAPPED__ = 'true';
  const child = spawn(process.execPath, ['--import', 'tsx', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });

  const forwardSignal = (signal: string) => {
    if (child.pid) {
      try {
        process.kill(child.pid, signal as any);
      } catch {}
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('error', (err) => {
    console.error('[Server Bootstrap] Erro no arranque do processo:', err);
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
} else {
  await import('./server.main.ts');
}
