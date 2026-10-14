// Cores legíveis para o número da linha (chip): o operador escolhe a cor de fundo, nós garantimos
// um contraste mínimo de 4,5:1 (WCAG AA) com o texto, escurecendo ou clareando o fundo só o necessário.
type Rgb = [number, number, number];

function lerRgb(hex?: string): Rgb | null {
  const limpo = String(hex || '').replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(limpo)) return null;
  const c = limpo.length === 3 ? limpo.split('').map((x) => x + x).join('') : limpo;
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function emHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function luminancia([r, g, b]: Rgb): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const LUM_ESCURO = luminancia([17, 17, 17]);

/** Devolve fundo e texto com contraste >= 4,5:1; o fundo só muda se for preciso e muda pouco. */
export function chipLegivel(fundoHex?: string, textoPedido?: string): { fundo: string; texto: string } {
  const fundo = lerRgb(fundoHex);
  if (!fundo) return { fundo: fundoHex || '#111111', texto: textoPedido || '#FFFFFF' };
  const pedido = lerRgb(textoPedido);
  const lf = luminancia(fundo);
  if (pedido && razao(luminancia(pedido), lf) >= 4.5) return { fundo: emHex(fundo), texto: emHex(pedido) };
  const comBranco = razao(1, lf);
  const comEscuro = razao(LUM_ESCURO, lf);
  if (comBranco >= 4.5) return { fundo: emHex(fundo), texto: '#FFFFFF' };
  if (comEscuro >= 4.5) return { fundo: emHex(fundo), texto: '#111111' };
  // Nenhum chega: ajusta o fundo na direção do melhor texto até chegar a 4,5
  const branco = comBranco >= comEscuro;
  let atual: Rgb = fundo;
  for (let i = 0; i < 40; i++) {
    atual = branco
      ? [atual[0] * 0.97, atual[1] * 0.97, atual[2] * 0.97]
      : [atual[0] + (255 - atual[0]) * 0.05, atual[1] + (255 - atual[1]) * 0.05, atual[2] + (255 - atual[2]) * 0.05];
    const l = luminancia(atual);
    if (razao(branco ? 1 : LUM_ESCURO, l) >= 4.5) break;
  }
  return { fundo: emHex(atual), texto: branco ? '#FFFFFF' : '#111111' };
}
