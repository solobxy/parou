import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';

interface FolhaProps {
  aberta: boolean;
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  /** "larga" para editores com duas colunas no ecrã grande */
  largura?: 'normal' | 'larga';
}

const FOCAVEIS = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Janela da comunidade: no telemóvel sobe do fundo (ocupa quase todo o ecrã), no tablet e no computador
 * aparece ao centro. Fecha com Esc, toque fora ou no X; o foco fica preso lá dentro e volta ao sítio
 * de onde veio quando fecha.
 */
export const Folha: React.FC<FolhaProps> = ({ aberta, titulo, onFechar, children, rodape, largura = 'normal' }) => {
  const caixa = useRef<HTMLDivElement>(null);
  const aoFechar = useRef(onFechar);
  aoFechar.current = onFechar;

  useEffect(() => {
    if (!aberta) return;
    const origem = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar.current(); return; }
      if (e.key !== 'Tab' || !caixa.current) return;
      const lista = Array.from(caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((x) => x.offsetParent !== null);
      if (lista.length === 0) return;
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', aoTecla, true);
    const temporizador = setTimeout(() => {
      const alvo = caixa.current?.querySelector<HTMLElement>('[data-foco]');
      (alvo || caixa.current)?.focus({ preventScroll: true });
    }, 40);
    return () => {
      clearTimeout(temporizador);
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', aoTecla, true);
      try { origem?.focus?.({ preventScroll: true }); } catch {}
    };
  }, [aberta]);

  if (!aberta) return null;
  return (
    <div
      className="folha-fundo fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/45 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={`folha-entra w-full ${largura === 'larga' ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92dvh] sm:max-h-[88dvh] flex flex-col bg-[#FFFFFF] rounded-t-[20px] sm:rounded-[16px] border border-[#E6E6E3] shadow-2xl outline-none overflow-hidden`}
      >
        <div className="sm:hidden flex justify-center pt-2" aria-hidden="true">
          <span className="block w-10 h-1 rounded-full bg-[#D9D9D6]" />
        </div>
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-1 sm:pt-3 pb-1">
          <h2 className="text-[18px] font-bold text-[#111111] leading-tight">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label={t('Fechar')}
            className="-mr-2 w-11 h-11 rounded-full flex items-center justify-center text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 pb-4">{children}</div>
        {rodape && (
          <footer className="px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#E6E6E3] bg-[#FFFFFF]">{rodape}</footer>
        )}
      </div>
    </div>
  );
};
