import React from 'react';
import { ConfigAvatar } from '../utils/avatarCatalogo';
import { proporcaoDoAvatar, urlDaMedalha, urlDoAvatar, VistaAvatar } from '../utils/avatarSvg';

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
  // A medalha (ganha com reputação) fica no canto de baixo, a sair do círculo; nas vistas inteiras já vem desenhada
  const medalha = redondo ? urlDaMedalha(config?.medalha) : '';
  const lado = Math.max(15, Math.round(tamanho * 0.46));
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: tamanho }}>
      <img
        src={urlDoAvatar(config, vista)}
        alt=""
        aria-hidden="true"
        width={tamanho}
        height={redondo ? tamanho : Math.round(tamanho / proporcaoDoAvatar(config, vista))}
        decoding="async"
        draggable={false}
        className={`block select-none ${redondo ? 'rounded-full bg-[#F4F4F2] border border-[#E6E6E3]' : ''}`}
      />
      {medalha && (
        <img
          src={medalha}
          alt=""
          aria-hidden="true"
          width={lado}
          height={lado}
          draggable={false}
          data-teste="medalha-avatar"
          className="absolute select-none pointer-events-none"
          style={{ right: -Math.round(lado * 0.2), bottom: -Math.round(lado * 0.2) }}
        />
      )}
    </span>
  );
};
