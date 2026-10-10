import React from 'react';
import { ConfigAvatar } from '../utils/avatarCatalogo';
import { proporcaoDoAvatar, urlDoAvatar, VistaAvatar } from '../utils/avatarSvg';

interface AvatarProps {
  config?: Partial<ConfigAvatar> | null;
  /** largura em píxeis (a altura acompanha a vista escolhida) */
  tamanho?: number;
  /** "redonda" = a cara num círculo; "completa" = corpo inteiro (sem círculo) */
  vista?: VistaAvatar;
  className?: string;
}

/** Avatar da PAROU. Decorativo: o nome de quem escreve vem sempre ao lado. */
export const Avatar: React.FC<AvatarProps> = ({ config, tamanho = 40, vista = 'redonda', className = '' }) => {
  const redondo = vista === 'redonda';
  return (
    <img
      src={urlDoAvatar(config, vista)}
      alt=""
      aria-hidden="true"
      width={tamanho}
      height={redondo ? tamanho : Math.round(tamanho / proporcaoDoAvatar(config, vista))}
      decoding="async"
      draggable={false}
      className={`shrink-0 select-none ${redondo ? 'rounded-full bg-[#F4F4F2] border border-[#E6E6E3]' : ''} ${className}`}
    />
  );
};
