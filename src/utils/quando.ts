// Datas das ocorrências em português, sempre concretas ("hoje às 10:32", "ontem às 22:10",
// "7 out, 14:05") em vez de "recente". Hora de Lisboa.

import { t, LOCALE } from '../i18n';

const ZONA = 'Europe/Lisbon';

function diaLisboa(d: Date): string {
  return d.toLocaleDateString('pt-PT', { timeZone: ZONA });
}

function hora(d: Date): string {
  return d.toLocaleTimeString(LOCALE, { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
}

/** "há 12 min · 10:32", "hoje às 10:32", "ontem às 22:10", "7 out, 14:05" */
export function formatarQuando(ms: number | string | null | undefined): string {
  const t = typeof ms === 'string' ? Date.parse(ms) : Number(ms);
  if (!Number.isFinite(t) || t <= 0) return '';
  const d = new Date(t);
  const agora = new Date();
  const min = Math.round((agora.getTime() - t) / 60000);
  if (min >= 0 && min < 1) return t('agora · {h}', { h: hora(d) });
  if (min >= 1 && min < 60) return t('há {n} min · {h}', { n: min, h: hora(d) });
  if (diaLisboa(d) === diaLisboa(agora)) return t('hoje às {h}', { h: hora(d) });
  if (diaLisboa(d) === diaLisboa(new Date(agora.getTime() - 86400000))) return t('ontem às {h}', { h: hora(d) });
  if (diaLisboa(d) === diaLisboa(new Date(agora.getTime() + 86400000))) return t('amanhã às {h}', { h: hora(d) });
  const dia = d.toLocaleDateString(LOCALE, { timeZone: ZONA, day: 'numeric', month: 'short' }).replace('.', '');
  return `${dia}, ${hora(d)}`;
}

/** Data de uma ocorrência (usa a hora guardada; "recente" só se não houver nenhuma) */
export function quandoAconteceu(o: { timestamp?: number; reportedAt?: string } | null | undefined): string {
  if (!o) return '';
  return formatarQuando(o.timestamp) || o.reportedAt || '';
}

/** Ocorrência ainda atual: das últimas 24 h e não resolvida nem oculta */
export function eOcorrenciaAtual(o: { timestamp?: number; status?: string } | null | undefined): boolean {
  if (!o) return false;
  if (o.status === 'Resolvida' || o.status === 'Ocultada') return false;
  return (o.timestamp || 0) >= Date.now() - 24 * 3600_000;
}
