// Percurso de uma linha para desenhar no mapa do "Perto": as paragens por ordem, com coordenadas
// e (quando há horário) a hora a que a viagem passa em cada uma.
//  - Linhas com horários na base: o percurso é o da viagem escolhida (trip_id da partida).
//  - UNIR: não há viagens na base, só a ordem das paragens de cada linha e sentido (stop_routes);
//    o sentido vem da AMP e, se não bater certo, escolhe-se pelo destino da partida.

import { getDatabase } from './db/gtfsDatabase';

export interface ParagemDoPercurso {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  /** HH:MM (só linhas com horários na base) */
  hora?: string;
}

export interface PercursoLinha {
  fonte: 'horarios' | 'unir';
  linha: string;
  cor?: string;
  destino: string;
  paragens: ParagemDoPercurso[];
  /** Posição da paragem de onde se partiu (-1 se não se sabe) */
  indice: number;
}

function hm(segs: number): string {
  const s = ((Math.round(segs) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

function normalizar(t: string): string {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Percurso de uma viagem (partida com trip_id) */
export function percursoDeViagem(tripId: string, paragemId?: string): PercursoLinha | null {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT st.stop_id AS id, st.stop_sequence AS seq, st.arrival_secs AS chega, st.departure_secs AS parte,
           s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
    FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id
    WHERE st.trip_id = ? ORDER BY st.stop_sequence
  `).all(tripId) as Array<{ id: string; seq: number; chega: number | null; parte: number | null; nome: string; lat: number; lon: number }>;
  const paragens = rows
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({ id: r.id, nome: String(r.nome || ''), lat: r.lat, lon: r.lon, hora: hm((r.chega ?? r.parte ?? 0)) }));
  if (paragens.length < 2) return null;
  const info = db.prepare(`
    SELECT t.trip_headsign AS hs, r.route_short_name AS curto, r.route_long_name AS longo, r.route_color AS cor
    FROM trips t JOIN routes r ON r.route_id = t.route_id WHERE t.trip_id = ?
  `).get(tripId) as { hs?: string; curto?: string; longo?: string; cor?: string } | undefined;
  let indice = paragemId ? paragens.findIndex((p) => p.id === paragemId) : -1;
  if (indice < 0 && paragemId) {
    // Paragem da partida pode ser a "estação" e o percurso usar uma plataforma dela
    const filhos = db.prepare('SELECT stop_id FROM stops WHERE parent_station = ?').all(paragemId) as Array<{ stop_id: string }>;
    const ids = new Set(filhos.map((f) => f.stop_id));
    indice = paragens.findIndex((p) => ids.has(p.id));
  }
  return {
    fonte: 'horarios',
    linha: String(info?.curto || info?.longo || ''),
    cor: info?.cor ? `#${String(info.cor).replace(/^#/, '')}` : undefined,
    destino: String(info?.hs || paragens[paragens.length - 1].nome),
    paragens,
    indice,
  };
}

/** Percurso de uma linha UNIR: o sentido da AMP, ou o que acaba no destino da partida */
export function percursoUnir(route: string, paragemId: string, sentido?: string, destino?: string): PercursoLinha | null {
  const db = getDatabase();
  const rotaId = route.startsWith('unir:') ? route : `unir:${route}`;
  const pId = paragemId.startsWith('unir:') ? paragemId : `unir:${paragemId}`;
  const sentidos = (db.prepare('SELECT DISTINCT direction_id AS d FROM stop_routes WHERE route_id = ? AND stop_id = ?').all(rotaId, pId) as Array<{ d: number }>).map((r) => r.d);
  if (!sentidos.length) return null;
  const qParagens = db.prepare(`
    SELECT s.stop_id AS id, s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
    FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
    WHERE sr.route_id = ? AND sr.direction_id = ? ORDER BY sr.stop_sequence
  `);
  const alvo = normalizar(destino || '');
  let melhor: { d: number; paragens: ParagemDoPercurso[]; indice: number; pontos: number } | null = null;
  for (const d of sentidos) {
    const paragens = (qParagens.all(rotaId, d) as Array<{ id: string; nome: string; lat: number; lon: number }>)
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({ id: p.id, nome: String(p.nome || ''), lat: p.lat, lon: p.lon }));
    const indice = paragens.findIndex((p) => p.id === pId);
    if (indice < 0) continue;
    const restantes = paragens.length - 1 - indice;
    if (restantes <= 0 && sentidos.length > 1) continue; // fim de linha: não é por aqui que o autocarro parte
    const ultima = normalizar(paragens[paragens.length - 1].nome);
    let pontos = restantes > 0 ? 1 : 0;
    if (sentido !== undefined && String(sentido) === String(d)) pontos += 4;
    if (alvo && ultima && (ultima.includes(alvo) || alvo.includes(ultima))) pontos += 2;
    if (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && restantes > melhor.paragens.length - 1 - melhor.indice)) {
      melhor = { d, paragens, indice, pontos };
    }
  }
  if (!melhor || melhor.paragens.length < 2) return null;
  const linha = db.prepare('SELECT route_short_name AS curto, route_long_name AS longo, route_color AS cor FROM routes WHERE route_id = ?').get(rotaId) as { curto?: string; longo?: string; cor?: string } | undefined;
  return {
    fonte: 'unir',
    linha: String(linha?.curto || rotaId.replace(/^unir:/, '')),
    cor: linha?.cor ? `#${String(linha.cor).replace(/^#/, '')}` : '#CE9926',
    destino: String(destino || melhor.paragens[melhor.paragens.length - 1].nome).trim(),
    paragens: melhor.paragens,
    indice: melhor.indice,
  };
}
