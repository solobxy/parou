import React from 'react';
import { chipLegivel } from '../utils/contraste';

interface LineChipProps {
  number: string;
  color?: string;
  textColor?: string;
  className?: string;
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
  const corPedida = color ? (color.startsWith('#') ? color : `#${color}`) : '#F4F4F2';
  const legivel = color ? chipLegivel(corPedida, textColor) : { fundo: corPedida, texto: textColor || '#111111' };
  const bgColor = legivel.fundo;
  const resolvedTextColor = legivel.texto;
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
