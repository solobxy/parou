// Temas da PAROU (Escuro, Âmbar e Azul), gerados no build a partir do CSS que o Tailwind já produziu.
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
  id: 'escuro' | 'ambar' | 'porto';
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
    // Desempenho: o sujeito de cada regra (o que está mais à direita) tem de ser uma classe, para o navegador só a testar nos
    // elementos que a têm. Com :is(…) à frente, a regra era testada em todos os elementos a cada recálculo de estilo.
    const PRETOS = ['111111', '1F1F1F', '2B2B2B', '000000'].map((c) => `.bg-\\[\\#${c}\\]`);
    const PEQUENOS = ':is(button,a,span,label,summary,[role="tab"],[role="radio"],[role="switch"],[role="button"])';
    const GRANDES = ':is(div,section,article,li,p,header,aside,nav,footer,main,ul,ol,figure,table,tr,td)';
    const T = 'html[data-tema="escuro"] ';
    const lista = (f: (p: string) => string) => PRETOS.map(f).join(',');
    return `
${lista((p) => `${T}${p}${GRANDES}`)}{background-color:#26262B;border-color:#34343A}
${lista((p) => `${T}${p}${PEQUENOS}`)}{background-color:#F2F2F0}
${lista((p) => `${T}${p}${PEQUENOS}`)},${lista((p) => `${T}${p}${PEQUENOS} .text-\\[\\#FFFFFF\\],${T}${p}${PEQUENOS} .text-white`)}{color:#111111!important}
`;
  })(),
};

// ---------------------------------------------------------------- Âmbar ----------------------------------------------------------------
// Claro e quente, em vidro: fundos translúcidos sobre um degradé laranja, texto castanho-escuro, laranja em força.
const AMBAR: Tema = {
  id: 'ambar',
  // Fundos opacos e quentes: o vidro (translúcido, desfocado) fica só no cabeçalho, na barra de baixo, nas janelas e nos cartões
  // redondos (ver temas.css). Um ecrã inteiro por cima de outro (ex.: detalhe de uma paragem) tem de tapar o que está por baixo.
  fundo: {
    FFFFFF: '#FFFAF4', FAFAF8: '#FFF6EC', F9F9F7: '#FFF6EC', F4F4F2: '#FFF0E1',
    F1F1EE: '#FFEAD7', ECECE8: '#FFE4CC', EFEFEC: '#F8E6D4', E6E6E3: '#F3DCC7',
    D9D9D6: '#ECD0B6', D6D6D2: '#ECD0B6', D4D4D0: '#ECD0B6', C9C9C4: '#DFB995', B5B5B0: '#DFB995',
    '6B6B6B': '#8A6B55', '111111': '#2B170A', '1F1F1F': '#33200F', '2B2B2B': '#4A2C16',
    FDECEA: '#FFE2DC', FDE8E6: '#FFE2DC', FDF2F1: '#FFEAE5', E6F6EC: '#DDF5E5', E7F3E3: '#E3F3DB',
    E8F0FE: '#E2ECFF', FFF1E8: '#FFE5CE', FFF4EC: '#FFE9D4', FFF7ED: '#FFEDDA', FFF4E0: '#FFEBC6', FFF1DC: '#FFEBC6',
  },
  texto: {
    '111111': '#2A170B', '1F1F1F': '#33200F', '2B2B2B': '#3B2616', '4A4A4A': '#5C4332', '6B6B6B': '#7A5C47',
    FF6B1A: '#C24A0A', // laranja em texto pequeno sobre creme precisa de mais corpo (4,7:1); em fundos e botões continua #FF6B1A
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

// ---------------------------------------------------------------- Azul ----------------------------------------------------------------
// Claro, em azul e branco: o laranja da marca passa a azul (#0B46B0, 8,3:1 com branco), os cinzentos ganham um tom frio
// e o que era preto (botões, separadores ativos) passa a azul-marinho. Os avisos (laranja escuro, amarelo, vermelho, verde) ficam como estão.
const AZUL = '#0B46B0';
const PORTO: Tema = {
  id: 'porto',
  fundo: {
    FAFAF8: '#F7FAFE', F9F9F7: '#F7FAFE', F4F4F2: '#EDF2FA', F1F1EE: '#E8EEF8', EFEFEC: '#E4EBF6', ECECE8: '#E1E8F4', E6E6E3: '#DAE3F1',
    D9D9D6: '#CCD8EA', D6D6D2: '#CCD8EA', D4D4D0: '#CCD8EA', C9C9C4: '#B8C8E0', B5B5B0: '#A3B6D3', '6B6B6B': '#4F5C76',
    '111111': '#0A1F4D', '1F1F1F': '#0F2860', '2B2B2B': '#1B3D78', '000000': '#06183A',
    FF6B1A: AZUL, FFF1E8: '#E6EEFA', FFF4EC: '#EAF1FB',
  },
  texto: {
    '111111': '#0B1A36', '1F1F1F': '#101E3C', '2B2B2B': '#1B2B4B', '4A4A4A': '#3C4B68', '6B6B6B': '#4F5C76', D9D9D6: '#A9B7D0',
    FF6B1A: AZUL,
  },
  borda: {
    E6E6E3: '#DAE3F1', EFEFEC: '#E4EBF6', D5D5D0: '#C5D2E6', C9C9C4: '#B8C8E0', '111111': '#0A1F4D', '6B6B6B': '#4F5C76', '000000': '#06183A',
    FF6B1A: AZUL,
  },
  alternativa(papel, r, g, b) {
    const [L, C] = paraOklch(r, g, b);
    if (C > 0.03) return null; // cores com tom próprio (verdes, vermelhos, amarelos…) ficam como estão
    if (L > 0.985) return null; // branco continua branco
    // cinzentos neutros passam a cinzentos frios, com a mesma luminosidade
    return deOklch(L, papel === 'texto' ? 0.02 : 0.014, 255);
  },
};

export const TEMAS_GERADOS: Tema[] = [ESCURO, AMBAR, PORTO];

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

// O Tailwind escreve as cores com transparência (text-[#111111]/75) em oklab(L a b / alfa); lê-se, troca-se e volta em hex com alfa.
const REGEX_OKLAB = /oklab\(\s*([\d.]+)(%?)\s+(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*(?:\/\s*([\d.]+)(%?))?\s*\)/;
const REGEX_COR = new RegExp(`${REGEX_HEX.source}|${REGEX_OKLAB.source}`, 'g');

function trocarNoValor(tema: Tema, papel: Papel, valor: string): string | null {
  let mudou = false;
  const novo = valor.replace(REGEX_COR, (todo: string, ...g: Array<string | undefined>) => {
    if (todo.startsWith('oklab')) {
      const L = parseFloat(g[1] as string) / (g[2] === '%' ? 100 : 1);
      const a = parseFloat(g[3] as string), b = parseFloat(g[4] as string);
      const alfaTxt = g[5];
      const alfa = alfaTxt === undefined ? 1 : parseFloat(alfaTxt) / (g[6] === '%' ? 100 : 1);
      const hex = deOklch(L, Math.hypot(a, b), (Math.atan2(b, a) * 180) / Math.PI).slice(1);
      const c = trocarCor(tema, papel, hex);
      if (c === null) return todo;
      mudou = true;
      if (alfa >= 0.999) return c;
      if (/^#[0-9A-F]{6}$/i.test(c)) return c + Math.round(limitar(alfa, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase();
      const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(c);
      if (rgba) return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${+(parseFloat(rgba[4] ?? '1') * alfa).toFixed(3)})`;
      return c;
    }
    const c = trocarCor(tema, papel, todo.slice(1));
    if (c === null) return todo;
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
