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

function jaInstalada(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}

function eIphone(): boolean {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export const InstalarApp: React.FC = () => {
  const [fechado, setFechado] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAVE_FECHADO) === '1'; } catch { return false; }
  });
  const [podeInstalar, setPodeInstalar] = useState<boolean>(() => Boolean(eventoInstalar));
  const [verPassos, setVerPassos] = useState(false);

  useEffect(() => {
    const aoPoder = () => setPodeInstalar(true);
    window.addEventListener('parou_pode_instalar', aoPoder);
    return () => window.removeEventListener('parou_pode_instalar', aoPoder);
  }, []);

  if (fechado || jaInstalada()) return null;
  const iphone = eIphone();
  if (!podeInstalar && !iphone) return null;

  const fechar = () => {
    setFechado(true);
    try { localStorage.setItem(CHAVE_FECHADO, '1'); } catch {}
  };

  const instalar = async () => {
    if (eventoInstalar) {
      try {
        eventoInstalar.prompt();
        const r = await eventoInstalar.userChoice;
        eventoInstalar = null;
        if (r?.outcome === 'accepted') fechar();
        else setPodeInstalar(false);
      } catch {}
      return;
    }
    setVerPassos((v) => !v);
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
            {iphone && !eventoInstalar ? <Share className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            {iphone && !eventoInstalar ? 'Como instalar' : 'Instalar'}
          </button>
          {verPassos && (
            <ol className="mt-2.5 text-[12.5px] text-[#111111] space-y-1 list-decimal pl-4">
              <li>Toca em <strong>Partilhar</strong> <Share className="w-3.5 h-3.5 inline -mt-0.5" /> na barra do Safari.</li>
              <li>Escolhe <strong>Adicionar ao ecrã principal</strong>.</li>
              <li>Toca em <strong>Adicionar</strong>.</li>
            </ol>
          )}
        </div>
        <button onClick={fechar} className="shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-full text-[#6B6B6B] flex items-center justify-center cursor-pointer" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
