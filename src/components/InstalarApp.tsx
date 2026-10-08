import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

// Convite discreto para instalar a PAROU no ecrã principal (abre como uma app, mais rápida,
// e no iPhone os dados guardados deixam de ser apagados pelo Safari ao fim de 7 dias).
// Não aparece se já estiver instalada ou se a pessoa o fechou.

const CHAVE_FECHADO = 'parou_instalar_fechado';

let eventoInstalar: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    eventoInstalar = e;
    window.dispatchEvent(new CustomEvent('parou_pode_instalar'));
  });
}

/** Está a correr dentro da app instalada (PWA ou app Android da Play Store)? */
function jaInstalada(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('origem') === 'android') sessionStorage.setItem('parou_na_app', '1');
    if (document.referrer.startsWith('android-app://')) sessionStorage.setItem('parou_na_app', '1');
  } catch {}
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
      || (navigator as any).standalone === true
      || sessionStorage.getItem('parou_na_app') === '1';
  } catch {
    return false;
  }
}

function eIphone(): boolean {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Estado partilhado da instalação (o cartão nos Favoritos e o botão no topo usam o mesmo).
 *  No site aparece sempre (mesmo para quem já instalou); dentro da app instalada nunca. */
export function useInstalarApp() {
  const [podeInstalar, setPodeInstalar] = useState<boolean>(() => Boolean(eventoInstalar));
  const naApp = (() => { try { return jaInstalada(); } catch { return false; } })();

  useEffect(() => {
    const aoPoder = () => setPodeInstalar(true);
    window.addEventListener('parou_pode_instalar', aoPoder);
    return () => window.removeEventListener('parou_pode_instalar', aoPoder);
  }, []);

  const iphone = typeof navigator !== 'undefined' && eIphone();
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  const disponivel = !naApp;

  /** Abre o pedido do browser se houver; senão devolve 'passos' (mostrar como fazer). */
  const instalar = async (): Promise<'aceite' | 'recusado' | 'passos'> => {
    if (eventoInstalar) {
      try {
        eventoInstalar.prompt();
        const r = await eventoInstalar.userChoice;
        eventoInstalar = null;
        setPodeInstalar(false);
        return r?.outcome === 'accepted' ? 'aceite' : 'recusado';
      } catch {
        return 'recusado';
      }
    }
    return 'passos';
  };

  const plataforma: 'iphone' | 'android' | 'computador' = iphone ? 'iphone' : android ? 'android' : 'computador';
  return { disponivel, podeInstalar, plataforma, iphone: iphone && !podeInstalar, android: android && !podeInstalar, instalar };
}

export const PassosIphone: React.FC = () => (
  <ol className="text-[12.5px] text-[#111111] space-y-1 list-decimal pl-4">
    <li>Toca em <strong>Partilhar</strong> <Share className="w-3.5 h-3.5 inline -mt-0.5" /> na barra do Safari.</li>
    <li>Escolhe <strong>Adicionar ao ecrã principal</strong>.</li>
    <li>Toca em <strong>Adicionar</strong>.</li>
  </ol>
);

export const PassosAndroid: React.FC = () => (
  <ol className="text-[12.5px] text-[#111111] space-y-1 list-decimal pl-4">
    <li>Toca no menu <strong>⋮</strong> do browser (canto superior direito).</li>
    <li>Escolhe <strong>Instalar app</strong> ou <strong>Adicionar ao ecrã principal</strong>.</li>
    <li>Confirma em <strong>Instalar</strong>.</li>
    <li className="list-none -ml-4 pt-1 text-[#6B6B6B]">Se já a instalaste, abre-a pelo ícone <strong>PAROU</strong> no ecrã principal.</li>
  </ol>
);

export const PassosComputador: React.FC = () => (
  <ol className="text-[12.5px] text-[#111111] space-y-1 list-decimal pl-4">
    <li>No <strong>Chrome</strong> ou no <strong>Edge</strong>: toca no ícone de instalar na barra do endereço (ou menu › <strong>Instalar PAROU</strong>).</li>
    <li>No <strong>Safari</strong> (Mac): menu Ficheiro › <strong>Adicionar à Dock</strong>.</li>
  </ol>
);

/** Botão compacto para o topo da página */
export const BotaoInstalar: React.FC = () => {
  const { disponivel, plataforma, iphone, instalar } = useInstalarApp();
  const [verPassos, setVerPassos] = useState(false);
  if (!disponivel) return null;
  const tocar = async () => {
    const r = await instalar();
    if (r === 'passos') setVerPassos((v) => !v);
  };
  return (
    <div className="relative">
      <button
        onClick={tocar}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#111111] hover:bg-[#2B2B2B] rounded-[8px] text-xs font-semibold text-[#FFFFFF] min-h-[44px] transition-colors cursor-pointer"
        aria-label="Instalar a app PAROU"
        data-teste="instalar-topo"
      >
        {iphone ? <Share className="w-4 h-4 stroke-[2]" /> : <Download className="w-4 h-4 stroke-[2]" />}
        <span className="hidden min-[375px]:inline">Instalar</span>
      </button>
      {verPassos && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Fechar" onClick={() => setVerPassos(false)} />
          <div className="fixed right-3 top-[64px] z-50 w-[min(300px,calc(100vw-24px))] rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5 shadow-lg" role="dialog" aria-label="Como instalar">
            <div className="flex items-center gap-2.5 mb-2">
              <img src="/icon-192.png" alt="" className="w-8 h-8 rounded-[8px]" />
              <div className="text-[13.5px] font-semibold text-[#111111] leading-tight">Instalar a PAROU{plataforma === 'iphone' ? ' no iPhone' : ''}</div>
            </div>
            {plataforma === 'iphone' ? <PassosIphone /> : plataforma === 'android' ? <PassosAndroid /> : <PassosComputador />}
          </div>
        </>
      )}
    </div>
  );
};

export const InstalarApp: React.FC = () => {
  const [fechado, setFechado] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAVE_FECHADO) === '1'; } catch { return false; }
  });
  const [verPassos, setVerPassos] = useState(false);
  const { disponivel, plataforma, podeInstalar, iphone, instalar: pedirInstalar } = useInstalarApp();
  const android = plataforma === 'android' && !podeInstalar;

  if (fechado || !disponivel) return null;

  const fechar = () => {
    setFechado(true);
    try { localStorage.setItem(CHAVE_FECHADO, '1'); } catch {}
  };

  const instalar = async () => {
    const r = await pedirInstalar();
    if (r === 'aceite') fechar();
    else if (r === 'passos') setVerPassos((v) => !v);
  };

  return (
    <div className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-[10px] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[#111111] leading-snug">Tem a PAROU no ecrã principal</div>
          <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">
            Abre como uma app, num toque, e os teus favoritos ficam sempre guardados.
          </div>
          <button
            onClick={instalar}
            className="mt-2.5 h-9 px-3.5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {iphone ? <Share className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {iphone || android ? 'Como instalar' : 'Instalar'}
          </button>
          {verPassos && (
            <div className="mt-2.5">{plataforma === 'iphone' ? <PassosIphone /> : plataforma === 'android' ? <PassosAndroid /> : <PassosComputador />}</div>
          )}
        </div>
        <button onClick={fechar} className="shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-full text-[#6B6B6B] flex items-center justify-center cursor-pointer" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
