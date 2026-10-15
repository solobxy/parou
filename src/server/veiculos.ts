// Lista leve de autocarros em direto para o mapa e para o "A bordo": só o que a app precisa, filtrado por linhas e/ou por uma caixa no mapa.
// Não inventa nada: são as posições que os operadores enviam (Carris Metropolitana, STCP e TUB), com a hora a que cada uma foi medida.

import type { LiveVehicle } from './realtimeEngine';
import { chaveDeLinha, type OperadorVeiculos } from '../utils/chaveLinha';
import type { VeiculoLeve } from '../types/aBordo';
import { LADO_MAX_GRAUS, LIMITES_PORTUGAL, TOLERANCIA_GRAUS, type Caixa } from '../utils/caixaVeiculos';

export type { VeiculoLeve, Caixa };

/** Quantos autocarros no máximo numa resposta: com o mapa muito afastado ficam os mais perto do centro do ecrã (resposta leve) */
export const MAX_VEICULOS_RESPOSTA = 700;

export function operadorDoVeiculo(v: Pick<LiveVehicle, 'operator'>): OperadorVeiculos | null {
  if (v.operator === 'STCP') return 'stcp';
  if (v.operator === 'Carris Metropolitana') return 'cm';
  if (v.operator === 'TUB') return 'tub';
  return null;
}

/** "sul,oeste,norte,leste" em graus */
export function lerCaixa(texto: unknown): Caixa | null {
  if (typeof texto !== 'string') return null;
  const n = texto.split(',').map((x) => Number(x));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [sul, oeste, norte, leste] = n;
  if (sul >= norte || oeste >= leste) return null;
  if (sul < LIMITES_PORTUGAL.sul || norte > LIMITES_PORTUGAL.norte || oeste < LIMITES_PORTUGAL.oeste || leste > LIMITES_PORTUGAL.leste) return null; // Portugal, Açores e Madeira incluídos
  // Raio largo (até 0,6° de lado): chega para ver uma cidade ou uma região; impede pedidos do país inteiro
  if (norte - sul > LADO_MAX_GRAUS + TOLERANCIA_GRAUS || leste - oeste > LADO_MAX_GRAUS + TOLERANCIA_GRAUS) return null;
  return { sul, oeste, norte, leste };
}

const arredondar = (x: number, casas: number) => Math.round(x * 10 ** casas) / 10 ** casas;

export function paraVeiculoLeve(v: LiveVehicle): VeiculoLeve | null {
  const op = operadorDoVeiculo(v);
  if (!op || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return null;
  const linha = String(v.line_id ?? '').replace(/\[[^\]]*\]/g, '').trim();
  if (!linha) return null;
  return {
    id: v.id,
    op,
    linha,
    lat: arredondar(v.lat, 5),
    lon: arredondar(v.lon, 5),
    ...(typeof v.bearing === 'number' && Number.isFinite(v.bearing) ? { rumo: Math.round(v.bearing) } : {}),
    ...(typeof v.speed === 'number' && Number.isFinite(v.speed) ? { vel: Math.round(v.speed) } : {}),
    t: Math.round(v.timestamp),
    ...(v.prev && Number.isFinite(v.prev.lat) && Number.isFinite(v.prev.lon) && v.prev.timestamp < v.timestamp
      ? { ant: { lat: arredondar(v.prev.lat, 5), lon: arredondar(v.prev.lon, 5), t: Math.round(v.prev.timestamp) } } : {}),
    ...(v.trip_id ? { viagem: v.trip_id } : {}),
  };
}

/**
 * Veículos que pertencem a uma das linhas (chaves "stcp:803") e/ou estão dentro da caixa.
 * Só caixa = TODOS os autocarros de todos os operadores e linhas dentro dela (é o que o mapa pede para mostrar o que se vê).
 * Sem linhas nem caixa devolve vazio: ninguém pede "todos os autocarros do país".
 * Se houver mais do que `max`, ficam os que estão mais perto do centro da caixa.
 */
export function filtrarVeiculos(lista: LiveVehicle[], o: { linhas?: Set<string> | null; caixa?: Caixa | null; max?: number }): VeiculoLeve[] {
  const temLinhas = !!o.linhas && o.linhas.size > 0;
  if (!temLinhas && !o.caixa) return [];
  const max = o.max ?? MAX_VEICULOS_RESPOSTA;
  const saida: VeiculoLeve[] = [];
  for (const v of lista) {
    const leve = paraVeiculoLeve(v);
    if (!leve) continue;
    if (o.caixa && (leve.lat < o.caixa.sul || leve.lat > o.caixa.norte || leve.lon < o.caixa.oeste || leve.lon > o.caixa.leste)) continue;
    if (temLinhas) {
      const chave = chaveDeLinha(leve.op, leve.linha);
      if (!chave || !o.linhas!.has(chave)) continue;
    }
    saida.push(leve);
  }
  if (saida.length <= max) return saida;
  if (!o.caixa) return saida.slice(0, max);
  // Mais do que o limite: ficam os mais perto do centro do ecrã (distância em graus, com a longitude corrigida pela latitude)
  const cLat = (o.caixa.sul + o.caixa.norte) / 2, cLon = (o.caixa.oeste + o.caixa.leste) / 2;
  const cos = Math.cos((cLat * Math.PI) / 180);
  const distancia = (l: VeiculoLeve) => (l.lat - cLat) ** 2 + ((l.lon - cLon) * cos) ** 2;
  return saida.sort((a, b) => distancia(a) - distancia(b)).slice(0, max);
}

/** Chaves de linha vindas do pedido ("stcp:803,cm:4436"): máximo 40, só o que tem o feitio certo */
export function lerLinhas(texto: unknown): Set<string> {
  const saida = new Set<string>();
  if (typeof texto !== 'string') return saida;
  for (const parte of texto.split(',')) {
    const p = parte.trim().toUpperCase();
    const m = /^(STCP|CM|TUB):([A-Z0-9 ._-]{1,12})$/.exec(p);
    if (m) saida.add(`${m[1].toLowerCase()}:${m[2]}`);
    if (saida.size >= 40) break;
  }
  return saida;
}
