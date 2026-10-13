// Idioma da app (português por omissão; inglês, alemão e francês para turistas e estrangeiros).
// Os textos escrevem-se em português no código e passam por t(); os dicionários en.ts, de.ts e fr.ts dão as outras
// versões. Só se descarrega o dicionário do idioma em uso (o português não precisa de nenhum). Se faltar uma
// tradução em alemão ou francês, aparece o inglês e, por fim, o português (nunca fica um buraco no ecrã).
// Mudar de idioma guarda a escolha e recarrega a página (simples e sem estados a meio).

export type Idioma = 'pt' | 'en' | 'de' | 'fr';
export const IDIOMAS: readonly Idioma[] = ['pt', 'en', 'de', 'fr'];
const CHAVE = 'parou_idioma';

export const eIdioma = (v: unknown): v is Idioma => v === 'pt' || v === 'en' || v === 'de' || v === 'fr';

function lerIdioma(): Idioma {
  try {
    const url = new URLSearchParams(window.location.search).get('lang');
    if (eIdioma(url)) { localStorage.setItem(CHAVE, url); return url; }
    const guardado = localStorage.getItem(CHAVE);
    if (eIdioma(guardado)) return guardado;
  } catch {}
  return 'pt';
}

export const idioma: Idioma = typeof window === 'undefined' ? 'pt' : lerIdioma();

/** Código BCP 47 do idioma (atributo lang e formatação de datas, horas e números) */
const LOCALES: Record<Idioma, string> = { pt: 'pt-PT', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' };
const LANG_HTML: Record<Idioma, string> = { pt: 'pt-PT', en: 'en', de: 'de', fr: 'fr' };

// O servidor também fala outros idiomas nas páginas que desenha (cidades, linhas, greves…): diz-lhe o idioma por cookie.
function guardarCookie(i: Idioma) {
  try { document.cookie = `${CHAVE}=${i};path=/;max-age=31536000;samesite=lax`; } catch {}
}
if (typeof document !== 'undefined') guardarCookie(idioma);
if (typeof document !== 'undefined') document.documentElement.lang = LANG_HTML[idioma];

type Dicionario = Record<string, string>;
let DIC: Dicionario = {};
let ALTERNATIVA: Dicionario = {};

// Carrega só o que o idioma precisa; os módulos que usam t() só arrancam depois disto (await no topo do módulo).
if (typeof window !== 'undefined') {
  if (idioma === 'en') {
    DIC = (await import('./en')).EN;
  } else if (idioma === 'de') {
    const [de, en] = await Promise.all([import('./de'), import('./en')]);
    DIC = de.DE; ALTERNATIVA = en.EN;
  } else if (idioma === 'fr') {
    const [fr, en] = await Promise.all([import('./fr'), import('./en')]);
    DIC = fr.FR; ALTERNATIVA = en.EN;
  }
}

/** Traduz um texto (escrito em português). Variáveis: t('{n} paragens', { n: 3 }) */
export function t(pt: string, vars?: Record<string, string | number>): string {
  let s = idioma === 'pt' ? pt : (DIC[pt] ?? ALTERNATIVA[pt] ?? pt);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural simples: tn(n, '{n} paragem', '{n} paragens'). O francês trata 0 como singular ("0 arrêt"). */
export function tn(n: number, um: string, varios: string, vars?: Record<string, string | number>): string {
  const singular = idioma === 'fr' ? n >= 0 && n < 2 : n === 1;
  return t(singular ? um : varios, { n, ...(vars || {}) });
}

export function mudarIdioma(novo: Idioma): void {
  try { localStorage.setItem(CHAVE, novo); } catch {}
  guardarCookie(novo);
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}

/** Locale para datas e horas */
export const LOCALE = LOCALES[idioma];
