import React from 'react';
import { MessageCircle, ArrowUpRight } from 'lucide-react';
import { t } from '../i18n';
import { CANAL_WHATSAPP } from '../config/ligacoes';

interface BotaoWhatsAppProps {
  /** "discreto": pequeno, para alertas e mapa; "cartao": maior, com explicação, para perfil e comunidade */
  variante?: 'discreto' | 'cartao';
  className?: string;
}

/** Convite para seguir o canal da PAROU no WhatsApp. Não aparece enquanto não houver ligação. */
export const BotaoWhatsApp: React.FC<BotaoWhatsAppProps> = ({ variante = 'discreto', className = '' }) => {
  if (!CANAL_WHATSAPP) return null;

  if (variante === 'cartao') {
    return (
      <a
        href={CANAL_WHATSAPP}
        target="_blank"
        rel="noopener noreferrer"
        data-teste="seguir-whatsapp"
        className={`flex items-center gap-3 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] p-3 hover:border-[#C9C9C4] ${className}`}
      >
        <span className="w-10 h-10 shrink-0 rounded-full bg-[#E6F6EC] text-[#14693A] flex items-center justify-center" aria-hidden="true">
          <MessageCircle className="w-5 h-5 stroke-[2.2]" />
        </span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block text-[14.5px] font-bold text-[#111111]">{t('Segue a PAROU no WhatsApp')}</span>
          <span className="block text-[12.5px] text-[#6B6B6B] mt-0.5">{t('Avisos, greves e novidades no telemóvel. Ninguém vê o teu número.')}</span>
        </span>
        <ArrowUpRight className="w-4 h-4 text-[#6B6B6B] shrink-0" aria-hidden="true" />
      </a>
    );
  }

  return (
    <a
      href={CANAL_WHATSAPP}
      target="_blank"
      rel="noopener noreferrer"
      data-teste="seguir-whatsapp"
      className={`inline-flex items-center gap-1.5 h-11 px-3 rounded-full text-[13px] font-semibold text-[#14693A] hover:bg-[#E6F6EC] ${className}`}
    >
      <MessageCircle className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
      <span>{t('Segue no WhatsApp')}</span>
    </a>
  );
};
