import React from 'react';
import { t } from '../i18n';

// Se alguma parte da app rebentar, mostra uma mensagem com "Recarregar" em vez de um ecrã
// branco, e avisa o servidor (sem dados pessoais) para o erro ser corrigido.

export function reportarErro(tipo: string, mensagem: string, extra?: string) {
  try {
    const corpo = JSON.stringify({
      tipo,
      mensagem: String(mensagem || '').slice(0, 500),
      extra: String(extra || '').slice(0, 1500),
      pagina: location.pathname,
      versao: (document.querySelector('script[type="module"][src*="/assets/"]') as HTMLScriptElement | null)?.src?.split('/').pop() || '',
      ua: navigator.userAgent.slice(0, 200),
    });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/erros', new Blob([corpo], { type: 'application/json' }));
    else fetch('/api/erros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {});
  } catch {}
}

let instalado = false;
export function apanharErrosGlobais() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  let enviados = 0;
  const limite = () => enviados++ < 10; // no máximo 10 por visita
  window.addEventListener('error', (e) => {
    if (!limite()) return;
    reportarErro('erro', e.message, `${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (!limite()) return;
    const r: any = e.reason;
    reportarErro('promessa', r?.message || String(r), r?.stack);
  });
}

interface Estado { erro: Error | null }

export class ProtecaoErros extends React.Component<{ children: React.ReactNode }, Estado> {
  state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    reportarErro('react', erro?.message, `${erro?.stack || ''}\n${info?.componentStack || ''}`);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#FFFFFF', fontFamily: 'Barlow, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 340, textAlign: 'center' }}>
          <img src="/icon-192.png" alt="" width={56} height={56} style={{ borderRadius: 14, margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111111', margin: 0 }}>{t('Algo correu mal')}</h1>
          <p style={{ fontSize: 14, color: '#6B6B6B', marginTop: 8, lineHeight: 1.45 }}>
            Já fomos avisados. Recarrega a página para continuar — os teus favoritos estão guardados.
          </p>
          <button
            onClick={() => { try { location.reload(); } catch {} }}
            style={{ marginTop: 18, height: 48, width: '100%', borderRadius: 12, border: 0, background: '#FF6B1A', color: '#111111', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            {t('Recarregar')}
          </button>
        </div>
      </div>
    );
  }
}
