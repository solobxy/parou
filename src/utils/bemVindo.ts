// Boas-vindas (carrossel) para quem abre a PAROU pela primeira vez.
//
// Estado guardado neste telemóvel (localStorage, chave "parou_bemvindo"):
//   (vazio)    → ainda não decidido: quem não tem mais nada da PAROU guardada é "novo", quem já tem é "visto"
//   "novo"     → primeira vez: mostra as boas-vindas quando abrir o início
//   "curso:N"  → estava a meio (mudou de idioma, a página recarregou): retoma no passo N
//   "visto"    → já viu, ou já usava a PAROU antes de existirem as boas-vindas: nunca mais aparecem
//
// A decisão é tomada UMA vez, ao carregar este módulo, antes de a app guardar o que quer que seja.
// Só aparecem no início ("/" ou "/perto"): quem chega do Google a uma página de horários, greves, etc. vem à procura de
// uma coisa e não deve levar com uma janela por cima (e o Google penaliza janelas que tapam a página ao chegar).

const CHAVE = 'parou_bemvindo';
// Chaves que podem existir logo na primeira visita (idioma por ?lang=, tema, aviso de instalar, chave de administração)
const IGNORAR = new Set([CHAVE, 'parou_idioma', 'parou_tema', 'parou_aviso_instalar', 'parou_admin', 'parou_recarregou']);

export type EstadoBemVindo = { mostrar: false } | { mostrar: true; passo: number };

const NAO: EstadoBemVindo = { mostrar: false };

const eRobo = (): boolean => {
  try {
    if ((navigator as any).webdriver) return true;
    return /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit/i.test(navigator.userAgent || '');
  } catch { return false; }
};

const eInicio = (): boolean => {
  try {
    const caminho = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    return caminho === '/' || caminho === '/perto';
  } catch { return false; }
};

function calcular(): EstadoBemVindo {
  if (typeof window === 'undefined') return NAO;
  let guardado: string | null;
  try {
    guardado = localStorage.getItem(CHAVE);
  } catch {
    return NAO; // sem armazenamento não dá para saber se já viu: melhor não incomodar
  }
  if (guardado === 'visto') return NAO;
  if (eRobo()) return NAO;

  if (guardado === null) {
    // Primeira decisão: já havia algo da PAROU guardado? Então já usava a app antes disto existir.
    let jaUsava = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('parou_') && !IGNORAR.has(k)) { jaUsava = true; break; }
      }
    } catch {}
    try { localStorage.setItem(CHAVE, jaUsava ? 'visto' : 'novo'); } catch { return NAO; }
    if (jaUsava) return NAO;
    guardado = 'novo';
  }

  if (!eInicio()) return NAO;
  const retoma = /^curso:(\d{1,2})$/.exec(guardado);
  if (retoma) return { mostrar: true, passo: Math.max(1, Number(retoma[1])) };
  return guardado === 'novo' ? { mostrar: true, passo: 0 } : NAO;
}

/** Decidido ao carregar a página: o que fazer com as boas-vindas nesta abertura */
export const BEM_VINDO_AO_ABRIR: EstadoBemVindo = calcular();

export function marcarBemVindoVisto() {
  try { localStorage.setItem(CHAVE, 'visto'); } catch {}
}

/** Antes de recarregar por mudança de idioma: ao voltar, retoma no passo seguinte */
export function guardarBemVindoEmCurso(passo: number) {
  try { localStorage.setItem(CHAVE, `curso:${passo}`); } catch {}
}

// ---- Demonstração (administração) ----
// Quem vê o carrossel pelo botão de administração não mexe no estado acima, mas se mudar de idioma a página recarrega:
// guarda-se o passo só nesta aba (sessionStorage) e lê-se uma única vez ao carregar, para a demonstração continuar.
const CHAVE_DEMO = 'parou_bemvindo_demo';

function lerDemo(): number | null {
  try {
    const v = sessionStorage.getItem(CHAVE_DEMO);
    if (v === null) return null;
    sessionStorage.removeItem(CHAVE_DEMO);
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n < 20 ? n : null;
  } catch { return null; }
}

/** Passo a retomar na demonstração depois de mudar de idioma (ou null) */
export const BEM_VINDO_DEMO_AO_ABRIR: number | null = typeof window === 'undefined' ? null : lerDemo();

export function guardarDemoEmCurso(passo: number) {
  try { sessionStorage.setItem(CHAVE_DEMO, String(passo)); } catch {}
}
