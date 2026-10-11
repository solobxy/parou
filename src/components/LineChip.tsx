import React from 'react';

interface LineChipProps {
  number: string;
  color?: string;
  textColor?: string;
  className?: string;
}

// Cor do texto do número da linha: a do operador, se se ler bem (contraste mínimo 4,5:1, WCAG AA);
// senão, a melhor entre branco e quase-preto sobre a cor da linha.
function lerRgb(hex?: string): [number, number, number] | null {
  const clean = String(hex || '').replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)) return null;
  const c = clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean;
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function luminancia([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function getContrastColor(hexColor?: string, pedida?: string): string {
  const fundo = lerRgb(hexColor);
  if (!fundo) return pedida || '#111111';
  const lf = luminancia(fundo);
  const dada = lerRgb(pedida);
  if (pedida && dada && razao(luminancia(dada), lf) >= 4.5) return pedida;
  const branco = razao(1, lf);
  const escuro = razao(luminancia([17, 17, 17]), lf);
  return branco >= 4.5 || branco >= escuro ? '#FFFFFF' : '#111111';
}

/**
 * Line Number Chip: Exactly 32x28px, 4px corners, Barlow Condensed 700.
 * The only place where official line colors appear in the UI.
 */
export const LineChip: React.FC<LineChipProps> = ({
  number,
  color,
  textColor,
  className = '',
}) => {
  const bgColor = color ? (color.startsWith('#') ? color : `#${color}`) : '#F4F4F2';
  const resolvedTextColor = color ? getContrastColor(bgColor, textColor) : (textColor || '#111111');
  const borderStyle = !color || color.toLowerCase() === '#ffffff' ? '1px solid #E6E6E3' : 'none';

  return (
    <span
      className={`min-w-[32px] h-[28px] px-1.5 rounded-[4px] font-condensada font-bold text-sm tracking-tight inline-flex items-center justify-center leading-none tabular-nums shrink-0 select-none ${className}`}
      style={{
        backgroundColor: bgColor,
        color: resolvedTextColor,
        border: borderStyle,
      }}
      title={`Linha ${number}`}
    >
      {number}
    </span>
  );
};
