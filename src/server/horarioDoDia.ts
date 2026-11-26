// Horário de uma linha numa paragem num dia escolhido: hoje, amanhã ou os dias seguintes (pedido de um passageiro,
// 20/11/2026: «não consigo ver os horários de amanhã»). Conta o dia de serviço: viagens depois da meia-noite ficam no
// fim, como 00:05. Não conta a última paragem de cada viagem nem paragens onde não se pode entrar.
// Se o operador ainda não publicou esse dia, usa o mesmo dia da semana mais perto que esteja publicado e diz «previsto».
import { DateTime } from 'luxon';
import { getDatabase } from './db/gtfsDatabase';
import { getActiveServices, isServiceActive } from './dadosProntos';

const ZONA = 'Europe/Lisbon';
/** Até quantos dias à frente se pode pedir (a app mostra 7: hoje e os 6 seguintes) */
export const MAX_DIAS_A_FRENTE = 14;

export interface PartidaDoDia {
  /** Segundos desde a meia-noite do dia de serviço (passa de 86400 depois da meia-noite) */
  s: number;
  hora: string;
  destino: string;
}

export interface HorarioDoDia {
  data: string;
  /** ok: há partidas; sem-partidas: o dia está publicado mas a linha não passa; ultima-paragem: aqui só se chega;
   *  sem-dados: a linha não tem horários nesta paragem (ou nenhum dia publicado) */
  estado: 'ok' | 'sem-partidas' | 'ultima-paragem' | 'sem-dados';
  previsto: boolean;
  /** Dia publicado que serviu de base quando o pedido ainda não estava publicado */
  dataReferencia?: string;
  partidas: PartidaDoDia[];
}

/** Data pedida (AAAA-MM-DD), só de ontem até MAX_DIAS_A_FRENTE dias à frente; senão null */
export function lerDataPedida(texto: unknown, hoje: DateTime = DateTime.now().setZone(ZONA)): DateTime | null {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const d = DateTime.fromISO(texto, { zone: ZONA });
  if (!d.isValid) return null;
  const dias = Math.round(d.startOf('day').diff(hoje.setZone(ZONA).startOf('day'), 'days').days);
  return dias >= -1 && dias <= MAX_DIAS_A_FRENTE ? d.startOf('day') : null;
}

const horaDe = (s: number) => {
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * `viagem` (opcional): a viagem aberta no Perto. O horário fica com o sentido dela e com todas as linhas do mesmo nome no
 * mesmo operador (a CP tem uma linha por cada par de estações: só pela linha da viagem o horário vinha incompleto).
 */
export function horarioDoDia(routeId: string, stopId: string, sentido: number, dia: DateTime, viagem?: string): HorarioDoDia {
  const db = getDatabase();
  const data = dia.setZone(ZONA).startOf('day');
  const base: HorarioDoDia = { data: data.toISODate() || '', estado: 'sem-dados', previsto: false, partidas: [] };
  let linhas: Array<{ s: number; sv: string; f: string; h: string | null; pk: number; seq: number; ultima: number }>;
  const daViagem = viagem
    ? db.prepare('SELECT t.route_id AS r, COALESCE(t.direction_id, 0) AS d, t.feed_id AS f FROM trips t WHERE t.trip_id = ?').get(viagem) as { r: string; d: number; f: string } | undefined
    : undefined;
  if (daViagem) {
    linhas = db.prepare(`
      SELECT st.departure_secs AS s, t.service_id AS sv, t.feed_id AS f, t.trip_headsign AS h, COALESCE(st.pickup_type, 0) AS pk,
             st.stop_sequence AS seq, (SELECT MAX(x.stop_sequence) FROM stop_times x WHERE x.trip_id = st.trip_id) AS ultima
      FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
      WHERE st.stop_id = ? AND COALESCE(t.direction_id, 0) = ?
        AND t.route_id IN (SELECT r2.route_id FROM routes r2 WHERE r2.feed_id = ?
          AND COALESCE(r2.route_short_name, r2.route_id) = (SELECT COALESCE(r1.route_short_name, r1.route_id) FROM routes r1 WHERE r1.route_id = ?))
    `).all(stopId, daViagem.d, daViagem.f, daViagem.r) as typeof linhas;
  } else {
    linhas = db.prepare(`
      SELECT st.departure_secs AS s, t.service_id AS sv, t.feed_id AS f, t.trip_headsign AS h, COALESCE(st.pickup_type, 0) AS pk,
             st.stop_sequence AS seq, (SELECT MAX(x.stop_sequence) FROM stop_times x WHERE x.trip_id = st.trip_id) AS ultima
      FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
      WHERE st.stop_id = ? AND t.route_id = ? AND COALESCE(t.direction_id, 0) = ?
    `).all(stopId, routeId, sentido) as typeof linhas;
  }
  if (linhas.length === 0) return base;
  const saidas = linhas.filter((l) => Number.isFinite(l.s) && l.pk !== 1 && l.seq < l.ultima);
  if (saidas.length === 0) return { ...base, estado: 'ultima-paragem' };

  // Dias que o operador publicou (o dia pedido pode estar para lá do fim)
  const feedId = saidas[0].f;
  const limites = db.prepare(`
    SELECT MIN(a) AS ini, MAX(b) AS fim FROM (
      SELECT MIN(start_date) AS a, MAX(end_date) AS b FROM calendar WHERE feed_id = ?
      UNION ALL SELECT MIN(date), MAX(date) FROM calendar_dates WHERE feed_id = ? AND exception_type = 1)
  `).get(feedId, feedId) as { ini: string | null; fim: string | null } | undefined;
  const publicado = (d: DateTime) => {
    const ymd = d.toFormat('yyyyMMdd');
    return Boolean(limites?.ini && limites?.fim && ymd >= limites.ini && ymd <= limites.fim);
  };
  const doDia = (d: DateTime) => {
    const ativos = getActiveServices(d.toJSDate(), ZONA);
    const vistas = new Set<string>();
    const out: PartidaDoDia[] = [];
    for (const l of saidas.filter((x) => isServiceActive(x.f, x.sv, ativos)).sort((a, b) => a.s - b.s)) {
      const destino = (l.h || '').trim();
      const chave = `${l.s}|${destino}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      out.push({ s: l.s, hora: horaDe(l.s), destino });
    }
    return out;
  };

  if (publicado(data) || !limites?.fim) {
    const partidas = doDia(data);
    return { ...base, estado: partidas.length ? 'ok' : 'sem-partidas', partidas };
  }
  // Ainda não publicado (ou já acabou): o mesmo dia da semana mais perto que esteja publicado
  for (const delta of [-7, -14, -21, -28, 7, 14, 21, 28]) {
    const ref = data.plus({ days: delta });
    if (!publicado(ref)) continue;
    const partidas = doDia(ref);
    return { ...base, estado: partidas.length ? 'ok' : 'sem-partidas', previsto: true, dataReferencia: ref.toISODate() || undefined, partidas };
  }
  return base;
}
