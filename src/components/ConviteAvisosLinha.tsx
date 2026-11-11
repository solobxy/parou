import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { t } from '../i18n';
import { getLocalFavorites } from '../services/favoritesService';
import {
  getStoredNotificationPreferences, saveStoredNotificationPreferences, requestNotificationPermission, sincronizarPush, pushSuportado,
} from '../services/notifications';
import {
  CHAVE_CONVITE_LINHA, deveConvidarAvisosLinha, lerMemoriaConvite, memoriaDepoisDeFecharConvite, temAvisosPorLinha,
} from '../utils/avisosLinha';

// Ao guardar uma linha com avisos oficiais por linha (Carris Metropolitana, Metro de Lisboa), a PAROU oferece avisar
// a pessoa de greves, desvios e perturbações nessa linha. Quem já tem os avisos ligados vê só uma confirmação, uma vez.
// Cartão discreto em baixo, no mesmo sítio do convite para instalar (nunca os dois ao mesmo tempo).

type Estado = 'oculto' | 'convite' | 'a-ligar' | 'ligado' | 'bloqueado' | 'falhou' | 'confirmado';
const CHAVE_EXPLICADO = 'parou_avisos_linha_explicado';
const SAI_SOZINHO_MS = 20_000;

interface LinhaGuardada { id: string; op: string; rotulo: string }

function linhasAgora(): Map<string, LinhaGuardada> {
  const m = new Map<string, LinhaGuardada>();
  try {
    for (const f of getLocalFavorites() as any[]) {
      if (!f || typeof f.id !== 'string' || !f.id.startsWith('line-')) continue;
      const id = f.id.slice(5);
      const op = String(f.operatorName || f.operatorId || id.split(':')[0] || '');
      // Metro de Lisboa: a linha é a cor («Azul»); nos outros, o código («1001»)
      const cor = /metro(politano)? de lisboa|metro_lisboa/i.test(`${op} ${id}`)
        ? (`${f.lineName || ''} ${f.title || ''} ${f.lineCode || ''}`.match(/\b(azul|amarela|verde|vermelha)\b/i) || [])[1]
        : '';
      const bruto = String(cor || f.lineCode || f.title || id.split(':').pop() || '');
      // Sem código guardado fica o id da lista («cm:1001_0»): mostra só «1001»
      const curto = bruto.includes(':') ? (bruto.split(':').pop() || '').replace(/_\d+$/, '') : bruto;
      const limpo = curto.replace(/^linha\s+/i, '').trim();
      m.set(id, { id, op, rotulo: (cor ? limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase() : limpo).slice(0, 24) });
    }
  } catch { /* sem favoritos */ }
  return m;
}

function lerLocal(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}

export const ConviteAvisosLinha: React.FC = () => {
  const [estado, setEstado] = useState<Estado>('oculto');
  const [entrou, setEntrou] = useState(false);
  const [linha, setLinha] = useState('');
  const antes = useRef<Map<string, LinhaGuardada>>(new Map());
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const estadoRef = useRef<Estado>('oculto');
  estadoRef.current = estado;

  const mostrar = (e: Estado, ms?: number) => {
    clearTimeout(temporizador.current);
    setEstado(e);
    requestAnimationFrame(() => setEntrou(true));
    if (ms) temporizador.current = setTimeout(() => esconder(), ms);
  };
  const esconder = () => {
    clearTimeout(temporizador.current);
    setEntrou(false);
    setTimeout(() => setEstado('oculto'), 200);
  };

  useEffect(() => {
    antes.current = linhasAgora();
    const aoMudar = () => {
      const agora = linhasAgora();
      const novas = [...agora.values()].filter((l) => !antes.current.has(l.id));
      antes.current = agora;
      const comAvisos = novas.find((l) => temAvisosPorLinha(l.op, l.id));
      if (!comAvisos || estadoRef.current !== 'oculto') return;
      if (!pushSuportado()) return;
      const prefs = getStoredNotificationPreferences();
      const permissao = typeof Notification !== 'undefined' ? Notification.permission : 'default';
      setLinha(comAvisos.rotulo);
      if (prefs.enabled && permissao === 'granted') {
        // Já recebe avisos: diz uma vez que as linhas guardadas também contam
        if (lerLocal(CHAVE_EXPLICADO) === '1') return;
        try { localStorage.setItem(CHAVE_EXPLICADO, '1'); } catch {}
        mostrar('confirmado', 6000);
        return;
      }
      const pode = deveConvidarAvisosLinha({
        suportado: true,
        permissao,
        ligados: prefs.enabled,
        memoria: lerMemoriaConvite(lerLocal(CHAVE_CONVITE_LINHA)),
        agora: Date.now(),
      });
      if (!pode) return;
      // O convite para instalar ocupa o mesmo sítio: se estiver aberto, este fica para a próxima linha
      if (document.querySelector('[data-teste="convite-instalar"]')) return;
      setTimeout(() => {
        if (estadoRef.current === 'oculto') mostrar('convite', SAI_SOZINHO_MS);
      }, 500);
    };
    window.addEventListener('parou_favorites_updated', aoMudar);
    return () => { window.removeEventListener('parou_favorites_updated', aoMudar); clearTimeout(temporizador.current); };
  }, []);

  if (estado === 'oculto') return null;

  const fechar = () => {
    if (estado === 'convite') {
      try { localStorage.setItem(CHAVE_CONVITE_LINHA, JSON.stringify(memoriaDepoisDeFecharConvite(lerMemoriaConvite(lerLocal(CHAVE_CONVITE_LINHA)), Date.now()))); } catch {}
    }
    esconder();
  };

  const ligar = async () => {
    clearTimeout(temporizador.current);
    setEstado('a-ligar');
    const r = await requestNotificationPermission();
    if (r.permission !== 'granted') { mostrar('bloqueado', 9000); return; }
    const prefs = { ...getStoredNotificationPreferences(), enabled: true };
    saveStoredNotificationPreferences(prefs);
    try { localStorage.setItem(CHAVE_EXPLICADO, '1'); } catch {}
    const r2 = await sincronizarPush(prefs);
    // Ficam ligados nas preferências: a app volta a tentar ao abrir
    mostrar(r2 === 'ok' ? 'ligado' : 'falhou', r2 === 'ok' ? 5000 : 9000);
  };

  const titulo = estado === 'ligado'
    ? t('Avisos ligados')
    : estado === 'confirmado'
      ? t('Vais saber o que se passa na linha {l}', { l: linha })
      : estado === 'bloqueado'
        ? t('As notificações estão bloqueadas')
        : estado === 'falhou'
          ? t('Não foi possível ligar os avisos')
          : t('Avisar-te sobre a linha {l}?', { l: linha });
  const texto = estado === 'bloqueado'
    ? t('Permite-as nas definições do browser (cadeado ao lado do endereço) ou do telemóvel e tenta outra vez.')
    : estado === 'falhou'
      ? t('A PAROU volta a tentar da próxima vez que a abrires.')
    : estado === 'ligado'
      ? t('Greves, desvios e perturbações na linha {l} chegam-te mesmo com a app fechada.', { l: linha })
      : estado === 'confirmado'
        ? t('As linhas que guardas também recebem avisos de greves, desvios e perturbações.')
        : t('Greves, desvios e perturbações nesta linha, mesmo com a app fechada.');

  return (
    <div
      role="region"
      aria-label={t('Avisos da linha')}
      aria-live="polite"
      data-teste="convite-avisos-linha"
      data-estado={estado}
      className={`fixed left-3 right-3 z-[45] bottom-[calc(76px+env(safe-area-inset-bottom))] mx-auto max-w-[440px] lg:left-auto lg:right-5 lg:bottom-5 lg:w-[400px] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${entrou ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      <div className="tema-menu rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] shadow-lg p-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FFF1E8] text-[#FF6B1A] flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 stroke-[2]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-[#111111] leading-snug">{titulo}</div>
            <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">{texto}</div>
            {(estado === 'convite' || estado === 'a-ligar') && (
              <button
                type="button"
                onClick={() => void ligar()}
                disabled={estado === 'a-ligar'}
                data-teste="convite-avisos-linha-ligar"
                className="mt-2.5 h-10 px-3.5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
              >
                <Bell className={`w-4 h-4 ${estado === 'a-ligar' ? 'animate-pulse' : ''}`} aria-hidden="true" />
                {estado === 'a-ligar' ? t('A ligar…') : t('Avisar-me')}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label={estado === 'convite' ? t('Agora não') : t('Fechar')}
            data-teste="convite-avisos-linha-fechar"
            className="shrink-0 w-10 h-10 -mr-1.5 -mt-1.5 rounded-full text-[#6B6B6B] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
