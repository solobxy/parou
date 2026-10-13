import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Gift, Pencil, X } from 'lucide-react';
import { t, tn } from '../i18n';
import { Avatar } from './Avatar';
import { useVoltarFecha } from '../utils/janelas';
import { atualizarSessao, resgatarPontoDiario, utilizadorAutenticado } from '../services/conta';
import { estadoDoPonto, formatarContagem, quandoFicaPronto, usePontoDiario } from '../hooks/usePontoDiario';
import { exclusivasDe, temTudoAberto } from '../utils/avatarCatalogo';
import type { UserProfile } from '../types';

// Ponto diário: um aviso pequeno, sempre o primeiro a aparecer quando se abre a app com sessão iniciada e há
// um ponto por resgatar. Só fecha no X (ou resgatando). Se a pessoa o fechar, volta na próxima vez que abrir
// a app (ou que voltar a ela depois de uns minutos fora); depois de resgatar, só quando passarem 24 h.

const AvatarEditor = React.lazy(() => import('./AvatarEditor').then((m) => ({ default: m.AvatarEditor })));

/** Quanto tempo fora da app conta como "abrir a app outra vez" (no telemóvel a app fica em segundo plano em vez de fechar) */
const AUSENCIA_QUE_CONTA_MS = 5 * 60_000;
const FOCAVEIS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Fase = 'pronto' | 'a-resgatar' | 'feito';

export const PontoDiario: React.FC<{ user: UserProfile | null }> = ({ user }) => {
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<Fase>('pronto');
  const [resgatadoAgora, setResgatadoAgora] = useState(false);
  const [erro, setErro] = useState('');
  const [editor, setEditor] = useState(false);
  const [antes, setAntes] = useState<{ nome: string; falta: number } | null>(null);
  const avaliadoPara = useRef<string | null>(null);
  const escondidoDesde = useRef<number | null>(null);
  const abertoRef = useRef(false);
  const editorRef = useRef(false);
  const caixa = useRef<HTMLDivElement>(null);
  const ponto = usePontoDiario(user);
  abertoRef.current = aberto;
  editorRef.current = editor;

  const abrir = useCallback((u: UserProfile) => {
    setFase('pronto');
    setResgatadoAgora(false);
    setErro('');
    setAntes(u.proximaPeca ?? null);
    setAberto(true);
  }, []);
  const fechar = useCallback(() => setAberto(false), []);
  useVoltarFecha(aberto, fechar);

  // 1) Ao abrir a app (ou entrar na conta): se há ponto por resgatar, aparece primeiro
  useEffect(() => {
    if (!user) {
      avaliadoPara.current = null;
      setAberto(false);
      setEditor(false);
      return;
    }
    if (avaliadoPara.current === user.userId || !user.resgate) return;
    avaliadoPara.current = user.userId;
    if (estadoDoPonto(user)?.disponivel) abrir(user);
  }, [user, abrir]);

  // 2) No telemóvel a app fica em segundo plano em vez de fechar: voltar a ela depois de uns minutos conta como abrir
  const idDoUtilizador = user?.userId;
  useEffect(() => {
    if (!idDoUtilizador) return;
    const aoMudar = () => {
      if (document.hidden) { escondidoDesde.current = Date.now(); return; }
      const desde = escondidoDesde.current;
      escondidoDesde.current = null;
      if (desde === null || Date.now() - desde < AUSENCIA_QUE_CONTA_MS) return;
      void atualizarSessao().then(() => {
        const u = utilizadorAutenticado();
        if (u && !abertoRef.current && estadoDoPonto(u)?.disponivel) abrir(u);
      });
    };
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, [idDoUtilizador, abrir]);

  // Foco no botão principal, Esc fecha e o Tab fica preso dentro do aviso
  useEffect(() => {
    if (!aberto) return;
    const origem = document.activeElement as HTMLElement | null;
    const aoTecla = (e: KeyboardEvent) => {
      if (editorRef.current || !caixa.current) return; // o editor do avatar (por cima) trata das suas teclas
      if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); return; }
      if (e.key !== 'Tab') return;
      const lista = Array.from(caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((x) => x.offsetParent !== null);
      if (lista.length === 0) return;
      const primeiro = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', aoTecla, true);
    const temporizador = setTimeout(() => {
      (caixa.current?.querySelector<HTMLElement>('[data-foco]') || caixa.current)?.focus({ preventScroll: true });
    }, 40);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener('keydown', aoTecla, true);
      try { origem?.focus?.({ preventScroll: true }); } catch {}
    };
  }, [aberto]);

  const resgatar = async () => {
    if (fase === 'a-resgatar') return;
    setFase('a-resgatar');
    setErro('');
    try {
      const r = await resgatarPontoDiario();
      setResgatadoAgora(r.resgatado);
      setFase('feito');
    } catch (err: any) {
      setFase('pronto');
      setErro(t(err?.message || 'Não foi possível resgatar agora. Tenta outra vez.'));
    }
  };

  if (!user || !ponto) return null;
  const editorAvatar = editor ? (
    <React.Suspense fallback={null}>
      <AvatarEditor
        aberta
        onFechar={() => setEditor(false)}
        avatar={user.avatar}
        pontos={user.reputationPoints}
        tudoAberto={temTudoAberto(user)}
        exclusivas={exclusivasDe(user)}
        onGuardado={() => setEditor(false)}
      />
    </React.Suspense>
  ) : null;
  if (!aberto) return editorAvatar;

  const pronto = fase === 'a-resgatar' || ponto.disponivel;
  const pontos = user.reputationPoints;
  const peca = user.proximaPeca;
  const pct = peca ? Math.max(4, Math.min(100, Math.round((pontos / (pontos + peca.falta)) * 100))) : 0;
  const abriuPeca = !pronto && resgatadoAgora && antes && antes.falta <= 1 ? antes : null;

  const titulo = pronto ? t('O teu ponto de hoje') : resgatadoAgora ? t('Ponto resgatado!') : t('Já resgataste o ponto de hoje');
  const subtitulo = pronto
    ? t('Resgata 1 ponto de reputação para abrires peças novas no teu avatar.')
    : tn(pontos, 'Tens {n} ponto de reputação.', 'Tens {n} pontos de reputação.');

  return (
    <>
      <div
        className="folha-fundo fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/35 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        data-teste="ponto-diario"
      >
        <div
          ref={caixa}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ponto-diario-titulo"
          tabIndex={-1}
          className="folha-entra relative w-full max-w-[340px] rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] shadow-2xl p-4 outline-none"
        >
          <button
            type="button"
            onClick={fechar}
            aria-label={t('Fechar')}
            data-teste="ponto-diario-fechar"
            className="absolute right-1 top-1 w-11 h-11 rounded-full flex items-center justify-center text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>

          <div className="flex items-center gap-3 pr-9">
            <span className="relative shrink-0">
              <Avatar config={user.avatar} tamanho={48} />
              <span
                aria-hidden="true"
                className={`absolute -right-2 -bottom-1 min-w-[26px] h-[22px] px-1.5 rounded-full flex items-center justify-center font-condensada text-[14px] leading-none font-bold tabular-nums border-2 border-[#FFFFFF] ${
                  pronto ? 'bg-[#FF6B1A] text-[#111111]' : 'bg-[#111111] text-[#FFFFFF] ponto-mais'
                }`}
              >
                {pronto ? '+1' : <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </span>
            </span>
            <div className="min-w-0">
              <h2 id="ponto-diario-titulo" className="text-[16px] font-bold leading-tight text-[#111111]">{titulo}</h2>
              <p className="text-[13px] leading-snug text-[#4A4A4A] mt-0.5">{subtitulo}</p>
            </div>
          </div>

          {(peca || abriuPeca) && (
            <div className="mt-3">
              {peca && (
                <div className="h-2 rounded-full bg-[#E6E6E3] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('Progresso para a próxima peça')}>
                  <div className="h-full rounded-full bg-[#FF6B1A] transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
                </div>
              )}
              <p className={`text-[12.5px] text-[#4A4A4A] leading-snug ${peca ? 'mt-1.5' : ''}`}>
                {abriuPeca && <><strong className="text-[#111111]">{t('Desbloqueaste: {nome}!', { nome: t(abriuPeca.nome) })}</strong>{' '}</>}
                {peca && t('Faltam {n} pts para: {nome}', { n: peca.falta, nome: t(peca.nome) })}
              </p>
            </div>
          )}

          {pronto ? (
            <>
              <button
                type="button"
                data-foco
                onClick={() => void resgatar()}
                disabled={fase === 'a-resgatar'}
                aria-busy={fase === 'a-resgatar'}
                data-teste="ponto-diario-resgatar"
                className="mt-3.5 w-full h-12 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[15px] font-bold brand-chamfer inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
              >
                <Gift className="w-[18px] h-[18px] stroke-[2.4]" aria-hidden="true" />
                <span>{fase === 'a-resgatar' ? t('A resgatar…') : t('Resgatar +1 ponto')}</span>
              </button>
              <div role="alert" className="min-h-0">
                {erro && <p className="mt-2 text-[12.5px] text-[#D92D20] leading-snug">{erro}</p>}
              </div>
              <p className="mt-2 text-[12px] text-[#6B6B6B] leading-snug text-center">{t('Um ponto por dia: se faltares, não acumula.')}</p>
            </>
          ) : (
            <>
              <div className="mt-3.5 rounded-[12px] bg-[#F4F4F2] border border-[#E6E6E3] px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#6B6B6B]">{t('Próximo ponto daqui a')}</div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3">
                  <span role="timer" aria-live="off" data-teste="ponto-diario-contagem" className="font-condensada text-[32px] leading-none font-bold tabular-nums text-[#111111]">
                    {formatarContagem(ponto.restanteMs)}
                  </span>
                  <span className="text-[12.5px] text-[#4A4A4A] text-right leading-tight">{t('Volta {quando}', { quando: quandoFicaPronto(ponto.proximoEm) })}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  data-foco
                  onClick={() => setEditor(true)}
                  data-teste="ponto-diario-personalizar"
                  className="flex-1 h-11 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Pencil className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />
                  <span>{t('Personalizar avatar')}</span>
                </button>
                <button
                  type="button"
                  onClick={fechar}
                  className="h-11 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] cursor-pointer"
                >
                  {t('Fechar')}
                </button>
              </div>
            </>
          )}
          <span role="status" aria-live="polite" className="sr-only">{!pronto && resgatadoAgora ? t('Ponto resgatado!') : ''}</span>
        </div>
      </div>
      {editorAvatar}
    </>
  );
};

/** Cartão do perfil: o botão para resgatar (se o aviso foi fechado sem querer) e a contagem até ao próximo ponto */
export const PontoDiarioCartao: React.FC<{ user: UserProfile }> = ({ user }) => {
  const ponto = usePontoDiario(user);
  const [aResgatar, setAResgatar] = useState(false);
  const [feitoAgora, setFeitoAgora] = useState(false);
  const [erro, setErro] = useState('');
  if (!ponto) return null;

  const resgatar = async () => {
    if (aResgatar) return;
    setAResgatar(true);
    setErro('');
    try {
      const r = await resgatarPontoDiario();
      setFeitoAgora(r.resgatado);
    } catch (err: any) {
      setErro(t(err?.message || 'Não foi possível resgatar agora. Tenta outra vez.'));
    } finally {
      setAResgatar(false);
    }
  };

  return (
    <section aria-label={t('Ponto diário')} data-teste="ponto-diario-cartao" className="mt-3 rounded-[12px] border border-[#E6E6E3] bg-[#F4F4F2] p-3">
      {ponto.disponivel ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span aria-hidden="true" className="w-10 h-10 rounded-full bg-[#FF6B1A] text-[#111111] flex items-center justify-center shrink-0"><Gift className="w-5 h-5 stroke-[2.3]" /></span>
          <span className="flex-1 min-w-[140px] leading-tight">
            <span className="block text-[14px] font-semibold text-[#111111]">{t('Ponto diário')}</span>
            <span className="block text-[12px] text-[#4A4A4A]">{t('Tens 1 ponto por resgatar.')}</span>
          </span>
          <button
            type="button"
            onClick={() => void resgatar()}
            disabled={aResgatar}
            aria-busy={aResgatar}
            data-teste="ponto-diario-resgatar-perfil"
            className="h-11 px-4 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[14px] font-bold brand-chamfer cursor-pointer disabled:opacity-70 disabled:cursor-wait"
          >
            {aResgatar ? t('A resgatar…') : t('Resgatar +1 ponto')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="w-10 h-10 rounded-full bg-[#111111] text-[#FFFFFF] flex items-center justify-center shrink-0"><Check className="w-5 h-5 stroke-[3]" /></span>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block text-[14px] font-semibold text-[#111111]">{feitoAgora ? t('Ponto resgatado!') : t('Ponto diário')}</span>
              <span className="block text-[12px] text-[#4A4A4A]">{t('Próximo ponto daqui a')}</span>
            </span>
            <span role="timer" aria-live="off" data-teste="ponto-diario-contagem-perfil" className="font-condensada text-[26px] leading-none font-bold tabular-nums text-[#111111] shrink-0">
              {formatarContagem(ponto.restanteMs)}
            </span>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-[#E6E6E3] overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-[#FF6B1A]" style={{ width: `${Math.round(ponto.decorrido * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] text-[#6B6B6B] leading-snug">{t('Volta {quando}', { quando: quandoFicaPronto(ponto.proximoEm) })}</p>
        </>
      )}
      <div role="alert">{erro && <p className="mt-2 text-[12.5px] text-[#D92D20] leading-snug">{erro}</p>}</div>
    </section>
  );
};
