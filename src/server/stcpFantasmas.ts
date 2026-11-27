/**
 * Tempo real da STCP: separar as estimativas verdadeiras das que não o são.
 *
 * Visto em Campanhã a 27/11/2026: o 206 das 18:26 aparecia «a chegar» com 90, 98, 101… min de atraso.
 * Campanhã é o início da linha. A STCP mostra cada viagem que ainda não saiu da origem como «a chegar
 * agora», e o atraso cresce minuto a minuto (agora − hora marcada). Não há autocarro a chegar, e não
 * se sabe quando vai sair. Na mesma resposta vinham viagens com atraso 0 e hora certa ao segundo
 * (20:15:00). Essas são só o horário, sem GPS, e não deviam aparecer como tempo real.
 */

export interface ChegadaStcpBruta {
  epoch?: number | string;
  arrival_minutes?: number | string;
  estimated_arrival_time?: string;
  delay_minutes?: number | string;
  com_gps?: boolean;
}

/** Hora estimada (segundos desde 1970): hora exata da API oficial, a da fonte anterior ou os minutos que faltam. */
export function horaEstimada(a: ChegadaStcpBruta, agora: number): number {
  const ep = Number(a?.epoch);
  if (a?.epoch !== undefined && a?.epoch !== null && a?.epoch !== '' && Number.isFinite(ep)) return Math.round(ep);
  const iso = Date.parse(String(a?.estimated_arrival_time ?? ''));
  if (Number.isFinite(iso)) return Math.round(iso / 1000);
  return agora + Math.round(Number(a?.arrival_minutes) * 60);
}

/**
 * Só horário, sem GPS: atraso exatamente 0 e (na fonte anterior, que não diz se há GPS) hora certa ao
 * segundo. A API oficial diz se há GPS (com_gps); sem GPS e sem atraso não é uma estimativa.
 */
export function soHorario(a: ChegadaStcpBruta): boolean {
  const atraso = Number(a?.delay_minutes);
  if (!Number.isFinite(atraso) || Math.abs(atraso) > 0.001) return false;
  if (a?.com_gps === false) return true;
  if (a?.com_gps === true) return false;
  return /T\d{2}:\d{2}:00(?:\.0+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(String(a?.estimated_arrival_time ?? ''));
}

/**
 * Viagem que ainda não saiu da paragem de origem: a STCP dá-a «a chegar agora» (até 2 min) com mais de
 * 10 min de atraso. É a hora marcada que já passou, não um autocarro a chegar.
 */
export function aindaNaOrigem(p: { estEpoch: number; atrasoS: number; agora: number; naOrigem: boolean }): boolean {
  return p.naOrigem && p.estEpoch - p.agora <= 120 && p.atrasoS > 10 * 60;
}
