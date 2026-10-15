// Lista leve de autocarros em direto para o mapa e para o "A bordo": só o que a app precisa, filtrado por linhas e/ou por uma caixa no mapa.
// Não inventa nada: são as posições que os operadores enviam (Carris Metropolitana e STCP), com a hora a que cada uma foi medida.

import type { LiveVehicle } from './realtimeEngine';
import { chaveDeLinha, type OperadorVeiculos } from '../utils/chaveLinha';
import type { VeiculoLeve } from '../types/aBordo';

export type { VeiculoLeve };

export interface Caixa { sul: number; oeste: number; norte: number; leste: number }

/** Largura máxima de uma caixa, em graus (≈ 33 km): chega para um ecrã de mapa e impede pedidos do país inteiro */
const MAX_LADO_GRAUS = 0.3;

export function operadorDoVeiculo(v: Pick<LiveVehicle, 'operator'>): OperadorVeiculos | null {
  if (v.operator === 'STCP') return 'stcp';
  if (v.operator === 'Carris Metropolitana') return 'cm';
  return null;
}

/** "sul,oeste,norte,leste" em graus */
export function lerCaixa(texto: unknown): Caixa | null {
  if (typeof texto !== 'string') return null;
  const n = texto.split(',').map((x) => Number(x));
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const [sul, oeste, norte, leste] = n;
  if (sul >= norte || oeste >= leste) return null;
  if (sul < 30 || norte > 45 || oeste < -35 || leste > -5) return null; // Portugal, Açores e Madeira incluídos
  if (norte - sul > MAX_LADO_GRAUS || leste - oeste > MAX_LADO_GRAUS) return null;
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
    ...(v.trip_id ? { viagem: v.trip_id } : {}),
  };
}

/**
 * Veículos que pertencem a uma das linhas (chaves "stcp:803") e/ou estão dentro da caixa.
 * Sem linhas nem caixa devolve vazio: ninguém pede "todos os autocarros do país".
 */
export function filtrarVeiculos(lista: LiveVehicle[], o: { linhas?: Set<string> | null; caixa?: Caixa | null; max?: number }): VeiculoLeve[] {
  const temLinhas = !!o.linhas && o.linhas.size > 0;
  if (!temLinhas && !o.caixa) return [];
  const max = o.max ?? 400;
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
    if (saida.length >= max) break;
  }
  return saida;
}

/** Chaves de linha vindas do pedido ("stcp:803,cm:4436"): máximo 40, só o que tem o feitio certo */
export function lerLinhas(texto: unknown): Set<string> {
  const saida = new Set<string>();
  if (typeof texto !== 'string') return saida;
  for (const parte of texto.split(',')) {
    const p = parte.trim().toUpperCase();
    const m = /^(STCP|CM):([A-Z0-9 ._-]{1,12})$/.exec(p);
    if (m) saida.add(`${m[1].toLowerCase()}:${m[2]}`);
    if (saida.size >= 40) break;
  }
  return saida;
}
