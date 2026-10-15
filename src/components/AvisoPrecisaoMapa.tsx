import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t, LOCALE } from '../i18n';
import { textoMetros } from '../utils/distancia';
import type { NivelGps } from '../utils/qualidadeGps';

interface Props {
  nivel: NivelGps;
  /** metros, já arredondado para mostrar */
  precisao: number;
  aTentar: boolean;
  onTentar: () => void;
}

/**
 * Aviso por cima do mapa quando a posição está pouco precisa ou sem sinal.
 * À vista só uma linha; o que fazer abre ao toque (regra: o essencial à vista, o detalhe ao toque).
 */
export const AvisoPrecisaoMapa: React.FC<Props> = ({ nivel, precisao, aTentar, onTentar }) => {
  const [aberto, setAberto] = useState(false);
  useEffect(() => { if (nivel === 'boa') setAberto(false); }, [nivel]);
  if (nivel === 'boa') return null;

  const distancia = precisao >= 1000
    ? `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(precisao / 1000)} km`
    : textoMetros(precisao);
  const semSinal = nivel === 'sem-sinal';
  const rotulo = semSinal ? t('Sem sinal de GPS') : t('Posição aproximada (cerca de {d})', { d: distancia });

  return (
    <div className="absolute left-3 bottom-3 z-20 flex flex-col items-start gap-2 max-w-[calc(100%-1.5rem)]" data-teste="aviso-precisao-mapa" role="status">
      {aberto && (
        <div className="w-[min(21rem,calc(100vw-1.5rem))] rounded-[14px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-[0_4px_14px_rgba(17,17,17,0.12)] p-3.5" data-teste="aviso-precisao-detalhe">
          <p className="text-[13.5px] text-[#111111] leading-snug">
            {semSinal
              ? t('A mostrar a última posição conhecida. Dentro de edifícios e em túneis o sinal costuma falhar; volta ao normal quando o GPS apanhar sinal.')
              : t('Nas definições do telemóvel, liga a localização precisa para este browser. Dentro de um edifício, chegar a uma janela ou à rua ajuda.')}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onTentar}
              disabled={aTentar}
              data-teste="aviso-precisao-tentar"
              className="h-10 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold cursor-pointer disabled:opacity-60"
            >
              {aTentar ? t('A tentar…') : t('Tentar outra vez')}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              data-teste="aviso-precisao-fechar-mapa"
              className="min-h-[44px] px-2 text-[13px] font-semibold text-[#111111] underline underline-offset-2 cursor-pointer"
            >
              {t('Fechar')}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        data-teste="aviso-precisao-chip"
        className="min-h-[44px] max-w-full pl-3 pr-3.5 rounded-full bg-[#FFFFFF] border border-[#E6E6E3] shadow-[0_4px_14px_rgba(17,17,17,0.12)] flex items-center gap-2 text-[13px] font-semibold text-[#111111] cursor-pointer active:bg-[#F4F4F2]"
      >
        <AlertTriangle className="w-4 h-4 shrink-0 text-[#C2410C] stroke-[2.25]" aria-hidden="true" />
        <span className="truncate">{rotulo}</span>
      </button>
    </div>
  );
};
