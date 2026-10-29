// Linhas e paragens mais procuradas na PAROU. A app avisa o servidor quando alguém abre uma linha ou
// paragem; o servidor guarda só o dia, o que foi aberto e quantas pessoas diferentes o abriram (nunca quem).
// Quem desligou a contagem na página de Privacidade não é contado. Ver src/server/estatisticas.ts.

export type TipoProcura = 'linha' | 'paragem';
const avisados = new Set<string>();

/** Conta a abertura (uma vez por sessão para cada linha/paragem; o servidor conta uma vez por dia). */
export function registarProcura(tipo: TipoProcura, id: string, nome = ''): void {
  if (!id || typeof window === 'undefined') return;
  try { if ((navigator as any).webdriver) return; } catch {} // testes automáticos não contam
  const chave = `${tipo}|${id}`;
  if (avisados.has(chave)) return;
  avisados.add(chave);
  void fetch('/api/estatisticas/procura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: tipo, id, nome: nome.slice(0, 80) }),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => { avisados.delete(chave); });
}

/** As linhas mais abertas na PAROU (das cidades escolhidas, se houver). Lista vazia se ainda não há dados. */
export async function linhasMaisProcuradas(cidades: string[], signal?: AbortSignal): Promise<string[]> {
  const qs = cidades.length ? `?cidades=${encodeURIComponent(cidades.join(','))}` : '';
  const r = await fetch(`/api/estatisticas/populares${qs}`, { signal: signal || AbortSignal.timeout(10000) });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j?.linhas) ? j.linhas.filter((x: unknown) => typeof x === 'string') : [];
}
