// =====================================================================================
// PAROU.PT — Tempo real dentro do cálculo de percursos
//
// O planeador (RAPTOR, planeadorIndice.ts) trabalha com os horários do GTFS. Aqui junta-se o que os operadores dizem em
// direto sobre as viagens que estão a circular (GTFS-Realtime, "trip updates"):
//   - Carris Metropolitana: previsões da plataforma GO da TML (organização LA3SO), com os mesmos códigos de viagem do GTFS
//     que a base guarda como "cmh:<viagem>";
//   - UNIR: previsões da TMP na mesma plataforma (organização 53JAZ), com os códigos do GTFS da TMP ("unirh:<viagem>");
//   - TUB (Braga): as mesmas previsões que a app já usa nas partidas ("tub_braga:<viagem>").
// Para cada viagem com previsão calcula-se o atraso em cada paragem do padrão: o motor passa a usar a hora prevista para
// entrar, sair e fazer transbordos, deixa de propor viagens suprimidas e não entra em paragens por onde o veículo já passou
// ou que vai saltar. Nada se inventa: sem previsão recente (menos de 3 min) fica o horário.
// =====================================================================================
import { DateTime } from 'luxon';
import type { Indice } from './planeadorIndice';
import { lerHoraDoFicheiro, lerViagensTub, viagensTub, type ViagemTub } from './tubTempoReal';
import { registerCacheClearCallback } from './db/gtfsDatabase';

/** Previsões em GTFS-Realtime da Carris Metropolitana (plataforma GO da TML; sem chave) */
export const URL_PREVISOES_CM = 'https://go.tmlmobilidade.pt/hub/api/v1/LA3SO/eta/gtfs.pb';
/** Previsões em GTFS-Realtime da UNIR (TMP, na mesma plataforma; sem chave) */
export const URL_PREVISOES_UNIR = 'https://go.tmlmobilidade.pt/hub/api/v1/53JAZ/eta/gtfs.pb';

/** Valor de atraso que quer dizer "não se pode usar esta paragem nesta viagem" (já passou, vai saltar ou foi suprimida) */
export const NAO = 0x40000000;
/** Previsões com mais de 3 minutos não entram no cálculo */
export const IDADE_MAXIMA_S = 180;
/** Uma previsão a mais de 3 horas do horário é de outro dia (ou está errada): ignora-se a viagem */
const DESVIO_MAXIMO_S = 3 * 3600;
/**
 * Um autocarro não anda 10 min adiantado: uma previsão assim é de um veículo posto na viagem errada (a TML chegou a dar 25 min de
 * avanço). A viagem fica com o horário.
 */
export const ADIANTO_MAXIMO_S = 10 * 60;

const TTL_MS = 20_000;
const ESPERA_APOS_FALHA_MS = 60_000;
const TIMEOUT_MS = 4_000;
const MAX_BYTES = 8 * 1024 * 1024;

interface Fonte { prefixo: string; feed: string; viagens: Map<string, ViagemTub>; hora: number; quando: number }

/** Uma fonte da plataforma GO da TML: um pedido partilhado por todos, no máximo de 20 em 20 s (60 s depois de uma falha) */
interface FonteTml { nome: string; url: string; prefixo: string; feed: string; dados: Fonte | null; emCurso: Promise<void> | null; ultimoPedido: number; falhou: boolean; ultimoAviso: number }
const fontesTml: FonteTml[] = [
  { nome: 'Carris Metropolitana', url: URL_PREVISOES_CM, prefixo: 'cmh:', feed: 'cmh', dados: null, emCurso: null, ultimoPedido: 0, falhou: false, ultimoAviso: 0 },
  { nome: 'UNIR', url: URL_PREVISOES_UNIR, prefixo: 'unirh:', feed: 'unirh', dados: null, emCurso: null, ultimoPedido: 0, falhou: false, ultimoAviso: 0 },
];
let versao = 0;

async function pedirTml(f: FonteTml): Promise<void> {
  f.ultimoPedido = Date.now();
  try {
    const res = await fetch(f.url, { headers: { 'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const corpo = new Uint8Array(await res.arrayBuffer());
    if (corpo.byteLength > MAX_BYTES) throw new Error('ficheiro grande demais');
    const hora = lerHoraDoFicheiro(corpo);
    const viagens = new Map<string, ViagemTub>();
    for (const v of lerViagensTub(corpo, hora)) viagens.set(v.tripId, v);
    f.dados = { prefixo: f.prefixo, feed: f.feed, viagens, hora, quando: Date.now() };
    versao++;
    f.falhou = false;
  } catch (e: any) {
    f.falhou = true;
    if (Date.now() - f.ultimoAviso > 10 * 60 * 1000) {
      f.ultimoAviso = Date.now();
      console.warn(`[Planeador] previsões da ${f.nome}: não consegui ler (${e?.message || e}); uso o horário.`);
    }
  }
}

const idade = (f: { hora: number; quando: number }) => Math.max((Date.now() - f.quando) / 1000, f.hora ? Date.now() / 1000 - f.hora : 0);

let tub: Fonte | null = null;

/**
 * Atualiza as previsões e espera por elas até `maxEsperaMs` (só se não houver nenhumas de há menos de 1 min: aí usa-se o
 * que há e atualiza-se por trás). Chamar no início de cada planeamento.
 */
export async function atualizarTempoReal(maxEsperaMs = 800): Promise<void> {
  const agora = Date.now();
  const recente = (f: Fonte | null) => !!f && idade(f) < 60;
  const espera: Promise<unknown>[] = [];
  for (const f of fontesTml) {
    const fresca = !!f.dados && agora - f.dados.quando < TTL_MS;
    if (!fresca && !f.emCurso && agora - f.ultimoPedido >= (f.falhou ? ESPERA_APOS_FALHA_MS : TTL_MS)) {
      f.emCurso = pedirTml(f).finally(() => { f.emCurso = null; });
    }
    if (!fresca && f.emCurso && !recente(f.dados)) espera.push(f.emCurso);
  }
  espera.push(viagensTub(recente(tub) ? 0 : maxEsperaMs).then((d) => {
    if (d && (!tub || tub.viagens !== d.dados)) { tub = { prefixo: 'tub_braga:', feed: 'tub_braga', viagens: d.dados, hora: Math.floor(Date.now() / 1000 - d.idadeS), quando: Date.now() - d.idadeS * 1000 }; versao++; }
  }).catch(() => undefined));
  let t: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(espera), new Promise<void>((r) => { t = setTimeout(r, maxEsperaMs); })]);
  if (t) clearTimeout(t);
}

/** Atrasos de um padrão: viagem (posição no padrão) -> atraso em segundos em cada paragem (ou NAO) */
export interface RtPadrao { viagens: Map<number, Int32Array>; maxAtraso: number; maxAdianto: number }
export type CamadaTempoReal = Map<number, RtPadrao>;

const camadas = new Map<string, CamadaTempoReal>();
let camadasDe: Indice | null = null;
let viagemDe: { ix: Indice; mapa: Map<string, number> } | null = null;

registerCacheClearCallback(() => { camadas.clear(); viagemDe = null; camadasDe = null; });

/** Código de viagem -> padrão * 2^20 + posição (só dos feeds com previsões) */
function viagensDoIndice(ix: Indice): Map<string, number> {
  if (viagemDe && viagemDe.ix === ix) return viagemDe.mapa;
  const mapa = new Map<string, number>();
  ix.padroes.forEach((pd, p) => {
    if (pd.freq || (pd.feed !== 'cmh' && pd.feed !== 'unirh' && pd.feed !== 'tub_braga')) return;
    for (let t = 0; t < pd.nT; t++) mapa.set(pd.tripId[t], p * 1048576 + t);
  });
  viagemDe = { ix, mapa };
  return mapa;
}

/**
 * Camada de tempo real para as viagens de um dia de serviço (aaaammdd). undefined = nada a corrigir.
 * Fica em memória enquanto as previsões não mudarem.
 */
export function camadaTempoReal(ix: Indice, diaServico: string): CamadaTempoReal | undefined {
  const fontes = [...fontesTml.map((f) => f.dados), tub].filter((f): f is Fonte => !!f && idade(f) <= IDADE_MAXIMA_S);
  if (!fontes.length) return undefined;
  if (camadasDe !== ix) { camadas.clear(); camadasDe = ix; }
  const chave = `${diaServico}|${versao}|${fontes.map((f) => f.feed).join(',')}`;
  const ja = camadas.get(chave);
  if (ja) return ja.size ? ja : undefined;
  const meiaNoite = DateTime.fromFormat(diaServico, 'yyyyMMdd', { zone: 'Europe/Lisbon' }).startOf('day');
  if (!meiaNoite.isValid) return undefined;
  const m0 = Math.floor(meiaNoite.toSeconds());
  const porViagem = viagensDoIndice(ix);
  const camada: CamadaTempoReal = new Map();
  for (const f of fontes) {
    for (const v of f.viagens.values()) {
      if (v.dia && v.dia !== diaServico) continue;
      const cod = porViagem.get(f.prefixo + v.tripId);
      if (cod === undefined) continue;
      const p = Math.floor(cod / 1048576), t = cod % 1048576;
      const atrasos = atrasosDaViagem(ix, p, t, v, m0, f.prefixo);
      if (!atrasos) continue;
      let rp = camada.get(p);
      if (!rp) { rp = { viagens: new Map(), maxAtraso: 0, maxAdianto: 0 }; camada.set(p, rp); }
      rp.viagens.set(t, atrasos);
      for (const d of atrasos) {
        if (d === NAO) continue;
        if (d > rp.maxAtraso) rp.maxAtraso = d;
        if (-d > rp.maxAdianto) rp.maxAdianto = -d;
      }
    }
  }
  if (camadas.size > 8) camadas.clear();
  camadas.set(chave, camada);
  return camada.size ? camada : undefined;
}

/**
 * Atraso em cada paragem do padrão. Antes da primeira paragem com previsão o veículo já passou (NAO); entre previsões vale a
 * última (como diz a norma GTFS-Realtime); paragens saltadas e viagens suprimidas ficam NAO.
 */
export function atrasosDaViagem(ix: Indice, p: number, t: number, v: ViagemTub, meiaNoite: number, prefixo: string): Int32Array | null {
  const pd = ix.padroes[p], nS = pd.stops.length, o = t * nS;
  const atrasos = new Int32Array(nS).fill(NAO);
  if (v.cancelada) return atrasos;
  const prefixoParagem = prefixo === 'cmh:' ? 'cm:' : prefixo === 'unirh:' ? 'unir:' : prefixo;
  const marcas = new Map<number, { d: number | null; salta: boolean }>();
  let ultima = 0;
  const paragens = [...v.paragens].sort((a, b) => a.sequencia - b.sequencia);
  for (const s of paragens) {
    // posição no padrão: pela sequência do GTFS e, se não bater, pelo código da paragem
    let pos = -1;
    for (let j = ultima; j < nS; j++) if (pd.seq[o + j] === s.sequencia) { pos = j; break; }
    if (pos < 0) for (let j = ultima; j < nS; j++) if (ix.stopId[pd.stops[j]] === prefixoParagem + s.paragem) { pos = j; break; }
    if (pos < 0) continue;
    ultima = pos;
    let d: number | null = null;
    if (s.chegada) d = s.chegada - (meiaNoite + pd.arr[o + pos]);
    else if (s.partida) d = s.partida - (meiaNoite + pd.dep[o + pos]);
    else if (s.atrasoChegada !== undefined) d = s.atrasoChegada;
    else if (s.atrasoPartida !== undefined) d = s.atrasoPartida;
    if (d !== null && Math.abs(d) > DESVIO_MAXIMO_S) return null; // de outro dia
    if (d !== null && d < -ADIANTO_MAXIMO_S) return null; // adiantado demais: previsão de outra viagem
    marcas.set(pos, { d, salta: s.saltada });
  }
  if (!marcas.size) return null;
  const primeira = Math.min(...marcas.keys());
  let atual: number | null = null;
  let conhecida = false;
  // As horas previstas nunca andam para trás ao longo da viagem: a TML às vezes dá a uma paragem mais à frente uma hora antes da
  // de uma paragem anterior, e o motor aproveitava isso para "viajar no tempo" (percursos com a viagem seguinte a sair antes de a
  // anterior chegar). Cada paragem fica, no mínimo, com a hora prevista da anterior.
  let horaAnterior = -Infinity;
  for (let j = primeira; j < nS; j++) {
    const m = marcas.get(j);
    if (m && m.d !== null) { atual = m.d; conhecida = true; }
    if (!conhecida) continue; // sem hora prevista ainda (só "salta"): fica NAO até haver uma
    let d = atual as number;
    const chega = pd.arr[o + j], parte = pd.dep[o + j];
    if (chega + d < horaAnterior) d = horaAnterior - chega;
    horaAnterior = Math.max(horaAnterior, chega + d, parte + d);
    atrasos[j] = m?.salta ? NAO : d;
  }
  return atrasos;
}

/** Hora prevista (segundos do dia de serviço) de partida ou chegada; -1 = não se pode usar; sem previsão, o horário */
export function horaPrevista(ix: Indice, rt: CamadaTempoReal | undefined, p: number, t: number, pos: number, chegada: boolean): { hora: number; atraso?: number } {
  const pd = ix.padroes[p], nS = pd.stops.length;
  const base = chegada ? pd.arr[t * nS + pos] : pd.dep[t * nS + pos];
  const a = rt?.get(p)?.viagens.get(t);
  if (!a) return { hora: base };
  const d = a[pos];
  if (d === NAO) return { hora: -1 };
  return { hora: base + d, atraso: d };
}

/** Só para os testes: esquece as previsões */
export function limparTempoRealPlaneador(): void {
  for (const f of fontesTml) { f.dados = null; f.emCurso = null; f.ultimoPedido = 0; f.falhou = false; }
  tub = null; camadas.clear(); versao++;
}
