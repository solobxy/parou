// Idioma da app (português por omissão; inglês para turistas e estudantes estrangeiros).
// Os textos escrevem-se em português no código e passam por t(); o dicionário en.ts dá a versão
// inglesa. Mudar de idioma guarda a escolha e recarrega a página (simples e sem estados a meio).
import { EN } from './en';

export type Idioma = 'pt' | 'en';
const CHAVE = 'parou_idioma';

function lerIdioma(): Idioma {
  try {
    const url = new URLSearchParams(window.location.search).get('lang');
    if (url === 'en' || url === 'pt') { localStorage.setItem(CHAVE, url); return url; }
    const guardado = localStorage.getItem(CHAVE);
    if (guardado === 'en' || guardado === 'pt') return guardado;
  } catch {}
  return 'pt';
}

export const idioma: Idioma = typeof window === 'undefined' ? 'pt' : lerIdioma();
if (typeof document !== 'undefined') document.documentElement.lang = idioma === 'en' ? 'en' : 'pt-PT';

/** Traduz um texto (escrito em português). Variáveis: t('{n} paragens', { n: 3 }) */
export function t(pt: string, vars?: Record<string, string | number>): string {
  let s = idioma === 'en' ? (EN[pt] ?? pt) : pt;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural simples: tn(n, '{n} paragem', '{n} paragens') */
export function tn(n: number, um: string, varios: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? um : varios, { n, ...(vars || {}) });
}

export function mudarIdioma(novo: Idioma): void {
  try { localStorage.setItem(CHAVE, novo); } catch {}
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}

/** Locale para datas e horas */
export const LOCALE = idioma === 'en' ? 'en-GB' : 'pt-PT';
