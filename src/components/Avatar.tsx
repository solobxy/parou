import React from 'react';
import { ConfigAvatar } from '../utils/avatarCatalogo';
import { urlDoAvatar, VistaAvatar } from '../utils/avatarSvg';

interface AvatarProps {
  config?: Partial<ConfigAvatar> | null;
  /** lado em píxeis (o avatar é redondo e mostra a cara) */
  tamanho?: number;
  /** "redonda" = só a cara num círculo; "completa" = corpo inteiro (sem círculo) */
  vista?: VistaAvatar;
  className?: string;
}

/** Avatar da mascote Paro. Decorativo: o nome de quem escreve vem sempre ao lado. */
export const Avatar: React.FC<AvatarProps> = ({ config, tamanho = 40, vista = 'redonda', className = '' }) => {
  const redondo = vista === 'redonda';
  return (
    <img
      src={urlDoAvatar(config, vista)}
      alt=""
      aria-hidden="true"
      width={tamanho}
      height={redondo ? tamanho : Math.round((tamanho * 292) / 212)}
      decoding="async"
      draggable={false}
      className={`shrink-0 select-none ${redondo ? 'rounded-full bg-[#FFF1E8] border border-[#E6E6E3]' : ''} ${className}`}
    />
  );
};
