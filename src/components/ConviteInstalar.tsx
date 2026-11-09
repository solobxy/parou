import React, { useEffect, useRef, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { t } from '../i18n';
import { useInstalarApp, PassosIphone, PassosAndroid, enderecoChrome } from './InstalarApp';
import { EVENTO_VALOR, marcarEvento, type MomentoDeValor } from '../services/momentoDeValor';
import {
  CHAVE_CONVITE, CHAVE_AVISO_ANTIGO, CHAVE_SESSAO, deveConvidar, lerMemoria, memoriaDepoisDeFechar, dentroDeOutraApp,
} from '../utils/conviteInstalar';

// Convite para pôr a PAROU no ecrã principal, no momento certo: logo a seguir a a pessoa ter tido valor (abriu uma opção
// de viagem, viu as partidas de uma paragem ou o horário de uma linha). Só no telemóvel, uma vez por sessão, e quem
// diz "agora não" fica semanas sem o ver. Cartão discreto em baixo, sem tapar o ecrã nem roubar o foco.

const ESPERA_MS = 1200; // deixa a pessoa ver o que abriu antes de aparecer
const SAI_SOZINHO_MS = 20_000; // sem toque, sai sozinho (não conta como "agora não")

function lerLocal(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function eTelemovel(): boolean {
  try {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  } catch { return false; }
}
function eRobo(): boolean {
  try { return (navigator as any).webdriver === true; } catch { return false; }
}

export const ConviteInstalar: React.FC = () => {
  const { disponivel, plataforma, podeInstalar, instalar } = useInstalarApp();
  const [visivel, setVisivel] = useState(false);
  const [entrou, setEntrou] = useState(false);
  const [verPassos, setVerPassos] = useState(false);
  const [aEsperar, setAEsperar] = useState(false);
  const tocou = useRef(false);
  const mostrado = useRef(false);
  const disponivelRef = useRef(disponivel);
  disponivelRef.current = disponivel;

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoValor = (e: Event) => {
      if (mostrado.current) return;
      let jaNestaSessao = false;
      try { jaNestaSessao = sessionStorage.getItem(CHAVE_SESSAO) === '1'; } catch {}
      const pode = deveConvidar({
        instalada: !disponivelRef.current,
        telemovel: eTelemovel(),
        robo: eRobo(),
        avisoAntigoFechado: lerLocal(CHAVE_AVISO_ANTIGO) === '1',
        jaMostradoNestaSessao: jaNestaSessao,
        memoria: lerMemoria(lerLocal(CHAVE_CONVITE)),
        agora: Date.now(),
      });
      if (!pode) return;
      mostrado.current = true;
      try { sessionStorage.setItem(CHAVE_SESSAO, '1'); } catch {}
      const momento = String((e as CustomEvent<MomentoDeValor>).detail || 'outro');
      espera = setTimeout(() => {
        setVisivel(true);
        requestAnimationFrame(() => setEntrou(true));
        marcarEvento('instalar', `convite:${momento}`);
      }, ESPERA_MS);
    };
    window.addEventListener(EVENTO_VALOR, aoValor);
    return () => { window.removeEventListener(EVENTO_VALOR, aoValor); if (espera) clearTimeout(espera); };
  }, []);

  // Sem nenhum toque, sai sozinho ao fim de um bocado (pode voltar noutra sessão)
  useEffect(() => {
    if (!visivel) return;
    const t1 = setTimeout(() => { if (!tocou.current) esconder(); }, SAI_SOZINHO_MS);
    return () => clearTimeout(t1);
  }, [visivel]);

  const esconder = () => {
    setEntrou(false);
    setTimeout(() => setVisivel(false), 180);
  };

  const fechar = () => {
    tocou.current = true;
    try { localStorage.setItem(CHAVE_CONVITE, JSON.stringify(memoriaDepoisDeFechar(lerMemoria(lerLocal(CHAVE_CONVITE)), Date.now()))); } catch {}
    marcarEvento('instalar', 'convite-fechado');
    esconder();
  };

  const tocarInstalar = async () => {
    if (aEsperar) return;
    tocou.current = true;
    if (verPassos) { setVerPassos(false); return; }
    marcarEvento('instalar', 'convite-toque');
    setAEsperar(true);
    const r = await instalar();
    setAEsperar(false);
    if (r === 'aceite') {
      marcarEvento('instalar', 'convite-aceite');
      // instalada: no browser não volta a convidar
      try { localStorage.setItem(CHAVE_CONVITE, JSON.stringify({ fechadoEm: Date.now(), vezes: 3 })); } catch {}
      esconder();
    } else if (r === 'recusado') {
      marcarEvento('instalar', 'convite-recusado');
      fechar();
    } else {
      marcarEvento('instalar', 'convite-passos');
      setVerPassos(true);
    }
  };

  const instalarAqui = async () => {
    tocou.current = true;
    const r = await instalar({ aqui: true });
    if (r === 'aceite') { marcarEvento('instalar', 'convite-aceite'); esconder(); }
  };

  if (!visivel || !disponivel) return null;
  const iphone = plataforma === 'iphone';
  const umToque = podeInstalar && !iphone;
  const outraApp = (() => { try { return dentroDeOutraApp(navigator.userAgent || ''); } catch { return false; } })();

  return (
    <div
      role="region"
      aria-label={t('Instalar a app PAROU')}
      aria-live="polite"
      data-teste="convite-instalar"
      className={`lg:hidden fixed left-3 right-3 z-[45] bottom-[calc(76px+env(safe-area-inset-bottom))] mx-auto max-w-[440px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${entrou ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <div className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] shadow-lg p-3">
        <div className="flex items-start gap-3">
          <img src="/icon-192.png" alt="" width={40} height={40} className="w-10 h-10 rounded-[10px] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[#111111] leading-snug">{t('Põe a PAROU no ecrã principal')}</div>
            <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">{t('Da próxima vez abre num toque, como uma app.')}</div>
            <button
              type="button"
              onClick={() => void tocarInstalar()}
              aria-expanded={umToque ? undefined : verPassos}
              data-teste="convite-instalar-botao"
              className="mt-2.5 h-10 px-3.5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {iphone ? <Share className="w-4 h-4" aria-hidden="true" /> : <Download className={`w-4 h-4 ${aEsperar ? 'animate-pulse' : ''}`} aria-hidden="true" />}
              {umToque ? t('Instalar') : t('Como instalar')}
            </button>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label={t('Agora não')}
            data-teste="convite-instalar-fechar"
            className="shrink-0 w-10 h-10 -mr-1.5 -mt-1.5 rounded-full text-[#6B6B6B] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {verPassos && (
          <div className="mt-3 border-t border-[#E6E6E3] pt-3" data-teste="convite-instalar-passos">
            {outraApp && (
              <div className="mb-2.5 text-[12.5px] text-[#111111] leading-snug">
                {iphone
                  ? t('Estás dentro de outra app: abre primeiro esta página no Safari (no menu, «Abrir no Safari»).')
                  : t('Estás dentro de outra app: abre primeiro esta página no Chrome.')}
                {!iphone && (
                  <a href={enderecoChrome()} className="mt-2 h-10 px-3.5 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-[13px] font-semibold inline-flex items-center" data-teste="convite-abrir-chrome">
                    {t('Abrir no Chrome')}
                  </a>
                )}
              </div>
            )}
            {iphone ? <PassosIphone /> : <PassosAndroid onAqui={() => void instalarAqui()} />}
          </div>
        )}
      </div>
    </div>
  );
};
