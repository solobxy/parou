// «A bordo»: o mapa segue o autocarro com zoom para ver mais ou menos 2 a 3 paragens à volta dele.

import { distanciaM } from './trajetoVeiculo';

const ZOOM_MIN = 14;
const ZOOM_MAX = 17;
/** Quantos espaços entre paragens cabem na largura do mapa */
const ESPACOS_NA_LARGURA = 3;

/** Zoom (pode ser fracionário) para seguir o autocarro que vai perto da paragem `indice` de `paragens` num mapa com `larguraPx` de largura */
export function zoomParaParagens(paragens: Array<{ lat: number; lon: number }>, indice: number, larguraPx: number): number {
  const de = Math.max(0, indice - 2), ate = Math.min(paragens.length - 1, indice + 3);
  const d: number[] = [];
  for (let k = de; k < ate; k++) {
    const m = distanciaM(paragens[k], paragens[k + 1]);
    if (Number.isFinite(m) && m > 20) d.push(m);
  }
  d.sort((a, b) => a - b);
  const espaco = Math.min(1500, Math.max(120, d.length ? d[Math.floor(d.length / 2)] : 300));
  const lat = paragens[Math.min(Math.max(indice, 0), paragens.length - 1)]?.lat ?? 40;
  const largura = Number.isFinite(larguraPx) && larguraPx > 100 ? larguraPx : 390;
  const mPorPx = (ESPACOS_NA_LARGURA * espaco) / largura;
  const zoom = Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / mPorPx);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Onde a bola do «meu» autocarro está desenhada neste momento (escrita por VeiculosNoMapa, lida por quem segue o autocarro) */
let posicao: { lat: number; lon: number; em: number } | null = null;
export function guardarPosicaoMeuAutocarro(lat: number, lon: number): void { posicao = { lat, lon, em: performance.now() }; }
export function posicaoMeuAutocarro(): { lat: number; lon: number } | null {
  return posicao && performance.now() - posicao.em < 2500 ? posicao : null;
}
