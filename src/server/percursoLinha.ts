// Percurso de uma linha para desenhar no mapa do "Perto": as paragens por ordem, com coordenadas
// e (quando há horário) a hora a que a viagem passa em cada uma.
//  - Linhas com horários na base: o percurso é o da viagem escolhida (trip_id da partida).
//  - UNIR: não há viagens na base, só a ordem das paragens de cada linha e sentido (stop_routes);
//    o sentido vem da AMP e, se não bater certo, escolhe-se pelo destino da partida.

import { getDatabase, registerCacheClearCallback } from './db/gtfsDatabase';
import { caminhoDaLinhaUnir, caminhoDaViagem } from './caminhos';
import { pontuarPercurso } from '../utils/geoPercurso';
import type { OperadorVeiculos } from '../utils/chaveLinha';

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
  /** Identificador da linha na lista de linhas (para a guardar nos favoritos) e o nome completo dela */
  rota?: string;
  nome?: string;
  paragens: ParagemDoPercurso[];
  /** Posição da paragem de onde se partiu (-1 se não se sabe) */
  indice: number;
  /** Desenho da viagem pela estrada (polilinha codificada) e a posição de cada paragem nele; sem eles a app une as paragens em linha reta */
  caminho?: string;
  cortes?: Array<number | null>;
}

function hm(segs: number): string {
  const s = ((Math.round(segs) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

function normalizar(t: string): string {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Carris Metropolitana: as viagens do horário estão no feed "cmh" com paragens e linhas "cmh:<id>", e a app (e a API)
// usam "cm:<id>" (ver linesEngine). Aqui traduz-se de um lado para o outro para o percurso ter as paragens todas.
// O tempo real da Carris Metropolitana traz a linha como "cm:[A2L1N]4436" e a viagem como "[ZLLEW][A2L1N]4436_0_1|1400|1520"
// (com o código do padrão entre parênteses retos); no horário a linha é "cmh:4436" e a viagem "cmh:[ZLLEW][A2L1N]4436_0_1|1400|1520".
const paraViagens = (id: string): string => (id.startsWith('cm:') ? `cmh:${id.slice(3).replace(/\[[^\]]*\]/g, '')}` : id);
const PARAGEM_DA_APP = `CASE WHEN st.stop_id LIKE 'cmh:%' THEN 'cm:' || substr(st.stop_id, 5) ELSE st.stop_id END`;
const LINHA_DA_APP = `CASE WHEN t.route_id LIKE 'cmh:%' THEN 'cm:' || substr(t.route_id, 5) ELSE t.route_id END`;

/** Percurso de uma viagem (partida com trip_id) */
export function percursoDeViagem(tripIdPedido: string, paragemId?: string): PercursoLinha | null {
  const db = getDatabase();
  const qViagem = db.prepare(`
    SELECT s.stop_id AS id, st.stop_sequence AS seq, st.arrival_secs AS chega, st.departure_secs AS parte,
           s.stop_name AS nome, s.stop_lat AS lat, s.stop_lon AS lon
    FROM stop_times st JOIN stops s ON s.stop_id = ${PARAGEM_DA_APP}
    WHERE st.trip_id = ? ORDER BY st.stop_sequence
  `);
  type Linha = { id: string; seq: number; chega: number | null; parte: number | null; nome: string; lat: number; lon: number };
  let tripId = tripIdPedido;
  let rows = qViagem.all(tripId) as Linha[];
  // Viagem do tempo real da Carris Metropolitana: no horário o código tem o prefixo "cmh:"
  if (!rows.length && !tripId.startsWith('cmh:')) {
    const alternativo = `cmh:${tripIdPedido}`;
    const outras = qViagem.all(alternativo) as Linha[];
    if (outras.length) { rows = outras; tripId = alternativo; }
  }
  const paragens = rows
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => ({ id: r.id, nome: String(r.nome || ''), lat: r.lat, lon: r.lon, hora: hm((r.chega ?? r.parte ?? 0)) }));
  if (paragens.length < 2) return null;
  const info = db.prepare(`
    SELECT t.trip_headsign AS hs, r.route_id AS rid, r.route_short_name AS curto, r.route_long_name AS longo, r.route_color AS cor
    FROM trips t JOIN routes r ON r.route_id = ${LINHA_DA_APP} WHERE t.trip_id = ?
  `).get(tripId) as { hs?: string; rid?: string; curto?: string; longo?: string; cor?: string } | undefined;
  let indice = paragemId ? paragens.findIndex((p) => p.id === paragemId) : -1;
  if (indice < 0 && paragemId) {
    // Paragem da partida pode ser a "estação" e o percurso usar uma plataforma dela
    const filhos = db.prepare('SELECT stop_id FROM stops WHERE parent_station = ?').all(paragemId) as Array<{ stop_id: string }>;
    const ids = new Set(filhos.map((f) => f.stop_id));
    indice = paragens.findIndex((p) => ids.has(p.id));
  }
  const desenho = caminhoDaViagem(tripId, paragens);
  return {
    fonte: 'horarios',
    linha: String(info?.curto || info?.longo || ''),
    cor: info?.cor ? `#${String(info.cor).replace(/^#/, '')}` : undefined,
    destino: String(info?.hs || paragens[paragens.length - 1].nome),
    ...(info?.rid ? { rota: String(info.rid) } : {}),
    ...(info?.longo ? { nome: String(info.longo) } : {}),
    paragens,
    indice,
    ...(desenho ? { caminho: desenho.caminho, cortes: desenho.cortes } : {}),
  };
}

/**
 * Partida em tempo real que o GPS indica mas cujo trip_id não existe no horário (o STCP, por exemplo, usa outro
 * código de serviço): usa uma viagem da mesma linha que passe nesta paragem e acabe no mesmo destino.
 */
export function percursoPorLinha(rotaId: string, destino: string | undefined, paragemId: string): PercursoLinha | null {
  const db = getDatabase();
  const candidatas = db.prepare(`
    SELECT t.trip_id AS id, t.trip_headsign AS hs
    FROM stop_times st JOIN trips t ON t.trip_id = st.trip_id
    WHERE st.stop_id = ? AND t.route_id = ?
    LIMIT 600
  `).all(paraViagens(paragemId), paraViagens(rotaId)) as Array<{ id: string; hs: string | null }>;
  if (!candidatas.length) return null;
  const alvo = normalizar(destino || '');
  const hsDe = (c: { hs: string | null }) => normalizar(c.hs || '');
  let escolhida = alvo ? candidatas.find((c) => hsDe(c) === alvo) : undefined;
  if (!escolhida && alvo) escolhida = candidatas.find((c) => { const h = hsDe(c); return h && (h.includes(alvo) || alvo.includes(h)); });
  // Sem destino que bata certo só serve se a linha tem um único sentido nesta paragem (não arriscar o sentido errado)
  if (!escolhida && new Set(candidatas.map(hsDe)).size === 1) escolhida = candidatas[0];
  const percurso = escolhida ? percursoDeViagem(escolhida.id, paragemId) : null;
  // As horas são de outra viagem da mesma linha: não se mostram (só o caminho e as paragens)
  if (percurso) percurso.paragens = percurso.paragens.map(({ hora: _hora, ...resto }) => resto);
  return percurso;
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
  const desenho = caminhoDaLinhaUnir(rotaId, melhor.d, melhor.paragens);
  return {
    fonte: 'unir',
    linha: String(linha?.curto || rotaId.replace(/^unir:/, '')),
    cor: linha?.cor ? `#${String(linha.cor).replace(/^#/, '')}` : '#CE9926',
    destino: String(destino || melhor.paragens[melhor.paragens.length - 1].nome).trim(),
    rota: rotaId,
    ...(linha?.longo ? { nome: String(linha.longo) } : {}),
    paragens: melhor.paragens,
    indice: melhor.indice,
    ...(desenho ? { caminho: desenho.caminho, cortes: desenho.cortes } : {}),
  };
}

// ---------------------------------------------------------------- percurso de um autocarro em circulação ----------------------------------------------------------------
// O "A bordo" precisa do percurso do autocarro em que a pessoa está. Se o operador diz a viagem e ela existe no horário, usa-se essa.
// Se não (o STCP usa outros códigos de serviço), escolhe-se, entre os percursos da linha, o que passa por baixo do autocarro e vai no mesmo sentido.

const percursosPorViagem = new Map<string, PercursoLinha | null>();
registerCacheClearCallback(() => { percursosPorViagem.clear(); });

function percursoDeViagemEmCache(tripId: string): PercursoLinha | null {
  if (percursosPorViagem.has(tripId)) return percursosPorViagem.get(tripId) ?? null;
  if (percursosPorViagem.size > 600) percursosPorViagem.clear();
  const p = percursoDeViagem(tripId);
  percursosPorViagem.set(tripId, p);
  return p;
}

/** Identificadores (como a app os usa) das linhas do horário que correspondem à linha de um autocarro em direto */
export function rotasDaLinha(op: OperadorVeiculos, linha: string, rotaDoOperador?: string): string[] {
  const db = getDatabase();
  const ids = new Set<string>();
  if (op === 'cm') {
    ids.add(`cm:${linha}`);
  } else if (op === 'tub') {
    if (rotaDoOperador) ids.add(`tub_braga:${rotaDoOperador}`);
    const rows = db.prepare("SELECT route_id AS id FROM routes WHERE route_id LIKE 'tub_braga:%' AND UPPER(route_short_name) = ? LIMIT 8").all(linha.toUpperCase()) as Array<{ id: string }>;
    for (const r of rows) ids.add(r.id);
  } else {
    if (rotaDoOperador) ids.add(`stcp:${rotaDoOperador}`);
    const rows = db.prepare("SELECT route_id AS id FROM routes WHERE route_id LIKE 'stcp:%' AND UPPER(route_short_name) = ? LIMIT 8").all(linha.toUpperCase()) as Array<{ id: string }>;
    for (const r of rows) ids.add(r.id);
  }
  return [...ids].slice(0, 8);
}

/** Um percurso por sentido e destino de cada linha (as viagens de uma linha repetem-se ao longo do dia) */
function percursosDaRota(rotaId: string): PercursoLinha[] {
  const db = getDatabase();
  const viagens = db.prepare(`
    SELECT MIN(t.trip_id) AS id FROM trips t WHERE t.route_id = ? GROUP BY t.direction_id, t.trip_headsign LIMIT 12
  `).all(paraViagens(rotaId)) as Array<{ id: string }>;
  const saida: PercursoLinha[] = [];
  for (const v of viagens) {
    const p = percursoDeViagemEmCache(v.id);
    if (p) saida.push(p);
  }
  return saida;
}

/**
 * Percurso que o autocarro está a fazer, a partir da viagem que o operador indica ou, se essa não existir no horário,
 * da linha e da posição. As horas só vêm quando a viagem é mesmo a deste autocarro.
 */
export function percursoPorVeiculo(
  v: { op: OperadorVeiculos; linha: string; lat: number; lon: number; rumo?: number; vel?: number; viagem?: string; rota?: string },
): { percurso: PercursoLinha; origem: 'viagem' | 'posicao' } | null {
  const mover = (v.vel ?? 0) >= 3;
  const ponto = { lat: v.lat, lon: v.lon };
  if (v.viagem) {
    const ids = v.op === 'stcp' ? [`stcp:${v.viagem}`, v.viagem] : v.op === 'tub' ? [`tub_braga:${v.viagem}`, v.viagem] : [v.viagem, `cmh:${v.viagem}`];
    for (const id of ids) {
      const p = percursoDeViagemEmCache(id);
      if (p) return { percurso: p, origem: 'viagem' };
    }
  }
  let melhor: { p: PercursoLinha; pontos: number } | null = null;
  for (const rota of rotasDaLinha(v.op, v.linha, v.rota)) {
    for (const p of percursosDaRota(rota)) {
      const r = pontuarPercurso(p.paragens, ponto, v.rumo, mover);
      if (!r || r.distanciaM > 150) continue;
      if (!melhor || r.pontos < melhor.pontos) melhor = { p, pontos: r.pontos };
    }
  }
  if (!melhor) return null;
  // As horas são de outra viagem da mesma linha: não se mostram
  return { percurso: { ...melhor.p, paragens: melhor.p.paragens.map(({ hora: _hora, ...resto }) => resto) }, origem: 'posicao' };
}
