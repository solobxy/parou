// "As minhas cidades": a pessoa escolhe as cidades onde viaja e os Horários passam a mostrar só as linhas que lá passam.
// Fica no telemóvel (e na cópia dos favoritos no servidor, como o resto das preferências).
import { useCallback, useEffect, useState } from 'react';
import { CIDADES } from '../data/cidades';

const CHAVE = 'parou_cidades';
const EVENTO = 'parou_cidades_mudou';
export const MAX_CIDADES = 8;

const CONHECIDAS = new Set(CIDADES.map((c) => c.slug));

function limpar(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  for (const s of lista) if (typeof s === 'string' && CONHECIDAS.has(s)) vistas.add(s);
  return Array.from(vistas).slice(0, MAX_CIDADES);
}

/** Cidades escolhidas (códigos, como "porto"); vazio = todas */
export function lerCidades(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    // Guarda-se como objeto e não como lista: a cópia no servidor junta listas, e assim uma cidade tirada não volta
    return limpar(v?.s);
  } catch {
    return [];
  }
}

export function guardarCidades(lista: string[]): void {
  const limpa = limpar(lista);
  try {
    // Lista vazia também se guarda (apagar a chave faria a cópia do servidor repor as cidades antigas)
    localStorage.setItem(CHAVE, JSON.stringify({ v: 1, s: limpa }));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENTO));
    window.dispatchEvent(new CustomEvent('parou_favorites_updated')); // dispara a cópia no servidor
  } catch {}
}

export function nomeDaCidade(slug: string): string {
  return CIDADES.find((c) => c.slug === slug)?.nome || slug;
}

/** "Porto", "Porto e Braga", "Porto, Braga e Lisboa" */
export function listaDeCidades(slugs: string[], e = 'e'): string {
  const nomes = slugs.map(nomeDaCidade);
  if (nomes.length <= 1) return nomes[0] || '';
  return `${nomes.slice(0, -1).join(', ')} ${e} ${nomes[nomes.length - 1]}`;
}

/** As cidades escolhidas, sempre em dia (mudam noutro separador, ou quando a cópia do servidor as repõe) */
export function useCidades(): [string[], (lista: string[]) => void] {
  const [cidades, setCidades] = useState<string[]>(() => lerCidades());
  useEffect(() => {
    const reler = () => setCidades((atual) => {
      const nova = lerCidades();
      return nova.join(',') === atual.join(',') ? atual : nova;
    });
    window.addEventListener(EVENTO, reler);
    window.addEventListener('parou_dados_repostos', reler);
    window.addEventListener('storage', reler);
    return () => {
      window.removeEventListener(EVENTO, reler);
      window.removeEventListener('parou_dados_repostos', reler);
      window.removeEventListener('storage', reler);
    };
  }, []);
  const mudar = useCallback((lista: string[]) => guardarCidades(lista), []);
  return [cidades, mudar];
}
