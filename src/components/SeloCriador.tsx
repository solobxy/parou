import React from 'react';
import { t } from '../i18n';

// Selo "Criador": só a conta de quem criou a PAROU. Laranja da marca com o P, para se distinguir do
// Pioneiro (preto com estrela). Cabe ao lado de um nome, num comentário ou no perfil.
export const SeloCriador: React.FC<{ soIcone?: boolean }> = ({ soIcone }) => {
  const explicacao = t('Criador da PAROU');
  return (
    <span
      title={explicacao}
      aria-label={explicacao}
      data-teste="selo-criador"
      className={`inline-flex items-center align-middle shrink-0 rounded-full bg-[#FF6B1A] text-[#111111] leading-none select-none ${
        soIcone ? 'w-[18px] h-[18px] justify-center' : 'h-[20px] pl-[4px] pr-[8px] gap-[3px] text-[11px] font-extrabold tracking-[0.01em]'
      }`}
    >
      <svg width={soIcone ? 12 : 13} height={soIcone ? 12 : 13} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path d="M12 2.2 20.2 7v10L12 21.8 3.8 17V7z" fill="#111111" />
        <path d="M8.1 6.6H12.45A3.45 3.45 0 0 1 12.45 13.5H10.95V17.4H8.1ZM10.95 8.7H12.45A1.35 1.35 0 0 1 12.45 11.4H10.95Z" fill="#FF6B1A" fillRule="evenodd" />
      </svg>
      {!soIcone && <span aria-hidden="true">{t('Criador')}</span>}
    </span>
  );
};
