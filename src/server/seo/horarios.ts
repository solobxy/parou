// Horários para as páginas públicas: tabela de partidas de uma linha (dias úteis, sábados,
// domingos) e resumo das linhas que passam numa paragem.
import { DateTime } from 'luxon';
import { getDatabase } from '../db/gtfsDatabase';
import { getActiveServices, isServiceActive } from '../dadosProntos';
import { nomeBonito } from './texto';
import type { Linha } from './indice';

const ZONA = 'Europe/Lisbon';

export type TipoDia = 'uteis' | 'sabado' | 'domingo';
export const NOME_TIPO_DIA: Record<TipoDia, string> = { uteis: 'Dias úteis', sabado: 'Sábados', domingo: 'Domingos e feriados' };

// Feriados nacionais fixos (para não escolher um feriado como "dia útil" de referência)
const FERIADOS_FIXOS = new Set(['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25']);

export function proximoDia(tipo: TipoDia, base: DateTime): DateTime {
  let d = base.startOf('day');
  for (let i = 0; i < 14; i++) {
    const wd = d.weekday; // 1 = segunda … 7 = domingo
    const feriado = FERIADOS_FIXOS.has(d.toFormat('MM-dd'));
    if (tipo === 'uteis' && wd <= 5 && !feriado) return d;
    if (tipo === 'sabado' && wd === 6) return d;
    if (tipo === 'domingo' && wd === 7) return d;
    d = d.plus({ days: 1 });
  }
  return base;
}

export interface Sentido {
  direcao: number;
  destino: string;
  paragens: Array<{ stopId: string; nome: string; minutos: number }>;
  horarios: Array<{ tipo: TipoDia; data: string; partidas: number[] }>; // segundos desde a meia-noite
}

export interface HorarioLinha {
  sentidos: Sentido[];
  hoje: { primeira: number | null; ultima: number | null; total: number; intervaloPonta: number | null };
}

function partidasNoDia(routeId: string, feedId: string, direcao: number, stopId: string, dia: DateTime): number[] {
  const db = getDatabase();
  const linhas = db.prepare(`
    SELECT st.departure_secs AS s, t.service_id AS sv
    FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
    WHERE st.stop_id = ? AND t.route_id = ? AND COALESCE(t.direction_id, 0) = ?
  `).all(stopId, routeId, direcao) as Array<{ s: number; sv: string }>;
  if (linhas.length === 0) return [];
  // Procura o dia pedido; se o operador ainda não publicou esse período (ou já acabou),
  // usa o mesmo dia da semana mais próximo que tenha serviço (até 10 semanas)
  const tentativas = [0, 7, -7, -14, 14, -21, -28];
  for (const delta of tentativas) {
    const d = dia.plus({ days: delta });
    const ativos = getActiveServices(d.toJSDate(), ZONA);
    const lista = linhas.filter((l) => isServiceActive(feedId, l.sv, ativos) && Number.isFinite(l.s)).map((l) => l.s);
    if (lista.length > 0) return Array.from(new Set(lista)).sort((a, b) => a - b);
  }
  return [];
}

function intervaloTipico(partidas: number[], deH: number, ateH: number): number | null {
  const janela = partidas.filter((s) => s >= deH * 3600 && s < ateH * 3600);
  if (janela.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < janela.length; i++) gaps.push(janela[i] - janela[i - 1]);
  gaps.sort((a, b) => a - b);
  return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)] / 60));
}

const cacheLinhas = new Map<string, { t: number; v: HorarioLinha }>();

export function horarioDaLinha(linha: Linha): HorarioLinha {
  const chave = `${linha.routeId}:${DateTime.now().setZone(ZONA).toISODate()}`;
  const c = cacheLinhas.get(chave);
  if (c && Date.now() - c.t < 30 * 60_000) return c.v;
  const db = getDatabase();
  const hojeDt = DateTime.now().setZone(ZONA);
  const direcoes = db.prepare(`
    SELECT COALESCE(direction_id, 0) AS d, trip_headsign AS h, COUNT(*) AS n
    FROM trips WHERE route_id = ? GROUP BY COALESCE(direction_id, 0), trip_headsign ORDER BY n DESC
  `).all(linha.routeId) as Array<{ d: number; h: string | null; n: number }>;
  const vistas = new Set<number>();
  const sentidos: Sentido[] = [];
  for (const dir of direcoes) {
    if (vistas.has(dir.d)) continue;
    vistas.add(dir.d);
    const rep = db.prepare(`
      SELECT t.trip_id FROM trips t JOIN stop_times st ON st.trip_id = t.trip_id
      WHERE t.route_id = ? AND COALESCE(t.direction_id, 0) = ?
      GROUP BY t.trip_id ORDER BY COUNT(*) DESC LIMIT 1
    `).get(linha.routeId, dir.d) as { trip_id: string } | undefined;
    if (!rep) continue;
    const paragens = db.prepare(`
      SELECT st.stop_id AS id, s.stop_name AS nome, st.departure_secs AS s
      FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
      WHERE st.trip_id = ? ORDER BY st.stop_sequence ASC
    `).all(rep.trip_id) as Array<{ id: string; nome: string; s: number }>;
    if (paragens.length === 0) continue;
    const s0 = paragens[0].s;
    const destino = nomeBonito(dir.h || paragens[paragens.length - 1].nome);
    const horarios: Sentido['horarios'] = [];
    for (const tipo of ['uteis', 'sabado', 'domingo'] as TipoDia[]) {
      const dia = proximoDia(tipo, hojeDt);
      horarios.push({ tipo, data: dia.toISODate() || '', partidas: partidasNoDia(linha.routeId, linha.feedId, dir.d, paragens[0].id, dia) });
    }
    sentidos.push({
      direcao: dir.d,
      destino,
      paragens: paragens.map((p) => ({ stopId: p.id, nome: nomeBonito(p.nome), minutos: Number.isFinite(p.s) && Number.isFinite(s0) ? Math.max(0, Math.round((p.s - s0) / 60)) : 0 })),
      horarios,
    });
    if (sentidos.length >= 2) break;
  }
  // Resumo de hoje (primeiro sentido)
  let hoje: HorarioLinha['hoje'] = { primeira: null, ultima: null, total: 0, intervaloPonta: null };
  if (sentidos[0]) {
    const p = partidasNoDia(linha.routeId, linha.feedId, sentidos[0].direcao, sentidos[0].paragens[0].stopId, hojeDt.startOf('day'));
    if (p.length) hoje = { primeira: p[0], ultima: p[p.length - 1], total: p.length, intervaloPonta: intervaloTipico(p, 7, 10) };
  }
  const v = { sentidos, hoje };
  cacheLinhas.set(chave, { t: Date.now(), v });
  if (cacheLinhas.size > 800) cacheLinhas.delete(cacheLinhas.keys().next().value as string);
  return v;
}

export interface LinhaNaParagem {
  routeId: string;
  destinos: string[];
  primeira: number | null;
  ultima: number | null;
  partidasHoje: number;
}

/** Linhas que passam nas paragens do grupo, com destinos e primeira/última partida de hoje */
export function linhasDaParagem(stopIds: string[]): LinhaNaParagem[] {
  const db = getDatabase();
  const ids = stopIds.slice(0, 12);
  const marcas = ids.map(() => '?').join(',');
  const linhas = db.prepare(`
    SELECT t.route_id AS r, t.trip_headsign AS h, t.service_id AS sv, t.feed_id AS f, st.departure_secs AS s, st.pickup_type AS pk
    FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
    WHERE st.stop_id IN (${marcas})
  `).all(...ids) as Array<{ r: string; h: string | null; sv: string; f: string; s: number; pk: number | null }>;
  const hoje = getActiveServices(new Date(), ZONA);
  const porRota = new Map<string, { destinos: Map<string, number>; hoje: number[] }>();
  for (const l of linhas) {
    const e = porRota.get(l.r) || { destinos: new Map<string, number>(), hoje: [] };
    if (l.h) e.destinos.set(nomeBonito(l.h), (e.destinos.get(nomeBonito(l.h)) || 0) + 1);
    if (l.pk !== 1 && Number.isFinite(l.s) && isServiceActive(l.f, l.sv, hoje)) e.hoje.push(l.s);
    porRota.set(l.r, e);
  }
  return Array.from(porRota.entries()).map(([routeId, e]) => {
    e.hoje.sort((a, b) => a - b);
    return {
      routeId,
      destinos: Array.from(e.destinos.entries()).sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 3),
      primeira: e.hoje[0] ?? null,
      ultima: e.hoje.length ? e.hoje[e.hoje.length - 1] : null,
      partidasHoje: e.hoje.length,
    };
  });
}
