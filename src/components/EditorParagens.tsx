// Ecrã "Adicionar paragens" (como o do Uber): a partida em cima e, por baixo, uma linha por paragem onde se
// escreve o local. Cada linha tem a pega ≡ para arrastar (ou as setas, com o teclado) e o ✕ para tirar;
// "+ Adicionar paragem" junta mais uma (até 5). "Ver rotas" devolve a lista pela ordem que ficou.

import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, MapPin, Plus, RefreshCw, X } from 'lucide-react';
import { t } from '../i18n';
import { searchDestinations } from '../services/pertoApi';
import { MAX_DESTINOS, novoUid, type Ponto } from '../services/rotaVarios';
import { useVoltarFecha } from '../utils/janelas';
import type { DestinationSuggestion } from '../types/perto';

/** Uma linha do editor: o texto escrito e (se já foi escolhido nos resultados) o local */
export interface LinhaEditor {
  /** Identifica a linha no ecrã (não muda quando se escolhe o local, para o campo não perder o cursor) */
  chave: string;
  /** Identifica o local escolhido (muda quando o local muda: é o que faz recalcular os percursos) */
  uid: string;
  texto: string;
  dest: DestinationSuggestion | null;
  /** Minutos que se fica nesta paragem antes de seguir (guardado para quando a linha já existia) */
  permanencia: number;
}

export const linhaVazia = (texto = ''): LinhaEditor => ({ chave: novoUid(), uid: novoUid(), texto, dest: null, permanencia: 0 });

interface Props {
  /** Nome da partida (por omissão, "A tua localização") */
  origemNome?: string;
  /** Para dar prioridade aos resultados perto de quem pesquisa */
  origem: Ponto;
  linhas: LinhaEditor[];
  /** Linha que arranca com o cursor (o teclado abre logo); -1 = nenhuma */
  ativaInicial: number;
  onFechar: () => void;
  onConfirmar: (linhas: LinhaEditor[]) => void;
}

/** Altura de cada linha (h-14): serve para calcular para onde vai a linha que se arrasta */
const ALTURA = 56;

const FOCAVEIS = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function lerVisual(): { top: number; h: number } | null {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv ? { top: Math.round(vv.offsetTop), h: Math.round(vv.height) } : null;
}

/** A parte do ecrã que se vê (o teclado do telemóvel tapa o fundo): o ecrã ajusta-se a ela */
function useAreaVisivel() {
  const [v, setV] = useState(lerVisual);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setV(lerVisual());
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);
  return v;
}

const limitar = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

export const EditorParagens: React.FC<Props> = ({ origemNome, origem, linhas: inicial, ativaInicial, onFechar, onConfirmar }) => {
  useVoltarFecha(true, onFechar);
  const visivel = useAreaVisivel();
  const caixa = useRef<HTMLDivElement>(null);
  const aoFechar = useRef(onFechar);
  aoFechar.current = onFechar;

  const [linhas, setLinhas] = useState<LinhaEditor[]>(() => (inicial.length ? inicial : [linhaVazia()]));
  const [ativa, setAtiva] = useState<string | null>(() => inicial[ativaInicial]?.chave ?? null);
  const [foco, setFoco] = useState<{ chave: string } | null>(() => {
    const l = inicial[ativaInicial];
    return l ? { chave: l.chave } : null;
  });
  const campos = useRef(new Map<string, HTMLInputElement>());
  const [resultado, setResultado] = useState<{ chave: string; lista: DestinationSuggestion[]; falhou: boolean } | null>(null);
  const [arrasto, setArrasto] = useState<{ de: number; dy: number } | null>(null);
  const inicioArrasto = useRef<{ y: number; de: number } | null>(null);

  const n = linhas.length;
  const linhaAtiva = linhas.find((l) => l.chave === ativa) || null;
  const chaveAtiva = linhaAtiva ? `${linhaAtiva.chave}|${linhaAtiva.texto}` : '';
  const aPesquisar = Boolean(linhaAtiva && !linhaAtiva.dest && linhaAtiva.texto.trim().length >= 2);
  const textoPendente = linhas.find((l) => !l.dest && l.texto.trim().length > 0);
  const escolhidas = linhas.filter((l) => l.dest).length;
  const podeConfirmar = escolhidas > 0 && !textoPendente;

  // Bloqueia o deslize do fundo e prende o Tab lá dentro (como as outras janelas)
  useEffect(() => {
    const origemFoco = document.activeElement as HTMLElement | null;
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
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', aoTecla, true);
      try { origemFoco?.focus?.({ preventScroll: true }); } catch {}
    };
  }, []);

  // Pede o cursor numa linha (depois de ela existir no ecrã)
  useEffect(() => {
    if (!foco) return;
    const id = setTimeout(() => {
      const el = campos.current.get(foco.chave);
      if (el) el.focus();
      else caixa.current?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(id);
  }, [foco]);

  // Pesquisa dos locais para a linha onde se escreve
  useEffect(() => {
    if (!linhaAtiva || !aPesquisar) return;
    let atual = true;
    const texto = linhaAtiva.texto.trim();
    const chave = chaveAtiva;
    const id = setTimeout(async () => {
      try {
        const lista = await searchDestinations(texto, origem.lat, origem.lon);
        if (atual) setResultado({ chave, lista, falhou: false });
      } catch {
        if (atual) setResultado({ chave, lista: [], falhou: true });
      }
    }, 120);
    return () => { atual = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveAtiva, aPesquisar]);

  const sugestoes = aPesquisar && resultado?.chave === chaveAtiva ? resultado : null;

  const mudarTexto = (chave: string, texto: string) => {
    // Escrever de novo desfaz a escolha anterior desta linha
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, texto, dest: null } : x)));
  };

  /** Passa o cursor para a próxima linha por preencher (ou, se não houver, fecha o teclado) */
  const seguinte = (lista: LinhaEditor[], depoisDe: string) => {
    const i = lista.findIndex((x) => x.chave === depoisDe);
    const ordem = [...lista.slice(i + 1), ...lista.slice(0, i + 1)];
    const vazia = ordem.find((x) => !x.dest);
    if (vazia) { setAtiva(vazia.chave); setFoco({ chave: vazia.chave }); }
    else { setAtiva(null); campos.current.get(depoisDe)?.blur(); }
  };

  const escolher = (chave: string, sug: DestinationSuggestion) => {
    const lista = linhas.map((x) => (x.chave === chave ? { ...x, uid: novoUid(), texto: sug.title, dest: sug } : x));
    setLinhas(lista);
    setResultado(null);
    seguinte(lista, chave);
  };

  const juntar = () => {
    if (n >= MAX_DESTINOS) return;
    const nova = linhaVazia();
    setLinhas((l) => [...l, nova]);
    setAtiva(nova.chave);
    setFoco({ chave: nova.chave });
  };

  const tirar = (chave: string) => {
    if (n <= 1) {
      // Última linha: só se limpa
      const nova = linhaVazia();
      setLinhas([nova]);
      setAtiva(nova.chave);
      setFoco({ chave: nova.chave });
      return;
    }
    setLinhas((l) => l.filter((x) => x.chave !== chave));
    if (ativa === chave) setAtiva(null);
  };

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= n || para === de) return;
    setLinhas((l) => {
      const copia = [...l];
      const [x] = copia.splice(de, 1);
      copia.splice(para, 0, x);
      return copia;
    });
  };

  const confirmar = () => {
    if (!podeConfirmar) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    onConfirmar(linhas.filter((l) => l.dest));
  };

  // Arrastar pela pega ≡ (rato, dedo ou caneta)
  const aoPressionar = (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    inicioArrasto.current = { y: e.clientY, de: i };
    setArrasto({ de: i, dy: 0 });
  };
  const aoMoverPega = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ini = inicioArrasto.current;
    if (!ini) return;
    setArrasto({ de: ini.de, dy: limitar(e.clientY - ini.y, -ini.de * ALTURA, (n - 1 - ini.de) * ALTURA) });
  };
  const aoSoltarPega = (e: React.PointerEvent<HTMLButtonElement>) => {
    const ini = inicioArrasto.current;
    inicioArrasto.current = null;
    if (!ini) return;
    const dy = limitar(e.clientY - ini.y, -ini.de * ALTURA, (n - 1 - ini.de) * ALTURA);
    setArrasto(null);
    mover(ini.de, limitar(Math.round(ini.de + dy / ALTURA), 0, n - 1));
  };
  const aoTeclaPega = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); mover(i, i - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); mover(i, i + 1); }
  };

  const paraOnde = arrasto ? limitar(Math.round(arrasto.de + arrasto.dy / ALTURA), 0, n - 1) : -1;
  const estiloLinha = (i: number): React.CSSProperties | undefined => {
    if (!arrasto) return undefined;
    if (i === arrasto.de) return { transform: `translateY(${arrasto.dy}px)`, zIndex: 10, transition: 'none' };
    if (arrasto.de < paraOnde && i > arrasto.de && i <= paraOnde) return { transform: `translateY(-${ALTURA}px)` };
    if (arrasto.de > paraOnde && i >= paraOnde && i < arrasto.de) return { transform: `translateY(${ALTURA}px)` };
    return undefined;
  };

  const aoTeclaCampo = (e: React.KeyboardEvent<HTMLInputElement>, l: LinhaEditor) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!l.dest && sugestoes?.lista.length) { escolher(l.chave, sugestoes.lista[0]); return; }
    if (podeConfirmar) { confirmar(); return; }
    if (l.dest) seguinte(linhas, l.chave);
  };

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-[70] flex items-stretch sm:items-center justify-center sm:p-6 sm:bg-black/45"
      style={visivel ? { top: visivel.top, bottom: 'auto', height: visivel.h } : undefined}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-paragens-titulo"
        tabIndex={-1}
        data-teste="editor-paragens"
        className="folha-entra w-full h-full sm:h-auto sm:max-h-[min(88dvh,680px)] sm:max-w-lg flex flex-col bg-[#FFFFFF] sm:rounded-[16px] sm:border sm:border-[#E6E6E3] sm:shadow-2xl outline-none overflow-hidden pt-[env(safe-area-inset-top)] sm:pt-0"
      >
        <header className="shrink-0 flex items-center justify-between gap-3 pl-4 sm:pl-5 pr-2 sm:pr-3 pt-2 pb-1">
          <h2 id="editor-paragens-titulo" className="text-[18px] font-bold text-[#111111] leading-tight">{t('Adicionar paragens')}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label={t('Fechar')}
            className="w-11 h-11 rounded-full flex items-center justify-center text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 pt-2 pb-4">
          <div className="rounded-[16px] bg-[#F4F4F2] overflow-hidden">
            {/* Partida */}
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 pl-3 pr-2 h-14" data-teste="editor-origem">
              <div className="relative" aria-hidden="true">
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block w-3.5 h-3.5 rounded-full bg-[#FFFFFF] border-[3px] border-[#111111]" />
                <span className="absolute left-1/2 -translate-x-1/2 top-1/2 bottom-0 mt-[7px] w-0.5 bg-[#D5D5D0]" />
              </div>
              <p className="self-center text-[15px] font-medium text-[#111111] truncate">{origemNome || t('A tua localização')}</p>
            </div>

            {/* Paragens */}
            <ol className="relative">
              {linhas.map((l, i) => {
                const aArrastar = arrasto?.de === i;
                const ativaAqui = ativa === l.chave;
                return (
                  <li
                    key={l.chave}
                    style={estiloLinha(i)}
                    className={`relative grid grid-cols-[28px_minmax(0,1fr)_40px_40px] gap-x-2.5 pl-3 pr-1 h-14 motion-reduce:transition-none transition-transform duration-150 ${
                      aArrastar ? 'bg-[#FFFFFF] shadow-[0_6px_18px_rgba(17,17,17,0.18)] rounded-[12px]' : ativaAqui ? 'bg-[#FFFFFF]' : ''
                    }`}
                    data-teste="editor-linha"
                  >
                    <div className="relative" aria-hidden="true">
                      <span className="absolute left-1/2 -translate-x-1/2 top-0 h-[calc(50%-14px)] w-0.5 bg-[#D5D5D0]" />
                      <span className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#111111] text-[#FFFFFF] ring-2 ring-[#FF6B1A] flex items-center justify-center font-condensada text-[15px] font-bold tabular-nums">{i + 1}</span>
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-0 h-[calc(50%-14px)] w-0.5 bg-[#D5D5D0]" />
                    </div>
                    <div className="min-w-0 flex items-center border-t border-[#E6E6E3]">
                      <input
                        ref={(el) => { if (el) campos.current.set(l.chave, el); else campos.current.delete(l.chave); }}
                        type="text"
                        value={l.texto}
                        onChange={(e) => mudarTexto(l.chave, e.target.value)}
                        onFocus={() => setAtiva(l.chave)}
                        onKeyDown={(e) => aoTeclaCampo(e, l)}
                        placeholder={n === 1 ? t('Para onde?') : t('Adicionar paragem')}
                        aria-label={t('Paragem {n}', { n: i + 1 })}
                        enterKeyHint={podeConfirmar ? 'go' : 'search'}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full h-full bg-transparent text-[16px] font-medium text-[#111111] placeholder-[#6B6B6B] focus:outline-none truncate"
                      />
                    </div>
                    <button
                      type="button"
                      onPointerDown={(e) => aoPressionar(e, i)}
                      onPointerMove={aoMoverPega}
                      onPointerUp={aoSoltarPega}
                      onPointerCancel={() => { inicioArrasto.current = null; setArrasto(null); }}
                      onKeyDown={(e) => aoTeclaPega(e, i)}
                      aria-label={t('Mudar a ordem da paragem {n}', { n: i + 1 })}
                      title={t('Arrastar para mudar a ordem')}
                      className={`touch-none select-none self-center h-14 w-10 flex items-center justify-center text-[#6B6B6B] ${n > 1 ? 'cursor-grab active:cursor-grabbing' : 'invisible'}`}
                      tabIndex={n > 1 ? 0 : -1}
                    >
                      <GripVertical className="w-5 h-5 stroke-[2]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => tirar(l.chave)}
                      aria-label={n > 1 ? t('Tirar a paragem {n}', { n: i + 1 }) : t('Limpar')}
                      className={`self-center h-14 w-10 flex items-center justify-center text-[#6B6B6B] hover:text-[#111111] cursor-pointer ${n > 1 || l.texto ? '' : 'invisible'}`}
                      tabIndex={n > 1 || l.texto ? 0 : -1}
                    >
                      <X className="w-[18px] h-[18px] stroke-[2.25]" />
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* + Adicionar paragem */}
            {n < MAX_DESTINOS && (
              <button
                type="button"
                onClick={juntar}
                data-teste="editor-juntar"
                className="w-full grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 pl-3 pr-3 h-14 text-left cursor-pointer active:bg-[#E6E6E3] hover:bg-[#EDEDEA]"
              >
                <div className="relative" aria-hidden="true">
                  <span className="absolute left-1/2 -translate-x-1/2 top-0 h-[calc(50%-12px)] w-0.5 bg-[#D5D5D0]" />
                  <Plus className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-[#111111] stroke-[2.25]" />
                </div>
                <span className="h-full min-w-0 flex items-center gap-2 border-t border-[#E6E6E3] text-[15px] font-semibold text-[#111111]">
                  <span className="truncate">{t('Adicionar paragem')}</span>
                  <span className="text-[#6B6B6B] font-medium tabular-nums">{n}/{MAX_DESTINOS}</span>
                </span>
              </button>
            )}
          </div>

          {/* Resultados da pesquisa da linha ativa */}
          {aPesquisar && (
            <div className="mt-3" aria-live="polite">
              {sugestoes && sugestoes.lista.length > 0 ? (
                <ul className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[12px] divide-y divide-[#E6E6E3] overflow-hidden" data-teste="editor-sugestoes">
                  {sugestoes.lista.map((sug, k) => (
                    <li key={`${sug.id}-${k}`}>
                      <button
                        type="button"
                        // O toque não tira o cursor ao campo antes de a escolha ser feita
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => linhaAtiva && escolher(linhaAtiva.chave, sug)}
                        className="w-full text-left px-3 py-2.5 hover:bg-[#F4F4F2] active:bg-[#F4F4F2] flex items-center gap-2.5 cursor-pointer min-h-[48px]"
                      >
                        <MapPin className="w-4 h-4 text-[#6B6B6B] shrink-0 stroke-[2]" />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold text-[#111111] truncate">{sug.title}</span>
                          {sug.subtitle && <span className="block text-[12px] text-[#6B6B6B] truncate">{sug.subtitle}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : sugestoes ? (
                <p className="text-[13.5px] text-[#6B6B6B] leading-snug px-1">
                  {sugestoes.falhou
                    ? t('Não foi possível pesquisar agora. Verifica a ligação e tenta outra vez.')
                    : t('Não encontrámos «{t}». Tenta outro nome ou morada.', { t: linhaAtiva?.texto.trim() || '' })}
                </p>
              ) : (
                <p className="text-[13.5px] text-[#6B6B6B] px-1 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[2] shrink-0" />
                  {t('A procurar…')}
                </p>
              )}
            </div>
          )}
          {!aPesquisar && (
            <p className="mt-3 px-1 text-[12.5px] text-[#6B6B6B] leading-snug">
              {n > 1
                ? t('Arrasta ≡ para mudar a ordem. As rotas são calculadas por esta ordem.')
                : t('Escreve o local ou a morada. Com "+ Adicionar paragem" podes juntar até {n} paragens na mesma viagem.', { n: MAX_DESTINOS })}
            </p>
          )}
        </div>

        <footer className="shrink-0 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#E6E6E3] bg-[#FFFFFF]">
          {textoPendente && !aPesquisar && (
            <p className="text-[12.5px] text-[#6B6B6B] mb-2 truncate">{t('Escolhe um dos resultados para «{t}».', { t: textoPendente.texto.trim() })}</p>
          )}
          <button
            type="button"
            onClick={confirmar}
            disabled={!podeConfirmar}
            data-teste="editor-confirmar"
            className="w-full h-12 rounded-[12px] bg-[#111111] text-[#FFFFFF] text-[15px] font-bold cursor-pointer disabled:bg-[#E6E6E3] disabled:text-[#6B6B6B] disabled:cursor-default"
          >
            {t('Ver rotas')}
          </button>
        </footer>
      </div>
    </div>
  );
};
