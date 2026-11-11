// Avisos das linhas guardadas: que linhas mandar ao servidor e quando convidar a ligar os avisos.
// Funções puras (testadas em auditoria/avisos-linha.mjs); o ecrã está em components/ConviteAvisosLinha.tsx.

export interface LinhaParaAvisos {
  op: string;
  ln: string;
  nome?: string;
}

interface FavoritoLinha {
  id: string;
  operatorName?: string;
  operatorId?: string;
  lineCode?: string;
  lineName?: string;
}

/** Máximo de linhas enviadas (o servidor também corta nas 40) */
export const MAX_LINHAS_AVISOS = 40;

/**
 * Linhas guardadas, a partir dos favoritos (id "line-<feed>:<rota>") e da lista antiga dos Horários (só ids).
 * Uma linha sem nome de operador usa o feed do id ("cm:1001" → operador "cm", linha "1001").
 */
export function linhasParaAvisos(favoritos: FavoritoLinha[], idsAntigos: unknown[] = []): LinhaParaAvisos[] {
  const out = new Map<string, LinhaParaAvisos>();
  const vistos = new Set<string>();
  const juntar = (id: string, f?: FavoritoLinha) => {
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    const dois = id.indexOf(':');
    const feed = dois > 0 ? id.slice(0, dois) : '';
    const rota = dois > 0 ? id.slice(dois + 1) : id;
    const op = String(f?.operatorName || f?.operatorId || feed || '').trim().slice(0, 60);
    const ln = String(f?.lineCode || rota || '').trim().slice(0, 60);
    if (!op || !ln) return;
    const nome = f?.lineName ? String(f.lineName).trim().slice(0, 60) : '';
    const k = `${op.toLowerCase()}|${ln.toLowerCase()}`;
    if (!out.has(k)) out.set(k, nome ? { op, ln, nome } : { op, ln });
  };
  for (const f of favoritos || []) {
    if (f && typeof f.id === 'string' && f.id.startsWith('line-')) juntar(f.id.slice(5), f);
  }
  for (const id of idsAntigos || []) if (typeof id === 'string') juntar(id);
  return Array.from(out.values()).slice(0, MAX_LINHAS_AVISOS);
}

/**
 * Operadores com avisos por linha (os avisos oficiais dizem a linha afetada): Carris Metropolitana e Metro de Lisboa.
 * Só nestes se oferece «avisar-te sobre esta linha», para não prometer o que não chega.
 */
export function temAvisosPorLinha(operador: string, idLinha = ''): boolean {
  const t = `${operador || ''} ${idLinha || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /carris metropolitana|carris_metropolitana|metro(politano)? de lisboa|metro_lisboa|(^|\s)cm:/.test(t);
}

export interface MemoriaConvite {
  /** Quantas vezes a pessoa disse «agora não» */
  vezes: number;
  /** Quando disse «agora não» pela última vez (ms) */
  fechadoEm: number | null;
}

export const CHAVE_CONVITE_LINHA = 'parou_convite_avisos_linha';

export function lerMemoriaConvite(texto: string | null): MemoriaConvite {
  try {
    const v = JSON.parse(texto || 'null');
    if (v && typeof v.vezes === 'number' && v.vezes >= 0) return { vezes: Math.floor(v.vezes), fechadoEm: typeof v.fechadoEm === 'number' ? v.fechadoEm : null };
  } catch { /* estragada: começa do zero */ }
  return { vezes: 0, fechadoEm: null };
}

export function memoriaDepoisDeFecharConvite(m: MemoriaConvite, agora: number): MemoriaConvite {
  return { vezes: m.vezes + 1, fechadoEm: agora };
}

/**
 * Convidar a ligar os avisos ao guardar uma linha? Só se o aparelho os recebe, a pessoa não os bloqueou nem já os
 * tem ligados, e não disse «agora não» há pouco (14 dias depois da 1.ª vez; à 2.ª, nunca mais).
 */
export function deveConvidarAvisosLinha(o: {
  suportado: boolean;
  permissao: string;
  ligados: boolean;
  memoria: MemoriaConvite;
  agora: number;
}): boolean {
  if (!o.suportado || o.ligados || o.permissao === 'denied') return false;
  if (o.memoria.vezes >= 2) return false;
  if (o.memoria.vezes === 1 && o.memoria.fechadoEm !== null && o.agora - o.memoria.fechadoEm < 14 * 864e5) return false;
  return true;
}
