import React from 'react';
import { t } from '../i18n';

// Medalha "Pioneiro": quem criou a conta até ao fim de 2026. Pequena, preta com estrela laranja
// (diferente do medalhão laranja dos apoiantes). Cabe ao lado de um nome, num comentário ou no perfil.
function Estrela({ lado }: { lado: number }) {
  return (
    <svg width={lado} height={lado} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M12 2.6l2.8 6.1 6.6.7-4.9 4.5 1.4 6.5L12 17.1l-5.9 3.3 1.4-6.5-4.9-4.5 6.6-.7z"
        fill="#FF6B1A"
        stroke="#FF6B1A"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const MedalhaPioneiro: React.FC<{ soIcone?: boolean }> = ({ soIcone }) => {
  const explicacao = t('Pioneiro: criou a conta até ao fim de 2026');
  return (
    <span
      title={explicacao}
      aria-label={explicacao}
      data-teste="medalha-pioneiro"
      className={`inline-flex items-center align-middle shrink-0 rounded-full bg-[#111111] text-[#FFFFFF] leading-none select-none ${
        soIcone ? 'w-[18px] h-[18px] justify-center' : 'h-[20px] pl-[5px] pr-[8px] gap-[3px] text-[11px] font-bold tracking-[0.01em]'
      }`}
    >
      <Estrela lado={soIcone ? 11 : 12} />
      {!soIcone && <span aria-hidden="true">{t('Pioneiro')}</span>}
    </span>
  );
};
