import React, { useId } from 'react';
import type { Idioma } from '../i18n';

/**
 * Bandeiras reais (Portugal, Reino Unido, Alemanha e França) desenhadas em SVG, sem imagens externas.
 * Todas na proporção 3:2 e com um contorno fino, para lerem-se bem a 24–28 px nas barras do topo,
 * nos três temas (a bandeira de França é branca no meio e precisa do contorno no tema claro).
 */

function Portugal() {
  return (
    <>
      <rect width="30" height="20" fill="#FF0000" />
      <rect width="12" height="20" fill="#006600" />
      {/* Esfera armilar simplificada: círculo amarelo com o escudo vermelho e branco ao centro */}
      <circle cx="12" cy="10" r="5.2" fill="none" stroke="#FFCC00" strokeWidth="1.1" />
      <path d="M12 4.8 C9.6 4.8 8.4 6.6 8.4 8.6 L8.4 11.4 C8.4 13.2 10 14.8 12 15.6 C14 14.8 15.6 13.2 15.6 11.4 L15.6 8.6 C15.6 6.6 14.4 4.8 12 4.8 Z" fill="#FF0000" stroke="#FFFFFF" strokeWidth="0.55" />
      <path d="M12 7.2 C10.9 7.2 10.4 8 10.4 8.9 L10.4 11 C10.4 11.9 11 12.6 12 13 C13 12.6 13.6 11.9 13.6 11 L13.6 8.9 C13.6 8 13.1 7.2 12 7.2 Z" fill="#FFFFFF" />
      <circle cx="12" cy="10" r="0.9" fill="#003399" />
    </>
  );
}

function ReinoUnido({ id }: { id: string }) {
  // A Union Jack oficial (60×30) ajustada a 30×20: cruzes de Santo André e de São Patrício com a troca de lados
  return (
    <>
      <clipPath id={`${id}s`}><path d="M0,0 v20 h30 v-20 z" /></clipPath>
      <clipPath id={`${id}t`}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" transform="scale(0.5 0.6667)" /></clipPath>
      <g clipPath={`url(#${id}s)`}>
        <path d="M0,0 v20 h30 v-20 z" fill="#012169" />
        <path d="M0,0 L30,20 M30,0 L0,20" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M0,0 L30,20 M30,0 L0,20" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="2.6" />
        <path d="M15,0 v20 M0,10 h30" stroke="#FFFFFF" strokeWidth="6.6" />
        <path d="M15,0 v20 M0,10 h30" stroke="#C8102E" strokeWidth="4" />
      </g>
    </>
  );
}

function Alemanha() {
  return (
    <>
      <rect width="30" height="20" fill="#FFCE00" />
      <rect width="30" height="13.34" fill="#DD0000" />
      <rect width="30" height="6.67" fill="#000000" />
    </>
  );
}

function Franca() {
  return (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect width="10" height="20" fill="#0055A4" />
      <rect x="20" width="10" height="20" fill="#EF4135" />
    </>
  );
}

/** Bandeira de um idioma (decorativa: o nome do idioma vem sempre escrito ao lado ou no rótulo do botão) */
export const Bandeira: React.FC<{ idioma: Idioma; className?: string }> = ({ idioma, className = 'w-[27px] h-[18px]' }) => {
  const id = `bd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox="0 0 30 20"
      className={`${className} shrink-0 rounded-[3px] overflow-hidden`}
      style={{ boxShadow: '0 0 0 1px rgba(128,128,128,0.45)' }}
      aria-hidden="true"
      focusable="false"
      data-bandeira={idioma}
    >
      {idioma === 'pt' ? <Portugal /> : idioma === 'en' ? <ReinoUnido id={id} /> : idioma === 'de' ? <Alemanha /> : <Franca />}
    </svg>
  );
};
