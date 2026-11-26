// =====================================================================================
// PAROU.PT — «Avisar-me antes de sair de casa» em direto
//
// O lembrete guarda a paragem, a viagem e a linha do primeiro transporte. Quando o operador dá previsões em direto, a hora
// do aviso acompanha o autocarro: se vem 6 min atrasado, o aviso chega 6 min mais tarde (e diz a hora prevista); se vem
// adiantado, chega mais cedo. Sem previsão, fica a hora do horário (como antes).
// =====================================================================================
import { DateTime } from 'luxon';

/** Partida (de uma paragem) como o motor de partidas a devolve */
export interface PartidaDireta {
  trip_id: string;
  route_short_name?: string;
  dep_epoch_secs: number;
  realtime_epoch_secs?: number;
  is_realtime: boolean;
}

/** Ids de viagem e paragem como a base os guarda («cmh:»/«unirh:» são os horários da CM e da UNIR) */
export const idNormal = (id: string) => String(id || '').replace(/^cmh:/, 'cm:').replace(/^unirh:/, 'unir:');

/**
 * A partida do lembrete entre as próximas da paragem: a mesma viagem; se o operador usa outros ids em direto, a mesma
 * linha à mesma hora do horário (até 2 min de diferença). Devolve a hora prevista (em direto) ou a do horário.
 */
export function escolherPartida(deps: PartidaDireta[], viagem: string, linha: string, horaMs: number): { ms: number; direto: boolean } | undefined {
  const v = idNormal(viagem);
  let d = v ? deps.find((x) => idNormal(x.trip_id) === v) : undefined;
  if (!d && linha) {
    const l = linha.trim().toLowerCase();
    d = deps
      .filter((x) => String(x.route_short_name || '').trim().toLowerCase() === l && Math.abs(x.dep_epoch_secs * 1000 - horaMs) <= 120_000)
      .sort((a, b) => Math.abs(a.dep_epoch_secs * 1000 - horaMs) - Math.abs(b.dep_epoch_secs * 1000 - horaMs))[0];
  }
  if (!d) return undefined;
  const direto = !!d.is_realtime && Number.isFinite(d.realtime_epoch_secs);
  return { ms: (direto ? (d.realtime_epoch_secs as number) : d.dep_epoch_secs) * 1000, direto };
}

/** Quando enviar: hora do transporte na paragem (prevista, se houver) menos a antecedência pedida (a pé + minutos) */
export function momentoDoAviso(l: { quando: number; hora: number; antes: number }, prevista?: { ms: number }): number {
  if (!prevista || !Number.isFinite(prevista.ms)) return l.quando;
  // uma previsão absurda (mais de 1 h de diferença) não conta: fica o horário
  if (Math.abs(prevista.ms - l.hora) > 3600_000) return l.quando;
  return prevista.ms - l.antes;
}

/** Texto do aviso: troca {h} pela hora prevista (ou do horário) e junta «em direto» se a hora vem do operador */
export function textoDoAviso(modelo: string, horaMs: number, direto: boolean, emDireto: string): string {
  const h = DateTime.fromMillis(horaMs, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
  const t = modelo.replace(/\{h\}/g, h);
  return direto && emDireto ? `${t} (${emDireto})` : t;
}
