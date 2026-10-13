import { useEffect, useState } from 'react';
import { agoraDoServidor } from '../services/conta';
import { t, LOCALE } from '../i18n';
import type { UserProfile } from '../types';

// Ponto diário: 1 ponto de reputação a cada 24 h, a contar do momento em que o último foi resgatado.
// O servidor diz a que horas o próximo fica disponível; aqui só se faz a contagem (com a hora do servidor).

export const DIA_MS = 24 * 3600_000;

export interface EstadoPonto {
  /** Já se pode resgatar */
  disponivel: boolean;
  /** Milissegundos até poder resgatar (0 = já pode) */
  restanteMs: number;
  /** Hora (ms) a partir da qual se pode resgatar */
  proximoEm: number;
  /** Parte das 24 h que já passou (0 a 1) */
  decorrido: number;
}

export function estadoDoPonto(user: Pick<UserProfile, 'resgate'> | null | undefined): EstadoPonto | null {
  const r = user?.resgate;
  if (!r || typeof r.disponivelEm !== 'number') return null;
  const restanteMs = Math.max(0, r.disponivelEm - agoraDoServidor());
  return {
    disponivel: restanteMs <= 0,
    restanteMs,
    proximoEm: r.disponivelEm,
    decorrido: Math.min(1, Math.max(0, 1 - restanteMs / DIA_MS)),
  };
}

/** Estado do ponto diário que se atualiza sozinho enquanto falta tempo (só com o ecrã visível) */
export function usePontoDiario(user: Pick<UserProfile, 'resgate'> | null | undefined, cadaMs = 1000): EstadoPonto | null {
  const [, atualizar] = useState(0);
  const estado = estadoDoPonto(user);
  const aContar = !!estado && !estado.disponivel;
  const alvo = user?.resgate?.disponivelEm;
  useEffect(() => {
    if (!aContar) return;
    const id = setInterval(() => { if (!document.hidden) atualizar((n) => n + 1); }, cadaMs);
    const aoVoltar = () => { if (!document.hidden) atualizar((n) => n + 1); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [aContar, alvo, cadaMs]);
  return estado;
}

/** "23:59:07" (horas, minutos e segundos que faltam; sobe ao segundo seguinte para nunca mostrar 00:00:00 antes da hora) */
export function formatarContagem(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

/** "amanhã às 19:42" / "hoje às 19:42" / "quinta às 19:42" (hora do telemóvel) */
export function quandoFicaPronto(proximoEm: number): string {
  const d = new Date(proximoEm);
  const hoje = new Date(agoraDoServidor());
  const hora = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const inicioDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((inicioDia(d) - inicioDia(hoje)) / DIA_MS);
  if (dias <= 0) return t('hoje às {h}', { h: hora });
  if (dias === 1) return t('amanhã às {h}', { h: hora });
  const diaSemana = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(d);
  return t('{d} às {h}', { d: diaSemana, h: hora });
}
