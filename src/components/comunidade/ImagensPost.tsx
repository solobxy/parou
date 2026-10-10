import React from 'react';
import { t } from '../../i18n';

/** Imagens de uma novidade da PAROU: quadradas, com cantos redondos; tocar abre a imagem inteira. */
export const ImagensPost: React.FC<{ imagens?: string[]; alt: string; grande?: boolean }> = ({ imagens, alt, grande }) => {
  if (!imagens || !imagens.length) return null;
  const varias = imagens.length > 1;
  return (
    <div
      className={`mt-3 grid gap-2 ${varias ? 'grid-cols-2' : 'grid-cols-1'} ${varias ? (grande ? 'max-w-[640px]' : 'max-w-[520px]') : (grande ? 'max-w-[480px]' : 'max-w-[360px]')}`}
      data-teste="imagens-post"
    >
      {imagens.map((src, i) => (
        <a
          key={src}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={t('Abrir imagem {n}', { n: i + 1 })}
          className="block overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-[#F4F4F2] aspect-square"
        >
          <img
            src={src}
            alt={`${alt}${varias ? ` (${i + 1}/${imagens.length})` : ''}`}
            width={1080}
            height={1080}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </a>
      ))}
    </div>
  );
};
