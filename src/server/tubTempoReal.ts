// Tempo real da TUB (Transportes Urbanos de Braga). Dados cedidos pela TUB à PAROU.PT (GTFS-Realtime, sem chave):
//   posições dos veículos  https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/vehicle_positions.pb
//   atualizações de viagens https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/trip_updates.pb
// Os identificadores de viagens, linhas e paragens são os do GTFS da TUB (na base têm o prefixo "tub_braga:").
//
// Regras: nada se inventa. Só se mostra uma hora em direto quando a TUB a envia para essa viagem e essa paragem
// e o ficheiro tem menos de 2 minutos; senão a app mostra o horário. Os ficheiros são pedidos no máximo de 10 em 10 s
// (um pedido partilhado por todas as pessoas) e, se a TUB falhar, não se insiste mais de 30 em 30 s.

import { lerCampos, texto, type CampoProto } from './protobufMinimo';

export const URL_POSICOES_TUB = 'https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/vehicle_positions.pb';
export const URL_VIAGENS_TUB = 'https://mobibus-gateway.fleetaware.pt/gtfs-rt/feed/trip_updates.pb';

/** Dados com mais de 2 minutos não se usam */
export const IDADE_MAXIMA_TUB_S = 120;

const TTL_MS = 15_000;
const INTERVALO_MIN_MS = 10_000;
const ESPERA_APOS_FALHA_MS = 30_000;
const TIMEOUT_MS = 5_000;
const MAX_BYTES = 3 * 1024 * 1024;

export interface PosicaoTub {
  /** Número do veículo (ex.: "1066") */
  veiculo: string;
  tripId: string;
  routeId: string;
  lat: number;
  lon: number;
  /** Graus, 0 = norte: a TUB não envia o rumo, calcula-se pelo caminho do veículo */
  rumo?: number;
  /** km/h */
  velocidade?: number;
  /** Segundos desde 1970 a que a TUB mediu esta posição */
  epoch: number;
}

export interface ParagemPrevistaTub {
  sequencia: number;
  paragem: string;
  /** Hora prevista de chegada e de partida (segundos desde 1970), quando a TUB as envia */
  chegada?: number;
  partida?: number;
  /** Atraso em segundos (só quando a TUB o envia em vez da hora) */
  atrasoChegada?: number;
  atrasoPartida?: number;
  /** A TUB diz que o autocarro não pára aqui */
  saltada: boolean;
}

export interface ViagemTub {
  tripId: string;
  routeId: string;
  veiculo?: string;
  /** Dia a que a viagem pertence (aaaammdd): as viagens repetem-se todos os dias com o mesmo código */
  dia?: string;
  /** A TUB diz que a viagem foi suprimida */
  cancelada: boolean;
  epoch: number;
  paragens: ParagemPrevistaTub[];
}

// ------------------------------------------------------------------------------------------ leitura dos ficheiros

const numero = (c?: CampoProto): number | undefined => (c && c.t !== 2 && Number.isFinite(c.num) ? c.num : undefined);

/** Hora do ficheiro (cabeçalho GTFS-Realtime, campo 3 do FeedHeader) */
export function lerHoraDoFicheiro(buf: Uint8Array): number {
  try {
    const cab = lerCampos(buf).find((c) => c.n === 1 && c.bytes);
    const ts = cab ? numero(lerCampos(cab.bytes as Uint8Array).find((c) => c.n === 3)) : undefined;
    return ts && ts > 1e9 ? ts : 0;
  } catch {
    return 0;
  }
}

/** Posições dos veículos. Cada entidade lida à parte: uma estragada não deita fora as outras. */
export function lerPosicoesTub(buf: Uint8Array, horaDoFicheiro = 0): PosicaoTub[] {
  const saida: PosicaoTub[] = [];
  for (const entidade of lerCampos(buf).filter((c) => c.n === 2 && c.bytes)) {
    try {
      const veic = lerCampos(entidade.bytes as Uint8Array).find((c) => c.n === 4 && c.bytes);
      if (!veic) continue;
      const v = lerCampos(veic.bytes as Uint8Array);
      const posCampo = v.find((c) => c.n === 2 && c.bytes);
      if (!posCampo) continue;
      const pos = lerCampos(posCampo.bytes as Uint8Array);
      const lat = pos.find((c) => c.n === 1 && c.t === 5)?.num;
      const lon = pos.find((c) => c.n === 2 && c.t === 5)?.num;
      if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < 40.5 || lat > 42.5 || lon < -9.5 || lon > -7.5) continue; // fora do Norte de Portugal
      const viagem = v.find((c) => c.n === 1 && c.bytes);
      const viagemCampos = viagem ? lerCampos(viagem.bytes as Uint8Array) : [];
      const tripId = texto(viagemCampos.find((c) => c.n === 1)).trim();
      const routeId = texto(viagemCampos.find((c) => c.n === 5)).trim();
      const desc = v.find((c) => c.n === 8 && c.bytes);
      const descCampos = desc ? lerCampos(desc.bytes as Uint8Array) : [];
      const veiculo = texto(descCampos.find((c) => c.n === 1)).trim() || texto(descCampos.find((c) => c.n === 2)).trim();
      if (!veiculo || !routeId) continue;
      const rumo = pos.find((c) => c.n === 3 && c.t === 5)?.num;
      const ms = pos.find((c) => c.n === 5 && c.t === 5)?.num;
      const epoch = numero(v.find((c) => c.n === 5 && c.t === 0));
      saida.push({
        veiculo,
        tripId,
        routeId,
        lat,
        lon,
        ...(rumo !== undefined && Number.isFinite(rumo) && rumo >= 0 && rumo <= 360 ? { rumo: Math.round(rumo) % 360 } : {}),
        ...(ms !== undefined && Number.isFinite(ms) && ms >= 0 ? { velocidade: Math.round(ms * 3.6) } : {}),
        epoch: epoch && epoch > 1e9 ? epoch : horaDoFicheiro || Math.floor(Date.now() / 1000),
      });
    } catch {
      /* entidade estragada: passa à seguinte */
    }
  }
  return saida;
}

function lerEvento(c?: CampoProto): { tempo?: number; atraso?: number } {
  if (!c?.bytes) return {};
  const e = lerCampos(c.bytes);
  const tempo = numero(e.find((x) => x.n === 2 && x.t === 0));
  const atraso = numero(e.find((x) => x.n === 1 && x.t === 0));
  return {
    ...(tempo && tempo > 1e9 ? { tempo } : {}),
    ...(atraso !== undefined ? { atraso } : {}),
  };
}

/** Atualizações de viagens: para cada viagem em circulação, a hora prevista de cada paragem que falta */
export function lerViagensTub(buf: Uint8Array, horaDoFicheiro = 0): ViagemTub[] {
  const saida: ViagemTub[] = [];
  for (const entidade of lerCampos(buf).filter((c) => c.n === 2 && c.bytes)) {
    try {
      const tu = lerCampos(entidade.bytes as Uint8Array).find((c) => c.n === 3 && c.bytes);
      if (!tu) continue;
      const t = lerCampos(tu.bytes as Uint8Array);
      const viagem = t.find((c) => c.n === 1 && c.bytes);
      if (!viagem) continue;
      const vc = lerCampos(viagem.bytes as Uint8Array);
      const tripId = texto(vc.find((c) => c.n === 1)).trim();
      if (!tripId) continue;
      const routeId = texto(vc.find((c) => c.n === 5)).trim();
      const dia = texto(vc.find((c) => c.n === 3)).trim();
      const cancelada = numero(vc.find((c) => c.n === 4 && c.t === 0)) === 3;
      const veic = t.find((c) => c.n === 3 && c.bytes);
      const veiculo = veic ? texto(lerCampos(veic.bytes as Uint8Array).find((c) => c.n === 1)).trim() : '';
      const epoch = numero(t.find((c) => c.n === 4 && c.t === 0));
      const paragens: ParagemPrevistaTub[] = [];
      for (const stu of t.filter((c) => c.n === 2 && c.bytes)) {
        try {
          const s = lerCampos(stu.bytes as Uint8Array);
          const paragem = texto(s.find((c) => c.n === 4)).trim();
          if (!paragem) continue;
          const chegada = lerEvento(s.find((c) => c.n === 2));
          const partida = lerEvento(s.find((c) => c.n === 3));
          paragens.push({
            sequencia: numero(s.find((c) => c.n === 1 && c.t === 0)) ?? 0,
            paragem,
            ...(chegada.tempo ? { chegada: chegada.tempo } : {}),
            ...(partida.tempo ? { partida: partida.tempo } : {}),
            ...(chegada.atraso !== undefined && !chegada.tempo ? { atrasoChegada: chegada.atraso } : {}),
            ...(partida.atraso !== undefined && !partida.tempo ? { atrasoPartida: partida.atraso } : {}),
            saltada: numero(s.find((c) => c.n === 5 && c.t === 0)) === 1,
          });
        } catch {
          /* paragem estragada: passa à seguinte */
        }
      }
      saida.push({
        tripId,
        routeId,
        ...(veiculo ? { veiculo } : {}),
        ...(/^\d{8}$/.test(dia) ? { dia } : {}),
        cancelada,
        epoch: epoch && epoch > 1e9 ? epoch : horaDoFicheiro || Math.floor(Date.now() / 1000),
        paragens,
      });
    } catch {
      /* viagem estragada: passa à seguinte */
    }
  }
  return saida;
}

// ------------------------------------------------------------------------------------------ hora em direto de uma partida

/** O que a partida do horário precisa de ter para se ligar à previsão da TUB (códigos como estão na base: "tub_braga:…") */
export interface PartidaParaTub {
  trip_id: string;
  stop_id: string;
  dep_epoch_secs: number;
  /** Segundos desde a meia-noite do dia de serviço (pode passar de 86 400 nas viagens depois da meia-noite) */
  scheduled_seconds: number;
}

export type EstimativaTub =
  | { tipo: 'hora'; epoch: number; veiculo?: string }
  | { tipo: 'suprimida'; motivo: 'viagem' | 'paragem' };

/** Uma previsão mais de 3 horas afastada do horário não é desta partida (o código da viagem repete-se todos os dias) */
const DIFERENCA_MAXIMA_S = 3 * 3600;

const formatoDia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia de serviço (aaaammdd) de uma partida: a meia-noite do dia de serviço é a hora da partida menos os segundos do horário */
function diaDeServico(p: PartidaParaTub): string | null {
  if (!Number.isFinite(p.dep_epoch_secs) || !Number.isFinite(p.scheduled_seconds)) return null;
  return formatoDia.format(new Date((p.dep_epoch_secs - p.scheduled_seconds + 12 * 3600) * 1000)).replace(/-/g, '');
}

const semPrefixo = (id: string) => String(id || '').replace(/^tub_braga:/, '');

/**
 * Hora prevista pela TUB para esta partida (viagem e paragem), ou null se a TUB não tem previsão para ela.
 * Nunca se inventa: sem previsão da mesma viagem, do mesmo dia e perto da hora do horário, fica o horário.
 */
export function estimativaTub(partida: PartidaParaTub, viagens: Map<string, ViagemTub>): EstimativaTub | null {
  const v = viagens.get(semPrefixo(partida.trip_id));
  if (!v) return null;
  const dia = diaDeServico(partida);
  if (v.dia && dia && v.dia !== dia) return null; // é a viagem de outro dia
  if (v.cancelada) {
    // Sem o dia no ficheiro, só vale se a atualização for do mesmo dia da partida (12 horas é metade de um dia)
    if (!v.dia && Math.abs(partida.dep_epoch_secs - v.epoch) > 12 * 3600) return null;
    return { tipo: 'suprimida', motivo: 'viagem' };
  }
  const idParagem = semPrefixo(partida.stop_id);
  const tempoDe = (p: ParagemPrevistaTub): number | undefined => {
    const t = p.partida ?? p.chegada;
    if (t !== undefined) return t;
    const atraso = p.atrasoPartida ?? p.atrasoChegada;
    return atraso !== undefined ? partida.dep_epoch_secs + atraso : undefined;
  };
  // Uma viagem pode passar duas vezes na mesma paragem (linhas circulares): fica a que está mais perto do horário
  let melhor: { p: ParagemPrevistaTub; t?: number; d: number } | null = null;
  for (const p of v.paragens) {
    if (p.paragem !== idParagem) continue;
    const t = tempoDe(p);
    const d = t === undefined ? 0 : Math.abs(t - partida.dep_epoch_secs);
    if (!melhor || d < melhor.d) melhor = { p, t, d };
  }
  if (!melhor) return null;
  if (melhor.t !== undefined && melhor.d > DIFERENCA_MAXIMA_S) return null;
  if (melhor.p.saltada) return { tipo: 'suprimida', motivo: 'paragem' };
  if (melhor.t === undefined) return null;
  return { tipo: 'hora', epoch: Math.round(melhor.t), ...(v.veiculo ? { veiculo: v.veiculo } : {}) };
}

/**
 * Hora prevista de chegada a cada paragem que falta do percurso da viagem (por posição na lista de paragens).
 * Percorre as paragens por ordem e as previsões por ordem, por isso uma linha circular, que passa duas vezes na mesma paragem, fica certa.
 * `desde` é a posição da paragem seguinte: as anteriores já passaram e a TUB já não as envia.
 */
export function previsoesDoPercurso(viagem: ViagemTub, paragensDoPercurso: Array<{ id: string }>, desde: number): Map<number, number> {
  const saida = new Map<number, number>();
  const lista = [...viagem.paragens].sort((a, b) => a.sequencia - b.sequencia);
  let k = 0;
  for (let i = Math.max(0, desde); i < paragensDoPercurso.length; i++) {
    const id = semPrefixo(paragensDoPercurso[i].id);
    for (let j = k; j < lista.length; j++) {
      if (lista[j].paragem !== id) continue;
      const t = lista[j].chegada ?? lista[j].partida;
      if (t !== undefined && !lista[j].saltada) saida.set(i, Math.round(t));
      k = j + 1;
      break;
    }
  }
  return saida;
}

// ------------------------------------------------------------------------------------------ rumo (a TUB não o envia)

interface Ancora { lat: number; lon: number; rumo?: number; epoch: number }
const ancoras = new Map<string, Ancora>();
/** Distância mínima para o rumo ser fiável (o GPS de um autocarro parado tremem alguns metros) */
const RUMO_DISTANCIA_MIN_M = 8;

function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function rumoEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return Math.round((Math.atan2(y, x) / rad + 360) % 360) % 360;
}

/** Acrescenta o rumo às posições que não o têm, a partir do caminho que cada veículo fez desde a leitura anterior */
export function completarRumos(lista: PosicaoTub[]): void {
  const vistos = new Set<string>();
  for (const p of lista) {
    vistos.add(p.veiculo);
    const a = ancoras.get(p.veiculo);
    if (!a) { ancoras.set(p.veiculo, { lat: p.lat, lon: p.lon, rumo: p.rumo, epoch: p.epoch }); continue; }
    if (a.epoch === p.epoch) { if (p.rumo === undefined && a.rumo !== undefined) p.rumo = a.rumo; continue; }
    if (distanciaM(a, p) >= RUMO_DISTANCIA_MIN_M) {
      const rumo = p.rumo ?? rumoEntre(a, p);
      p.rumo = rumo;
      ancoras.set(p.veiculo, { lat: p.lat, lon: p.lon, rumo, epoch: p.epoch });
    } else {
      if (p.rumo === undefined && a.rumo !== undefined) p.rumo = a.rumo;
      a.epoch = p.epoch; // a âncora fica onde está para o movimento lento ir somando
      if (p.rumo !== undefined) a.rumo = p.rumo;
    }
  }
  if (ancoras.size > 500) for (const id of [...ancoras.keys()]) if (!vistos.has(id)) ancoras.delete(id);
}

/** Só para testes */
export function limparRumosTub(): void { ancoras.clear(); }

// ------------------------------------------------------------------------------------------ pedidos (partilhados e com cache)

export interface DadosTub<T> { dados: T; /** Idade dos dados, em segundos (pela hora do ficheiro e pela hora do pedido) */ idadeS: number }

function criarFonte<T>(nome: string, url: string, ler: (b: Uint8Array, hora: number) => T): (maxEsperaMs: number) => Promise<DadosTub<T> | null> {
  let cache: { dados: T; quando: number; hora: number } | null = null;
  let emCurso: Promise<void> | null = null;
  let ultimoPedido = 0;
  let falhou = false;
  let ultimoAviso = 0;

  const pedir = async (): Promise<void> => {
    ultimoPedido = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const corpo = new Uint8Array(await res.arrayBuffer());
      if (corpo.byteLength > MAX_BYTES) throw new Error('ficheiro grande demais');
      const hora = lerHoraDoFicheiro(corpo);
      const dados = ler(corpo, hora);
      cache = { dados, quando: Date.now(), hora };
      falhou = false;
    } catch (e: any) {
      falhou = true;
      if (Date.now() - ultimoAviso > 10 * 60 * 1000) {
        ultimoAviso = Date.now();
        console.warn(`[TUB] ${nome}: não consegui ler (${e?.message || e}); a app usa o horário até voltar.`);
      }
    }
  };

  return async (maxEsperaMs: number) => {
    const agora = Date.now();
    const fresca = !!cache && agora - cache.quando < TTL_MS;
    if (!fresca && !emCurso && agora - ultimoPedido >= (falhou ? ESPERA_APOS_FALHA_MS : INTERVALO_MIN_MS)) {
      emCurso = pedir().finally(() => { emCurso = null; });
    }
    if (!fresca && emCurso && maxEsperaMs > 0) {
      let t: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([emCurso, new Promise<void>((r) => { t = setTimeout(r, maxEsperaMs); })]);
      if (t) clearTimeout(t);
    }
    if (!cache) return null;
    const agoraS = Date.now() / 1000;
    const idadePeloPedido = (Date.now() - cache.quando) / 1000;
    const idadePelaHora = cache.hora ? Math.max(0, agoraS - cache.hora) : 0;
    const idadeS = Math.max(idadePeloPedido, idadePelaHora);
    if (idadeS > IDADE_MAXIMA_TUB_S) return null;
    return { dados: cache.dados, idadeS };
  };
}

/** Posições dos veículos da TUB (com rumo calculado). null = sem dados recentes. */
export const posicoesTub = criarFonte<PosicaoTub[]>('posições', URL_POSICOES_TUB, (b, hora) => {
  const lista = lerPosicoesTub(b, hora);
  completarRumos(lista);
  return lista;
});

/** Previsões por viagem da TUB, indexadas pelo código da viagem. null = sem dados recentes. */
export const viagensTub = criarFonte<Map<string, ViagemTub>>('viagens', URL_VIAGENS_TUB, (b, hora) => {
  const mapa = new Map<string, ViagemTub>();
  for (const v of lerViagensTub(b, hora)) mapa.set(v.tripId, v);
  return mapa;
});
