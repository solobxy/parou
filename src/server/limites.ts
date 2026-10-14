// Limites por endereço: travam robôs e tentativas de adivinhar palavras-passe.
// Só confia no endereço enviado pelo Caddy (cabeçalho x-forwarded-for) quando o pedido vem da própria
// máquina; ligações diretas não conseguem fingir ser outro endereço.
import type { Request } from 'express';

const registos = new Map<string, number[]>();

// O registo de segurança quer saber quando um limite trava alguém (só chega o início da chave, ver registoSeguranca.ts)
let aoExceder: ((chave: string) => void) | null = null;
export function aoExcederLimite(f: (chave: string) => void) { aoExceder = f; }

/** true = pode continuar; false = passou do limite. Conta sempre este pedido. */
export function dentroDoLimite(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const lista = (registos.get(chave) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  registos.set(chave, lista);
  const dentro = lista.length <= max;
  if (!dentro && aoExceder) { try { aoExceder(chave); } catch { /* o registo nunca trava um pedido */ } }
  return dentro;
}

setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of registos) if (!v.some((t) => agora - t < 24 * 3600_000)) registos.delete(k);
}, 10 * 60_000).unref?.();

export function ipDe(req: Request): string {
  const remoto = req.socket.remoteAddress || '';
  const local = remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1';
  return (local ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || remoto;
}
