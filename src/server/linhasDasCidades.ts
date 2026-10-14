// Linhas que passam numa cidade, para a pessoa ver nos Horários só as linhas das "suas cidades".
// Usa o índice dos horários que já está em memória (o do planeador): uma linha é "da cidade" se tem alguma
// paragem a menos de raioKm do centro dela. Sem consultas à base: milissegundos, e fica em cache até o índice mudar.
import { indicePronto, type Indice } from './planeadorIndice';
import { CIDADES, type Cidade } from '../data/cidades';

/** Máximo de cidades por pedido */
export const MAX_CIDADES = 8;

// Os horários da Carris Metropolitana vivem no feed "cmh", mas a app usa os códigos "cm:<id>"
const rotaDaApp = (id: string): string => (id.startsWith('cmh:') ? `cm:${id.slice(4)}` : id);

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

let cache: { ix: Indice; porCidade: Map<string, Set<string>> } | null = null;

function linhasDaCidade(ix: Indice, c: Cidade): Set<string> {
  const out = new Set<string>();
  const dLat = c.raioKm / 111;
  const dLon = c.raioKm / (111 * Math.max(0.2, Math.cos((c.lat * Math.PI) / 180)));
  for (let s = 0; s < ix.lat.length; s++) {
    const la = ix.lat[s];
    const lo = ix.lon[s];
    // (NaN nunca passa estas comparações: paragens sem coordenadas ficam de fora)
    if (!(Math.abs(la - c.lat) <= dLat) || !(Math.abs(lo - c.lon) <= dLon)) continue;
    if (distKm(c.lat, c.lon, la, lo) > c.raioKm) continue;
    for (let k = ix.psStart[s]; k < ix.psStart[s + 1]; k++) out.add(rotaDaApp(ix.padroes[ix.psPat[k]].route));
  }
  return out;
}

/** Só aceita códigos de cidades que existem (sem repetidas), no máximo MAX_CIDADES */
export function cidadesValidas(texto: unknown): string[] {
  if (typeof texto !== 'string') return [];
  const conhecidas = new Set(CIDADES.map((c) => c.slug));
  const vistas = new Set<string>();
  for (const parte of texto.split(',')) {
    const slug = parte.trim().toLowerCase();
    if (conhecidas.has(slug)) vistas.add(slug);
    if (vistas.size >= MAX_CIDADES) break;
  }
  return Array.from(vistas);
}

/**
 * Códigos das linhas que passam em alguma das cidades. Devolve null enquanto o índice dos horários ainda
 * não está pronto (quem chama diz à pessoa para esperar um pouco).
 */
export function linhasDasCidades(slugs: string[]): Set<string> | null {
  const ix = indicePronto();
  if (!ix) return null;
  if (!cache || cache.ix !== ix) cache = { ix, porCidade: new Map() };
  const todas = new Set<string>();
  for (const slug of slugs) {
    let do_ = cache.porCidade.get(slug);
    if (!do_) {
      const c = CIDADES.find((x) => x.slug === slug);
      if (!c) continue;
      do_ = linhasDaCidade(ix, c);
      cache.porCidade.set(slug, do_);
    }
    for (const id of do_) todas.add(id);
  }
  return todas;
}
