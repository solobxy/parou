// Regista no diário do servidor as consultas SQLite que demoram demasiado (ex.: um plano de consulta
// que muda com a versão do SQLite e passa de 1 ms para 200 ms). Cada consulta lenta aparece no
// máximo uma vez a cada 10 minutos, com o tempo e o início do SQL (nunca os valores pedidos).
import * as sqlite from 'node:sqlite';

const LIMITE_MS = 150;
const vistas = new Map<string, number>();
let ligado = false;

function avisar(sql: string, ms: number) {
  const chave = sql.replace(/\s+/g, ' ').trim().slice(0, 160);
  const agora = Date.now();
  if ((vistas.get(chave) || 0) > agora) return;
  vistas.set(chave, agora + 10 * 60_000);
  if (vistas.size > 500) vistas.clear();
  console.warn(`[SQL lento] ${Math.round(ms)} ms: ${chave}`);
}

export function vigiarConsultasLentas(): void {
  if (ligado) return;
  ligado = true;
  const proto = (sqlite as any).StatementSync?.prototype;
  if (!proto) return;
  for (const nome of ['all', 'get', 'run'] as const) {
    const original = proto[nome];
    if (typeof original !== 'function') continue;
    proto[nome] = function (this: any, ...args: unknown[]) {
      const t0 = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const ms = performance.now() - t0;
        if (ms > LIMITE_MS) { try { avisar(String(this.sourceSQL || '?'), ms); } catch { /* nunca parte a consulta */ } }
      }
    };
  }
}
