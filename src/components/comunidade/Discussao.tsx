import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, MoreHorizontal, CornerDownRight, ChevronDown, ChevronUp, EyeOff, RefreshCw } from 'lucide-react';
import { t } from '../../i18n';
import { UserProfile } from '../../types';
import { Avatar } from '../Avatar';
import {
  lerConversa, responder as enviarResposta, votar, Publicacao, Resposta,
} from '../../services/comunidade';
import { AutorLinha, EtiquetaTipo, Etiqueta, VotoPilula, textoDeErro } from './pecas';
import { AcoesConteudo, AlvoAcoes } from './AcoesConteudo';

interface DiscussaoProps {
  id: string;
  utilizador: UserProfile | null;
  onEntrar: () => void;
  onVoltar: () => void;
  /** a publicação deixou de existir ou foi apagada */
  onDesapareceu?: () => void;
  /** pontos e votos mudaram (para a lista atualizar sem recarregar) */
  onAlterada?: (p: Publicacao) => void;
}

interface No { r: Resposta; filhos: No[] }
type Ordem = 'melhores' | 'recentes';

function construirArvore(respostas: Resposta[], ordem: Ordem): No[] {
  const nos = new Map<string, No>(respostas.map((r) => [r.id, { r, filhos: [] }]));
  const raizes: No[] = [];
  for (const r of respostas) {
    const no = nos.get(r.id) as No;
    const pai = r.paiId ? nos.get(r.paiId) : undefined;
    (pai ? pai.filhos : raizes).push(no);
  }
  const comparar = ordem === 'melhores'
    ? (a: No, b: No) => (b.r.pontos - a.r.pontos) || (a.r.criado - b.r.criado)
    : (a: No, b: No) => b.r.criado - a.r.criado;
  const ordenar = (lista: No[]) => { lista.sort(comparar); lista.forEach((n) => ordenar(n.filhos)); };
  ordenar(raizes);
  return raizes;
}

const contarDescendentes = (n: No): number => n.filhos.reduce((s, f) => s + 1 + contarDescendentes(f), 0);

// ---------------------------------------------------------------------------------------------
// Caixa para escrever uma resposta
// ---------------------------------------------------------------------------------------------
const CaixaResposta: React.FC<{
  utilizador: UserProfile | null;
  onEntrar: () => void;
  onEnviar: (texto: string) => Promise<void>;
  onCancelar?: () => void;
  autoFoco?: boolean;
  placeholder: string;
  rotulo: string;
}> = ({ utilizador, onEntrar, onEnviar, onCancelar, autoFoco, placeholder, rotulo }) => {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (autoFoco) campo.current?.focus({ preventScroll: false }); }, [autoFoco]);

  if (!utilizador) {
    return (
      <div className="rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] p-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[200px] text-[14.5px] text-[#4A4A4A]">{t('Entra na tua conta para responder.')}</p>
        <button type="button" onClick={onEntrar} className="h-11 px-4 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[14.5px] font-bold brand-chamfer cursor-pointer">
          {t('Entrar')}
        </button>
      </div>
    );
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || aEnviar) return;
    setAEnviar(true);
    setErro('');
    try { await onEnviar(texto.trim()); setTexto(''); }
    catch (err: any) { setErro(textoDeErro(err)); }
    finally { setAEnviar(false); }
  };

  return (
    <form onSubmit={enviar} className="flex gap-2.5 items-start">
      <Avatar config={utilizador.avatar} tamanho={36} className="mt-1 hidden min-[380px]:block" />
      <div className="flex-1 min-w-0">
        <label className="sr-only" htmlFor={`resp-${rotulo}`}>{placeholder}</label>
        <textarea
          id={`resp-${rotulo}`}
          ref={campo}
          value={texto}
          maxLength={1000}
          rows={3}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-[#FFFFFF] border border-[#D5D5D0] rounded-[10px] text-[16px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] resize-y min-h-[84px]"
        />
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[12.5px] text-[#6B6B6B] tabular-nums">{texto.length}/1000</span>
          <div className="flex gap-2">
            {onCancelar && (
              <button type="button" onClick={onCancelar} className="h-11 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14.5px] font-semibold text-[#111111] cursor-pointer">
                {t('Cancelar')}
              </button>
            )}
            <button
              type="submit"
              disabled={!texto.trim() || aEnviar}
              data-teste="enviar-resposta"
              className="h-11 px-5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14.5px] font-bold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {aEnviar ? t('A enviar…') : t('Responder')}
            </button>
          </div>
        </div>
        {erro && <p role="alert" className="mt-2 text-[13.5px] font-semibold text-[#9F1D14] bg-[#FDECEA] rounded-[10px] p-2.5">{erro}</p>}
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------------------------
// Uma resposta (e, dentro dela, as que lhe respondem)
// ---------------------------------------------------------------------------------------------
interface ContextoResposta {
  utilizador: UserProfile | null;
  onEntrar: () => void;
  aResponderA: string | null;
  definirResposta: (id: string | null) => void;
  enviar: (texto: string, paiId: string) => Promise<void>;
  aoVotar: (id: string, valor: -1 | 0 | 1) => void;
  abrirAcoes: (alvo: AlvoAcoes) => void;
  recolhidas: Set<string>;
  alternarRecolha: (id: string) => void;
}

const MAX_NIVEIS_VISUAIS = 3; // a partir daqui não se recua mais (o texto não fica espremido no telemóvel)

const NoResposta: React.FC<{ no: No; nivel: number; ctx: ContextoResposta }> = ({ no, nivel, ctx }) => {
  const { r } = no;
  const recolhida = ctx.recolhidas.has(r.id);
  const total = contarDescendentes(no);
  const semConteudo = r.apagada || r.escondida || r.bloqueada;

  const marcador = r.apagada
    ? t('Esta resposta foi apagada.')
    : r.bloqueada
      ? t('Resposta de um utilizador que bloqueaste.')
      : t('Resposta escondida por denúncias, à espera de revisão.');

  return (
    <li className="list-none">
      <div className="py-2.5" data-teste="resposta" id={r.id}>
        {semConteudo ? (
          <p className="flex items-center gap-2 text-[14px] text-[#6B6B6B] italic min-h-[36px]">
            <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />{marcador}
          </p>
        ) : (
          <>
            <AutorLinha autor={r.autor} momento={r.criado} oficial={r.oficial} tamanho={32} />
            <p className="mt-2 text-[15.5px] leading-[1.5] text-[#111111] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{r.texto}</p>
            <div className="mt-1.5 flex items-center flex-wrap gap-x-1 gap-y-0.5 -ml-1">
              <VotoPilula pontos={r.pontos} meuVoto={r.meuVoto} desativado={r.meu} aoVotar={(v) => ctx.aoVotar(r.id, v)} />
              <button
                type="button"
                onClick={() => (ctx.utilizador ? ctx.definirResposta(ctx.aResponderA === r.id ? null : r.id) : ctx.onEntrar())}
                className="h-11 px-3 rounded-full inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#4A4A4A] hover:bg-[#F4F4F2] cursor-pointer"
                aria-expanded={ctx.aResponderA === r.id}
              >
                <CornerDownRight className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />{t('Responder')}
              </button>
              <button
                type="button"
                aria-label={t('Mais opções')}
                onClick={() => ctx.abrirAcoes({ id: r.id, meu: r.meu, denunciei: r.denunciei, podeBloquear: !r.autor.apagada })}
                className="h-11 w-11 rounded-full flex items-center justify-center text-[#4A4A4A] hover:bg-[#F4F4F2] cursor-pointer"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
        {ctx.aResponderA === r.id && !semConteudo && (
          <div className="mt-2">
            <CaixaResposta
              utilizador={ctx.utilizador}
              onEntrar={ctx.onEntrar}
              onEnviar={(texto) => ctx.enviar(texto, r.id)}
              onCancelar={() => ctx.definirResposta(null)}
              autoFoco
              placeholder={t('Responder a {nome}', { nome: r.autor.nome })}
              rotulo={r.id}
            />
          </div>
        )}
        {total > 0 && (
          <button
            type="button"
            onClick={() => ctx.alternarRecolha(r.id)}
            aria-expanded={!recolhida}
            className="mt-0.5 h-11 pr-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#4A4A4A] hover:text-[#111111] cursor-pointer"
          >
            {recolhida ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronUp className="w-4 h-4" aria-hidden="true" />}
            {recolhida
              ? (total === 1 ? t('Mostrar 1 resposta') : t('Mostrar {n} respostas', { n: total }))
              : t('Esconder respostas')}
          </button>
        )}
      </div>
      {no.filhos.length > 0 && !recolhida && (
        <ul className={nivel < MAX_NIVEIS_VISUAIS ? 'ml-3.5 pl-3 sm:ml-[18px] sm:pl-4 border-l-2 border-[#E6E6E3]' : 'border-t border-[#EFEFEC]'}>
          {no.filhos.map((f) => <NoResposta key={f.r.id} no={f} nivel={nivel + 1} ctx={ctx} />)}
        </ul>
      )}
    </li>
  );
};

// ---------------------------------------------------------------------------------------------
// Ecrã da conversa
// ---------------------------------------------------------------------------------------------
export const Discussao: React.FC<DiscussaoProps> = ({ id, utilizador, onEntrar, onVoltar, onDesapareceu, onAlterada }) => {
  const [dados, setDados] = useState<{ publicacao: Publicacao; respostas: Resposta[] } | null>(null);
  const [estado, setEstado] = useState<'a-carregar' | 'ok' | 'nao-existe' | 'rede'>('a-carregar');
  const [ordem, setOrdem] = useState<Ordem>('melhores');
  const [aResponderA, setAResponderA] = useState<string | null>(null);
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [acoes, setAcoes] = useState<AlvoAcoes | null>(null);
  const [aviso, setAviso] = useState('');
  const votosEmCurso = useRef(0);
  const avisoTimer = useRef<ReturnType<typeof setTimeout>>();

  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(''), 5000);
  }, []);
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  const carregar = useCallback(async (silencioso = false) => {
    try {
      const d = await lerConversa(id);
      if (silencioso && votosEmCurso.current > 0) return;
      setDados(d);
      setEstado('ok');
      onAlterada?.(d.publicacao);
    } catch (err: any) {
      if (err?.estado === 404) { setEstado('nao-existe'); setDados(null); return; }
      if (!silencioso) setEstado('rede');
    }
  }, [id, onAlterada]);

  useEffect(() => {
    setDados(null);
    setEstado('a-carregar');
    setAResponderA(null);
    setRecolhidas(new Set());
    void carregar();
  }, [id, carregar]);

  // Respostas novas aparecem sozinhas enquanto a conversa está aberta
  useEffect(() => {
    const a = setInterval(() => { if (!document.hidden) void carregar(true); }, 20_000);
    return () => clearInterval(a);
  }, [carregar]);

  // Quando a sessão muda (entrar/sair), os votos e as marcas "meu" mudam
  const idUtilizador = utilizador?.userId || '';
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    void carregar(true);
  }, [idUtilizador, carregar]);

  const arvore = useMemo(() => construirArvore(dados?.respostas || [], ordem), [dados, ordem]);

  const aplicar = (alvoId: string, f: (x: { pontos: number; meuVoto: number }) => { pontos: number; meuVoto: number }) => {
    setDados((d) => {
      if (!d) return d;
      if (d.publicacao.id === alvoId) return { ...d, publicacao: { ...d.publicacao, ...f(d.publicacao) } };
      return { ...d, respostas: d.respostas.map((r) => (r.id === alvoId ? { ...r, ...f(r) } : r)) };
    });
  };

  const aoVotar = async (alvoId: string, valor: -1 | 0 | 1) => {
    if (!utilizador) { onEntrar(); return; }
    const atual = dados && (dados.publicacao.id === alvoId ? dados.publicacao : dados.respostas.find((r) => r.id === alvoId));
    if (!atual) return;
    const antes = { pontos: atual.pontos, meuVoto: atual.meuVoto };
    aplicar(alvoId, (x) => ({ pontos: x.pontos + valor - x.meuVoto, meuVoto: valor }));
    votosEmCurso.current++;
    try {
      const r = await votar(alvoId, valor);
      aplicar(alvoId, () => ({ pontos: r.pontos, meuVoto: r.meuVoto }));
    } catch (err: any) {
      aplicar(alvoId, () => antes);
      mostrarAviso(textoDeErro(err));
    } finally { votosEmCurso.current--; }
  };

  const enviar = async (texto: string, paiId: string | null) => {
    await enviarResposta(id, texto, paiId);
    setAResponderA(null);
    await carregar(true);
  };

  const aoMudar = (o: 'denunciado' | 'bloqueado' | 'apagado') => {
    if (o === 'apagado' && acoes && dados && acoes.id === dados.publicacao.id) { onDesapareceu?.(); return; }
    if (o === 'denunciado') mostrarAviso(t('Obrigado. A denúncia foi enviada.'));
    if (o === 'bloqueado') mostrarAviso(t('Utilizador bloqueado.'));
    void carregar(true);
  };

  const ctx: ContextoResposta = {
    utilizador,
    onEntrar,
    aResponderA,
    definirResposta: setAResponderA,
    enviar,
    aoVotar,
    abrirAcoes: setAcoes,
    recolhidas,
    alternarRecolha: (rid) => setRecolhidas((s) => { const n = new Set(s); if (n.has(rid)) n.delete(rid); else n.add(rid); return n; }),
  };

  const voltar = (
    <button
      type="button"
      onClick={onVoltar}
      className="-ml-2 h-11 px-2 pr-3 inline-flex items-center gap-1.5 rounded-full text-[14.5px] font-semibold text-[#111111] hover:bg-[#E6E6E3] cursor-pointer"
    >
      <ArrowLeft className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />{t('Comunidade')}
    </button>
  );

  if (estado === 'a-carregar') {
    return (
      <div aria-busy="true">
        {voltar}
        <div className="mt-2 rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4 space-y-3 animate-pulse" aria-label={t('A carregar…')}>
          <div className="flex gap-3 items-center"><div className="w-10 h-10 rounded-full bg-[#ECECE8]" /><div className="space-y-2 flex-1"><div className="h-3.5 w-1/3 rounded bg-[#ECECE8]" /><div className="h-3 w-1/4 rounded bg-[#F1F1EE]" /></div></div>
          <div className="h-6 w-4/5 rounded bg-[#ECECE8]" />
          <div className="h-3.5 w-full rounded bg-[#F1F1EE]" /><div className="h-3.5 w-11/12 rounded bg-[#F1F1EE]" /><div className="h-3.5 w-2/3 rounded bg-[#F1F1EE]" />
        </div>
      </div>
    );
  }

  if (estado === 'nao-existe' || estado === 'rede' || !dados) {
    const semRede = estado === 'rede';
    return (
      <div>
        {voltar}
        <div className="mt-2 rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-6 text-center" role="alert">
          <p className="text-[17px] font-bold text-[#111111]">{semRede ? t('Não foi possível carregar a conversa.') : t('Esta conversa já não está disponível.')}</p>
          <p className="text-[14.5px] text-[#4A4A4A] mt-1">{semRede ? t('Verifica a ligação e tenta outra vez.') : t('Pode ter sido apagada ou estar à espera de revisão.')}</p>
          <div className="mt-4 flex justify-center gap-2">
            {semRede && (
              <button type="button" onClick={() => { setEstado('a-carregar'); void carregar(); }} className="h-11 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14.5px] font-bold inline-flex items-center gap-2 cursor-pointer">
                <RefreshCw className="w-4 h-4" aria-hidden="true" />{t('Tentar outra vez')}
              </button>
            )}
            <button type="button" onClick={onVoltar} className="h-11 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14.5px] font-semibold text-[#111111] cursor-pointer">
              {t('Ver a comunidade')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const p = dados.publicacao;
  const apagada = p.estado === 'apagada';
  const oculta = p.estado === 'oculta';
  const aceitaRespostas = p.estado === 'visivel';
  const ligacao = typeof window !== 'undefined' ? `${window.location.origin}/comunidade/${p.id}` : undefined;
  const totalRespostas = dados.respostas.filter((r) => !r.apagada).length;

  return (
    <div>
      {voltar}

      <article className="mt-2 rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] p-4 sm:p-5" aria-labelledby="titulo-conversa">
        <div className="flex items-start justify-between gap-2">
          <AutorLinha autor={p.autor} momento={p.criado} oficial={undefined} />
          {!apagada && (
            <button
              type="button"
              aria-label={t('Mais opções')}
              onClick={() => setAcoes({ id: p.id, meu: p.meu, denunciei: p.denunciei, ligacao, podeBloquear: !p.autor.apagada })}
              className="-mr-2 -mt-1 h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#4A4A4A] hover:bg-[#F4F4F2] cursor-pointer"
              data-teste="acoes-publicacao"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>

        {oculta && (
          <p role="status" className="mt-3 text-[13.5px] font-semibold text-[#8A4B00] bg-[#FFF4E0] rounded-[10px] p-2.5">
            {t('Esta publicação está escondida por denúncias, à espera de revisão. Só tu a consegues ver.')}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <EtiquetaTipo tipo={p.tipo} />
          {p.operador && <Etiqueta>{t(p.operador)}</Etiqueta>}
          {p.linha && <Etiqueta>{t('Linha {n}', { n: p.linha })}</Etiqueta>}
          {p.comLocalizacao && <Etiqueta>{t('Zona aproximada')}</Etiqueta>}
        </div>

        <h1 id="titulo-conversa" className="mt-2.5 text-[22px] sm:text-[26px] leading-[1.2] font-bold text-[#111111] break-words [overflow-wrap:anywhere]">
          {apagada ? t('Publicação apagada') : p.titulo}
        </h1>
        {!apagada && p.texto && (
          <p className="mt-2.5 text-[16px] leading-[1.55] text-[#1F1F1F] whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-[68ch]">{p.texto}</p>
        )}

        {!apagada && (
          <div className="mt-3 flex items-center gap-3">
            <VotoPilula pontos={p.pontos} meuVoto={p.meuVoto} desativado={p.meu || !aceitaRespostas} aoVotar={(v) => aoVotar(p.id, v)} />
            <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#4A4A4A]">
              <MessageSquare className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
              {totalRespostas === 1 ? t('1 resposta') : t('{n} respostas', { n: totalRespostas })}
            </span>
          </div>
        )}
      </article>

      <section className="mt-4" aria-label={t('Respostas')}>
        {aceitaRespostas ? (
          <div className="rounded-[16px] bg-[#F9F9F7] border border-[#E6E6E3] p-3 sm:p-4">
            <CaixaResposta
              utilizador={utilizador}
              onEntrar={onEntrar}
              onEnviar={(texto) => enviar(texto, null)}
              placeholder={t('Escreve uma resposta')}
              rotulo="topo"
            />
          </div>
        ) : (
          <p className="text-[14px] text-[#6B6B6B] px-1">{t('Esta publicação já não aceita respostas.')}</p>
        )}

        {aviso && <p role="status" className="mt-3 text-[13.5px] font-semibold text-[#111111] bg-[#FFFFFF] border border-[#E6E6E3] rounded-[10px] p-2.5">{aviso}</p>}

        {arvore.length > 1 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#4A4A4A]">{t('Ordenar')}</span>
            <div role="radiogroup" aria-label={t('Ordenar respostas')} className="inline-flex p-0.5 rounded-full bg-[#ECECE8]">
              {(['melhores', 'recentes'] as Ordem[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={ordem === o}
                  onClick={() => setOrdem(o)}
                  className={`h-10 px-4 rounded-full text-[13.5px] font-bold cursor-pointer ${ordem === o ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#4A4A4A] hover:text-[#111111]'}`}
                >
                  {o === 'melhores' ? t('Melhores') : t('Mais recentes')}
                </button>
              ))}
            </div>
          </div>
        )}

        {arvore.length === 0 ? (
          aceitaRespostas && (
            <div className="mt-4 rounded-[16px] border border-dashed border-[#D5D5D0] p-6 text-center">
              <p className="text-[16px] font-bold text-[#111111]">{t('Ainda ninguém respondeu')}</p>
              <p className="text-[14px] text-[#4A4A4A] mt-1">{t('Sê o primeiro a ajudar ou a dizer o que achas.')}</p>
            </div>
          )
        ) : (
          <ul className="mt-2 rounded-[16px] bg-[#FFFFFF] border border-[#E6E6E3] px-3 sm:px-4 divide-y divide-[#EFEFEC]" data-teste="lista-respostas">
            {arvore.map((n) => <NoResposta key={n.r.id} no={n} nivel={0} ctx={ctx} />)}
          </ul>
        )}
      </section>

      <AcoesConteudo
        alvo={acoes}
        onFechar={() => setAcoes(null)}
        onMudou={aoMudar}
        temSessao={!!utilizador}
        onPedirLogin={onEntrar}
      />
    </div>
  );
};
