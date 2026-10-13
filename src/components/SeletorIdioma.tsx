import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { IDIOMAS, idioma, mudarIdioma, t, type Idioma } from '../i18n';
import { Bandeira } from './Bandeira';

/** Nome de cada idioma na própria língua (nunca se traduz: quem não percebe o idioma atual reconhece o seu) */
export const NOME_IDIOMA: Record<Idioma, string> = { pt: 'Português', en: 'English', de: 'Deutsch', fr: 'Français' };
const LANG_ATRIBUTO: Record<Idioma, string> = { pt: 'pt-PT', en: 'en', de: 'de', fr: 'fr' };

/** Botão do topo com a bandeira do idioma em uso; abre a lista de idiomas (cada um com a sua bandeira). */
export const SeletorIdioma: React.FC = () => {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; largura: number } | null>(null);

  // O menu alinha-se ao botão mas nunca sai do ecrã (o botão fica longe do canto direito em ecrãs estreitos)
  useLayoutEffect(() => {
    if (!aberto || !botao.current) { setPos(null); return; }
    const r = botao.current.getBoundingClientRect();
    const margem = 12;
    const largura = Math.min(232, window.innerWidth - margem * 2);
    const left = Math.max(margem, Math.min(r.right - largura, window.innerWidth - margem - largura));
    setPos({ left, top: r.bottom + 6, largura });
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    window.addEventListener('resize', fechar);
    return () => window.removeEventListener('resize', fechar);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent | TouchEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  const escolher = (novo: Idioma) => {
    setAberto(false);
    if (novo !== idioma) mudarIdioma(novo);
  };

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={`${t('Mudar de idioma')} (${NOME_IDIOMA[idioma]})`}
        title={t('Mudar de idioma')}
        className="w-10 max-[359px]:w-9 h-10 min-[420px]:w-11 min-[420px]:h-11 flex items-center justify-center rounded-[10px] hover:bg-[#F4F4F2] transition-colors cursor-pointer"
        data-teste="mudar-idioma"
      >
        <Bandeira idioma={idioma} />
      </button>
      {aberto && (
        <div
          role="radiogroup"
          aria-label={t('Idioma')}
          className="fixed z-50 rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-1.5 shadow-lg tema-menu"
          style={pos ? { left: pos.left, top: pos.top, width: pos.largura } : { visibility: 'hidden' }}
          data-teste="menu-idioma"
        >
          {IDIOMAS.map((l) => {
            const ativo = l === idioma;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={ativo}
                lang={LANG_ATRIBUTO[l]}
                onClick={() => escolher(l)}
                className={`w-full flex items-center gap-3 rounded-[10px] px-2.5 py-2 min-h-[48px] text-left cursor-pointer ${ativo ? 'bg-[#F4F4F2]' : 'hover:bg-[#F4F4F2]'}`}
                data-teste={`idioma-${l}`}
              >
                <Bandeira idioma={l} className="w-[30px] h-[20px]" />
                <span className="min-w-0 flex-1 text-[15px] font-bold text-[#111111] leading-tight">{NOME_IDIOMA[l]}</span>
                {ativo && <Check className="w-4.5 h-4.5 shrink-0 stroke-[3] text-[#111111]" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
