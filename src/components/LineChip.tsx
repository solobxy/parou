import React from 'react';

interface LineChipProps {
  number: string;
  color?: string;
  textColor?: string;
  className?: string;
}

// Function to calculate relative luminance and pick high contrast text color (#111111 vs #FFFFFF)
function getContrastColor(hexColor?: string): string {
  if (!hexColor) return '#111111';
  const clean = hexColor.replace(/^#/, '');
  if (clean.length !== 6 && clean.length !== 3) return '#111111';
  
  const r = parseInt(clean.length === 3 ? clean[0] + clean[0] : clean.substring(0, 2), 16);
  const g = parseInt(clean.length === 3 ? clean[1] + clean[1] : clean.substring(2, 4), 16);
  const b = parseInt(clean.length === 3 ? clean[2] + clean[2] : clean.substring(4, 6), 16);

  // YIQ luminance formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 135 ? '#111111' : '#FFFFFF';
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
  const resolvedTextColor = textColor || (color ? getContrastColor(bgColor) : '#111111');
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
