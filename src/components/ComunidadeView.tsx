import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, MoreHorizontal, MapPin, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { t, LOCALE } from '../i18n';
import { UserProfile } from '../types';
import { Avatar } from './Avatar';
import { AvatarEditor } from './AvatarEditor';
import { BotaoWhatsApp } from './BotaoWhatsApp';
import { Compositor } from './comunidade/Compositor';
import { Discussao } from './comunidade/Discussao';
import { AcoesConteudo, AlvoAcoes } from './comunidade/AcoesConteudo';
import { AutorLinha, EtiquetaTipo, Etiqueta, VotoPilula, OPERADORES_COMUNIDADE, textoDeErro } from './comunidade/pecas';
import { listarConversas, votar, Publicacao, TipoConversa, TIPOS_CONVERSA } from '../services/comunidade';
import { posicaoAtual } from '../utils/posicao';
import { aplicarMetaRota } from '../seo/rotasApp';

interface ComunidadeViewProps {
  currentUser: UserProfile | null;
  onOpenLoginModal: () => void;
}

type Ordem = 'novas' | 'em-alta' | 'perto';
const ORDENS: Array<{ id: Ordem; nome: string }> = [
  { id: 'novas', nome: 'Novas' },
  { id: 'em-alta', nome: 'Em alta' },
  { id: 'perto', nome: 'Perto de ti' },
];
const PLURAL_TIPO: Record<TipoConversa, string> = { queixa: 'Queixas', pergunta: 'Perguntas', elogio: 'Elogios', conversa: 'Conversas' };

const ROTA_CONVERSA = /^\/comunidade\/(pub-[a-z0-9]{1,12}-[a-f0-9]{10})\/?$/i;
const idDaRota = (): string | null => {
  try { return window.location.pathname.match(ROTA_CONVERSA)?.[1]?.toLowerCase() || null; } catch { return null; }
};

const REGRAS = [
  'Fala do serviço, não das pessoas. Não descrevas nem fotografes quem lá está.',
  'Sem links, telefones, emails nem outros dados pessoais.',
  'Respeita os outros. Insultos e ódio são apagados.',
  'Os operadores respondem com uma conta oficial, sempre marcada como “Oficial”. Ninguém paga para esconder críticas.',
  'Denuncia o que estiver mal: com 3 denúncias de contas diferentes, fica escondido até ser revisto.',
];

const ListaRegras: React.FC = () => (
  <ul className="space-y-2.5">
    {REGRAS.map((r) => (
      <li key={r} className="flex gap-2.5 text-[14px] leading-snug text-[#2B2B2B]">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#14693A]" aria-hidden="true" />
        <span>{t(r)}</span>
      </li>
    ))}
  </ul>
);

export const ComunidadeView: React.FC<ComunidadeViewProps> = ({ currentUser, onOpenLoginModal }) => {
  const [idAberto, setIdAberto] = useState<string | null>(() => idDaRota());
  const [ordem, setOrdem] = useState<Ordem>('novas');
  const [tipo, setTipo] = useState<TipoConversa | ''>('');
  const [operador, setOperador] = useState('');
  const [itens, setItens] = useState<Publicacao[]>([]);
  const [proxima, setProxima] = useState<number | null>(null);
  const [estado, setEstado] = useState<'a-carregar' | 'ok' | 'erro' | 'sem-posicao'>('a-carregar');
  const [aCarregarMais, setACarregarMais] = useState(false);
  const [posicao, setPosicao] = useState<{ lat: number; lon: number } | null>(null);
  const [compositor, setCompositor] = useState(false);
  const [editorAvatar, setEditorAvatar] = useState(false);
  const [acoes, setAcoes] = useState<AlvoAcoes | null>(null);
  const [aviso, setAviso] = useState('');
  const pedidoAtual = useRef(0);
  const scrollGuardado = useRef(0);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(''), 5000);
  }, []);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  // ---------- endereço: /comunidade e /comunidade/<conversa> ----------
  useEffect(() => {
    const aoMudar = () => setIdAberto(idDaRota());
    window.addEventListener('popstate', aoMudar);
    return () => window.removeEventListener('popstate', aoMudar);
  }, []);

  useEffect(() => { aplicarMetaRota(idAberto ? `/comunidade/${idAberto}` : '/comunidade'); }, [idAberto]);

  const abrir = (id: string) => {
    scrollGuardado.current = window.scrollY;
    try { window.history.pushState({ comunidade: id }, '', `/comunidade/${id}`); } catch {}
    setIdAberto(id);
    window.scrollTo(0, 0);
  };

  const fechar = () => {
    if (window.history.state && window.history.state.comunidade) {
      window.history.back(); // o popstate trata de mostrar a lista
    } else {
      try { window.history.pushState({}, '', '/comunidade'); } catch {}
      setIdAberto(null);
    }
  };

  // Ao voltar à lista, fica no sítio onde estava
  useEffect(() => {
    if (idAberto !== null) return;
    const f = requestAnimationFrame(() => window.scrollTo(0, scrollGuardado.current));
    return () => cancelAnimationFrame(f);
  }, [idAberto]);

  // ---------- lista ----------
  const carregar = useCallback(async (pagina: number, acrescentar: boolean) => {
    const meu = ++pedidoAtual.current;
    if (!acrescentar) setEstado('a-carregar');
    let pos = posicao;
    if (ordem === 'perto' && !pos) {
      try { pos = await posicaoAtual(); if (meu !== pedidoAtual.current) return; setPosicao(pos); }
      catch { if (meu === pedidoAtual.current) { setItens([]); setProxima(null); setEstado('sem-posicao'); } return; }
    }
    try {
      const r = await listarConversas({
        ordem: ordem === 'em-alta' ? 'em-alta' : 'novas',
        tipo,
        operador,
        pagina,
        ...(ordem === 'perto' && pos ? { lat: pos.lat, lon: pos.lon, raioKm: 15 } : {}),
      });
      if (meu !== pedidoAtual.current) return;
      setItens((antes) => (acrescentar ? [...antes, ...r.itens.filter((n) => !antes.some((a) => a.id === n.id))] : r.itens));
      setProxima(r.proxima);
      setEstado('ok');
    } catch {
      if (meu !== pedidoAtual.current) return;
      setEstado('erro');
    } finally {
      if (meu === pedidoAtual.current) setACarregarMais(false);
    }
  }, [ordem, tipo, operador, posicao]);

  const idUtilizador = currentUser?.userId || '';
  useEffect(() => { void carregar(0, false); }, [ordem, tipo, operador, idUtilizador]); // eslint-disable-line react-hooks/exhaustive-deps

  const mais = () => {
    if (proxima === null || aCarregarMais) return;
    setACarregarMais(true);
    void carregar(proxima, true);
  };

  // ---------- ações ----------
  const publicarNovo = () => (currentUser ? setCompositor(true) : onOpenLoginModal());

  const aoVotar = async (p: Publicacao, valor: -1 | 0 | 1) => {
    if (!currentUser) { onOpenLoginModal(); return; }
    const antes = { pontos: p.pontos, meuVoto: p.meuVoto };
    const aplicar = (v: { pontos: number; meuVoto: number }) => setItens((l) => l.map((x) => (x.id === p.id ? { ...x, ...v } : x)));
    aplicar({ pontos: p.pontos + valor - p.meuVoto, meuVoto: valor });
    try { aplicar(await votar(p.id, valor)); }
    catch (err: any) { aplicar(antes); mostrarAviso(textoDeErro(err)); }
  };

  const aoAlterar = (o: 'denunciado' | 'bloqueado' | 'apagado') => {
    if (o === 'denunciado') mostrarAviso(t('Obrigado. A denúncia foi enviada.'));
    if (o === 'bloqueado') mostrarAviso(t('Utilizador bloqueado.'));
    void carregar(0, false);
  };

  const aoPublicar = (id: string) => {
    setCompositor(false);
    void carregar(0, false);
    abrir(id);
  };

  const distancia = (km?: number) => (km === undefined ? '' : t('a {n} km', { n: km.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) }));

  // ---------- conversa aberta ----------
  const discussao = idAberto && (
    <Discussao
      id={idAberto}
      utilizador={currentUser}
      onEntrar={onOpenLoginModal}
      onVoltar={fechar}
      onDesapareceu={() => { void carregar(0, false); fechar(); }}
      onAlterada={(p) => {
        document.title = `${p.titulo} | ${t('Comunidade PAROU')}`;
        setItens((l) => l.map((x) => (x.id === p.id ? { ...x, pontos: p.pontos, respostas: p.respostas, meuVoto: p.meuVoto } : x)));
      }}
    />
  );

  const pontosAtuais = currentUser?.reputationPoints ?? 0;
  const proximaPeca = currentUser?.proximaPeca;
  const total = proximaPeca ? pontosAtuais + proximaPeca.falta : 0;

  const aside = (
    <aside className="space-y-3 lg:sticky lg:top-[72px] self-start" aria-label={t('Sobre a comunidade')}>
      <section className="hidden lg:block rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4">
        {currentUser ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar config={currentUser.avatar} tamanho={64} />
              <div className="min-w-0 leading-tight">
                <p className="text-[16px] font-bold text-[#111111] truncate">{currentUser.displayName}</p>
                <p className="text-[13px] text-[#6B6B6B] mt-0.5 tabular-nums">{t('{n} pts', { n: pontosAtuais })}</p>
              </div>
            </div>
            {proximaPeca ? (
              <div className="mt-3">
                <div className="h-2 rounded-full bg-[#ECECE8] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={pontosAtuais} aria-label={t('Progresso para a próxima peça')}>
                  <div className="h-full bg-[#FF6B1A]" style={{ width: `${Math.min(100, Math.round((pontosAtuais / Math.max(1, total)) * 100))}%` }} />
                </div>
                <p className="text-[12.5px] text-[#4A4A4A] mt-1.5">{t('Faltam {n} pts para: {nome}', { n: proximaPeca.falta, nome: t(proximaPeca.nome) })}</p>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#4A4A4A] mt-3">{t('Tens todas as peças. Obrigado por ajudares!')}</p>
            )}
            <button type="button" onClick={() => setEditorAvatar(true)} className="mt-3 w-full h-11 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14.5px] font-semibold text-[#111111] inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-[#ECECE8]">
              <Pencil className="w-4 h-4 stroke-[2]" aria-hidden="true" />{t('Personalizar avatar')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar tamanho={64} />
              <p className="text-[14.5px] text-[#2B2B2B] leading-snug">{t('Cria uma conta para publicar, responder e personalizar o teu avatar.')}</p>
            </div>
            <button type="button" onClick={onOpenLoginModal} className="mt-3 w-full h-11 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[14.5px] font-bold brand-chamfer cursor-pointer">{t('Entrar ou criar conta')}</button>
          </>
        )}
      </section>

      <section className="hidden lg:block rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4">
        <h2 className="text-[15px] font-bold text-[#111111] mb-3">{t('Regras da comunidade')}</h2>
        <ListaRegras />
      </section>

      <BotaoWhatsApp variante="cartao" />
    </aside>
  );

  return (
    <div data-teste="comunidade-vista" className="max-w-[1080px] mx-auto">
      {/* O feed fica montado (escondido) enquanto se lê uma conversa, para voltar ao mesmo sítio */}
      <div className={idAberto ? 'max-w-[680px] mx-auto' : 'hidden'}>{discussao}</div>

      <div className={idAberto ? 'hidden' : 'lg:grid lg:grid-cols-[minmax(0,680px)_320px] lg:gap-6 lg:justify-center'}>
        <div className="min-w-0 space-y-3">
          <header className="px-0.5 pt-1">
            <h1 className="text-[26px] sm:text-[30px] leading-tight font-bold text-[#111111] font-condensada tracking-tight">{t('Comunidade')}</h1>
            <p className="text-[14.5px] text-[#4A4A4A] mt-0.5">{t('Perguntas, queixas e elogios sobre os transportes. Sem anúncios.')}</p>
          </header>

          {/* Escrever */}
          <div className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-2.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => (currentUser ? setEditorAvatar(true) : onOpenLoginModal())}
              aria-label={currentUser ? t('Personalizar avatar') : t('Entrar ou criar conta')}
              className="lg:pointer-events-none w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
              data-teste="abrir-avatar"
            >
              <Avatar config={currentUser?.avatar} tamanho={40} />
            </button>
            <button
              type="button"
              onClick={publicarNovo}
              data-teste="abrir-compositor"
              className="flex-1 min-w-0 h-11 px-4 rounded-full bg-[#F4F4F2] border border-[#E6E6E3] text-left text-[15px] text-[#4A4A4A] truncate cursor-pointer hover:border-[#C9C9C4]"
            >
              {t('Escreve algo à comunidade…')}
            </button>
          </div>

          {/* Filtros */}
          <div className="space-y-2">
            <div role="radiogroup" aria-label={t('Ordenar')} className="grid grid-cols-3 gap-1 p-1 rounded-[14px] bg-[#ECECE8]">
              {ORDENS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={ordem === o.id}
                  data-teste={`ordem-${o.id}`}
                  onClick={() => setOrdem(o.id)}
                  className={`h-11 rounded-[10px] text-[14px] font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 ${ordem === o.id ? 'bg-[#FFFFFF] text-[#111111] shadow-sm' : 'text-[#4A4A4A] hover:text-[#111111]'}`}
                >
                  {o.id === 'perto' && <MapPin className="w-3.5 h-3.5 stroke-[2.4]" aria-hidden="true" />}
                  {t(o.nome)}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Tipo de publicação')}>
              {(['', ...TIPOS_CONVERSA] as Array<TipoConversa | ''>).map((x) => (
                <button
                  key={x || 'todas'}
                  type="button"
                  aria-pressed={tipo === x}
                  onClick={() => setTipo(x)}
                  className={`h-11 sm:h-10 px-3.5 rounded-full text-[13.5px] font-semibold border cursor-pointer ${tipo === x ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#D5D5D0] text-[#2B2B2B] hover:border-[#111111]'}`}
                >
                  {x ? t(PLURAL_TIPO[x]) : t('Todas')}
                </button>
              ))}
              <label className="sr-only" htmlFor="filtro-operador">{t('Operador')}</label>
              <select
                id="filtro-operador"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                className="h-11 sm:h-10 px-3 rounded-full text-[13.5px] font-semibold border border-[#D5D5D0] bg-[#FFFFFF] text-[#2B2B2B] max-w-full cursor-pointer"
              >
                <option value="">{t('Todos os operadores')}</option>
                {OPERADORES_COMUNIDADE.map((o) => <option key={o} value={o}>{t(o)}</option>)}
              </select>
            </div>
          </div>

          {aviso && <p role="status" className="text-[13.5px] font-semibold text-[#111111] bg-[#FFFFFF] border border-[#E6E6E3] rounded-[10px] p-2.5">{aviso}</p>}

          {/* Publicações */}
          <div aria-live="polite" aria-busy={estado === 'a-carregar'}>
            {estado === 'a-carregar' && (
              <ul className="space-y-3" aria-label={t('A carregar…')}>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4 animate-pulse">
                    <div className="flex gap-3 items-center"><div className="w-10 h-10 rounded-full bg-[#ECECE8]" /><div className="space-y-2 flex-1"><div className="h-3.5 w-1/3 rounded bg-[#ECECE8]" /><div className="h-3 w-1/5 rounded bg-[#F1F1EE]" /></div></div>
                    <div className="h-5 w-4/5 rounded bg-[#ECECE8] mt-4" /><div className="h-3.5 w-full rounded bg-[#F1F1EE] mt-3" /><div className="h-3.5 w-3/5 rounded bg-[#F1F1EE] mt-2" />
                  </li>
                ))}
              </ul>
            )}

            {estado === 'erro' && (
              <div className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-6 text-center" role="alert">
                <p className="text-[16px] font-bold text-[#111111]">{t('Não foi possível carregar a comunidade.')}</p>
                <p className="text-[14px] text-[#4A4A4A] mt-1">{t('Verifica a ligação e tenta outra vez.')}</p>
                <button type="button" onClick={() => void carregar(0, false)} className="mt-4 h-11 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14.5px] font-bold inline-flex items-center gap-2 cursor-pointer">
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />{t('Tentar outra vez')}
                </button>
              </div>
            )}

            {estado === 'sem-posicao' && (
              <div className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-6 text-center">
                <p className="text-[16px] font-bold text-[#111111]">{t('Precisamos da tua localização')}</p>
                <p className="text-[14px] text-[#4A4A4A] mt-1">{t('Para ver o que se passa à tua volta, permite a localização no browser. Só usamos a tua zona aproximada.')}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button type="button" onClick={() => void carregar(0, false)} className="h-11 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14.5px] font-bold cursor-pointer">{t('Tentar outra vez')}</button>
                  <button type="button" onClick={() => setOrdem('novas')} className="h-11 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14.5px] font-semibold text-[#111111] cursor-pointer">{t('Ver as novas')}</button>
                </div>
              </div>
            )}

            {estado === 'ok' && itens.length === 0 && (
              <div className="rounded-[16px] border border-dashed border-[#D5D5D0] bg-[#FFFFFF] p-7 text-center" data-teste="comunidade-vazia">
                <p className="text-[17px] font-bold text-[#111111]">{ordem === 'perto' ? t('Ainda não há nada por perto') : t('Ainda não há publicações aqui')}</p>
                <p className="text-[14.5px] text-[#4A4A4A] mt-1">{t('Sê o primeiro a escrever. Uma pergunta, uma queixa ou um elogio ajudam quem anda no mesmo transporte.')}</p>
                <button type="button" onClick={publicarNovo} className="mt-4 h-12 px-5 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[15px] font-bold brand-chamfer cursor-pointer">{t('Escrever a primeira')}</button>
              </div>
            )}

            {estado === 'ok' && itens.length > 0 && (
              <ul className="space-y-3">
                {itens.map((p) => (
                  <li key={p.id}>
                    <article
                      data-teste="cartao-publicacao"
                      onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, select, input')) abrir(p.id); }}
                      className="rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4 hover:border-[#C9C9C4] cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <AutorLinha autor={p.autor} momento={p.criado} />
                        <button
                          type="button"
                          aria-label={t('Mais opções')}
                          onClick={() => setAcoes({ id: p.id, meu: p.meu, denunciei: p.denunciei, ligacao: `${window.location.origin}/comunidade/${p.id}`, podeBloquear: !p.autor.apagada })}
                          className="-mr-2 -mt-1 h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#4A4A4A] hover:bg-[#F4F4F2] cursor-pointer"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <EtiquetaTipo tipo={p.tipo} />
                        {p.estado === 'oculta' && <Etiqueta>{t('À espera de revisão')}</Etiqueta>}
                        {p.operador && <Etiqueta>{t(p.operador)}</Etiqueta>}
                        {p.linha && <Etiqueta>{t('Linha {n}', { n: p.linha })}</Etiqueta>}
                        {p.distanciaKm !== undefined && <Etiqueta>{distancia(p.distanciaKm)}</Etiqueta>}
                      </div>

                      <h2 className="mt-2 text-[18px] leading-[1.25] font-bold text-[#111111] break-words [overflow-wrap:anywhere]">
                        <a
                          href={`/comunidade/${p.id}`}
                          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); abrir(p.id); }}
                          className="hover:underline"
                        >
                          {p.titulo}
                        </a>
                      </h2>
                      {p.texto && <p className="mt-1.5 text-[15px] leading-[1.5] text-[#2B2B2B] line-clamp-3 break-words [overflow-wrap:anywhere]">{p.texto}</p>}

                      <div className="mt-3 flex items-center gap-3">
                        <VotoPilula pontos={p.pontos} meuVoto={p.meuVoto} desativado={p.meu} aoVotar={(v) => aoVotar(p, v)} />
                        <button
                          type="button"
                          onClick={() => abrir(p.id)}
                          className="h-11 px-3 -ml-1 rounded-full inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#4A4A4A] hover:bg-[#F4F4F2] cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
                          {p.respostas === 1 ? t('1 resposta') : t('{n} respostas', { n: p.respostas })}
                        </button>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}

            {estado === 'ok' && proxima !== null && (
              <div className="pt-3 flex justify-center">
                <button type="button" onClick={mais} disabled={aCarregarMais} className="h-12 px-6 rounded-[10px] bg-[#FFFFFF] border border-[#D5D5D0] text-[14.5px] font-bold text-[#111111] cursor-pointer hover:border-[#111111] disabled:opacity-50">
                  {aCarregarMais ? t('A carregar…') : t('Ver mais')}
                </button>
              </div>
            )}
          </div>

          {/* Regras no telemóvel e tablet (no computador ficam ao lado) */}
          <details className="lg:hidden rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4">
            <summary className="text-[15px] font-bold text-[#111111] cursor-pointer min-h-[28px]">{t('Regras da comunidade')}</summary>
            <div className="mt-3"><ListaRegras /></div>
          </details>
          <div className="lg:hidden"><BotaoWhatsApp variante="cartao" /></div>
        </div>

        <div className="hidden lg:block">{aside}</div>
      </div>

      <Compositor aberta={compositor} onFechar={() => setCompositor(false)} onPublicado={aoPublicar} />
      {currentUser && (
        <AvatarEditor
          aberta={editorAvatar}
          onFechar={() => setEditorAvatar(false)}
          avatar={currentUser.avatar}
          pontos={pontosAtuais}
          onGuardado={() => setEditorAvatar(false)}
        />
      )}
      <AcoesConteudo alvo={acoes} onFechar={() => setAcoes(null)} onMudou={aoAlterar} temSessao={!!currentUser} onPedirLogin={onOpenLoginModal} />
    </div>
  );
};

