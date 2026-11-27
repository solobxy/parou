/**
 * Favoritos de linhas: a linha inteira ("line-stcp:801") ou só um sentido ("line-stcp:801~s1").
 * Quem só precisa da linha (avisos, estrela das listas) usa linhaDoFavorito(id).routeId.
 */

const SEPARADOR = '~s';

export function idFavoritoLinha(routeId: string, sentido?: number | null): string {
  return sentido == null ? `line-${routeId}` : `line-${routeId}${SEPARADOR}${sentido}`;
}

export function linhaDoFavorito(id: unknown): { routeId: string; sentido?: number } | null {
  if (typeof id !== 'string' || !id.startsWith('line-')) return null;
  const resto = id.slice(5);
  const m = resto.match(/^(.*)~s(\d{1,2})$/);
  if (m && m[1]) return { routeId: m[1], sentido: Number(m[2]) };
  return resto ? { routeId: resto } : null;
}

/** Sentidos guardados de uma linha: 'toda' (a linha inteira) ou o conjunto de direction_id guardados. */
export function sentidosGuardados(favoritos: Array<{ id: string }>, routeId: string): 'toda' | Set<number> {
  const sentidos = new Set<number>();
  for (const f of favoritos || []) {
    const l = linhaDoFavorito(f?.id);
    if (!l || l.routeId !== routeId) continue;
    if (l.sentido == null) return 'toda';
    sentidos.add(l.sentido);
  }
  return sentidos;
}

export interface SentidoDaLinha { direction_id: number; headsign?: string }

/**
 * O que fazer ao tocar na estrela de um sentido: devolve os ids a tirar e os sentidos a juntar.
 * Linha inteira guardada → fica só o(s) outro(s) sentido(s); sentido guardado → sai; senão entra.
 */
export function alternarSentido(
  favoritos: Array<{ id: string }>,
  routeId: string,
  sentido: number,
  todosSentidos: number[],
): { tirar: string[]; juntar: number[]; ficaGuardado: boolean } {
  const atual = sentidosGuardados(favoritos, routeId);
  if (atual === 'toda') {
    const outros = Array.from(new Set(todosSentidos)).filter((d) => d !== sentido);
    return { tirar: [idFavoritoLinha(routeId)], juntar: outros, ficaGuardado: false };
  }
  if (atual.has(sentido)) return { tirar: [idFavoritoLinha(routeId, sentido)], juntar: [], ficaGuardado: false };
  return { tirar: [], juntar: [sentido], ficaGuardado: true };
}
