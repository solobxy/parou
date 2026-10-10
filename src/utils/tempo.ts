import { t, LOCALE } from '../i18n';

/** "agora", "há 5 min", "há 3 h", "há 2 d" ou a data (a partir de 7 dias) */
export function tempoRelativo(momento: number, agora: number = Date.now()): string {
  const s = Math.max(0, Math.round((agora - momento) / 1000));
  if (s < 45) return t('agora');
  const m = Math.round(s / 60);
  if (m < 60) return t('há {n} min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('há {n} h', { n: h });
  const d = Math.round(h / 24);
  if (d < 7) return t('há {n} d', { n: d });
  try { return new Date(momento).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }); } catch { return ''; }
}
