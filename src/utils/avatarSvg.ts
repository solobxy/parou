// Desenho da mascote "Paro": cada peça é uma função que devolve SVG; o avatar é só uma lista de escolhas
// (ver avatarCatalogo.ts). Tudo é desenhado aqui, sem imagens externas, e usado como <img> (data URI),
// por isso cada avatar é isolado e leve.
import { AVATAR_PADRAO, CATEGORIAS_AVATAR, ConfigAvatar, avatarOuPadrao } from './avatarCatalogo';

const INK = '#1B1B1B';
const SW = 3.6;

const P = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
const C = (cx: number, cy: number, r: number, fill: string, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${SW}"${extra}/>`;
const E = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${SW}"${extra}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"${extra}/>`;
const L = (d: string, w: number, col: string, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

const HEAD = 'M 72,20 H 128 L 162,54 V 114 Q 162,148 128,148 H 72 Q 38,148 38,114 V 54 Q 38,20 72,20 Z';
const BODY = 'M 70,138 H 130 Q 142,138 142,152 V 194 Q 142,210 126,210 H 74 Q 58,210 58,194 V 152 Q 58,138 70,138 Z';

const CHAPEUS: Record<string, () => string> = {
  boné: () =>
    P('M 46,52 Q 46,4 100,4 Q 154,4 154,52 Q 100,42 46,52 Z', '#3F7BE8') + L('M 100,6 L 100,45', 2.6, '#2447A0') +
    C(100, 5, 5, '#2F5FC4') + P('M 50,50 Q 100,38 150,50 Q 158,62 100,66 Q 42,62 50,50 Z', '#2F5FC4') +
    C(100, 27, 8, '#FF6B1A') + L('M 58,32 Q 64,19 80,12', 4, '#fff', ' stroke-opacity="0.45"'),
  gorro: () => {
    let costelas = '';
    for (let x = 54; x < 150; x += 14) costelas += L(`M ${x},44 V 62`, 2.6, '#9E2A30');
    return P('M 44,52 Q 42,0 100,0 Q 158,0 156,52 Z', '#E5484D') + L('M 62,14 Q 70,6 84,5', 4, '#fff', ' stroke-opacity="0.4"') +
      P('M 38,42 H 162 V 58 Q 162,66 154,66 H 46 Q 38,66 38,58 Z', '#C93A3F') + costelas + C(100, -6, 13, '#FFFFFF');
  },
  capacete: () =>
    P('M 44,50 Q 44,2 100,2 Q 156,2 156,50 Z', '#FFC933') + P('M 90,2 H 110 V 50 H 90 Z', '#F2B300') +
    L('M 56,22 Q 62,10 76,6', 4, '#fff', ' stroke-opacity="0.5"') + R(24, 46, 152, 13, 6, '#FFC933'),
  pescador: () =>
    P('M 54,52 Q 54,8 100,8 Q 146,8 146,52 Z', '#D9C79A') + P('M 54,34 H 146 V 46 H 54 Z', '#8A6A3B') +
    P('M 28,50 Q 100,32 172,50 Q 186,68 160,66 Q 100,54 40,66 Q 14,68 28,50 Z', '#CDB985'),
  revisor: () =>
    P('M 42,46 Q 36,6 100,2 Q 164,6 158,46 Z', '#1F2A44') + P('M 42,36 H 158 V 50 H 42 Z', '#F2B300') +
    C(100, 28, 9, '#FF6B1A') + L('M 100,23 V 33 M 95,28 H 105', 2.4, '#fff') + P('M 52,50 Q 100,80 148,50 Q 100,64 52,50 Z', '#111111'),
};

const CARAS: Record<string, () => string> = {
  oculos: () =>
    L('M 60,86 L 44,82', 4, INK) + L('M 140,86 L 156,82', 4, INK) + L('M 94,88 Q 100,83 106,88', 4, INK) +
    `<circle cx="78" cy="90" r="17" fill="#FFFFFF" fill-opacity="0.28" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="122" cy="90" r="17" fill="#FFFFFF" fill-opacity="0.28" stroke="${INK}" stroke-width="4"/>`,
  sol: () =>
    L('M 58,84 L 44,82', 4, INK) + L('M 142,84 L 156,82', 4, INK) +
    P('M 58,78 H 98 V 96 Q 98,108 86,108 H 70 Q 58,108 58,96 Z', INK) + P('M 102,78 H 142 V 96 Q 142,108 130,108 H 114 Q 102,108 102,96 Z', INK) +
    R(97, 80, 6, 5, 2, INK) + L('M 66,86 L 78,86', 3.4, '#fff', ' stroke-opacity="0.45"') + L('M 110,86 L 122,86', 3.4, '#fff', ' stroke-opacity="0.45"'),
  bigode: () => P('M 100,109 Q 88,100 70,107 Q 76,123 100,115 Q 124,123 130,107 Q 112,100 100,109 Z', '#4A3326'),
  sardas: () => {
    let s = '';
    for (const [x, y] of [[56, 104], [64, 111], [72, 103], [128, 103], [136, 111], [144, 104], [66, 100], [134, 100]]) s += `<circle cx="${x}" cy="${y}" r="2.3" fill="#7A3410" fill-opacity="0.6"/>`;
    return s;
  },
};

interface Roupa { sleeve?: string; body?: (cor: string) => string; front?: () => string }
const ROUPAS: Record<string, Roupa> = {
  riscas: {
    sleeve: '#F5F0E6',
    body: () => {
      let s = '<rect x="50" y="136" width="100" height="80" fill="#F5F0E6"/>';
      for (let y = 146; y < 212; y += 16) s += `<rect x="50" y="${y}" width="100" height="8" fill="#2F5FC4"/>`;
      return s;
    },
  },
  cachecol: {
    front: () => {
      let s = P('M 62,140 H 138 Q 148,140 148,149 Q 148,159 138,159 H 62 Q 52,159 52,149 Q 52,140 62,140 Z', '#E5484D');
      for (const x of [68, 84, 100, 116, 132]) s += L(`M ${x},143 V 156`, 4, '#fff', ' stroke-opacity="0.85"');
      s += P('M 114,156 H 134 L 138,196 Q 138,200 134,200 H 118 Q 114,200 114,196 Z', '#E5484D');
      s += L('M 119,164 H 133 M 120,174 H 135', 3.4, '#fff', ' stroke-opacity="0.85"');
      s += L('M 120,203 V 208 M 126,203 V 209 M 132,203 V 208', 3, INK);
      return s;
    },
  },
  colete: {
    body: (cor) =>
      '<rect x="50" y="136" width="100" height="80" fill="#D8F23A"/>' +
      '<rect x="74" y="136" width="12" height="80" fill="#EDEDED"/><rect x="114" y="136" width="12" height="80" fill="#EDEDED"/>' +
      '<rect x="50" y="178" width="100" height="10" fill="#EDEDED"/>' +
      `<path d="M 84,136 L 100,162 L 116,136 Z" fill="${cor}"/>` + L('M 100,162 V 210', 2.4, INK),
  },
  casaco: {
    sleeve: '#1F2A44',
    body: () =>
      '<rect x="50" y="136" width="100" height="80" fill="#1F2A44"/>' +
      `<path d="M 100,148 L 80,138 L 88,176 Z" fill="#2D3B5E" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      `<path d="M 100,148 L 120,138 L 112,176 Z" fill="#2D3B5E" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
      `<circle cx="100" cy="182" r="4" fill="#F2B300" stroke="${INK}" stroke-width="2"/><circle cx="100" cy="197" r="4" fill="#F2B300" stroke="${INK}" stroke-width="2"/>` +
      '<rect x="50" y="203" width="100" height="5" fill="#F2B300"/>',
  },
};

interface Calcado { upper: string; sole: string; accent: string; kind: 'sneaker' | 'boot' }
const CALCADOS: Record<string, Calcado> = {
  ténis: { upper: '#FFFFFF', sole: '#E8E4DA', accent: '#FF6B1A', kind: 'sneaker' },
  botas: { upper: '#8A5A2B', sole: '#3A2A1C', accent: '#5E3C1B', kind: 'boot' },
};
function sapato(def: Calcado, cx: number, dir: number): string {
  const g = def.kind === 'boot'
    ? P('M -12,240 V 204 Q -12,198 -6,198 H 8 Q 14,198 14,204 V 222 Q 24,224 24,234 Q 24,240 19,240 Z', def.upper) +
      L('M -11,210 H 14', 2.6, INK) + P('M -13,236 H 25 V 244 H -13 Z', def.sole)
    : P('M -14,240 V 227 Q -14,220 -6,220 H 0 Q 4,227 13,229 Q 23,231 23,240 Z', def.upper) +
      L('M -14,233 Q 4,233 23,235', 3.4, def.accent) + L('M 1,224 l 5,3 M 5,221.5 l 5,3', 2.2, INK) +
      P('M -15,238 H 24 V 244 Q 24,246 21,246 H -12 Q -15,246 -15,244 Z', def.sole);
  return `<g transform="translate(${cx} 0) scale(${dir} 1)">${g}</g>`;
}

const MAOS: Record<string, () => string> = {
  bilhete: () =>
    '<g transform="rotate(14 160 186)">' + P('M 148,167 H 190 Q 194,167 194,171 V 191 Q 194,195 190,195 H 148 Q 144,195 144,191 V 171 Q 144,167 148,167 Z', '#FFFFFF') +
    P('M 148,167 H 158 V 195 H 148 Q 144,195 144,191 V 171 Q 144,167 148,167 Z', '#FF6B1A') +
    L('M 158,168 V 194', 1.8, INK, ' stroke-dasharray="3 2.5"') + L('M 165,176 H 186 M 165,183 H 180', 3.2, '#9A9A9A') + '</g>',
  guardachuva: () =>
    L('M 152,206 V 118', 5.5, INK) +
    P('M 106,132 Q 112,84 152,80 Q 192,84 198,132 Q 187,121 175,132 Q 164,120 152,132 Q 140,120 129,132 Q 117,121 106,132 Z', '#3F7BE8') +
    L('M 152,82 V 130 M 129,88 Q 128,110 129,130 M 175,88 Q 176,110 175,130', 2.2, '#2447A0') + C(152, 79, 3, INK),
  cafe: () =>
    L('M 148,158 Q 143,151 149,144 M 158,158 Q 153,151 159,144', 3.2, '#9A9A9A') +
    P('M 138,172 H 166 L 162,208 Q 161,212 157,212 H 147 Q 143,212 142,208 Z', '#FFFFFF') +
    P('M 140,184 H 164 L 163,199 H 141 Z', '#C98B4A') + R(135, 165, 34, 8, 3, '#3A3A3A'),
  telemovel: () =>
    P('M 140,168 H 164 Q 169,168 169,173 V 204 Q 169,209 164,209 H 140 Q 135,209 135,204 V 173 Q 135,168 140,168 Z', '#3A3F4B') +
    '<rect x="139" y="174" width="26" height="28" rx="2" fill="#8FD3FF"/>' +
    `<path d="M 152,196 L 147,187 A 6 6 0 1 1 157,187 Z" fill="#FF6B1A" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="152" cy="185" r="2" fill="#fff"/>`,
};

export type VistaAvatar = 'completa' | 'cabeca' | 'redonda' | 'chapeu' | 'cara' | 'corpo' | 'pes' | 'mao';
const VISTAS: Record<VistaAvatar, string> = {
  completa: '-6 -28 212 292',
  cabeca: '24 -4 152 164',
  redonda: '26 -6 148 148',
  chapeu: '18 -26 164 128',
  cara: '34 52 132 104',
  corpo: '34 122 132 106',
  pes: '52 190 96 62',
  mao: '104 96 96 128',
};

const corDe = (id: string) => CATEGORIAS_AVATAR[0].itens.find((i) => i.id === id)?.hex || CATEGORIAS_AVATAR[0].itens[0].hex!;

export function desenharAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar = 'completa'): string {
  const cfg = avatarOuPadrao(entrada);
  const c = corDe(cfg.cor);
  const roupa = ROUPAS[cfg.roupa];
  const calc = CALCADOS[cfg.calcado];
  let s = '<ellipse cx="100" cy="246" rx="60" ry="9" fill="#000" fill-opacity="0.16"/>';
  s += R(78, 204, 16, 30, 6, c) + R(106, 204, 16, 30, 6, c); // pernas
  s += calc ? sapato(calc, 86, -1) + sapato(calc, 114, 1) : E(85, 238, 14, 8, c) + E(115, 238, 14, 8, c);
  s += P(BODY, c);
  s += `<clipPath id="bc"><path d="${BODY}"/></clipPath>`;
  s += '<g clip-path="url(#bc)"><rect x="50" y="196" width="100" height="20" fill="#000" fill-opacity="0.08"/>';
  if (roupa?.body) s += roupa.body(c);
  s += `</g><path d="${BODY}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`;
  if (roupa?.front) s += roupa.front();
  const manga = roupa?.sleeve || c;
  const braco = (d: string) => L(d, 19, INK) + L(d, 12.4, manga);
  s += braco('M 64,160 Q 45,174 47,198') + E(47, 203, 9, 9, c);
  s += braco('M 136,160 Q 155,174 153,198');
  if (MAOS[cfg.mao]) s += MAOS[cfg.mao]();
  s += E(153, 203, 9, 9, c);
  s += P(HEAD, c);
  s += `<clipPath id="hc"><path d="${HEAD}"/></clipPath>`;
  s += '<g clip-path="url(#hc)"><rect x="30" y="122" width="140" height="40" fill="#000" fill-opacity="0.09"/></g>';
  s += L('M 50,52 Q 53,38 70,33', 5, '#fff', ' stroke-opacity="0.5"');
  s += '<ellipse cx="62" cy="113" rx="9" ry="6" fill="#FF3D6E" fill-opacity="0.28"/><ellipse cx="138" cy="113" rx="9" ry="6" fill="#FF3D6E" fill-opacity="0.28"/>';
  s += `<ellipse cx="78" cy="90" rx="8" ry="11" fill="${INK}"/><ellipse cx="122" cy="90" rx="8" ry="11" fill="${INK}"/>`;
  s += '<circle cx="81" cy="85" r="3.2" fill="#fff"/><circle cx="125" cy="85" r="3.2" fill="#fff"/><circle cx="75" cy="95" r="1.6" fill="#fff"/><circle cx="119" cy="95" r="1.6" fill="#fff"/>';
  s += L('M 90,117 Q 100,128 110,117', 4.2, INK);
  if (CARAS[cfg.cara]) s += CARAS[cfg.cara]();
  if (CHAPEUS[cfg.chapeu]) s += CHAPEUS[cfg.chapeu]();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VISTAS[vista] || VISTAS.completa}">${s}</svg>`;
}

const memo = new Map<string, string>();
/** Endereço (data URI) da imagem do avatar; o resultado fica guardado para não desenhar duas vezes. */
export function urlDoAvatar(entrada: Partial<ConfigAvatar> | null | undefined, vista: VistaAvatar = 'completa'): string {
  const cfg = avatarOuPadrao(entrada);
  const chave = `${cfg.cor}|${cfg.chapeu}|${cfg.cara}|${cfg.roupa}|${cfg.calcado}|${cfg.mao}|${vista}`;
  let u = memo.get(chave);
  if (!u) {
    u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(desenharAvatar(cfg, vista));
    if (memo.size > 400) memo.clear();
    memo.set(chave, u);
  }
  return u;
}

export { AVATAR_PADRAO };
