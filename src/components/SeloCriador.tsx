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
        <path d="M9.6 7.6h3.4c2 0 3.2 1.1 3.2 2.8s-1.2 2.8-3.2 2.8h-1.3v3.2H9.6zm2.1 1.8v2.1h1.2c.7 0 1.1-.4 1.1-1.05s-.4-1.05-1.1-1.05z" fill="#FF6B1A" fillRule="evenodd" />
      </svg>
      {!soIcone && <span aria-hidden="true">{t('Criador')}</span>}
    </span>
  );
};
