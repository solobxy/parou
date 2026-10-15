import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { t } from '../../i18n';
import { useVoltarFecha } from '../../utils/janelas';

/**
 * Imagem inteira por cima da Comunidade: fica DENTRO da app (nunca abre o ficheiro da imagem como se fosse uma página,
 * o que fazia a app arrancar de novo no endereço da imagem e mostrar «Página não encontrada»).
 * Fecha com o X, com o fundo, com Esc e com o gesto de voltar do telemóvel; com várias imagens passa-se de uma à outra
 * com os botões, as setas do teclado ou deslizando o dedo.
 */
const Visualizador: React.FC<{ imagens: string[]; inicio: number; alt: string; aoFechar: () => void }> = ({ imagens, inicio, alt, aoFechar }) => {
  const [i, setI] = useState(inicio);
  const caixa = useRef<HTMLDivElement>(null);
  const dedo = useRef<{ x: number; y: number } | null>(null);
  const varias = imagens.length > 1;
  useVoltarFecha(true, aoFechar);

  const ir = useCallback((passo: number) => {
    setI((atual) => Math.min(imagens.length - 1, Math.max(0, atual + passo)));
  }, [imagens.length]);

  useEffect(() => {
    caixa.current?.focus();
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); aoFechar(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); ir(1); }
    };
    window.addEventListener('keydown', teclas, true);
    // O ecrã de trás não anda enquanto a imagem está aberta
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', teclas, true);
      document.body.style.overflow = antes;
    };
  }, [aoFechar, ir]);

  const botao = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-white/15 text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white cursor-pointer disabled:opacity-35 disabled:cursor-default disabled:hover:bg-white/15';

  return createPortal(
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      data-teste="imagem-grande"
      className="folha-fundo fixed inset-0 z-[80] flex flex-col bg-black/90 outline-none overscroll-contain select-none"
      style={{ touchAction: 'pinch-zoom' }}
      onClick={(e) => {
        // Esta janela está dentro do cartão do post (para o React): o toque não pode abrir a conversa
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest('img,button')) aoFechar();
      }}
      onTouchStart={(e) => { const d = e.touches[0]; dedo.current = d ? { x: d.clientX, y: d.clientY } : null; }}
      onTouchEnd={(e) => {
        const ini = dedo.current;
        dedo.current = null;
        const fim = e.changedTouches[0];
        if (!ini || !fim) return;
        const dx = fim.clientX - ini.x;
        const dy = fim.clientY - ini.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
        else if (dy > 110 && dy > Math.abs(dx) * 1.5) aoFechar();
      }}
    >
      <div className="shrink-0 flex items-center justify-between gap-3 pl-4 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span data-teste="imagem-contador" className="font-condensada text-[17px] leading-none text-white tabular-nums" aria-live="polite">
          {varias ? `${i + 1} / ${imagens.length}` : ''}
        </span>
        <button type="button" onClick={aoFechar} aria-label={t('Fechar')} data-teste="imagem-fechar" className={botao}>
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-3 py-2">
        <img
          key={imagens[i]}
          src={imagens[i]}
          alt={`${alt}${varias ? ` (${i + 1}/${imagens.length})` : ''}`}
          width={1080}
          height={1080}
          draggable={false}
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-[12px]"
        />
      </div>

      {varias && (
        <div className="shrink-0 flex items-center justify-center gap-6 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => ir(-1)} disabled={i === 0} aria-label={t('Anterior')} data-teste="imagem-anterior" className={botao}>
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => ir(1)} disabled={i === imagens.length - 1} aria-label={t('Seguinte')} data-teste="imagem-seguinte" className={botao}>
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
};

/** Imagens de uma novidade da PAROU: quadradas, com cantos redondos; tocar abre a imagem inteira, dentro da app. */
export const ImagensPost: React.FC<{ imagens?: string[]; alt: string; grande?: boolean }> = ({ imagens, alt, grande }) => {
  const [aberta, setAberta] = useState<number | null>(null);
  const origem = useRef<HTMLElement | null>(null);
  const fechar = useCallback(() => {
    setAberta(null);
    // O foco volta à miniatura que se tocou
    setTimeout(() => { try { origem.current?.focus({ preventScroll: true }); } catch {} }, 0);
  }, []);
  if (!imagens || !imagens.length) return null;
  const varias = imagens.length > 1;
  return (
    <div
      className={`mt-3 grid gap-2 ${varias ? 'grid-cols-2' : 'grid-cols-1'} ${varias ? (grande ? 'max-w-[640px]' : 'max-w-[520px]') : (grande ? 'max-w-[480px]' : 'max-w-[360px]')}`}
      data-teste="imagens-post"
    >
      {imagens.map((src, i) => (
        <button
          key={src}
          type="button"
          onClick={(e) => { e.stopPropagation(); origem.current = e.currentTarget; setAberta(i); }}
          aria-label={t('Abrir imagem {n}', { n: i + 1 })}
          className="block w-full overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-[#F4F4F2] aspect-square p-0 cursor-zoom-in"
        >
          <img
            src={src}
            alt={`${alt}${varias ? ` (${i + 1}/${imagens.length})` : ''}`}
            width={1080}
            height={1080}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </button>
      ))}
      {aberta !== null && <Visualizador imagens={imagens} inicio={aberta} alt={alt} aoFechar={fechar} />}
    </div>
  );
};
