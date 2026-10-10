import React, { useId } from 'react';

export interface LogoProps {
  size?: number; // Altura do símbolo em pixels (predefinição: 28)
  className?: string;
  showText?: boolean;
}

/**
 * Logótipo oficial PAROU
 * Símbolo vetorial com máscara de corte + "PAROU" à direita em Barlow Condensed 700.
 * A linha usa currentColor (#111111 em claro, #FFFFFF em escuro) e o ponto é #FF6B1A.
 */
export const Logo: React.FC<LogoProps> = ({
  size = 28,
  className = '',
  showText = true,
}) => {
  const reactId = useId();
  const maskId = `parou-corte-${reactId.replace(/[:]/g, '')}`;

  // Proporções exatas do viewBox: 48 de largura para 66 de altura
  const symbolWidth = Math.round((size * 48) / 66);
  const fontSize = Math.round(size * 0.9);

  return (
    <span
      className={`inline-flex items-center shrink-0 select-none ${className}`}
      style={{ gap: '10px' }}
      aria-label="PAROU"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="26 17 48 66"
        aria-hidden="true"
        className="shrink-0 overflow-visible"
        style={{ width: `${symbolWidth}px`, height: `${size}px` }}
      >
        <mask id={maskId}>
          <rect x="26" y="17" width="48" height="66" fill="#FFFFFF" />
          <circle cx="49" cy="57" r="8" fill="#000000" />
        </mask>
        <path
          d="M34 80V25H56L66 35V57H52"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          mask={`url(#${maskId})`}
        />
        <circle cx="49" cy="57" r="6.5" fill="#FF6B1A" />
      </svg>

      {showText && (
        <span
          className="font-condensada font-bold leading-none"
          style={{
            fontSize: `${fontSize}px`,
            letterSpacing: '0.06em',
          }}
        >
          PAROU
        </span>
      )}
    </span>
  );
};
