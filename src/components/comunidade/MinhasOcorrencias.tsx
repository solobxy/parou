import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, ListChecks, MapPin, Plus, ThumbsUp, X } from 'lucide-react';
import type { Occurrence } from '../../types';
import { quandoAconteceu } from '../../utils/quando';
import { useVoltarFecha } from '../../utils/janelas';
import { t } from '../../i18n';

interface Props {
  ocorrencias: Occurrence[];
  onAbrir: (o: Occurrence) => void;
  onNova: () => void;
}

const FOCAVEIS = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Atalhos para as ocorrências que a pessoa reportou (últimas 24 h): uma linha compacta com "Ver ocorrências" e "Nova".
 * A lista só abre num pop-up quando se toca, para não ocupar a página.
 */
export const MinhasOcorrencias: React.FC<Props> = ({ ocorrencias, onAbrir, onNova }) => {
  const [aberta, setAberta] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = () => setAberta(false);
  useVoltarFecha(aberta, fechar);

  // Foco na janela, Esc fecha e o Tab fica dentro dela
  useEffect(() => {
    if (!aberta) return;
    const origem = document.activeElement as HTMLElement | null;
    const aoTecla = (e: KeyboardEvent) => {
      if (!caixa.current) return;
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); return; }
      if (e.key !== 'Tab') return;
      const lista = Array.from(caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((x) => x.offsetParent !== null);
      if (!lista.length) return;
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', aoTecla, true);
    const temporizador = setTimeout(() => caixa.current?.focus({ preventScroll: true }), 40);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener('keydown', aoTecla, true);
      origem?.focus?.({ preventScroll: true });
    };
  }, [aberta]);

  const titulo = t('As minhas ocorrências ({n})', { n: ocorrencias.length });

  return (
    <>
      <div data-teste="minhas-ocorrencias" className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberta(true)}
          data-teste="minhas-ocorrencias-abrir"
          className="flex-1 min-w-0 h-11 px-3 rounded-[12px] bg-[#FFFFFF] border border-[#D5D5D0] hover:border-[#111111] text-[14px] font-bold text-[#111111] inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <ListChecks className="w-4 h-4 stroke-[2.2] shrink-0" aria-hidden="true" />
          <span className="truncate">{t('Ver ocorrências')}</span>
          <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#111111] text-[#FFFFFF] font-condensada text-[13px] leading-[22px] tabular-nums text-center" aria-label={String(ocorrencias.length)}>{ocorrencias.length}</span>
        </button>
        <button
          type="button"
          onClick={onNova}
          data-teste="minhas-ocorrencias-nova"
          className="shrink-0 h-11 px-3.5 rounded-[12px] bg-[#FF6B1A] text-[#111111] text-[14px] font-bold brand-chamfer inline-flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.6]" aria-hidden="true" />
          <span>{t('Nova')}</span>
        </button>
      </div>

      {aberta && (
        <div
          className="folha-fundo fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 py-[max(1rem,env(safe-area-inset-top))]"
          onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}
          data-teste="minhas-ocorrencias-lista"
        >
          <div
            ref={caixa}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            tabIndex={-1}
            className="ponto-entra w-full max-w-[420px] max-h-[min(80dvh,560px)] flex flex-col rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] shadow-2xl outline-none"
          >
            <div className="flex items-center gap-2 pl-4 pr-1.5 py-1.5 border-b border-[#E6E6E3] shrink-0">
              <h2 className="flex-1 min-w-0 text-[16px] font-bold text-[#111111] leading-tight">{titulo}</h2>
              <button type="button" onClick={fechar} aria-label={t('Fechar')} className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#4A4A4A] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0 divide-y divide-[#E6E6E3]">
              {ocorrencias.length === 0 ? (
                <p className="p-6 text-center text-[14px] text-[#4A4A4A]">{t('Ainda não reportou nenhuma ocorrência.')}</p>
              ) : (
                ocorrencias.map((occ) => (
                  <button
                    key={occ.id}
                    type="button"
                    onClick={() => { fechar(); onAbrir(occ); }}
                    className="w-full min-h-[60px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[#F4F4F2] cursor-pointer"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-[#111111] truncate">{occ.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-[#4A4A4A]">
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
          </div>
        </div>
      )}
    </>
  );
};
