import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Database, Menu, MessageSquare, Radio, X } from 'lucide-react';
import { IDIOMAS, idioma, mudarIdioma, t } from '../i18n';
import { EVENTO_TEMA, TEMAS, TemaId, mudarTema, temaAtual } from '../utils/tema';
import { Bandeira } from './Bandeira';
import { NOME_IDIOMA } from './SeletorIdioma';
import { BotaoInstalarPagina } from './InstalarApp';

type Separador = 'reclamacoes' | 'catalogo';

interface Props {
  /** Abre um separador da app (no telemóvel estes não têm lugar na barra de baixo) */
  onAbrir?: (s: Separador) => void;
  onAbrirFontes?: () => void;
}

/**
 * Um só botão no topo para o que se muda poucas vezes: idioma, tema, instalar a app e as páginas que no telemóvel não
 * cabem na barra de baixo. Antes eram 3 ícones soltos (bandeira, paleta, instalar), cada um com o seu estilo.
 * No telemóvel abre por baixo (folha); no computador, encostado ao botão.
 */
export const MenuApp: React.FC<Props> = ({ onAbrir, onAbrirFontes }) => {
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState<TemaId>(() => temaAtual());
  const botao = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const aoMudar = (e: Event) => setTema(((e as CustomEvent).detail as TemaId) || temaAtual());
    window.addEventListener(EVENTO_TEMA, aoMudar);
    return () => window.removeEventListener(EVENTO_TEMA, aoMudar);
  }, []);

  const fechar = (devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    // O foco vai para dentro do menu (quem usa teclado ou leitor de ecrã continua a partir dali)
    const id = window.setTimeout(() => painel.current?.querySelector<HTMLElement>('button, a')?.focus(), 30);
    return () => { document.removeEventListener('keydown', tecla); window.clearTimeout(id); };
  }, [aberto]);

  const ir = (s: Separador) => { fechar(false); onAbrir?.(s); };
  const ligacao = 'flex items-center gap-3 w-full min-h-[48px] px-1 text-left text-[15px] font-semibold text-[#111111] cursor-pointer rounded-[10px] hover:bg-[#F4F4F2]';

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={t('Abrir o menu')}
        title={t('Menu')}
        className="w-10 max-[359px]:w-9 h-10 min-[420px]:w-11 min-[420px]:h-11 flex items-center justify-center rounded-[10px] text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer"
        data-teste="botao-menu"
      >
        <Menu className="w-5 h-5 stroke-[2]" aria-hidden="true" />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[60]" data-teste="menu-app">
          <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/30 lg:bg-transparent cursor-default" onClick={() => fechar()} />
          <div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-label={t('Menu')}
            className="folha-entra absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[20px] bg-[#FFFFFF] px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-[60px] lg:w-[360px] lg:rounded-[16px] lg:border lg:border-[#E6E6E3] lg:pb-4"
          >
            <header className="flex items-center justify-between">
              <h2 className="font-condensada text-[22px] leading-none font-bold text-[#111111]">{t('Menu')}</h2>
              <button type="button" onClick={() => fechar()} aria-label={t('Fechar')} className="-mr-2 w-11 h-11 flex items-center justify-center rounded-full text-[#111111] hover:bg-[#F4F4F2] cursor-pointer">
                <X className="w-5 h-5 stroke-[2.25]" aria-hidden="true" />
              </button>
            </header>

            <div className="mt-2 [&_[data-teste=instalar-pagina-botao]]:w-full">
              <BotaoInstalarPagina />
            </div>

            <section className="mt-5" aria-labelledby="menu-idioma-titulo">
              <h3 id="menu-idioma-titulo" className="text-[13px] font-semibold text-[#6B6B6B]">{t('Idioma')}</h3>
              <div role="radiogroup" aria-labelledby="menu-idioma-titulo" className="mt-2 grid grid-cols-2 gap-2" data-teste="menu-idioma">
                {IDIOMAS.map((l) => {
                  const ativo = l === idioma;
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      lang={l === 'pt' ? 'pt-PT' : l}
                      onClick={() => { if (!ativo) mudarIdioma(l); else fechar(); }}
                      className={`flex items-center gap-2.5 min-h-[48px] px-3 rounded-[12px] border text-left cursor-pointer ${ativo ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3] hover:bg-[#F4F4F2]'}`}
                      data-teste={`idioma-${l}`}
                    >
                      <Bandeira idioma={l} className="w-[26px] h-[18px] shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-[#111111]">{NOME_IDIOMA[l]}</span>
                      {ativo && <Check className="w-4 h-4 shrink-0 stroke-[3] text-[#111111]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-5" aria-labelledby="menu-tema-titulo">
              <h3 id="menu-tema-titulo" className="text-[13px] font-semibold text-[#6B6B6B]">{t('Tema')}</h3>
              <div role="radiogroup" aria-labelledby="menu-tema-titulo" className="mt-2 grid grid-cols-4 gap-2" data-teste="menu-tema">
                {TEMAS.map((x) => {
                  const ativo = x.id === tema;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      title={t(x.descricao)}
                      onClick={() => { mudarTema(x.id); setTema(x.id); }}
                      className={`flex flex-col items-center gap-1.5 rounded-[12px] border p-1.5 pb-2 cursor-pointer ${ativo ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3] hover:bg-[#F4F4F2]'}`}
                      data-teste={`tema-${x.id}`}
                    >
                      <span aria-hidden="true" className="relative w-full h-[38px] rounded-[8px] overflow-hidden border border-[#D5D5D0]" style={{ background: x.mini.fundo }}>
                        <span className="absolute left-[5px] right-[5px] top-[6px] h-[12px] rounded-[3px]" style={{ background: x.mini.cartao }} />
                        <span className="absolute left-[5px] bottom-[5px] w-[40%] h-[5px] rounded-full" style={{ background: x.mini.texto, opacity: 0.8 }} />
                        <span className="absolute right-[5px] bottom-[4px] w-[10px] h-[8px] rounded-[2px]" style={{ background: x.mini.destaque }} />
                      </span>
                      <span className="text-[13px] font-bold text-[#111111] leading-none">{t(x.nome)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* No telemóvel a barra de baixo só tem 5 lugares: o resto fica aqui (no computador está no «Mais» do topo) */}
            {(onAbrir || onAbrirFontes) && (
              <nav className="mt-5 pt-2 border-t border-[#E6E6E3] lg:hidden" aria-label={t('Mais')}>
                {onAbrir && (
                  <button type="button" onClick={() => ir('reclamacoes')} className={ligacao}>
                    <MessageSquare className="w-5 h-5 stroke-[2] text-[#6B6B6B]" aria-hidden="true" />
                    <span className="flex-1">{t('Reclamações')}</span>
                    <ChevronRight className="w-4 h-4 stroke-[2.25] text-[#6B6B6B]" aria-hidden="true" />
                  </button>
                )}
                {onAbrir && (
                  <button type="button" onClick={() => ir('catalogo')} className={ligacao}>
                    <Database className="w-5 h-5 stroke-[2] text-[#6B6B6B]" aria-hidden="true" />
                    <span className="flex-1">{t('Catálogo')}</span>
                    <ChevronRight className="w-4 h-4 stroke-[2.25] text-[#6B6B6B]" aria-hidden="true" />
                  </button>
                )}
                {onAbrirFontes && (
                  <button type="button" onClick={() => { fechar(false); onAbrirFontes(); }} className={ligacao}>
                    <Radio className="w-5 h-5 stroke-[2] text-[#6B6B6B]" aria-hidden="true" />
                    <span className="flex-1">{t('Fontes')}</span>
                    <ChevronRight className="w-4 h-4 stroke-[2.25] text-[#6B6B6B]" aria-hidden="true" />
                  </button>
                )}
              </nav>
            )}

            <p className="mt-4 pt-3 border-t border-[#E6E6E3] flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
              <a href="/sobre" className="min-h-[40px] inline-flex items-center font-semibold text-[#111111] underline-offset-4 hover:underline">{t('Sobre a PAROU')}</a>
              <a href="/contactar" className="min-h-[40px] inline-flex items-center font-semibold text-[#111111] underline-offset-4 hover:underline">{t('Contactar')}</a>
              <a href="/privacidade" className="min-h-[40px] inline-flex items-center font-semibold text-[#111111] underline-offset-4 hover:underline">{t('Privacidade')}</a>
            </p>
          </div>
        </div>
      )}
    </>
  );
};
