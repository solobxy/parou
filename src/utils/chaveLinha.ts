// Junta uma linha do horário com os autocarros em direto: "stcp:803", "cm:4436", "tub:45".
// Serve no servidor (que sabe de que operador é cada veículo) e na app (que sabe de que linha é cada partida).
// O código da linha tira o que está entre parênteses retos (a Carris Metropolitana usa "[A2L1N]4436" em alguns sítios).

export type OperadorVeiculos = 'stcp' | 'cm' | 'tub';

export function normalizarLinha(t: string | undefined | null): string {
  return String(t ?? '').replace(/\[[^\]]*\]/g, '').trim().toUpperCase();
}

/** Operador pelo prefixo do identificador ("stcp:…", "cm:…", "cmh:…", "tub_braga:…") */
export function operadorPorPrefixo(id: string | undefined | null): OperadorVeiculos | null {
  const p = String(id ?? '').toLowerCase();
  if (p.startsWith('stcp:')) return 'stcp';
  if (p.startsWith('cm:') || p.startsWith('cmh:')) return 'cm';
  if (p.startsWith('tub_braga:') || p.startsWith('tub:')) return 'tub';
  return null;
}

function operadorPorNome(nome: string | undefined | null): OperadorVeiculos | null {
  const n = String(nome ?? '').toLowerCase();
  if (n === 'stcp' || n.startsWith('stcp ') || n.includes('stcp')) return 'stcp';
  if (n === 'cm' || n.includes('carris metropolitana')) return 'cm';
  // TUB de Braga (não a TUBA de Barcelos, que é outro operador)
  if (n === 'tub' || n.startsWith('tub ') || n.startsWith('tub_') || n.startsWith('tub-') || n.includes('transportes urbanos de braga')) return 'tub';
  return null;
}

export function chaveDeLinha(op: OperadorVeiculos, linha: string | undefined | null): string | null {
  const l = normalizarLinha(linha);
  return l ? `${op}:${l}` : null;
}

/** Chave da linha de uma partida (código da linha e, para saber o operador, o routeId ou o nome do operador). Só há autocarros em direto para a STCP, a Carris Metropolitana e a TUB. */
export function chaveDaPartida(p: { routeId?: string; operatorId?: string; operatorName?: string; lineCode?: string }): string | null {
  const op = operadorPorPrefixo(p.routeId) ?? operadorPorNome(p.operatorId) ?? operadorPorNome(p.operatorName);
  return op ? chaveDeLinha(op, p.lineCode) : null;
}
