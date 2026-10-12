// API oficial da STCP (tempo real). Dados abertos da STCP (CC BY 4.0), cedidos à PAROU.PT.
// As credenciais (STCP_APP_ID e STCP_API_KEY) só existem no servidor e nunca saem daqui:
// não se registam em logs, não se enviam para o navegador e só servem esta plataforma.
//
//   GET /v1/real/tempos/{paragem}  -> próximas chegadas à paragem (atualizadas de 10 em 10 s)
//
// Se a API falhar, estiver sem credenciais ou pedir para abrandar, devolve null e o motor de tempo real
// recorre à fonte anterior (stcp.pt), como acontecia antes.

import { getDatabase } from './db/gtfsDatabase';

const BASE = 'https://api.stcp.pt:8443';
const TIMEOUT_MS = 2500;

export interface ChegadaStcpOficial {
  /** Linha como as pessoas a conhecem (ex.: "ZC", "805") */
  linha: string;
  /** Identificador da linha no GTFS (ex.: "107" para a linha ZC) */
  routeId: string;
  destino: string;
  longa: string;
  cor: string;
  tripId: string;
  /** Hora estimada de chegada à paragem (segundos desde 1970) */
  epoch: number;
  /** Atraso em relação ao horário, em segundos */
  atrasoS: number;
  cancelada: boolean;
  /** true se o autocarro tem posição GPS neste momento */
  comGps: boolean;
}

export function stcpApiConfigurada(): boolean {
  return !!(process.env.STCP_APP_ID && process.env.STCP_API_KEY);
}

// Se a STCP recusar as credenciais ou pedir para abrandar, não insistimos durante um tempo.
let pausadoAte = 0;
let avisouPausa = false;

function pausar(ms: number, motivo: string): void {
  pausadoAte = Date.now() + ms;
  if (!avisouPausa) {
    avisouPausa = true;
    console.warn(`[STCP API] ${motivo}; a usar a fonte anterior durante ${Math.round(ms / 1000)} s`);
  }
}

// Linhas da STCP na base (route_id "stcp:107" -> linha "ZC"), para dar nome e cor às chegadas.
interface InfoLinha { curta: string; longa: string; cor: string }
let linhasCache: { mapa: Map<string, InfoLinha>; ate: number } | null = null;

function infoDasLinhas(): Map<string, InfoLinha> {
  const agora = Date.now();
  if (linhasCache && agora < linhasCache.ate) return linhasCache.mapa;
  const mapa = new Map<string, InfoLinha>();
  try {
    const linhas = getDatabase()
      .prepare('SELECT route_id, route_short_name, route_long_name, route_color FROM routes WHERE feed_id = ?')
      .all('stcp') as Array<{ route_id: string; route_short_name: string | null; route_long_name: string | null; route_color: string | null }>;
    for (const l of linhas) {
      mapa.set(String(l.route_id).replace(/^stcp:/, '').toUpperCase(), {
        curta: String(l.route_short_name || '').trim(),
        longa: String(l.route_long_name || '').trim(),
        cor: String(l.route_color || '').trim(),
      });
    }
  } catch {
    // sem base: ficam os identificadores da própria API
  }
  // Só se guarda se vier alguma coisa; se a base ainda está a arrancar, tenta-se de novo daqui a pouco.
  linhasCache = { mapa, ate: agora + (mapa.size > 0 ? 30 * 60 * 1000 : 30 * 1000) };
  return mapa;
}

/** Converte a resposta da API em chegadas. Exportado para testes. */
export function lerChegadas(json: unknown, mapaLinhas: Map<string, InfoLinha> = new Map()): ChegadaStcpOficial[] {
  if (!Array.isArray(json)) return [];
  const saida: ChegadaStcpOficial[] = [];
  for (const item of json) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const relacao = String(a.schedule_relationship ?? '');
    // "Sem dados": a STCP não tem tempo real para esta viagem, não é uma estimativa.
    if (/no.?data/i.test(relacao)) continue;
    const epoch = Date.parse(String(a.real_time_arrival_time ?? '')) / 1000;
    if (!Number.isFinite(epoch)) continue;
    const routeId = String(a.route_id ?? '').trim();
    if (!routeId) continue;
    const info = mapaLinhas.get(routeId.toUpperCase());
    const atraso = Number(a.delay);
    saida.push({
      linha: info?.curta || routeId,
      routeId,
      destino: String(a.destination ?? '').trim(),
      longa: info?.longa || '',
      cor: info?.cor || '',
      tripId: String(a.trip_id ?? ''),
      epoch,
      atrasoS: Number.isFinite(atraso) ? atraso : 0,
      cancelada: /cancel|skip/i.test(relacao),
      comGps: a.latitude != null && a.longitude != null && Number(a.distance) > 0,
    });
  }
  return saida;
}

/**
 * Próximas chegadas a uma paragem da STCP (código como na STCP, ex.: "ANT1").
 * Devolve null se a API não estiver disponível (o chamador usa então a fonte anterior).
 */
export async function chegadasStcpOficial(codigoParagem: string): Promise<ChegadaStcpOficial[] | null> {
  if (!stcpApiConfigurada() || Date.now() < pausadoAte) return null;
  const codigo = codigoParagem.trim();
  if (!/^[A-Za-z0-9._-]{1,16}$/.test(codigo)) return null;
  try {
    const res = await fetch(`${BASE}/v1/real/tempos/${encodeURIComponent(codigo)}`, {
      headers: {
        'X-App-Id': process.env.STCP_APP_ID as string,
        'X-Api-Key': process.env.STCP_API_KEY as string,
        Accept: 'application/json',
        'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      pausar(10 * 60 * 1000, `a API recusou as credenciais (HTTP ${res.status})`);
      return null;
    }
    if (res.status === 429) {
      const espera = Number(res.headers.get('retry-after'));
      pausar(Number.isFinite(espera) && espera > 0 ? Math.min(espera, 600) * 1000 : 60 * 1000, 'a API pediu para abrandar (HTTP 429)');
      return null;
    }
    if (!res.ok) return null; // inclui 404: deixa a fonte anterior tentar
    avisouPausa = false;
    return lerChegadas(await res.json(), infoDasLinhas());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Posição dos autocarros (GTFS-Realtime, formato protobuf, atualizado de 10 em 10 s)
//   GET /v1/ficheiros/real/stream/vehiclepositions
// Leitura mínima do protobuf, só dos campos que a PAROU usa (sem dependências).
// ---------------------------------------------------------------------------

export interface PosicaoStcpOficial {
  id: string;
  veiculo: string;
  routeId: string;
  linha: string;
  tripId: string;
  lat: number;
  lon: number;
  rumo?: number;
  /** km/h */
  velocidade?: number;
  /** segundos desde 1970 */
  epoch: number;
}

interface CampoProto { n: number; t: number; num: number; bytes?: Uint8Array }

function lerVarint(buf: Uint8Array, pos: number): [number, number] {
  let valor = 0;
  let mult = 1;
  let p = pos;
  while (p < buf.length && mult <= 2 ** 49) {
    const b = buf[p++];
    valor += (b & 0x7f) * mult;
    if ((b & 0x80) === 0) return [valor, p];
    mult *= 128;
  }
  throw new Error('protobuf: número inválido');
}

function lerCampos(buf: Uint8Array): CampoProto[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const campos: CampoProto[] = [];
  let p = 0;
  while (p < buf.length) {
    const [chave, depoisChave] = lerVarint(buf, p);
    p = depoisChave;
    const n = Math.floor(chave / 8);
    const t = chave % 8;
    if (t === 0) {
      const [v, q] = lerVarint(buf, p);
      p = q;
      campos.push({ n, t, num: v });
    } else if (t === 1) {
      if (p + 8 > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: dv.getFloat64(p, true) });
      p += 8;
    } else if (t === 2) {
      const [len, q] = lerVarint(buf, p);
      p = q;
      if (p + len > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: 0, bytes: buf.subarray(p, p + len) });
      p += len;
    } else if (t === 5) {
      if (p + 4 > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: dv.getFloat32(p, true) });
      p += 4;
    } else {
      throw new Error('protobuf: tipo de campo desconhecido');
    }
  }
  return campos;
}

const texto = (c?: CampoProto): string => (c?.bytes ? new TextDecoder().decode(c.bytes) : '');

/** Lê um ficheiro GTFS-Realtime de posições. Exportado para testes. */
export function lerPosicoes(buf: Uint8Array, mapaLinhas: Map<string, InfoLinha> = new Map()): PosicaoStcpOficial[] {
  const saida: PosicaoStcpOficial[] = [];
  for (const entidade of lerCampos(buf).filter((c) => c.n === 2 && c.bytes)) {
    const veiculo = lerCampos(entidade.bytes as Uint8Array).find((c) => c.n === 4 && c.bytes);
    if (!veiculo) continue;
    const v = lerCampos(veiculo.bytes as Uint8Array);
    const viagem = v.find((c) => c.n === 1 && c.bytes);
    const posicao = v.find((c) => c.n === 2 && c.bytes);
    if (!posicao) continue;
    const pos = lerCampos(posicao.bytes as Uint8Array);
    const lat = pos.find((c) => c.n === 1 && c.t === 5)?.num;
    const lon = pos.find((c) => c.n === 2 && c.t === 5)?.num;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat < 40.5 || lat > 42.5 || lon < -9.5 || lon > -7.5) continue; // fora da zona do Porto
    const rumo = pos.find((c) => c.n === 3 && c.t === 5)?.num;
    const ms = pos.find((c) => c.n === 5 && c.t === 5)?.num;
    const viagemCampos = viagem ? lerCampos(viagem.bytes as Uint8Array) : [];
    const tripId = texto(viagemCampos.find((c) => c.n === 1));
    const routeId = texto(viagemCampos.find((c) => c.n === 5)).trim();
    const desc = v.find((c) => c.n === 8 && c.bytes);
    const descCampos = desc ? lerCampos(desc.bytes as Uint8Array) : [];
    const idVeiculo = texto(descCampos.find((c) => c.n === 1)) || texto(descCampos.find((c) => c.n === 2));
    if (!idVeiculo) continue;
    const epoch = v.find((c) => c.n === 5 && c.t === 0)?.num;
    saida.push({
      id: `stcp:${idVeiculo}`,
      veiculo: idVeiculo,
      routeId,
      linha: mapaLinhas.get(routeId.toUpperCase())?.curta || routeId || 'STCP',
      tripId,
      lat,
      lon,
      rumo: rumo !== undefined && Number.isFinite(rumo) ? Math.round(rumo) : undefined,
      velocidade: ms !== undefined && Number.isFinite(ms) ? Math.round(ms * 3.6) : undefined,
      epoch: epoch !== undefined && epoch > 0 ? epoch : Math.floor(Date.now() / 1000),
    });
  }
  return saida;
}

let posicoesCache: { dados: PosicaoStcpOficial[]; quando: number } = { dados: [], quando: 0 };
const POSICOES_TTL_MS = 10 * 1000;
const MAX_POSICOES_BYTES = 5 * 1024 * 1024;

/** Posição de todos os autocarros da STCP. Devolve null se a API não estiver disponível. */
export async function posicoesStcpOficial(): Promise<PosicaoStcpOficial[] | null> {
  if (!stcpApiConfigurada() || Date.now() < pausadoAte) return null;
  const agora = Date.now();
  if (posicoesCache.dados.length > 0 && agora - posicoesCache.quando < POSICOES_TTL_MS) return posicoesCache.dados;
  try {
    const res = await fetch(`${BASE}/v1/ficheiros/real/stream/vehiclepositions`, {
      headers: {
        'X-App-Id': process.env.STCP_APP_ID as string,
        'X-Api-Key': process.env.STCP_API_KEY as string,
        'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 403) {
      pausar(10 * 60 * 1000, `a API recusou as credenciais (HTTP ${res.status})`);
      return null;
    }
    if (res.status === 429) {
      const espera = Number(res.headers.get('retry-after'));
      pausar(Number.isFinite(espera) && espera > 0 ? Math.min(espera, 600) * 1000 : 60 * 1000, 'a API pediu para abrandar (HTTP 429)');
      return null;
    }
    if (!res.ok) return null;
    const corpo = new Uint8Array(await res.arrayBuffer());
    if (corpo.byteLength > MAX_POSICOES_BYTES) return null;
    const limite = Math.floor(agora / 1000) - 300; // posições com mais de 5 min não se mostram
    const dados = lerPosicoes(corpo, infoDasLinhas()).filter((p) => p.epoch >= limite);
    // Ficheiro vazio, ilegível ou todo antigo não substitui a fonte anterior
    if (dados.length === 0) return null;
    avisouPausa = false;
    posicoesCache = { dados, quando: agora };
    return dados;
  } catch {
    return null;
  }
}
