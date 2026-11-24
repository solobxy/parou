// Atribuição que um operador pediu (ex.: «Fonte — Transtejo Soflusa (TTSL)»), por baixo dos horários e do tempo real
// dele. Recebe os operadores (ids dos feeds) que estão no ecrã e mostra uma linha por atribuição, sem repetir.
import React from 'react';
import { idioma } from '../i18n';
import { atribuicaoNaLingua } from '../utils/atribuicoes';

export function textosFonte(ids: ReadonlyArray<string | null | undefined>, lingua: string = idioma): string[] {
  const vistos = new Set<string>();
  for (const id of ids) {
    const texto = id ? atribuicaoNaLingua(String(id), lingua) : null;
    if (texto) vistos.add(texto);
  }
  return [...vistos];
}

export default function FonteOperador({ ids, className = '' }: { ids: ReadonlyArray<string | null | undefined>; className?: string }) {
  const textos = textosFonte(ids);
  if (!textos.length) return null;
  return (
    <div className={`text-[11px] leading-snug text-[#6B6B6B] ${className}`} data-teste="fonte-operador">
      {textos.map((x) => <p key={x}>{x}</p>)}
    </div>
  );
}
