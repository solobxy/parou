// Rota com vários destinos (até 5): cada troço vai do destino anterior ao seguinte e começa
// quando se chega ao anterior (mais o tempo que se fica lá). As opções de cada troço vêm do
// mesmo planeador de sempre, ordenadas da mais rápida/simples para a mais lenta.

import { planTransitRoute } from './pertoApi';
import { viagemUnir, motivosFalhaUnir } from './unirAmp';
import { opcoesComUnir } from './hibridasUnir';
import { textoMetros } from '../utils/distancia';
import { limitarComModos } from '../utils/escolhaOpcoes';
import { t, tn, LOCALE } from '../i18n';
import type { DestinationSuggestion, TransitRouteOption } from '../types/perto';

export const MAX_DESTINOS = 5;
/** Tempos de permanência oferecidos em cada destino intermédio (minutos) */
export const PERMANENCIAS_MIN = [0, 10, 15, 30, 45, 60, 90, 120, 180];

export interface Ponto { lat: number; lon: number }

/** Um destino da viagem e o tempo que se fica lá antes de seguir para o próximo */
export interface DestinoViagem {
  uid: string;
  dest: DestinationSuggestion;
  /** Minutos que se fica neste destino antes de seguir (não conta no último) */
  permanencia: number;
}

/** Quando não há paragens com horários perto: metros até à mais próxima (-1 = nenhuma a menos de 8 km) */
export interface LongeDeParagens { origem?: number; destino?: number }
/** Opções de um troço; `longe` só vem quando não há nenhuma e falta cobertura de horários */
export type OpcoesTroco = TransitRouteOption[] & { longe?: LongeDeParagens };

/** Texto de "sem ligações": explica a falta de paragens com horários perto, se for esse o motivo */
export function textoSemLigacao(longe?: LongeDeParagens): string {
  const base = t('Não encontrámos ligações em transportes daqui para lá, hoje ou amanhã de manhã (até três transbordos e ~1,5 km a pé de cada lado).');
  if (!longe || (longe.origem === undefined && longe.destino === undefined)) return base;
  const km = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
  const dist = (m: number) => (m < 0 ? t('mais de 8 km') : m >= 1000 ? `${km.format(m / 1000)} km` : textoMetros(m));
  const frases: string[] = [];
  if (longe.origem !== undefined) frases.push(t('Não há paragens com horários perto da origem (a mais próxima fica a {d}).', { d: dist(longe.origem) }));
  if (longe.destino !== undefined) frases.push(t('Não há paragens com horários perto do destino (a mais próxima fica a {d}).', { d: dist(longe.destino) }));
  frases.push(t('A PAROU ainda não tem os horários de todos os operadores desta zona.'));
  return frases.join(' ');
}

export type EstadoTroco = 'espera' | 'a-calcular' | 'ok' | 'sem-ligacao' | 'erro';

/** Um troço da viagem: do ponto anterior (ou da posição atual) até ao destino com o mesmo índice */
export interface Troco {
  estado: EstadoTroco;
  opcoes: TransitRouteOption[];
  /** Só em "sem-ligacao": falta de paragens com horários perto da origem ou do destino */
  longe?: LongeDeParagens;
  /** Índice, em `opcoes`, da opção escolhida (a primeira é a mais rápida) */
  escolhida: number;
  /** Instante (ms) em que se parte */
  partida: number;
  /** Instante (ms) em que se chega ao destino com a opção escolhida */
  chegada: number | null;
}

export const trocoVazio = (estado: EstadoTroco): Troco => ({ estado, opcoes: [], escolhida: 0, partida: 0, chegada: null });

let contador = 0;
export function novoUid(): string { contador += 1; return `d${Date.now().toString(36)}${contador}`; }

export function pontoDoDestino(d: DestinoViagem): Ponto { return { lat: d.dest.latitude, lon: d.dest.longitude }; }

/**
 * Ordena as opções de um troço da mais rápida para a mais lenta (hora de chegada); em caso de
 * empate ganha a que tem menos transbordos e, depois, menos a pé. Marca a mais rápida.
 */
export function ordenarOpcoes(lista: TransitRouteOption[]): TransitRouteOption[] {
  const ordem = (a: TransitRouteOption, b: TransitRouteOption) => a.totalDurationMinutes - b.totalDurationMinutes
    || a.transfersCount - b.transfersCount
    || a.walkingMinutes - b.walkingMinutes;
  // A mesma viagem pode chegar por caminhos diferentes (ligação direta, combinação…): fica a mais rápida
  const assinatura = (r: TransitRouteOption) => {
    const t = r.legs.filter((l) => l.mode === 'TRANSIT').map((l) => `${l.lineCode}|${l.fromStopName}|${l.departureTime}`).join('>');
    return t || r.id;
  };
  const vistas = new Set<string>();
  const unicas = [...lista].sort(ordem).filter((r) => {
    const sig = assinatura(r);
    if (vistas.has(r.id) || vistas.has(sig)) return false;
    vistas.add(r.id); vistas.add(sig);
    return true;
  });
  const melhor = unicas.find((r) => r.id !== 'a-pe');
  // Até 5 opções, com pelo menos uma de cada meio de transporte (o metro não pode ficar de fora só por haver 5 autocarros mais rápidos)
  return limitarComModos(unicas, 5).map((r) => ({
    ...r,
    badgeLabel: r.id === 'a-pe' ? t('A pé')
      : r.id === melhor?.id ? (r.transfersCount ? `${t('Mais rápido')} · ${tn(r.transfersCount, '{n} transbordo', '{n} transbordos')}` : t('Mais rápido'))
      : r.transfersCount ? tn(r.transfersCount, '{n} transbordo', '{n} transbordos') : t('Direto'),
  }));
}

/** Instante (ms) em que se chega ao fim da opção, partindo no instante `partida` (ms) */
export function chegadaDe(opcao: TransitRouteOption, partida: number): number {
  return partida + Math.max(0, opcao.totalDurationMinutes) * 60_000;
}

/**
 * Opções (ordenadas) para ir de `de` a `para` partindo no instante `partida` (ms).
 * `nivel`: quantas vezes já se continuou uma viagem depois de uma linha da UNIR (0, 1 ou 2); a partir do 2 já só
 * se aceitam combinações que chegam ao destino.
 */
export async function calcularTroco(
  de: Ponto, para: Ponto, nomeDestino: string, partida: number, aindaValido: () => boolean = () => true, nivel = 0,
): Promise<OpcoesTroco> {
  const res = await planTransitRoute(de.lat, de.lon, para.lat, para.lon, nomeDestino, new Date(partida), { nivel });
  if (!aindaValido()) return [];
  let rotas = ordenarOpcoes(res.routes || []);
  // UNIR: o telemóvel pede à AMP a hora de cada ligação direta encontrada pelo servidor
  const candidatos = (res.unir || []).slice(0, 4);
  const desde = Math.floor(partida / 1000);
  const diretas = Promise.all(candidatos.map((c) => viagemUnir(c, nomeDestino, res.originCoords, res.destCoords, desde).catch(() => null)));
  // ...e junta a rede normal com a UNIR (em qualquer ordem) quando nenhuma ligação direta serve
  const combinadas = opcoesComUnir(
    res, nomeDestino, partida,
    nivel >= 2 ? null : (ponto, quandoMs) => calcularTroco(ponto, para, nomeDestino, quandoMs, aindaValido, nivel + 1),
    aindaValido,
  ).catch(() => [] as TransitRouteOption[]);
  const [diretasOk, combinadasOk] = await Promise.all([diretas, combinadas]);
  motivosFalhaUnir(); // só serve para o diagnóstico do planeador normal
  const extra = [...(diretasOk.filter(Boolean) as TransitRouteOption[]), ...combinadasOk];
  if (extra.length && aindaValido()) rotas = ordenarOpcoes([...rotas, ...extra]);
  return Object.assign(rotas, res.longe && !rotas.length ? { longe: res.longe } : {});
}

/**
 * Primeiro troço que muda entre duas versões da lista de destinos (outro destino, outra ordem ou
 * outro tempo de permanência no anterior). Devolve `novo.length` se nenhum troço precisa de ser refeito.
 */
export function primeiroTrocoAlterado(antigo: DestinoViagem[], novo: DestinoViagem[]): number {
  for (let i = 0; i < novo.length; i++) {
    const a = antigo[i];
    if (!a || a.uid !== novo[i].uid) return i;
    if (i > 0 && antigo[i - 1].permanencia !== novo[i - 1].permanencia) return i;
  }
  return novo.length;
}

/** "1 h 05 min", "42 min" */
export function formatarDuracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')} min` : `${h} h`;
}

/** Hora (24 h) de Lisboa de um instante em ms */
export function horaDe(ms: number): string {
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

/** Dia (aaaa-mm-dd) de Lisboa de um instante em ms */
function diaDe(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** "Chegas às 18:40" (ou "Chegas amanhã às 00:15", se já for outro dia do que `base`) */
export function textoChegada(ms: number, base: number): string {
  return diaDe(ms) !== diaDe(base) ? t('Chegas amanhã às {h}', { h: horaDe(ms) }) : t('Chegas às {h}', { h: horaDe(ms) });
}

/** Texto do tempo de permanência: "Sem demora", "30 min", "1 h" */
export function textoPermanencia(min: number): string {
  if (min <= 0) return t('Sem demora');
  return formatarDuracao(min);
}
