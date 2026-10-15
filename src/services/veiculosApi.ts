import type { RespostaABordo, VeiculoLeve } from '../types/aBordo';

export interface Caixa { sul: number; oeste: number; norte: number; leste: number }

/** Autocarros em direto das linhas pedidas (chaves "stcp:803") e/ou dentro de uma caixa do mapa */
export async function fetchVeiculos(o: { linhas?: string[]; caixa?: Caixa }, signal?: AbortSignal): Promise<{ veiculos: VeiculoLeve[]; agora: number }> {
  const params = new URLSearchParams();
  if (o.linhas && o.linhas.length) params.set('linhas', o.linhas.slice(0, 40).join(','));
  if (o.caixa) params.set('caixa', [o.caixa.sul, o.caixa.oeste, o.caixa.norte, o.caixa.leste].map((x) => x.toFixed(5)).join(','));
  const res = await fetch(`/api/transit/veiculos?${params.toString()}`, { cache: 'no-store', signal: signal || AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Falha ao obter os autocarros (${res.status})`);
  const data = await res.json();
  return { veiculos: Array.isArray(data.veiculos) ? data.veiculos : [], agora: Number(data.agora) || Math.floor(Date.now() / 1000) };
}

export class SemSinalError extends Error {
  constructor() { super('Sem sinal deste autocarro'); this.name = 'SemSinalError'; }
}

/** Percurso e paragem seguinte do autocarro em que a pessoa está (`completo` traz a lista de paragens; só o primeiro pedido precisa dela) */
export async function fetchABordo(id: string, o: { desde?: number; completo?: boolean } = {}, signal?: AbortSignal): Promise<RespostaABordo> {
  const params = new URLSearchParams({ veiculo: id });
  if (o.desde !== undefined && o.desde >= 0) params.set('desde', String(Math.floor(o.desde)));
  if (o.completo) params.set('completo', '1');
  const res = await fetch(`/api/transit/a-bordo?${params.toString()}`, { cache: 'no-store', signal: signal || AbortSignal.timeout(8000) });
  if (res.status === 404) throw new SemSinalError();
  if (!res.ok) throw new Error(`Falha ao obter o percurso (${res.status})`);
  return (await res.json()) as RespostaABordo;
}
