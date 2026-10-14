import React from 'react';
import { Clock } from 'lucide-react';
import { t } from '../i18n';

/**
 * "Atrasado 5 min": só aparece quando o próprio operador (GPS do autocarro, API da STCP, previsões da Carris
 * Metropolitana) diz que a partida vem atrasada. Quando não há esse dado não se mostra nada: não se adivinha.
 * A cor ajuda (âmbar até 9 min, vermelho a partir de 10), mas o texto e o relógio dizem o mesmo sem ela.
 */
export const EtiquetaAtraso: React.FC<{ minutos: number; horario?: string; className?: string }> = ({ minutos, horario, className = '' }) => {
  const forte = minutos >= 10;
  return (
    <span
      className={`inline-flex items-center gap-1 max-w-full h-5 px-1.5 rounded-full text-[11.5px] leading-none font-bold tabular-nums whitespace-nowrap ${forte ? 'bg-[#FDE8E6] text-[#9F1D14]' : 'bg-[#FFF1DC] text-[#8A4B00]'} ${className}`}
      data-teste="etiqueta-atraso"
    >
      <Clock className="w-3 h-3 shrink-0 stroke-[2.5]" aria-hidden="true" />
      <span className="truncate">{t('Atrasado {m} min', { m: minutos })}</span>
      {horario && <span className="sr-only">{t('(horário {h})', { h: horario })}</span>}
    </span>
  );
};
