// Desenho das personagens da PAROU. Cada personagem é um "esqueleto" (rig) com pontos de ancoragem:
// onde ficam os olhos, a boca, o chapéu, o tronco, as mãos e os pés. Todas as peças (chapéus, óculos,
// roupa, calçado, objetos) são desenhadas uma só vez, num tamanho de referência, e colocadas e
// redimensionadas pelos pontos da personagem. Assim qualquer peça serve em qualquer personagem.
//
// Estilo comum: formas simples com cantos chanfrados (como a marca), sem contornos pretos, volume por
// uma sombra suave em baixo e um brilho em cima, olhos grandes com brilho. Tudo em SVG, sem imagens
// externas; é usado como <img> (data URI), por isso cada avatar é isolado e leve.
import { AVATAR_PADRAO, CATEGORIAS_AVATAR, ConfigAvatar, avatarOuPadrao } from './avatarCatalogo';

export type VistaAvatar = 'completa' | 'palco' | 'redonda' | 'cabeca' | 'chapeu' | 'cara' | 'corpo' | 'pes' | 'mao';

const INK = '#1B1B1B';
const NOITE = '#1B2433';

// ---------- utilitários ----------
const f = (n: number) => Math.round(n * 100) / 100;

function rgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  const c = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
const escurecer = (h: string, t = 0.24) => mix(h, NOITE, t);
const clarear = (h: string, t = 0.35) => mix(h, '#FFFFFF', t);

interface Pal { c: string; d: string; dd: string; l: string; ll: string }
const paleta = (h: string): Pal => ({ c: h, d: escurecer(h, 0.22), dd: escurecer(h, 0.45), l: clarear(h, 0.3), ll: clarear(h, 0.62) });

const P = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const L = (d: string, w: number, col: string, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const C = (cx: number, cy: number, r: number, fill: string, extra = '') => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${extra}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${fill}"${extra}/>`;
const G = (t: string, inner: string, extra = '') => `<g transform="${t}"${extra}>${inner}</g>`;
const mover = (x: number, y: number, esc = 1, rot = 0) => `translate(${f(x)} ${f(y)})${rot ? ` rotate(${rot})` : ''}${esc !== 1 ? ` scale(${f(esc)})` : ''}`;
const op = (n: number) => ` fill-opacity="${n}"`;
const so = (n: number) => ` stroke-opacity="${n}"`;

/** Polígono com cantos arredondados (usado na estrela). */
function poligono(pts: Array<[number, number]>, raio: (i: number) => number): string {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(raio(i), la / 2, lc / 2);
    const p1 = [b[0] + ((a[0] - b[0]) / la) * r, b[1] + ((a[1] - b[1]) / la) * r];
    const p2 = [b[0] + ((c[0] - b[0]) / lc) * r, b[1] + ((c[1] - b[1]) / lc) * r];
    d += `${i === 0 ? 'M' : 'L'} ${f(p1[0])},${f(p1[1])} Q ${f(b[0])},${f(b[1])} ${f(p2[0])},${f(p2[1])} `;
  }
  return d + 'Z';
}
function estrelaD(cx: number, cy: number, R1: number, r1: number, raioPonta: number, raioVale: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? R1 : r1;
    pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
  }
  return poligono(pts, (i) => (i % 2 === 0 ? raioPonta : raioVale));
}

/** Identificadores únicos dentro de cada desenho (cada avatar é um SVG isolado). */
class Ctx {
  n = 0;
  defs = '';
  id(p = 'k') { return `${p}${++this.n}`; }
  clip(d: string): string {
    const i = this.id('c');
    this.defs += `<clipPath id="${i}"><path d="${d}"/></clipPath>`;
    return i;
  }
}

/** Forma com volume: sombra suave em baixo à direita (a forma clara fica deslocada) e brilho opcional. */
function vol(k: Ctx, d: string, p: Pal, realce?: string, dx = -3, dy = -6): string {
  const c = k.clip(d);
  return P(d, p.d) +
    `<g clip-path="url(#${c})">${P(d, p.c, ` transform="translate(${dx} ${dy})"`)}</g>` +
    (realce ? L(realce, 6, '#FFFFFF', so(0.42)) : '');
}

// ---------- esqueletos das personagens ----------
interface Ponto { x: number; y: number }
interface Rig {
  /** atrás de tudo (cauda, braços de cato, ...) */
  tras?: (k: Ctx, p: Pal) => string;
  /** corpo (tronco); a roupa é desenhada por cima */
  tronco: (k: Ctx, p: Pal) => string;
  /** cabeça e tudo o que faz parte do rosto (por cima da roupa) */
  cabeca: (k: Ctx, p: Pal) => string;
  cabecaD: string; // contorno da cabeça (a barba segue-o)
  queixo: number; // y do fundo do queixo (onde acaba a barba)
  torso: { d: string; y0: number; y1: number; nx: number; ny: number; nw: number };
  olhos: { x: number; y: number; sep: number; r: number };
  boca: { x: number; y: number; w: number };
  chapeu: { x: number; y: number; esc: number };
  /** orelhas dos auscultadores (relativas à âncora do chapéu, na escala de referência) */
  bracos?: Array<[number, number, number, number, number, number]>; // sx,sy, cx,cy, hx,hy (esquerdo, direito)
  maos: [Ponto, Ponto]; // esquerda, direita
  semMaos?: boolean;
  pernas?: Array<[number, number, number, number]>;
  pernaCor?: string;
  pes: [Ponto, Ponto];
  escPe?: number;
  sombra: { x: number; y: number; rx: number };
  redonda: { cx: number; cy: number; r: number; topo: number };
  vistaCorpo: [number, number, number]; // cx, cy, largura
  tinta?: string; // cor da boca e sobrancelhas
  pele?: string; // cor atrás dos olhos (para as pálpebras)
  semBochechas?: boolean;
  braco?: number; // espessura dos braços
}

const BRACOS_PARO: Rig['bracos'] = [[68, 160, 44, 168, 44, 194], [132, 160, 156, 168, 156, 194]];
const MAOS_PARO: Rig['maos'] = [{ x: 44, y: 198 }, { x: 156, y: 198 }];
const PERNAS: Rig['pernas'] = [[84, 204, 84, 232], [116, 204, 116, 232]];
const PES: Rig['pes'] = [{ x: 84, y: 240 }, { x: 116, y: 240 }];

const TORSO_PARO = 'M 72,142 H 128 Q 136,142 136,150 V 196 Q 136,208 124,208 H 76 Q 64,208 64,196 V 150 Q 64,142 72,142 Z';

const RIGS: Record<string, Rig> = {
  // ---- Paro: a mascote, cabeça quadrada de cantos chanfrados ----
  paro: (() => {
    const cabecaD = 'M 70,22 H 130 L 164,56 V 112 Q 164,150 126,150 H 74 Q 36,150 36,112 V 58 Q 36,22 70,22 Z';
    return {
      tronco: (k, p) => vol(k, TORSO_PARO, p),
      cabeca: (k, p) =>
        R(28, 86, 14, 28, 6, p.dd) + R(158, 86, 14, 28, 6, p.dd) +
        vol(k, cabecaD, p, 'M 48,62 Q 50,42 68,33') + P('M 106,28 L 124,28 L 150,54 L 150,62 Z', '#FFFFFF', op(0.1)),
      cabecaD, queixo: 150,
      torso: { d: TORSO_PARO, y0: 146, y1: 208, nx: 100, ny: 150, nw: 64 },
      olhos: { x: 100, y: 92, sep: 27, r: 17 },
      boca: { x: 100, y: 124, w: 15 },
      chapeu: { x: 100, y: 30, esc: 1.3 },
      bracos: BRACOS_PARO, maos: MAOS_PARO, pernas: PERNAS, pes: PES,
      sombra: { x: 100, y: 244, rx: 56 },
      redonda: { cx: 100, cy: 86, r: 72, topo: 22 },
      vistaCorpo: [100, 176, 140],
    };
  })(),

  // ---- Estrela: estrela roundinha, as pontas são os braços e as pernas ----
  estrela: (() => {
    const d = estrelaD(100, 138, 100, 58, 9, 14);
    return {
      tronco: (k, p) =>
        vol(k, d, p, 'M 50,100 Q 66,72 90,58') +
        P('M 100,48 L 84,86 Q 100,78 116,86 Z', '#FFFFFF', op(0.14)),
      cabeca: () => '',
      cabecaD: d, queixo: 180,
      torso: { d, y0: 168, y1: 232, nx: 100, ny: 166, nw: 66 },
      olhos: { x: 100, y: 128, sep: 22, r: 15 },
      boca: { x: 100, y: 154, w: 13 },
      chapeu: { x: 100, y: 84, esc: 0.84 },
      maos: [{ x: 22, y: 112 }, { x: 178, y: 112 }], semMaos: true,
      pes: [{ x: 48, y: 224 }, { x: 152, y: 224 }], escPe: 0.9,
      sombra: { x: 100, y: 243, rx: 46 },
      redonda: { cx: 100, cy: 130, r: 88, topo: 38 },
      vistaCorpo: [100, 172, 176],
    };
  })(),

  // ---- Gato: orelhas, focinho e bigodes ----
  gato: (() => {
    const cabecaD = 'M 38,78 L 38,22 Q 38,14 46,18 L 86,46 Q 100,42 114,46 L 154,18 Q 162,14 162,22 L 162,78 Q 172,98 162,118 Q 148,150 100,150 Q 52,150 38,118 Q 28,98 38,78 Z';
    const torso = 'M 76,144 H 124 Q 132,144 132,152 V 196 Q 132,208 120,208 H 80 Q 68,208 68,196 V 152 Q 68,144 76,144 Z';
    return {
      tras: (_k, p) => L('M 124,198 Q 174,204 172,166 Q 171,144 184,134', 15, p.d) + L('M 172,166 Q 171,144 184,134', 15, p.dd),
      tronco: (k, p) => vol(k, torso, p) + E(100, 184, 15, 18, p.ll, op(0.7)),
      cabeca: (k, p) =>
        vol(k, cabecaD, p, 'M 48,70 Q 46,50 54,36') +
        P('M 46,30 L 74,46 L 46,60 Z', '#F6A6BC') + P('M 154,30 L 126,46 L 154,60 Z', '#F6A6BC') +
        L('M 90,58 V 68 M 100,55 V 67 M 110,58 V 68', 3.4, p.dd, so(0.4)) +
        E(100, 128, 30, 19, p.ll, op(0.75)) +
        P('M 93,112 H 107 L 100,120 Z', '#F2708F') +
        L('M 66,122 L 30,114 M 66,130 L 32,134 M 134,122 L 170,114 M 134,130 L 168,134', 3, p.dd, so(0.75)),
      cabecaD, queixo: 150,
      torso: { d: torso, y0: 146, y1: 208, nx: 100, ny: 150, nw: 54 },
      olhos: { x: 100, y: 94, sep: 29, r: 17 },
      boca: { x: 100, y: 128, w: 12 },
      chapeu: { x: 100, y: 50, esc: 0.86 },
      bracos: [[72, 162, 50, 170, 50, 194], [128, 162, 150, 170, 150, 194]], maos: [{ x: 50, y: 198 }, { x: 150, y: 198 }],
      pernas: PERNAS, pes: PES,
      sombra: { x: 100, y: 244, rx: 56 },
      redonda: { cx: 100, cy: 84, r: 84, topo: 16 },
      vistaCorpo: [100, 176, 140],
    };
  })(),

  // ---- Cato: cato sorridente com flor ----
  cato: (() => {
    const tronco = 'M 62,80 Q 62,34 100,34 Q 138,34 138,80 V 188 Q 138,206 120,206 H 80 Q 62,206 62,188 Z';
    return {
      tras: (_k, p) =>
        L('M 72,154 H 48 Q 34,154 34,140 V 106', 26, p.c) + L('M 128,130 H 152 Q 166,130 166,116 V 84', 26, p.c) +
        L('M 34,138 V 108 M 166,114 V 88', 3.2, p.dd, so(0.4)) +
        // flor
        [0, 72, 144, 216, 288].map((a) => C(166 + 9 * Math.cos(((a - 90) * Math.PI) / 180), 76 + 9 * Math.sin(((a - 90) * Math.PI) / 180), 7.5, '#F27AA6')).join('') +
        C(166, 76, 6, '#FFD23F'),
      tronco: (k, p) =>
        vol(k, tronco, p, 'M 72,70 Q 72,46 90,42') +
        L('M 80,64 V 196 M 120,64 V 196', 3.4, p.dd, so(0.35)) +
        L('M 91,50 l 3,-4 M 109,52 l -3,-4 M 76,100 l -4,-3 M 124,98 l 4,-3 M 78,150 l -4,-3 M 122,146 l 4,-3 M 90,182 l -4,-3 M 112,186 l 4,-3', 2.6, '#FFFFFF', so(0.8)),
      cabeca: () => '',
      cabecaD: tronco, queixo: 152,
      torso: { d: tronco, y0: 152, y1: 206, nx: 100, ny: 148, nw: 74 },
      olhos: { x: 100, y: 92, sep: 21, r: 15 },
      boca: { x: 100, y: 122, w: 12 },
      chapeu: { x: 100, y: 42, esc: 0.9 },
      maos: [{ x: 34, y: 110 }, { x: 166, y: 88 }], semMaos: true,
      pernas: PERNAS, pes: PES,
      sombra: { x: 100, y: 244, rx: 52 },
      redonda: { cx: 100, cy: 96, r: 64, topo: 34 },
      vistaCorpo: [100, 168, 150],
    };
  })(),

  // ---- Camaleão: olhos em torre, cauda enrolada ----
  camaleao: (() => {
    const blob = 'M 38,106 Q 36,64 100,62 Q 164,64 162,106 Q 160,152 100,154 Q 40,152 38,106 Z';
    const torso = 'M 70,146 H 130 Q 140,146 140,158 V 192 Q 140,208 124,208 H 76 Q 60,208 60,192 V 158 Q 60,146 70,146 Z';
    return {
      tras: (_k, p) => L('M 128,198 Q 176,208 178,174 Q 180,148 158,152 Q 142,156 150,172 Q 154,180 164,175', 15, p.d),
      tronco: (k, p) => vol(k, torso, p) + E(100, 182, 21, 22, p.ll, op(0.8)),
      cabeca: (k, p) =>
        C(62, 72, 28, p.d) + C(138, 72, 28, p.d) + C(60, 70, 27.5, p.c) + C(136, 70, 27.5, p.c) +
        vol(k, blob, p, 'M 48,100 Q 50,84 62,78') +
        C(54, 132, 4, p.dd, op(0.28)) + C(146, 132, 4, p.dd, op(0.28)) + C(70, 142, 3, p.dd, op(0.28)) + C(130, 142, 3, p.dd, op(0.28)) +
        C(95, 106, 1.8, p.dd, op(0.55)) + C(105, 106, 1.8, p.dd, op(0.55)),
      cabecaD: blob, queixo: 154,
      torso: { d: torso, y0: 148, y1: 208, nx: 100, ny: 150, nw: 62 },
      olhos: { x: 100, y: 70, sep: 38, r: 19 },
      boca: { x: 100, y: 124, w: 20 },
      chapeu: { x: 100, y: 50, esc: 0.72 },
      bracos: [[66, 162, 44, 170, 44, 194], [134, 162, 156, 170, 156, 194]], maos: MAOS_PARO, pernas: PERNAS, pes: PES,
      sombra: { x: 100, y: 244, rx: 56 },
      redonda: { cx: 100, cy: 100, r: 72, topo: 44 },
      vistaCorpo: [100, 176, 140],
    };
  })(),

  // ---- Autocarro: o para-brisas é a cara ----
  autocarro: (() => {
    const corpo = 'M 56,32 H 144 L 168,56 V 196 Q 168,210 154,210 H 46 Q 32,210 32,196 V 56 Q 32,32 56,32 Z';
    const vidro = 'M 46,52 H 154 Q 158,52 158,56 V 136 Q 158,142 152,142 H 48 Q 42,142 42,136 V 56 Q 42,52 46,52 Z';
    return {
      tronco: (k, p) => vol(k, corpo, p, 'M 40,70 Q 40,48 56,40'),
      cabeca: (k, p) => {
        const cv = k.clip(vidro);
        return P(vidro, '#243149') +
          `<g clip-path="url(#${cv})">` + P('M 118,50 L 150,50 L 100,146 L 68,146 Z', '#FFFFFF', op(0.07)) + P('M 148,50 L 162,50 L 112,146 L 100,146 Z', '#FFFFFF', op(0.05)) + '</g>' +
          R(70, 36, 60, 12, 4, '#243149') + L('M 80,42 H 92 M 98,42 H 106 M 112,42 H 120', 3.4, '#FFB020') +
          C(56, 178, 13, '#FFF3B0') + C(56, 178, 8, '#FFFFFF') + C(144, 178, 13, '#FFF3B0') + C(144, 178, 8, '#FFFFFF') +
          L('M 76,166 H 124 M 76,176 H 124 M 76,186 H 124', 3.4, p.dd, so(0.55)) +
          R(38, 198, 124, 8, 4, p.dd, op(0.8));
      },
      cabecaD: vidro, queixo: 142,
      torso: { d: corpo, y0: 148, y1: 210, nx: 100, ny: 146, nw: 112 },
      olhos: { x: 100, y: 84, sep: 29, r: 17 },
      boca: { x: 100, y: 118, w: 14 },
      chapeu: { x: 100, y: 34, esc: 1.15 },
      bracos: [[36, 160, 20, 170, 20, 196], [164, 160, 180, 170, 180, 196]], maos: [{ x: 20, y: 200 }, { x: 180, y: 200 }],
      pernas: [[76, 206, 76, 232], [124, 206, 124, 232]], pes: [{ x: 76, y: 240 }, { x: 124, y: 240 }],
      sombra: { x: 100, y: 244, rx: 70 },
      redonda: { cx: 100, cy: 94, r: 76, topo: 32 },
      vistaCorpo: [100, 176, 160],
      tinta: '#FFFFFF', pele: '#243149', semBochechas: true,
    };
  })(),

  // ---- Paragem: placa de paragem num poste ----
  paragem: (() => {
    const placa = 'M 48,24 H 142 L 174,56 V 114 Q 174,136 152,136 H 48 Q 26,136 26,114 V 46 Q 26,24 48,24 Z';
    const plaqueta = 'M 70,148 H 130 Q 138,148 138,156 V 200 Q 138,208 130,208 H 70 Q 62,208 62,200 V 156 Q 62,148 70,148 Z';
    return {
      tronco: (k, p) =>
        R(88, 130, 24, 24, 0, '#4B5470') +
        vol(k, plaqueta, { ...p, c: '#EEF0F5', d: '#C9CDD9' }) +
        R(72, 154, 14, 8, 2, '#FF6B1A') + L('M 92,158 H 124 M 72,172 H 124 M 72,182 H 124 M 72,192 H 112', 3, '#AEB3C4'),
      cabeca: (k, p) =>
        vol(k, placa, p, 'M 36,60 Q 36,40 52,32') +
        G('translate(12 9.6) scale(0.88)', `<path d="${placa}" fill="none" stroke="#FFFFFF" stroke-width="4.6" stroke-linejoin="round"${so(0.9)}/>`) +
        C(44, 126, 3, '#FFFFFF', op(0.8)) + C(156, 126, 3, '#FFFFFF', op(0.8)),
      cabecaD: placa, queixo: 136,
      torso: { d: plaqueta, y0: 150, y1: 208, nx: 100, ny: 150, nw: 50 },
      olhos: { x: 100, y: 80, sep: 31, r: 18 },
      boca: { x: 100, y: 108, w: 16 },
      chapeu: { x: 100, y: 26, esc: 1.4 },
      bracos: BRACOS_PARO, maos: MAOS_PARO, pernas: PERNAS, pernaCor: '#4B5470', pes: PES,
      sombra: { x: 100, y: 244, rx: 56 },
      redonda: { cx: 100, cy: 82, r: 84, topo: 24 },
      vistaCorpo: [100, 176, 140],
    };
  })(),
};

const corDaPersonagem = (id: string) => RIGS[id] || RIGS.paro;

// ---------- olhos e expressões ----------
const GRAD_PUPILA = '<radialGradient id="gp" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#5B4636"/><stop offset=".55" stop-color="#2B1D17"/><stop offset="1" stop-color="#0F0A08"/></radialGradient>';

function olhoAberto(cx: number, cy: number, r: number, pr = 0.6, dx = 0, dy = 0.06): string {
  const rp = pr * r, px = cx + dx * r, py = cy + dy * r;
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(r * 1.1)}" fill="#FFFFFF" stroke="${NOITE}" stroke-opacity=".22" stroke-width="1.6"/>` +
    C(px, py, rp, 'url(#gp)') + C(px, py, rp * 0.36, '#000000', op(0.55)) +
    C(px + rp * 0.4, py - rp * 0.42, rp * 0.36, '#FFFFFF') + C(px - rp * 0.42, py + rp * 0.44, rp * 0.16, '#FFFFFF', op(0.85));
}
const coracao = (cx: number, cy: number, s: number, fill: string, rot = 0) =>
  `<path transform="${mover(cx, cy, s, rot)}" d="M 0,0.95 C -1.25,0 -1,-0.95 0,-0.5 C 1,-0.95 1.25,0 0,0.95 Z" fill="${fill}"/>`;

/** Boca aberta (sorriso grande) com dentes em cima e língua. */
function bocaAberta(k: Ctx, x: number, y: number, w: number, borda?: string, lingua = true): string {
  const d = `M ${f(x - w)},${f(y)} Q ${f(x)},${f(y + w * 0.25)} ${f(x + w)},${f(y)} Q ${f(x + w * 0.88)},${f(y + w * 1.08)} ${f(x)},${f(y + w * 1.08)} Q ${f(x - w * 0.88)},${f(y + w * 1.08)} ${f(x - w)},${f(y)} Z`;
  const c = k.clip(d);
  return P(d, '#2A1512') +
    `<g clip-path="url(#${c})">${R(x - w, y, 2 * w, w * 0.34, 0, '#FFFFFF')}${lingua ? E(x, y + w * 1.12, w * 0.58, w * 0.42, '#FF7A8A') : ''}</g>` +
    (borda ? `<path d="${d}" fill="none" stroke="${borda}" stroke-width="3" stroke-linejoin="round"/>` : '');
}

function rosto(k: Ctx, rig: Rig, p: Pal, exp: string, barba: boolean): string {
  const { x, y, sep, r } = rig.olhos;
  const b = rig.boca;
  const tinta = rig.tinta || INK;
  const tb = barba ? '#F3E3C0' : tinta;
  const pele = rig.pele || p.c;
  const ex0 = x - sep, ex1 = x + sep;
  const borda = rig.tinta ? tinta : undefined;
  let s = '';
  if (!rig.semBochechas && exp !== 'zangado') {
    const a = exp === 'apaixonado' ? 0.5 : 0.3;
    s += E(ex0 - r * 0.35, y + r * 1.55, r * 0.62, r * 0.36, '#FF3D6E', op(a)) + E(ex1 + r * 0.35, y + r * 1.55, r * 0.62, r * 0.36, '#FF3D6E', op(a));
  }
  const sorriso = () => bocaAberta(k, b.x, b.y, b.w, borda);
  switch (exp) {
    case 'cool': {
      for (const cx of [ex0, ex1]) {
        s += olhoAberto(cx, y, r, 0.62, 0, 0.3);
        s += P(`M ${f(cx - r * 1.2)},${f(y - r * 1.4)} H ${f(cx + r * 1.2)} V ${f(y - r * 0.08)} Q ${f(cx)},${f(y + r * 0.1)} ${f(cx - r * 1.2)},${f(y - r * 0.08)} Z`, pele);
        s += L(`M ${f(cx - r * 1.02)},${f(y - r * 0.06)} Q ${f(cx)},${f(y + r * 0.12)} ${f(cx + r * 1.02)},${f(y - r * 0.06)}`, 3.4, rig.tinta ? tinta : p.dd);
      }
      s += L(`M ${f(b.x - b.w * 0.8)},${f(b.y + 2)} Q ${f(b.x)},${f(b.y + b.w * 0.55)} ${f(b.x + b.w * 0.95)},${f(b.y - b.w * 0.3)}`, 5, tb);
      break;
    }
    case 'surpreso': {
      for (const cx of [ex0, ex1]) {
        s += olhoAberto(cx, y, r * 1.1, 0.36, 0, 0);
        s += L(`M ${f(cx - r * 0.8)},${f(y - r * 1.65)} Q ${f(cx)},${f(y - r * 2.05)} ${f(cx + r * 0.8)},${f(y - r * 1.65)}`, 3.6, tinta);
      }
      s += E(b.x, b.y + b.w * 0.45, b.w * 0.36, b.w * 0.5, '#2A1512') + (borda ? `<ellipse cx="${f(b.x)}" cy="${f(b.y + b.w * 0.45)}" rx="${f(b.w * 0.36)}" ry="${f(b.w * 0.5)}" fill="none" stroke="${borda}" stroke-width="3"/>` : '');
      break;
    }
    case 'piscadela': {
      s += olhoAberto(ex0, y, r);
      s += L(`M ${f(ex1 - r)},${f(y + r * 0.2)} Q ${f(ex1)},${f(y - r * 0.95)} ${f(ex1 + r)},${f(y + r * 0.2)}`, 5, tinta);
      s += bocaAberta(k, b.x, b.y, b.w, borda, true);
      break;
    }
    case 'sono': {
      for (const cx of [ex0, ex1]) s += L(`M ${f(cx - r)},${f(y - r * 0.1)} Q ${f(cx)},${f(y + r * 0.95)} ${f(cx + r)},${f(y - r * 0.1)}`, 5, tinta);
      s += E(b.x, b.y + b.w * 0.3, b.w * 0.26, b.w * 0.3, '#2A1512');
      const zx = ex1 + r * 1.5, zy = y - r * 1.5;
      s += L(`M ${f(zx)},${f(zy)} h 9 l -9 10 h 9`, 3.2, tinta) + L(`M ${f(zx + 12)},${f(zy - 12)} h 6 l -6 7 h 6`, 2.6, tinta, so(0.8));
      break;
    }
    case 'zangado': {
      for (const [cx, lado] of [[ex0, 1], [ex1, -1]] as Array<[number, number]>) {
        s += olhoAberto(cx, y + r * 0.1, r, 0.5, -0.05 * lado, 0.1);
        // pálpebra inclinada (mais baixa perto do nariz)
        const xa = cx - lado * r * 1.25, xb = cx + lado * r * 1.25;
        s += P(`M ${f(xa)},${f(y - r * 1.5)} L ${f(xb)},${f(y - r * 1.5)} L ${f(xb)},${f(y + r * 0.05)} L ${f(xa)},${f(y - r * 0.85)} Z`, pele);
        s += L(`M ${f(xa)},${f(y - r * 0.85)} L ${f(xb)},${f(y + r * 0.05)}`, 5.2, rig.tinta ? tinta : p.dd);
      }
      s += L(`M ${f(b.x - b.w * 0.75)},${f(b.y + b.w * 0.45)} Q ${f(b.x)},${f(b.y - b.w * 0.3)} ${f(b.x + b.w * 0.75)},${f(b.y + b.w * 0.45)}`, 5, tb);
      break;
    }
    case 'apaixonado': {
      for (const cx of [ex0, ex1]) {
        s += `<ellipse cx="${f(cx)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 1.1)}" fill="#FFFFFF" stroke="${NOITE}" stroke-opacity=".22" stroke-width="1.6"/>` +
          coracao(cx, y, r * 0.78, '#FF3D6E') + C(cx + r * 0.22, y - r * 0.3, r * 0.14, '#FFFFFF');
      }
      s += bocaAberta(k, b.x, b.y, b.w, borda, false);
      s += coracao(ex1 + r * 1.6, y - r * 1.5, 7, '#FF3D6E', 14) + coracao(ex1 + r * 2.3, y - r * 2.4, 4.5, '#FF8FB0', -10);
      break;
    }
    default: { // feliz
      s += olhoAberto(ex0, y, r) + olhoAberto(ex1, y, r);
      s += sorriso();
    }
  }
  return s;
}

// ---------- peças da cara ----------
function pecaCara(k: Ctx, rig: Rig, p: Pal, id: string): { antes: string; depois: string } {
  const { x, y, sep, r } = rig.olhos;
  const b = rig.boca;
  const ex0 = x - sep, ex1 = x + sep;
  switch (id) {
    case 'oculos': {
      const rr = r + 6;
      return {
        antes: '',
        depois:
          L(`M ${f(ex0 - rr)},${f(y - 2)} L ${f(ex0 - rr - 9)},${f(y - 6)} M ${f(ex1 + rr)},${f(y - 2)} L ${f(ex1 + rr + 9)},${f(y - 6)}`, 4, INK) +
          L(`M ${f(ex0 + rr)},${f(y - 3)} Q ${f(x)},${f(y - 11)} ${f(ex1 - rr)},${f(y - 3)}`, 4, INK) +
          `<circle cx="${f(ex0)}" cy="${f(y)}" r="${f(rr)}" fill="#FFFFFF" fill-opacity=".22" stroke="${INK}" stroke-width="4.2"/>` +
          `<circle cx="${f(ex1)}" cy="${f(y)}" r="${f(rr)}" fill="#FFFFFF" fill-opacity=".22" stroke="${INK}" stroke-width="4.2"/>` +
          L(`M ${f(ex0 - rr * 0.5)},${f(y - rr * 0.55)} Q ${f(ex0 - rr * 0.2)},${f(y - rr * 0.8)} ${f(ex0 + rr * 0.2)},${f(y - rr * 0.8)}`, 2.6, '#FFFFFF', so(0.7)),
      };
    }
    case 'sol': {
      const rr = r + 6;
      const lente = (cx: number) => P(`M ${f(cx - rr)},${f(y - r * 0.95)} H ${f(cx + rr)} V ${f(y + r * 0.45)} Q ${f(cx + rr)},${f(y + r * 1.4)} ${f(cx)},${f(y + r * 1.4)} Q ${f(cx - rr)},${f(y + r * 1.4)} ${f(cx - rr)},${f(y + r * 0.45)} Z`, INK) +
        L(`M ${f(cx - rr * 0.55)},${f(y - r * 0.4)} L ${f(cx - rr * 0.1)},${f(y - r * 0.4)}`, 3.4, '#FFFFFF', so(0.5));
      return {
        antes: '',
        depois: L(`M ${f(ex0 - rr)},${f(y - r * 0.7)} L ${f(ex0 - rr - 10)},${f(y - r * 0.9)} M ${f(ex1 + rr)},${f(y - r * 0.7)} L ${f(ex1 + rr + 10)},${f(y - r * 0.9)}`, 4, INK) +
          R(x - 6, y - r * 0.8, 12, 5, 2, INK) + lente(ex0) + lente(ex1),
      };
    }
    case 'sardas': {
      let s = '';
      for (const [dx, dy] of [[-0.7, 1.2], [0, 1.45], [0.7, 1.15], [-0.35, 1.8], [0.45, 1.75]]) {
        s += C(ex0 + dx * r, y + dy * r, r * 0.11, '#7A3410', op(0.6)) + C(ex1 - dx * r, y + dy * r, r * 0.11, '#7A3410', op(0.6));
      }
      return { antes: '', depois: s };
    }
    case 'bigode': {
      const s = b.w * 0.82;
      const my = b.y - b.w * 0.42;
      return {
        antes: '',
        depois: P(`M ${f(x)},${f(my - s * 0.2)} Q ${f(x - s * 0.55)},${f(my - s * 0.8)} ${f(x - s * 1.5)},${f(my - s * 0.1)} Q ${f(x - s * 1.3)},${f(my + s * 0.75)} ${f(x - s * 0.55)},${f(my + s * 0.4)} Q ${f(x - s * 0.2)},${f(my + s * 0.3)} ${f(x)},${f(my + s * 0.35)} Q ${f(x + s * 0.2)},${f(my + s * 0.3)} ${f(x + s * 0.55)},${f(my + s * 0.4)} Q ${f(x + s * 1.3)},${f(my + s * 0.75)} ${f(x + s * 1.5)},${f(my - s * 0.1)} Q ${f(x + s * 0.55)},${f(my - s * 0.8)} ${f(x)},${f(my - s * 0.2)} Z`, '#4A3326') +
          L(`M ${f(x - s * 1.0)},${f(my - s * 0.15)} Q ${f(x - s * 0.6)},${f(my - s * 0.4)} ${f(x - s * 0.2)},${f(my - s * 0.2)}`, 2.4, '#FFFFFF', so(0.25)),
      };
    }
    case 'barba': {
      const c = k.clip(rig.cabecaD);
      const bt = b.y - b.w * 0.55;
      const lado = sep + r * 1.45;
      return {
        antes: `<g clip-path="url(#${c})">` + P(`M ${f(x - lado - 30)},${f(y - 4)} L ${f(x - lado)},${f(y - 4)} Q ${f(x - lado)},${f(bt + 14)} ${f(x - b.w * 2.1)},${f(bt + 2)} Q ${f(x)},${f(bt - 18)} ${f(x + b.w * 2.1)},${f(bt + 2)} Q ${f(x + lado)},${f(bt + 14)} ${f(x + lado)},${f(y - 4)} L ${f(x + lado + 30)},${f(y - 4)} V ${f(rig.queixo - 18)} Q ${f(x)},${f(rig.queixo + 22)} ${f(x - lado - 30)},${f(rig.queixo - 18)} Z`, '#4A3326') +
          L(`M ${f(x - b.w * 2.4)},${f(bt + 20)} Q ${f(x - b.w * 2.7)},${f(bt + 44)} ${f(x - b.w * 1.7)},${f(bt + 62)}`, 4, '#FFFFFF', so(0.16)) + '</g>',
        depois: '',
      };
    }
    case 'monoculo': {
      const rr = r + 5;
      return {
        antes: '',
        depois: `<circle cx="${f(ex1)}" cy="${f(y)}" r="${f(rr)}" fill="#FFFFFF" fill-opacity=".18" stroke="#F5B800" stroke-width="4"/>` +
          L(`M ${f(ex1 + rr * 0.7)},${f(y + rr * 0.75)} Q ${f(ex1 + rr * 1.5)},${f(y + rr * 2.2)} ${f(ex1 + rr * 0.3)},${f(y + rr * 3.3)}`, 2.2, '#F5B800') +
          L(`M ${f(ex1 - rr * 0.5)},${f(y - rr * 0.6)} Q ${f(ex1 - rr * 0.2)},${f(y - rr * 0.85)} ${f(ex1 + rr * 0.2)},${f(y - rr * 0.85)}`, 2.6, '#FFFFFF', so(0.7)),
      };
    }
    default:
      return { antes: '', depois: '' };
  }
}

// ---------- chapéus (desenhados com a base em y=0, centrados em x=0, cabeça de 100 de largura) ----------
interface Chapeu { alt: number; d: (k: Ctx) => string }
const sombraD = (cor: string) => escurecer(cor, 0.25);
const brilho = (d: string, w = 4.5) => L(d, w, '#FFFFFF', so(0.42));

const CHAPEUS: Record<string, Chapeu> = {
  boné: {
    alt: 50, d: () => {
      const b = '#3F7BE8', bd = sombraD(b);
      return P('M -48,-2 Q 0,-14 48,-2 Q 54,16 0,20 Q -54,16 -48,-2 Z', bd) +
        P('M -44,2 Q -46,-46 0,-48 Q 46,-46 44,2 Z', b) + P('M 12,-47 Q 46,-44 44,2 H 6 Q 24,-18 12,-47 Z', bd, op(0.5)) +
        L('M 0,-47 V 0', 2.6, bd) + C(0, -48, 4.2, bd) + C(0, -22, 9, '#FF6B1A') + C(0, -22, 3.4, '#FFFFFF') + brilho('M -34,-26 Q -28,-40 -14,-44');
    },
  },
  gorro: {
    alt: 78, d: () => {
      const b = '#E5484D', bd = sombraD(b);
      let costelas = '';
      for (let x = -38; x <= 38; x += 12.7) costelas += L(`M ${f(x)},-14 V 4`, 2.4, bd);
      return P('M -44,4 Q -46,-54 0,-56 Q 46,-54 44,4 Z', b) + P('M 14,-55 Q 46,-52 44,4 H 8 Q 26,-20 14,-55 Z', bd, op(0.45)) + brilho('M -32,-30 Q -26,-46 -10,-52') +
        R(-50, -18, 100, 24, 9, bd) + costelas + C(0, -62, 14, '#F7ECEC') + E(4, -57, 10, 8, '#D9C9C9', op(0.55)) + C(-4, -67, 4.5, '#FFFFFF');
    },
  },
  boina: {
    alt: 46, d: () => {
      const b = '#8E2F4A', bd = sombraD(b);
      return P('M -50,2 Q -56,-26 -10,-34 Q 38,-40 54,-12 Q 58,4 32,4 Z', b) + P('M 20,-36 Q 52,-30 54,-12 Q 58,4 32,4 Q 36,-18 20,-36 Z', bd, op(0.5)) +
        P('M -4,-35 L -1,-44 L 6,-43 L 5,-34 Z', bd) + brilho('M -36,-12 Q -30,-24 -12,-28');
    },
  },
  auscultadores: {
    alt: 48, d: () => {
      return L('M -50,12 Q -54,-46 0,-46 Q 54,-46 50,12', 10, '#2A2F3A') + L('M -48,0 Q -50,-40 0,-41', 3.5, '#4B5263', so(0.8)) +
        R(-64, -6, 26, 42, 11, '#2F3545') + R(-60, 4, 10, 26, 5, '#FF6B1A') + R(38, -6, 26, 42, 11, '#2F3545') + R(50, 4, 10, 26, 5, '#FF6B1A') +
        brilho('M -60,0 Q -60,-2 -52,-2', 3);
    },
  },
  festa: {
    alt: 96, d: (k) => {
      const cone = 'M -30,4 L 0,-88 L 30,4 Z';
      const c = k.clip(cone);
      return G('rotate(7)',
        P(cone, '#FF4F9A') +
        `<g clip-path="url(#${c})">${P('M -40,-20 L 40,-52 L 40,-38 L -40,-6 Z', '#FFD23F')}${P('M -40,-58 L 40,-90 L 40,-76 L -40,-44 Z', '#FFD23F')}${P('M 6,-92 L 40,-92 L 40,4 L 6,4 Z', '#000000', op(0.1))}</g>` +
        C(0, -90, 8, '#FFFFFF') + R(-32, 0, 64, 6, 3, '#E8318A'));
    },
  },
  capacete: {
    alt: 52, d: () => {
      const y = '#FFC933', yd = sombraD(y);
      return P('M -44,2 Q -46,-46 0,-48 Q 46,-46 44,2 Z', y) + P('M 14,-47 Q 46,-44 44,2 H 8 Q 24,-18 14,-47 Z', yd, op(0.5)) +
        P('M -9,-47 H 9 V 2 H -9 Z', '#F2B300') + R(-56, -4, 112, 14, 6, y) + R(-56, 4, 112, 6, 3, yd, op(0.5)) + brilho('M -34,-26 Q -28,-40 -14,-44') +
        C(0, -26, 6, '#FFFFFF', op(0.9));
    },
  },
  cowboy: {
    alt: 52, d: () => {
      const b = '#B9803F', bd = '#8F5E27';
      return P('M -78,-4 Q -62,18 0,16 Q 62,18 78,-4 Q 64,-14 44,-6 H -44 Q -64,-14 -78,-4 Z', bd) +
        P('M -38,-2 Q -42,-46 -16,-48 Q 0,-34 16,-48 Q 42,-46 38,-2 Z', b) + P('M 14,-46 Q 42,-44 38,-2 H 8 Q 22,-22 14,-46 Z', bd, op(0.45)) +
        R(-39, -16, 78, 11, 3, '#5E3C1B') + C(0, -10.5, 4, '#F5B800') + brilho('M -30,-28 Q -26,-40 -16,-43', 3.6);
    },
  },
  pescador: {
    alt: 46, d: () => {
      const b = '#D9C79A', bd = '#B6A06B';
      return P('M -68,0 Q 0,-14 68,0 Q 74,16 0,18 Q -74,16 -68,0 Z', bd) +
        P('M -40,0 L -36,-38 Q 0,-48 36,-38 L 40,0 Z', b) + P('M 14,-42 L 36,-38 L 40,0 H 8 Z', bd, op(0.35)) + R(-39, -14, 78, 9, 0, '#8A6A3B') + brilho('M -28,-30 Q -22,-40 -10,-42', 3.6);
    },
  },
  revisor: {
    alt: 52, d: () => {
      const b = '#1F2A44', bd = '#141B2E';
      return P('M -42,2 Q 0,-4 42,2 Q 38,18 0,20 Q -38,18 -42,2 Z', '#111111') +
        P('M -46,2 Q -52,-34 -18,-44 Q 0,-50 18,-44 Q 52,-34 46,2 Z', b) + P('M 16,-45 Q 52,-34 46,2 H 8 Q 26,-20 16,-45 Z', bd, op(0.5)) +
        R(-47, -10, 94, 14, 3, '#F2B300') + C(0, -26, 10, '#FF6B1A') + L('M 0,-31 V -21 M -5,-26 H 5', 2.6, '#FFFFFF') + brilho('M -36,-26 Q -30,-38 -16,-42', 3.6);
    },
  },
  cartola: {
    alt: 80, d: () => {
      const b = '#1B1F2A';
      return E(0, 2, 62, 11, '#10131C') + R(-31, -74, 62, 78, 6, b) + E(0, -74, 31, 7, '#2A3040') + R(-31, -20, 62, 16, 0, '#E5484D') +
        L('M -22,-62 V -28', 4.5, '#FFFFFF', so(0.14)) + P('M 14,-70 H 31 V 4 H 8 Z', '#000000', op(0.2));
    },
  },
  coroa: {
    alt: 58, d: () => {
      const o = '#F5B800', od = '#D99A00';
      return P('M -40,2 L -46,-40 L -22,-22 L 0,-50 L 22,-22 L 46,-40 L 40,2 Z', o) + P('M 14,-30 L 22,-22 L 46,-40 L 40,2 H 10 Z', od, op(0.45)) +
        R(-40, -10, 80, 12, 3, od) + C(-46, -42, 4.5, '#FFE27A') + C(0, -52, 5, '#FFE27A') + C(46, -42, 4.5, '#FFE27A') +
        C(-20, -4, 4, '#E5484D') + C(0, -4, 4.5, '#3F7BE8') + C(20, -4, 4, '#2FB67C') + brilho('M -30,-14 L -37,-34', 3);
    },
  },
};
const ALT_CHAPEU = (id: string) => CHAPEUS[id]?.alt ?? 46;

// ---------- roupa ----------
interface Roupa {
  manga?: string;
  corpo?: (k: Ctx, rig: Rig, p: Pal) => string; // dentro do tronco (recortado)
  frente?: (k: Ctx, rig: Rig, p: Pal) => string; // por cima (pescoço)
  tras?: (k: Ctx, rig: Rig, p: Pal) => string; // atrás da personagem
}
const faixaY = (rig: Rig) => rig.torso.y0;

const ROUPAS: Record<string, Roupa> = {
  riscas: {
    manga: '#F5F0E6',
    corpo: (_k, rig) => {
      let s = R(-20, faixaY(rig), 240, 240, 0, '#F5F0E6');
      for (let y = faixaY(rig) + 4; y < rig.torso.y1 + 10; y += 15) s += R(-20, y, 240, 7.5, 0, '#2F5FC4');
      return s;
    },
  },
  cachecol: {
    frente: (_k, rig) => {
      const { nx, ny, nw } = rig.torso;
      const w = nw * 0.62;
      let s = R(nx - w, ny - 7, 2 * w, 17, 8.5, '#E5484D') + R(nx - w, ny - 7, 2 * w, 7, 3.5, '#FFFFFF', op(0.12));
      for (let i = -3; i <= 3; i++) s += L(`M ${f(nx + i * (w / 3.4))},${f(ny - 4)} v 11`, 3.4, '#FFFFFF', so(0.85));
      s += P(`M ${f(nx + w * 0.25)},${f(ny + 8)} h ${f(w * 0.5)} l 3,34 q 0,4 -4,4 h ${f(-w * 0.5 + 6)} q -4,0 -4,-4 Z`, '#E5484D') +
        L(`M ${f(nx + w * 0.32)},${f(ny + 20)} h ${f(w * 0.42)} M ${f(nx + w * 0.32)},${f(ny + 31)} h ${f(w * 0.44)}`, 3.2, '#FFFFFF', so(0.85)) +
        L(`M ${f(nx + w * 0.36)},${f(ny + 47)} v 5 M ${f(nx + w * 0.5)},${f(ny + 47)} v 6 M ${f(nx + w * 0.64)},${f(ny + 47)} v 5`, 2.8, '#B93036');
      return s;
    },
  },
  laco: {
    frente: (_k, rig) => {
      const { nx, ny, nw } = rig.torso;
      const s = nw * 0.34;
      return P(`M ${f(nx)},${f(ny + 6)} L ${f(nx - s)},${f(ny - 7)} Q ${f(nx - s * 1.15)},${f(ny + 6)} ${f(nx - s)},${f(ny + 19)} Z`, '#E5484D') +
        P(`M ${f(nx)},${f(ny + 6)} L ${f(nx + s)},${f(ny - 7)} Q ${f(nx + s * 1.15)},${f(ny + 6)} ${f(nx + s)},${f(ny + 19)} Z`, '#E5484D') +
        L(`M ${f(nx - s * 0.7)},${f(ny - 1)} L ${f(nx - s * 0.2)},${f(ny + 3)} M ${f(nx + s * 0.7)},${f(ny - 1)} L ${f(nx + s * 0.2)},${f(ny + 3)}`, 2.4, '#B93036') +
        R(nx - 6, ny, 12, 13, 4, '#B93036');
    },
  },
  colete: {
    corpo: (_k, rig, p) => {
      const { nx, y0, y1 } = rig.torso;
      return R(-20, y0 - 6, 240, 240, 0, '#D8F23A') + R(nx - 28, y0 - 6, 12, 240, 0, '#EDEDED') + R(nx + 16, y0 - 6, 12, 240, 0, '#EDEDED') +
        R(-20, y1 - 22, 240, 10, 0, '#EDEDED') + P(`M ${nx - 14},${y0 - 6} L ${nx},${y0 + 16} L ${nx + 14},${y0 - 6} Z`, p.d) + L(`M ${nx},${y0 + 16} V ${y1 + 10}`, 2.4, '#8FA011');
    },
  },
  impermeavel: {
    manga: '#FFD23F',
    corpo: (_k, rig) => {
      const { nx, y0, y1 } = rig.torso;
      let s = R(-20, y0 - 6, 240, 240, 0, '#FFD23F') + L(`M ${nx},${y0 - 4} V ${y1 + 10}`, 2.6, '#C99A00');
      for (const dy of [14, 30, 46]) s += C(nx + 8, y0 + dy, 2.6, '#C99A00');
      s += P(`M ${nx - 24},${y0 - 6} L ${nx},${y0 + 22} L ${nx + 24},${y0 - 6} Z`, '#E8B820');
      return s;
    },
    frente: (_k, rig) => {
      const { nx, ny, nw } = rig.torso;
      const w = nw * 0.56;
      return P(`M ${f(nx - w)},${f(ny - 2)} Q ${f(nx)},${f(ny + 16)} ${f(nx + w)},${f(ny - 2)} L ${f(nx + w * 0.8)},${f(ny - 10)} Q ${f(nx)},${f(ny + 4)} ${f(nx - w * 0.8)},${f(ny - 10)} Z`, '#E8B820');
    },
  },
  casaco: {
    manga: '#1F2A44',
    corpo: (_k, rig) => {
      const { nx, y0, y1 } = rig.torso;
      return R(-20, y0 - 6, 240, 240, 0, '#1F2A44') +
        P(`M ${nx},${y0 + 4} L ${nx - 22},${y0 - 8} L ${nx - 14},${y0 + 32} Z`, '#2D3B5E') + P(`M ${nx},${y0 + 4} L ${nx + 22},${y0 - 8} L ${nx + 14},${y0 + 32} Z`, '#2D3B5E') +
        C(nx, y0 + 38, 4.2, '#F2B300') + C(nx, y0 + 52, 4.2, '#F2B300') + R(-20, y1 - 8, 240, 6, 0, '#F2B300');
    },
  },
  capa: {
    tras: (_k, rig) => {
      const { nx, ny, nw, y1 } = rig.torso;
      const L1 = y1 - ny + 16;
      const w = nw * 0.55;
      return P(`M ${f(nx - w)},${f(ny - 4)} Q ${f(nx - w * 1.7)},${f(ny + L1 * 0.5)} ${f(nx - w * 1.9)},${f(ny + L1)} Q ${f(nx - w * 0.9)},${f(ny + L1 + 10)} ${f(nx)},${f(ny + L1 - 4)} Q ${f(nx + w * 0.9)},${f(ny + L1 + 10)} ${f(nx + w * 1.9)},${f(ny + L1)} Q ${f(nx + w * 1.7)},${f(ny + L1 * 0.5)} ${f(nx + w)},${f(ny - 4)} Z`, '#E5484D') +
        P(`M ${f(nx - w)},${f(ny - 4)} Q ${f(nx - w * 1.7)},${f(ny + L1 * 0.5)} ${f(nx - w * 1.9)},${f(ny + L1)} Q ${f(nx - w * 1.1)},${f(ny + L1 * 0.6)} ${f(nx - w * 0.5)},${f(ny + 4)} Z`, '#B93036', op(0.55));
    },
    frente: (_k, rig) => {
      const { nx, ny, nw } = rig.torso;
      const w = nw * 0.5;
      return R(nx - w, ny - 4, 2 * w, 9, 4, '#B93036') + C(nx - w * 0.82, ny + 1, 5, '#F5B800') + C(nx + w * 0.82, ny + 1, 5, '#F5B800');
    },
  },
};

// ---------- calçado (origem no ponto de apoio, no chão) ----------
function sapato(id: string, p: Pal, esc: number, lado: number): string {
  let g = '';
  switch (id) {
    case 'ténis':
      g = P('M -14,0 V -10 Q -14,-21 -4,-21 H 4 Q 9,-13 18,-11 Q 25,-9 25,0 Z', '#F6F4EC') + P('M 8,-14 Q 14,-12 18,-11 Q 25,-9 25,0 H 9 Z', '#BFBAA9', op(0.5)) +
        P('M -14,0 V -9 Q -14,-14 -9,-16 L -9,0 Z', '#FF6B1A') + L('M -2,-18 l 5,3 M 2,-20 l 5,3', 2, '#A9A596') +
        R(-16, -2, 42, 9, 4.5, '#CFCABB');
      break;
    case 'chinelos':
      g = E(3, -5, 14, 8, p.d) + E(2, 3, 18, 6.5, '#2FB6C9') + L('M -9,0 L 2,-12 L 14,0', 4.6, '#FF6B1A');
      break;
    case 'galochas':
      g = P('M -13,-36 H 11 V -17 Q 25,-15 25,-4 Q 25,2 19,2 H -13 Z', '#FFC933') + P('M 3,-34 H 11 V -17 Q 25,-15 25,-4 Q 25,2 19,2 H 3 Z', '#000000', op(0.1)) +
        R(-14, -38, 26, 7, 3, '#F2B300') + R(-15, 0, 42, 8, 4, '#3A3A3A') + L('M -8,-30 V -12', 3, '#FFFFFF', so(0.55));
      break;
    case 'botas':
      g = P('M -13,-32 H 11 V -15 Q 25,-13 25,-4 Q 25,2 19,2 H -13 Z', '#8A5A2B') + P('M 3,-30 H 11 V -15 Q 25,-13 25,-4 Q 25,2 19,2 H 3 Z', '#000000', op(0.12)) +
        R(-14, -35, 26, 9, 3, '#5E3C1B') + L('M -6,-22 h 10 M -6,-16 h 10', 2.2, '#2C1B0C') + R(-15, 0, 42, 8, 3, '#3A2A1C');
      break;
    case 'patins':
      g = P('M -12,-26 H 10 V -12 Q 22,-10 22,-4 V 2 H -12 Z', '#F1EFE8') + P('M 4,-26 H 10 V -12 Q 22,-10 22,-4 V 2 H 4 Z', '#BFBAA9', op(0.45)) + L('M -12,-14 H 10', 4, '#E5484D') + R(-14, 0, 40, 6, 3, '#2A2F3A') +
        C(-6, 11, 4.8, '#FF6B1A') + C(6, 11, 4.8, '#FF6B1A') + C(18, 11, 4.8, '#FF6B1A') + C(-6, 11, 1.8, '#2A2F3A') + C(6, 11, 1.8, '#2A2F3A') + C(18, 11, 1.8, '#2A2F3A');
      break;
    default: // descalço
      g = E(2, -4, 15, 8, p.c) + E(2, -1, 15, 5, p.d, op(0.55));
  }
  return G(`translate(0 0) scale(${f(lado * esc)} ${f(esc)})`, g);
}

// ---------- objetos na mão (origem na mão) ----------
interface Objeto { alt: number; d: (k: Ctx) => string }
const OBJETOS: Record<string, Objeto> = {
  bilhete: {
    alt: 38, d: () => G('rotate(-10)',
      P('M 2,-38 H 38 Q 42,-38 42,-34 V -8 Q 42,-4 38,-4 H 2 Q -2,-4 -2,-8 V -34 Q -2,-38 2,-38 Z', '#FFF1B8') +
      P('M 2,-38 H 12 V -4 H 2 Q -2,-4 -2,-8 V -34 Q -2,-38 2,-38 Z', '#FF6B1A') +
      L('M 12,-37 V -5', 1.8, INK, ' stroke-dasharray="3 2.5" stroke-opacity=".6"') + L('M 19,-28 H 36 M 19,-20 H 31 M 19,-12 H 34', 3, '#B79F4A')),
  },
  cafe: {
    alt: 58, d: () =>
      L('M -5,-44 Q -9,-50 -4,-56 M 5,-44 Q 1,-50 6,-56', 3, '#FFFFFF', so(0.7)) +
      P('M -14,-34 H 14 L 10,-4 Q 9,0 5,0 H -5 Q -9,0 -10,-4 Z', '#F2ECDD') + P('M 4,-34 H 14 L 10,-4 Q 9,0 5,0 H 2 Z', '#BDB59E', op(0.4)) + P('M -12,-24 H 12 L 11,-12 H -11 Z', '#C98B4A') + R(-16, -40, 32, 8, 3.5, '#3A3A3A'),
  },
  flor: {
    alt: 72, d: () => {
      let pet = '';
      for (let a = 0; a < 360; a += 60) pet += C(11 * Math.cos(((a - 90) * Math.PI) / 180), -62 + 11 * Math.sin(((a - 90) * Math.PI) / 180), 8.5, '#F27AA6');
      return L('M 0,4 V -54', 4.4, '#2FB67C') + P('M 0,-22 Q 16,-34 24,-24 Q 12,-14 0,-22 Z', '#2FB67C') + pet + C(0, -62, 7, '#FFD23F');
    },
  },
  balao: {
    alt: 100, d: () =>
      L('M 0,0 Q 7,-26 0,-56', 1.8, '#6B6B6B') + E(0, -78, 19, 23, '#E5484D') + P('M -4,-54 L 4,-54 L 0,-48 Z', '#B93036') + P('M 6,-92 Q 20,-84 17,-68 Q 8,-76 6,-92 Z', '#000000', op(0.12)) +
      L('M -11,-88 Q -14,-80 -12,-72', 4.4, '#FFFFFF', so(0.55)),
  },
  telemovel: {
    alt: 44, d: () =>
      R(-14, -42, 28, 46, 6, '#3A3F4B') + R(-10.5, -37, 21, 33, 2.5, '#8FD3FF') +
      `<path d="M 0,-10 L -5,-19 A 6 6 0 1 1 5,-19 Z" fill="#FF6B1A"/>` + C(0, -21, 2, '#FFFFFF') + R(-4, -40, 8, 2, 1, '#1B1B1B'),
  },
  mapa: {
    alt: 40, d: () =>
      P('M -22,-38 L -8,-34 L 8,-38 L 22,-34 V -4 L 8,-8 L -8,-4 L -22,-8 Z', '#F3EAC8') + P('M -8,-34 L 8,-38 V -8 L -8,-4 Z', '#E8DDB0') +
      L('M -8,-34 V -4 M 8,-38 V -8', 1.6, '#B6A66B') + L('M -16,-14 Q -8,-26 0,-18 T 14,-26', 2.6, '#FF6B1A', ' stroke-dasharray="3.5 3"') + C(14, -26, 3.4, '#E5484D'),
  },
  guardachuva: {
    alt: 96, d: () =>
      L('M 0,4 V -50', 4.6, '#2A2F3A') + L('M 0,4 Q 0,10 -7,8', 4.6, '#2A2F3A') +
      P('M -44,-46 Q -40,-90 0,-94 Q 40,-90 44,-46 Q 33,-56 22,-46 Q 11,-56 0,-46 Q -11,-56 -22,-46 Q -33,-56 -44,-46 Z', '#3F7BE8') +
      P('M 0,-94 Q 40,-90 44,-46 Q 33,-56 22,-46 Q 28,-70 0,-94 Z', '#000000', op(0.13)) +
      L('M 0,-92 V -48 M -22,-84 Q -24,-64 -22,-48 M 22,-84 Q 24,-64 22,-48', 2, '#2447A0', so(0.7)) + C(0, -96, 3, '#2A2F3A'),
  },
  megafone: {
    alt: 56, d: () => G('rotate(14)',
      R(-5, -12, 10, 14, 3, '#2A2F3A') + P('M -9,-12 H 9 L 27,-48 H -27 Z', '#FF6B1A') + P('M 9,-12 L 27,-48 H 12 L 3,-12 Z', '#000000', op(0.14)) +
      E(0, -48, 27, 7.5, '#C94F0C') + E(0, -48, 20, 4.8, '#6E2606') + L('M -14,-30 H 14', 4, '#FFFFFF', so(0.85))),
  },
  trofeu: {
    alt: 58, d: () =>
      L('M -16,-50 Q -30,-50 -28,-38 Q -26,-28 -14,-28 M 16,-50 Q 30,-50 28,-38 Q 26,-28 14,-28', 4, '#E39E00') +
      P('M -17,-56 H 17 V -40 Q 17,-22 0,-20 Q -17,-22 -17,-40 Z', '#F5B800') + P('M 5,-56 H 17 V -40 Q 17,-22 0,-20 Q 12,-30 5,-56 Z', '#000000', op(0.14)) +
      R(-3.5, -20, 7, 12, 0, '#E39E00') + R(-13, -9, 26, 9, 3, '#D99A00') + brilho('M -10,-50 V -40', 3.4),
  },
};

// ---------- fundos ----------
function fundo(id: string, p: Pal, cx: number, cy: number): string {
  const big = (fill: string) => R(-160, -160, 520, 560, 0, fill);
  switch (id) {
    case 'menta':
      return big('#CDEFE0') + C(cx, cy, 78, '#B7E6D2') + C(cx, cy, 46, '#A2DEC5', op(0.7)) + C(cx - 70, cy - 60, 9, '#FFFFFF', op(0.6)) + C(cx + 76, cy + 40, 6, '#FFFFFF', op(0.6));
    case 'ceu':
      return `<defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6DB8FF"/><stop offset="1" stop-color="#E4F3FF"/></linearGradient></defs>` + R(-160, -160, 520, 560, 0, 'url(#fg)') +
        E(cx - 56, cy - 40, 30, 11, '#FFFFFF', op(0.9)) + E(cx - 40, cy - 48, 20, 11, '#FFFFFF', op(0.9)) + E(cx + 62, cy + 8, 26, 9, '#FFFFFF', op(0.85)) + E(cx + 76, cy, 14, 8, '#FFFFFF', op(0.85));
    case 'sol':
      return `<defs><radialGradient id="fg" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#FFE98A"/><stop offset="1" stop-color="#FFB43A"/></radialGradient></defs>` + R(-160, -160, 520, 560, 0, 'url(#fg)') +
        C(cx, cy - 6, 70, '#FFFFFF', op(0.28)) + C(cx, cy - 6, 46, '#FFFFFF', op(0.28));
    case 'lilas': {
      let pontos = '';
      for (let y = -60; y < 340; y += 26) for (let x = -60 + ((y / 26) % 2 ? 13 : 0); x < 280; x += 26) pontos += C(x, y, 4, '#CDBBFF');
      return big('#E3D7FF') + pontos;
    }
    case 'noite': {
      let estrelas = '';
      for (const [dx, dy, s] of [[-70, -50, 3.4], [58, -66, 2.6], [78, -10, 3], [-84, 30, 2.4], [20, -84, 2.2], [-30, 74, 2.6], [84, 60, 2.2], [-58, -90, 2]] as Array<[number, number, number]>) {
        estrelas += `<path transform="${mover(cx + dx, cy + dy, s)}" d="M 0,-2 L 0.6,-0.6 L 2,0 L 0.6,0.6 L 0,2 L -0.6,0.6 L -2,0 L -0.6,-0.6 Z" fill="#FFFFFF"/>`;
      }
      return `<defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3770"/><stop offset="1" stop-color="#0E1330"/></linearGradient></defs>` + R(-160, -160, 520, 560, 0, 'url(#fg)') +
        estrelas + C(cx + 60, cy - 54, 17, '#FFE9A8') + C(cx + 68, cy - 60, 15, '#1D2755');
    }
    case 'raios': {
      let raios = '';
      const n = 18;
      for (let i = 0; i < n; i += 1) {
        if (i % 2) continue;
        const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
        raios += P(`M ${f(cx)},${f(cy)} L ${f(cx + 400 * Math.cos(a0))},${f(cy + 400 * Math.sin(a0))} L ${f(cx + 400 * Math.cos(a1))},${f(cy + 400 * Math.sin(a1))} Z`, '#FFC27A');
      }
      return big('#FF8A3D') + raios;
    }
    default: // auto: tom claro da cor da personagem
      return `<defs><radialGradient id="fg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${clarear(p.c, 0.9)}"/><stop offset="1" stop-color="${clarear(p.c, 0.72)}"/></radialGradient></defs>` + R(-160, -160, 520, 560, 0, 'url(#fg)');
  }
}

// ---------- montagem ----------
const corDe = (id: string) => CATEGORIAS_AVATAR.find((c) => c.id === 'cor')!.itens.find((i) => i.id === id)?.hex || '#FF6B1A';

/** Caixa (x, y, largura, altura) de cada vista, calculada a partir dos pontos da personagem. */
export function caixaDoAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar): [number, number, number, number] {
  const cfg = avatarOuPadrao(entrada);
  const rig = corDaPersonagem(cfg.personagem);
  const alt = ALT_CHAPEU(cfg.chapeu);
  const hat = rig.chapeu;
  const semChapeu = cfg.chapeu === 'nenhum';
  const topoChapeu = semChapeu ? 1e9 : hat.y - alt * hat.esc;
  switch (vista) {
    case 'redonda': {
      const { cx, cy, r } = rig.redonda;
      const folga = semChapeu ? 0 : Math.max(0, rig.redonda.topo - topoChapeu);
      const extra = Math.min(folga * 0.6, r * 0.45);
      const S = 2 * r + extra;
      return [cx - S / 2, cy - r - extra, S, S];
    }
    case 'cabeca': {
      const { cx, cy, r } = rig.redonda;
      const W = 2 * r * 1.38;
      return [cx - W / 2, cy - (W * 0.75) / 2, W, W * 0.75];
    }
    case 'chapeu': {
      const esc = hat.esc; // mesma escala para todos os chapéus, para as miniaturas se compararem
      const W = Math.max((96 + 44) / 0.75, 170) * esc;
      return [hat.x - W / 2, hat.y - (96 + 8) * esc, W, W * 0.75];
    }
    case 'cara': {
      const { x, y, sep, r } = rig.olhos;
      const W = (sep * 2 + r * 2) * 1.78;
      return [x - W / 2, (y + rig.boca.y) / 2 - (W * 0.75) / 2 - 6, W, W * 0.75];
    }
    case 'corpo': {
      const [cx, cy, w] = rig.vistaCorpo;
      return [cx - w / 2, cy - (w * 0.75) / 2, w, w * 0.75];
    }
    case 'pes': {
      const [a, b] = rig.pes;
      const W = Math.max(b.x - a.x + 78, 110);
      return [(a.x + b.x) / 2 - W / 2, a.y - 26 - (W * 0.75) / 2, W, W * 0.75];
    }
    case 'mao': {
      const m = rig.maos[1];
      const o = cfg.mao === 'nenhum' ? 30 : OBJETOS[cfg.mao]?.alt ?? 40;
      const W = Math.max(110, (o + 52) / 0.75);
      return [m.x - W / 2 + 10, m.y - o - 12, W, W * 0.75];
    }
    case 'palco': { // corpo inteiro com o espaço fixo para o chapéu mais alto: a personagem não muda de tamanho ao trocar de chapéu
      const topo = Math.min(-4, hat.y - 96 * hat.esc - 8);
      return [-6, topo, 212, 256 - topo];
    }
    default: { // completa
      const topo = Math.min(-4, topoChapeu - 8);
      return [-6, topo, 212, 256 - topo];
    }
  }
}

export function desenharAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar = 'completa'): string {
  const cfg = avatarOuPadrao(entrada);
  const rig = corDaPersonagem(cfg.personagem);
  const p = paleta(corDe(cfg.cor));
  const k = new Ctx();
  const roupa = ROUPAS[cfg.roupa];
  const chapeu = CHAPEUS[cfg.chapeu];
  const caixa = caixaDoAvatar(cfg, vista);
  let s = '';

  // fundo: quadrado na vista redonda, círculo atrás da personagem na vista completa
  if (vista === 'redonda') s += fundo(cfg.fundo, p, rig.redonda.cx, rig.redonda.cy);
  else if (vista === 'completa' || vista === 'palco') {
    const cc = k.clip('M 100,10 a 106,106 0 1 0 0.01,0 Z');
    s += `<g clip-path="url(#${cc})">${fundo(cfg.fundo, p, 100, 120)}</g>`;
  }

  // sombra no chão
  if (vista === 'completa' || vista === 'palco' || vista === 'pes') s += E(rig.sombra.x, rig.sombra.y, rig.sombra.rx, 8, '#000000', op(0.16));

  if (roupa?.tras) s += roupa.tras(k, rig, p);
  if (rig.tras) s += rig.tras(k, p);

  // pernas e pés
  const corPerna = rig.pernaCor || p.d;
  if (rig.pernas) for (const [x0, y0, x1, y1] of rig.pernas) s += L(`M ${x0},${y0} L ${x1},${y1}`, 17, corPerna);
  const esc = rig.escPe || 0.88;
  s += sapato(cfg.calcado, p, esc, -1).replace('translate(0 0)', `translate(${rig.pes[0].x} ${rig.pes[0].y})`);
  s += sapato(cfg.calcado, p, esc, 1).replace('translate(0 0)', `translate(${rig.pes[1].x} ${rig.pes[1].y})`);

  // braços (atrás do tronco)
  const manga = roupa?.manga || p.d;
  if (rig.bracos) for (const [sx, sy, cx, cy, hx, hy] of rig.bracos) s += L(`M ${sx},${sy} Q ${cx},${cy} ${hx},${hy}`, rig.braco || 15, manga);

  // tronco, roupa, cabeça
  s += rig.tronco(k, p);
  const t = rig.torso;
  if (roupa?.corpo) {
    const c = k.clip(t.d);
    s += `<g clip-path="url(#${c})">${roupa.corpo(k, rig, p)}</g>`;
  }
  if (roupa?.frente) s += roupa.frente(k, rig, p);
  s += rig.cabeca(k, p);

  // mãos e objeto
  const objeto = OBJETOS[cfg.mao];
  if (!rig.semMaos) s += C(rig.maos[0].x, rig.maos[0].y, 9.5, p.c) + C(rig.maos[0].x - 2, rig.maos[0].y - 2, 9.5, p.c, op(0));
  const md = rig.maos[1];
  if (objeto) s += G(mover(md.x, md.y), objeto.d(k));
  if (!rig.semMaos) s += C(md.x, md.y, 9.5, p.c) + E(md.x, md.y + 4, 8, 4, p.d, op(0.5));

  // cara
  const peca = pecaCara(k, rig, p, cfg.cara);
  s += peca.antes;
  s += rosto(k, rig, p, cfg.expressao, cfg.cara === 'barba');
  s += peca.depois;

  // chapéu
  if (chapeu) s += G(mover(rig.chapeu.x, rig.chapeu.y, rig.chapeu.esc), chapeu.d(k));

  const [x, y, w, h] = caixa;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}"><defs>${GRAD_PUPILA}${k.defs}</defs>${s}</svg>`;
}

const memo = new Map<string, string>();
/** Endereço (data URI) da imagem do avatar; o resultado fica guardado para não desenhar duas vezes. */
export function urlDoAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar = 'completa'): string {
  const cfg = avatarOuPadrao(entrada);
  const chave = `${cfg.personagem}|${cfg.cor}|${cfg.chapeu}|${cfg.expressao}|${cfg.cara}|${cfg.roupa}|${cfg.calcado}|${cfg.mao}|${cfg.fundo}|${vista}`;
  let u = memo.get(chave);
  if (!u) {
    u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(desenharAvatar(cfg, vista));
    if (memo.size > 500) memo.clear();
    memo.set(chave, u);
  }
  return u;
}

/** Proporção largura/altura de uma vista (para reservar o espaço certo). */
export function proporcaoDoAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar): number {
  const [, , w, h] = caixaDoAvatar(entrada, vista);
  return w / h;
}

export { AVATAR_PADRAO };
