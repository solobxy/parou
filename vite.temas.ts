// Temas da PAROU (Escuro e Âmbar), gerados no build a partir do CSS que o Tailwind já produziu.
//
// A app usa as cores da marca escritas nas próprias classes (bg-[#F4F4F2], text-[#6B6B6B], border-[#E6E6E3]…).
// Em vez de reescrever milhares de classes, este módulo lê o CSS final, encontra cada regra que usa uma
// dessas classes e cria uma regra igual, mas só para <html data-tema="…">, com a cor trocada por uma da
// tabela do tema (ou, se a cor não estiver na tabela, por uma calculada em OKLCH). Assim qualquer classe nova
// que se escreva no futuro já aparece bem nos três temas, sem ter de mexer aqui.
//
// As cores têm um "papel" (fundo, texto ou borda), porque a mesma cor faz coisas diferentes: #111111 como
// texto passa a claro no tema escuro, e como fundo (botão preto) também passa a claro.
// O que não é classe do Tailwind (html, body, mapa, scrollbars…) está à mão em src/temas.css.

export type Papel = 'fundo' | 'texto' | 'borda';
type Tabela = Record<string, string>;

interface Tema {
  id: 'escuro' | 'ambar';
  fundo: Tabela;
  texto: Tabela;
  borda: Tabela;
  /** Cor calculada quando não está na tabela: devolve a cor nova, ou null para deixar como está */
  alternativa: (papel: Papel, r: number, g: number, b: number) => string | null;
  /** Regras à mão que têm de ganhar às geradas (superfícies escuras decorativas, texto sobre botões…) */
  especiais?: string;
}

// ---------------------------------------------------------------- cores (sRGB ⇄ OKLCH) ----------------------------------------------------------------
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gama = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function paraOklch(r: number, g: number, b: number): [number, number, number] {
  const [lr, lg, lb] = [linear(r / 255), linear(g / 255), linear(b / 255)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function deOklch(L: number, C: number, h: number): string {
  const A = C * Math.cos((h * Math.PI) / 180);
  const B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.round(Math.min(1, Math.max(0, gama(Math.min(1, Math.max(0, x))))) * 255));
  return '#' + rgb.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const limitar = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- Escuro ----------------------------------------------------------------
// Cinzentos neutros e quentes; o laranja da marca mantém-se; o que era preto passa a claro (botões, separadores ativos).
const ESCURO: Tema = {
  id: 'escuro',
  fundo: {
    FFFFFF: '#161618', FAFAF8: '#1B1B1E', F9F9F7: '#1B1B1E', F4F4F2: '#222225', F1F1EE: '#242427', EFEFEC: '#2A2A2E', ECECE8: '#2A2A2E',
    E6E6E3: '#2F2F34', D9D9D6: '#3A3A40', D6D6D2: '#3A3A40', D4D4D0: '#3A3A40', C9C9C4: '#44444A', B5B5B0: '#55555C', '6B6B6B': '#8A8A90',
    '111111': '#F2F2F0', '1F1F1F': '#E8E8E5', '2B2B2B': '#D8D8D5', '000000': '#FFFFFF',
    FDECEA: '#3B1D1A', FDE8E6: '#3B1D1A', FDF2F1: '#331A18', E6F6EC: '#15301F', E7F3E3: '#17301E', E8F0FE: '#172544',
    FFF1E8: '#3A2314', FFF4EC: '#3A2314', FFF7ED: '#34210F', FFF4E0: '#382A10', FFF1DC: '#382A10',
  },
  texto: {
    '111111': '#F2F2F0', '1F1F1F': '#EAEAE7', '2B2B2B': '#E2E2DF', '4A4A4A': '#C6C6C2', '6B6B6B': '#A0A0A6', '000000': '#FFFFFF',
    D9D9D6: '#55555C',
    C2410C: '#FF8A4D', '9A3412': '#FFA166', '8A4B00': '#FFC27A', A16207: '#F2C15C',
    D92D20: '#FF7468', B42318: '#FF8A80', '9F1D14': '#FFB4AC',
    '14693A': '#6FD79A', '1F7A3A': '#6FD79A', '16A34A': '#4ADE80', '1B4DB1': '#9DB8FF',
  },
  borda: {
    E6E6E3: '#2E2E33', EFEFEC: '#2A2A2E', D5D5D0: '#3C3C42', D3E7CD: '#25402B', C9C9C4: '#46464C', F3C5C1: '#5A2C28', FFEDD5: '#4A2D14',
    '111111': '#F2F2F0', FFFFFF: '#161618', '6B6B6B': '#8A8A90', '000000': '#FFFFFF',
  },
  alternativa(papel, r, g, b) {
    const [L, C, h] = paraOklch(r, g, b);
    // Cores fortes (laranja, vermelho, verde, azul vivos) e fundos já escuros ficam como estão
    if (papel === 'fundo') return (C >= 0.06 && L < 0.88) || L < 0.2 ? null : deOklch(0.15 + (1 - L) * 0.3, C * 0.55, h);
    if (papel === 'borda') return C >= 0.1 && L < 0.82 ? null : deOklch(0.2 + (1 - L) * 0.28, C * 0.55, h);
    if (L >= 0.68) return null; // texto já claro: lê-se bem em fundo escuro
    return deOklch(limitar(0.97 - 0.55 * L, 0.72, 0.94), C * 1.05, h);
  },
  // Botões e etiquetas pretos passam a claros; cartões e faixas pretas (como o do tempo) ficam escuros mas elevados.
  especiais: (() => {
    const PRETOS = ['111111', '1F1F1F', '2B2B2B', '000000'].map((c) => `.bg-\\[\\#${c}\\]`).join(',');
    const PEQUENOS = 'button,a,span,label,summary,[role="tab"],[role="radio"],[role="switch"],[role="button"]';
    const GRANDES = 'div,section,article,li,p,header,aside,nav,footer,main,ul,ol,figure,table,tr,td';
    return `
html[data-tema="escuro"] :is(${GRANDES}):is(${PRETOS}){background-color:#26262B;border-color:#34343A}
html[data-tema="escuro"] :is(${PEQUENOS}):is(${PRETOS}){background-color:#F2F2F0}
html[data-tema="escuro"] :is(${PEQUENOS}):is(${PRETOS}),html[data-tema="escuro"] :is(${PEQUENOS}):is(${PRETOS}) :is(.text-\\[\\#FFFFFF\\],.text-white){color:#111111!important}
`;
  })(),
};

// ---------------------------------------------------------------- Âmbar ----------------------------------------------------------------
// Claro e quente, em vidro: fundos translúcidos sobre um degradé laranja, texto castanho-escuro, laranja em força.
const AMBAR: Tema = {
  id: 'ambar',
  fundo: {
    FFFFFF: 'rgba(255,255,255,.66)', FAFAF8: 'rgba(255,255,255,.5)', F9F9F7: 'rgba(255,255,255,.5)', F4F4F2: 'rgba(255,247,238,.64)',
    F1F1EE: 'rgba(255,240,226,.7)', ECECE8: 'rgba(255,238,222,.74)', EFEFEC: 'rgba(150,80,30,.08)', E6E6E3: 'rgba(150,80,30,.12)',
    D9D9D6: 'rgba(150,80,30,.2)', D6D6D2: 'rgba(150,80,30,.2)', D4D4D0: 'rgba(150,80,30,.2)', C9C9C4: 'rgba(150,80,30,.3)', B5B5B0: 'rgba(150,80,30,.3)',
    '6B6B6B': '#8A6B55', '111111': '#2B170A', '1F1F1F': '#33200F', '2B2B2B': '#4A2C16',
    FDECEA: 'rgba(255,226,222,.82)', FDE8E6: 'rgba(255,226,222,.82)', FDF2F1: 'rgba(255,232,229,.82)', E6F6EC: 'rgba(220,246,230,.82)', E7F3E3: 'rgba(226,244,220,.85)',
    E8F0FE: 'rgba(225,236,255,.82)', FFF1E8: 'rgba(255,230,208,.88)', FFF4EC: 'rgba(255,234,214,.88)', FFF7ED: 'rgba(255,238,220,.88)', FFF4E0: 'rgba(255,236,200,.88)', FFF1DC: 'rgba(255,236,200,.88)',
  },
  texto: {
    '111111': '#2A170B', '1F1F1F': '#33200F', '2B2B2B': '#3B2616', '4A4A4A': '#5C4332', '6B6B6B': '#7A5C47',
  },
  borda: {
    E6E6E3: 'rgba(160,90,40,.16)', EFEFEC: 'rgba(160,90,40,.1)', D5D5D0: 'rgba(160,90,40,.28)', C9C9C4: 'rgba(160,90,40,.36)', D3E7CD: 'rgba(60,140,70,.3)',
    '111111': '#2B170A', FFFFFF: 'rgba(255,255,255,.9)', '6B6B6B': '#8A6B55',
  },
  alternativa(papel, r, g, b) {
    const [L, C, h] = paraOklch(r, g, b);
    if (C > 0.03) return null; // cores com tom próprio (verdes, vermelhos…) ficam como estão
    // cinzentos neutros passam a cinzentos quentes, com a mesma luminosidade
    if (papel === 'fundo') return L > 0.95 ? null : deOklch(L, 0.02, 60);
    return deOklch(L, 0.03, 55);
  },
};

export const TEMAS_GERADOS: Tema[] = [ESCURO, AMBAR];

// ---------------------------------------------------------------- leitor de CSS (simples, serve para o CSS do Tailwind) ----------------------------------------------------------------
interface Decl { prop: string; val: string }
type Nodo =
  | { tipo: 'regra'; sel: string; decls: Decl[] }
  | { tipo: 'at'; nome: string; params: string; filhos: Nodo[] };

const COM_FILHOS = new Set(['layer', 'media', 'supports', 'container', 'scope']);

/** Avança até ao fim da expressão (respeitando aspas e parênteses); devolve a posição do caráter de paragem. */
function ate(css: string, de: number, paragens: string): number {
  let prof = 0;
  let aspas = '';
  for (let i = de; i < css.length; i++) {
    const c = css[i];
    if (aspas) { if (c === '\\') i++; else if (c === aspas) aspas = ''; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { aspas = c; continue; }
    if (c === '(') prof++;
    else if (c === ')') prof = Math.max(0, prof - 1);
    else if (prof === 0 && paragens.includes(c)) return i;
  }
  return css.length;
}

function saltarComentarios(css: string, i: number): number {
  for (;;) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (css.startsWith('/*', i)) { const f = css.indexOf('*/', i + 2); i = f < 0 ? css.length : f + 2; } else return i;
  }
}

/** Fecha o bloco que abriu em `i` (logo a seguir ao '{'): devolve a posição do '}' correspondente. */
function fimDoBloco(css: string, i: number): number {
  let nivel = 1;
  let aspas = '';
  let prof = 0;
  for (; i < css.length; i++) {
    const c = css[i];
    if (aspas) { if (c === '\\') i++; else if (c === aspas) aspas = ''; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '/' && css[i + 1] === '*') { const f = css.indexOf('*/', i + 2); i = f < 0 ? css.length : f + 1; continue; }
    if (c === '"' || c === "'") { aspas = c; continue; }
    if (c === '(') prof++;
    else if (c === ')') prof = Math.max(0, prof - 1);
    else if (prof === 0 && c === '{') nivel++;
    else if (prof === 0 && c === '}') { nivel--; if (nivel === 0) return i; }
  }
  return css.length;
}

function lerDeclaracoes(corpo: string): Decl[] | null {
  if (/[{}]/.test(corpo.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, ''))) return null; // regras aninhadas: não mexemos
  const decls: Decl[] = [];
  let i = 0;
  while (i < corpo.length) {
    const f = ate(corpo, i, ';');
    const parte = corpo.slice(i, f).trim();
    i = f + 1;
    if (!parte) continue;
    const dp = parte.indexOf(':');
    if (dp > 0) decls.push({ prop: parte.slice(0, dp).trim(), val: parte.slice(dp + 1).trim() });
  }
  return decls;
}

export function analisar(css: string): Nodo[] {
  const nos: Nodo[] = [];
  let i = 0;
  while (i < css.length) {
    i = saltarComentarios(css, i);
    if (i >= css.length) break;
    if (css[i] === '}') { i++; continue; }
    const fim = ate(css, i, '{;}');
    const prelude = css.slice(i, fim).trim();
    if (css[fim] === ';' || css[fim] === '}' || fim >= css.length) { i = fim + 1; continue; }
    const abre = fim + 1;
    const fecha = fimDoBloco(css, abre);
    const corpo = css.slice(abre, fecha);
    i = fecha + 1;
    if (prelude.startsWith('@')) {
      const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      if (m && COM_FILHOS.has(m[1])) nos.push({ tipo: 'at', nome: m[1], params: m[2].trim(), filhos: analisar(corpo) });
      continue; // keyframes, font-face, property… ficam de fora
    }
    const decls = lerDeclaracoes(corpo);
    if (decls) nos.push({ tipo: 'regra', sel: prelude, decls });
  }
  return nos;
}

// ---------------------------------------------------------------- geração ----------------------------------------------------------------
const PAPEL_POR_PROPRIEDADE: Array<[RegExp, Papel]> = [
  [/^(background|background-color|--tw-gradient-from|--tw-gradient-to|--tw-gradient-via)$/, 'fundo'],
  [/^(color|fill|stroke|caret-color|accent-color|text-decoration-color|-webkit-text-fill-color|-webkit-text-stroke-color)$/, 'texto'],
  [/^(border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-color)?|outline|outline-color|--tw-ring-color|--tw-inset-ring-color|--tw-shadow-color)$/, 'borda'],
];
const papelDa = (prop: string): Papel | null => { for (const [re, p] of PAPEL_POR_PROPRIEDADE) if (re.test(prop)) return p; return null; };

const REGEX_HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;

function expandir(h: string): { rgb: string; alfa: string } {
  const n = h.toUpperCase();
  if (n.length === 3 || n.length === 4) {
    const t = n.split('').map((x) => x + x).join('');
    return { rgb: t.slice(0, 6), alfa: t.slice(6) };
  }
  return { rgb: n.slice(0, 6), alfa: n.slice(6) };
}

function trocarCor(tema: Tema, papel: Papel, hex: string): string | null {
  const { rgb, alfa } = expandir(hex);
  const tabela = tema[papel];
  let nova: string | null = tabela[rgb] ?? null;
  if (!nova) {
    const r = parseInt(rgb.slice(0, 2), 16), g = parseInt(rgb.slice(2, 4), 16), b = parseInt(rgb.slice(4, 6), 16);
    nova = tema.alternativa(papel, r, g, b);
  }
  if (!nova) return null;
  if (alfa && alfa !== 'FF' && /^#[0-9A-F]{6}$/i.test(nova)) return nova + alfa; // mantém a transparência de quem a pedia
  return nova;
}

function trocarNoValor(tema: Tema, papel: Papel, valor: string): string | null {
  let mudou = false;
  const novo = valor.replace(REGEX_HEX, (h) => {
    const c = trocarCor(tema, papel, h.slice(1));
    if (c === null) return h;
    mudou = true;
    return c;
  });
  return mudou ? novo : null;
}

const E_CLASSE_DE_COR = /\\\[\\#/; // .bg-\[\#F4F4F2\] e variantes: só mexemos nas cores escritas na própria classe

function prefixar(seletor: string, tema: Tema): string | null {
  const partes: string[] = [];
  let ini = 0;
  let prof = 0;
  for (let i = 0; i <= seletor.length; i++) {
    const c = seletor[i];
    if (c === '\\') { i++; continue; }
    if (c === '(' || c === '[') prof++;
    else if (c === ')' || c === ']') prof--;
    else if ((c === ',' && prof === 0) || i === seletor.length) { partes.push(seletor.slice(ini, i).trim()); ini = i + 1; }
  }
  const saida: string[] = [];
  for (const p of partes) {
    if (!p || /^(:root|html|body|\*|::backdrop)/.test(p)) return null;
    saida.push(`html[data-tema="${tema.id}"] ${p}`);
  }
  return saida.join(',');
}

function gerarNodos(nodos: Nodo[], tema: Tema, contexto: string[]): string {
  let saida = '';
  for (const no of nodos) {
    if (no.tipo === 'at') {
      const interior = gerarNodos(no.filhos, tema, no.nome === 'layer' ? contexto : [...contexto, `@${no.nome} ${no.params}`]);
      if (!interior) continue;
      saida += interior;
      continue;
    }
    if (!E_CLASSE_DE_COR.test(no.sel)) continue;
    const mudadas: string[] = [];
    for (const d of no.decls) {
      const papel = papelDa(d.prop);
      if (!papel) continue;
      const v = trocarNoValor(tema, papel, d.val);
      if (v !== null) mudadas.push(`${d.prop}:${v}`);
    }
    if (!mudadas.length) continue;
    const sel = prefixar(no.sel, tema);
    if (!sel) continue;
    let regra = `${sel}{${mudadas.join(';')}}`;
    for (let k = contexto.length - 1; k >= 0; k--) regra = `${contexto[k]}{${regra}}`;
    saida += regra + '\n';
  }
  return saida;
}

/** Devolve o CSS dos temas para juntar ao fim do CSS da app. Vazio se o CSS não tiver classes de cor. */
export function gerarCssDosTemas(css: string): string {
  const nodos = analisar(css);
  let saida = '';
  for (const tema of TEMAS_GERADOS) saida += `/* tema ${tema.id} */\n` + gerarNodos(nodos, tema, []) + (tema.especiais || '');
  return saida;
}

// ---------------------------------------------------------------- plugin do Vite ----------------------------------------------------------------
/**
 * Junta ao CSS final da app as regras dos temas. Corre no fim (generateBundle), quando o Tailwind já gerou
 * todas as classes e o Vite já juntou e minimizou o CSS: é aí que se sabe quais as cores realmente usadas.
 */
export function temasPlugin() {
  return {
    name: 'parou-temas',
    enforce: 'post' as const,
    apply: 'build' as const,
    generateBundle(_opcoes: unknown, bundle: Record<string, any>) {
      for (const [nome, ficheiro] of Object.entries(bundle)) {
        if (!nome.endsWith('.css') || ficheiro?.type !== 'asset') continue;
        const original = typeof ficheiro.source === 'string' ? ficheiro.source : Buffer.from(ficheiro.source).toString('utf8');
        if (!E_CLASSE_DE_COR.test(original) || original.includes('/* tema claro-gerado */')) continue;
        try {
          const extra = gerarCssDosTemas(original);
          if (!extra) continue;
          ficheiro.source = `${original}\n${extra}`;
          console.log(`[temas] ${nome}: +${Math.round(extra.length / 1024)} kB de regras dos temas`);
        } catch (err) {
          console.warn('[temas] Não foi possível gerar o CSS dos temas:', (err as Error)?.message || err);
        }
      }
    },
  };
}
