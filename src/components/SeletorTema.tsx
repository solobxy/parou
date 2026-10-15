import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { t } from '../i18n';
import { EVENTO_TEMA, TEMAS, TemaId, mudarTema, temaAtual } from '../utils/tema';

/** Botão do topo para escolher o tema (Claro, Escuro, Âmbar ou Azul Porto). A escolha fica guardada neste aparelho. */
export const SeletorTema: React.FC = () => {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState<TemaId>(() => temaAtual());
  const raiz = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const aoMudar = (e: Event) => setAtual(((e as CustomEvent).detail as TemaId) || temaAtual());
    window.addEventListener(EVENTO_TEMA, aoMudar);
    return () => window.removeEventListener(EVENTO_TEMA, aoMudar);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent | TouchEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  const escolher = (id: TemaId) => { mudarTema(id); setAtual(id); setAberto(false); botao.current?.focus(); };

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={t('Escolher tema')}
        title={t('Tema')}
        className="w-10 max-[359px]:w-9 h-10 min-[420px]:w-11 min-[420px]:h-11 flex items-center justify-center rounded-[10px] text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer"
        data-teste="botao-tema"
      >
        <Palette className="w-5 h-5 stroke-[2]" aria-hidden="true" />
      </button>
      {aberto && (
        <div
          role="radiogroup"
          aria-label={t('Tema')}
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(264px,calc(100vw-24px))] rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-1.5 shadow-lg tema-menu"
          data-teste="menu-tema"
        >
          {TEMAS.map((x) => {
            const ativo = x.id === atual;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => escolher(x.id)}
                className={`w-full flex items-center gap-3 rounded-[10px] px-2 py-2 min-h-[52px] text-left cursor-pointer ${ativo ? 'bg-[#F4F4F2]' : 'hover:bg-[#F4F4F2]'}`}
                data-teste={`tema-${x.id}`}
              >
                <span aria-hidden="true" className="relative shrink-0 w-[44px] h-[34px] rounded-[8px] overflow-hidden border border-[#D5D5D0]" style={{ background: x.mini.fundo }}>
                  <span className="absolute left-[5px] right-[5px] top-[6px] h-[11px] rounded-[3px]" style={{ background: x.mini.cartao }} />
                  <span className="absolute left-[5px] bottom-[5px] w-[16px] h-[5px] rounded-full" style={{ background: x.mini.texto, opacity: 0.8 }} />
                  <span className="absolute right-[5px] bottom-[4px] w-[9px] h-[7px] rounded-[2px]" style={{ background: x.mini.destaque }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-[#111111] leading-tight">{t(x.nome)}</span>
                  <span className="block text-[12.5px] text-[#6B6B6B] leading-tight mt-0.5">{t(x.descricao)}</span>
                </span>
                {ativo && <Check className="w-4.5 h-4.5 shrink-0 stroke-[3] text-[#111111]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
