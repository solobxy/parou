import React from 'react';
import { t } from '../i18n';

// Medalha "Pioneiro": quem criou a conta até ao fim de 2026. Preta com estrela laranja, para não se
// confundir com o medalhão laranja dos apoiantes que virá mais tarde.
function Estrela({ tamanho }: { tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#111111" />
      <path
        d="M12 5.2l1.9 4.3 4.7.4-3.6 3.1 1.1 4.6L12 15.2l-4.1 2.4 1.1-4.6-3.6-3.1 4.7-.4z"
        fill="#FF6B1A"
        stroke="#FF6B1A"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const MedalhaPioneiro: React.FC<{ compacta?: boolean }> = ({ compacta }) => {
  if (compacta) {
    return (
      <span title={t('Pioneiro: criou a conta até ao fim de 2026')} aria-label={t('Pioneiro')} className="inline-flex align-middle" data-teste="medalha-pioneiro">
        <Estrela tamanho={16} />
      </span>
    );
  }
  return (
    <div
      className="flex items-center gap-3 rounded-[10px] bg-[#111111] text-[#FFFFFF] px-3 py-2.5"
      data-teste="medalha-pioneiro"
    >
      <Estrela tamanho={30} />
      <div className="min-w-0 leading-tight">
        <div className="text-[13.5px] font-bold">{t('Pioneiro')}</div>
        <div className="text-[11.5px] text-[#D9D9D6] mt-0.5">{t('Criaste a conta até ao fim de 2026, quando a PAROU era nova.')}</div>
      </div>
    </div>
  );
};
