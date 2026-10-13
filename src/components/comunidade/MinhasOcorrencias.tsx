import React, { useId, useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Plus, ThumbsUp } from 'lucide-react';
import type { Occurrence } from '../../types';
import { quandoAconteceu } from '../../utils/quando';
import { t } from '../../i18n';

interface Props {
  ocorrencias: Occurrence[];
  onAbrir: (o: Occurrence) => void;
  onNova: () => void;
}

/** As ocorrências que a pessoa reportou (últimas 24 h) e o atalho para reportar outra; fechado por omissão, para não ocupar a página */
export const MinhasOcorrencias: React.FC<Props> = ({ ocorrencias, onAbrir, onNova }) => {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <section data-teste="minhas-ocorrencias" className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3]">
      <div className="flex items-center gap-2 pl-3.5 pr-2 py-1.5">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls={id}
          data-teste="minhas-ocorrencias-abrir"
          className="flex-1 min-w-0 min-h-[44px] flex items-center gap-1.5 text-left cursor-pointer"
        >
          <span className="min-w-0 text-[14.5px] font-bold text-[#111111] leading-tight">{t('As minhas ocorrências ({n})', { n: ocorrencias.length })}</span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-[#4A4A4A] transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onNova}
          data-teste="minhas-ocorrencias-nova"
          className="shrink-0 h-11 px-3.5 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[14px] font-bold brand-chamfer inline-flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.6]" aria-hidden="true" />
          <span>{t('Nova')}</span>
        </button>
      </div>

      {aberto && (
        <div id={id} className="border-t border-[#E6E6E3] max-h-64 overflow-y-auto divide-y divide-[#E6E6E3]">
          {ocorrencias.length === 0 ? (
            <p className="p-4 text-center text-[13.5px] text-[#4A4A4A]">{t('Ainda não reportou nenhuma ocorrência.')}</p>
          ) : (
            ocorrencias.map((occ) => (
              <button
                key={occ.id}
                type="button"
                onClick={() => onAbrir(occ)}
                className="w-full min-h-[56px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#F4F4F2] cursor-pointer"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-[#111111] truncate">{occ.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-[#4A4A4A] truncate">
                    <MapPin className="w-3 h-3 stroke-[2] shrink-0" aria-hidden="true" />
                    <span className="truncate">{t(occ.district)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-condensada tabular-nums shrink-0">{quandoAconteceu(occ)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-[#4A4A4A] shrink-0">
                  <ThumbsUp className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />
                  <span className="font-condensada font-bold tabular-nums">{occ.confirmationsCount || occ.upvotes || 0}</span>
                  <ChevronRight className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
};
