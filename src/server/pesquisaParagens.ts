// Pesquisa de paragens pelo nome, a escrever: sem diferença entre maiúsculas/minúsculas nem acentos ("marques" encontra
// "MARQUÊS" e "Marquês"), com todas as paragens do país em memória (a lista só se refaz quando a base de horários muda).
// Com a localização da pessoa, os resultados vêm por ordem de distância (o "Marquês" do Porto antes do "Marquês de Pombal" de Lisboa).
// Sem localização, vêm os nomes que melhor correspondem ao que foi escrito (igual, começa por, palavra que começa por, contém).
import { getDatabase } from './db/gtfsDatabase';

export interface ParagemPesquisada {
  stop_id: string;
  feed_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
  /** metros até à localização dada (só quando há localização) */
  distancia?: number;
}

interface Entrada { p: ParagemPesquisada; norm: string; cosLat: number }

const VALIDADE_MS = 6 * 3600_000;
let diretorio: { db: unknown; quando: number; lista: Entrada[] } | null = null;

/** minúsculas, sem acentos, só letras e números separados por um espaço */
export function normalizarParaPesquisa(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function carregar(): Entrada[] {
  const db = getDatabase();
  if (diretorio && diretorio.db === db && Date.now() - diretorio.quando < VALIDADE_MS) return diretorio.lista;
  const linhas = db.prepare(
    `SELECT stop_id, feed_id, stop_name, stop_lat, stop_lon, COALESCE(location_type, 0) AS location_type
     FROM stops WHERE stop_name IS NOT NULL AND stop_name != '' AND stop_lat IS NOT NULL AND stop_lon IS NOT NULL AND stop_lat != 0`,
  ).all() as any[];
  const lista: Entrada[] = [];
  for (const r of linhas) {
    const lat = Number(r.stop_lat), lon = Number(r.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const norm = normalizarParaPesquisa(r.stop_name);
    if (!norm) continue;
    lista.push({
      p: { stop_id: String(r.stop_id), feed_id: String(r.feed_id), stop_name: String(r.stop_name), stop_lat: lat, stop_lon: lon, location_type: Number(r.location_type) || 0 },
      norm,
      cosLat: Math.cos((lat * Math.PI) / 180),
    });
  }
  diretorio = { db, quando: Date.now(), lista };
  return lista;
}

/** Distância em metros (aproximação plana: chega para ordenar paragens e é muito mais barata do que a exata) */
function distanciaAprox(aLat: number, aLon: number, e: Entrada): number {
  const dy = (e.p.stop_lat - aLat) * 111_195;
  const dx = (e.p.stop_lon - aLon) * 111_195 * e.cosLat;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Paragens cujo nome tem todas as palavras escritas. `maximo` limita o que se devolve depois de ordenar.
 * Cada resultado traz `distancia` quando há localização.
 */
export function procurarParagens(consulta: string, lat?: number, lon?: number, maximo = 60): ParagemPesquisada[] {
  const q = normalizarParaPesquisa(consulta);
  if (q.length < 2) return [];
  const palavras = q.split(' ');
  const comLocal = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  const frase = ` ${q}`;

  type Achado = { e: Entrada; nivel: number; dist: number };
  const achados: Achado[] = [];
  for (const e of carregar()) {
    let tem = true;
    for (const w of palavras) if (!e.norm.includes(w)) { tem = false; break; }
    if (!tem) continue;
    // 0 = igual, 1 = começa por, 2 = alguma palavra começa por isto, 3 = só aparece dentro de uma palavra / palavras soltas
    const nivel = e.norm === q ? 0 : e.norm.startsWith(q) ? 1 : (` ${e.norm}`).includes(frase) ? 2 : 3;
    achados.push({ e, nivel, dist: comLocal ? distanciaAprox(lat as number, lon as number, e) : 0 });
  }

  if (comLocal) {
    // Com localização manda a distância; só as correspondências "dentro de uma palavra" ficam depois das que começam uma palavra
    achados.sort((a, b) => (a.nivel === 3 ? 1 : 0) - (b.nivel === 3 ? 1 : 0) || a.dist - b.dist || a.e.p.stop_name.length - b.e.p.stop_name.length);
  } else {
    achados.sort((a, b) => a.nivel - b.nivel || a.e.norm.length - b.e.norm.length || a.e.p.stop_name.localeCompare(b.e.p.stop_name, 'pt'));
  }
  return achados.slice(0, maximo).map((a) => (comLocal ? { ...a.e.p, distancia: Math.round(a.dist) } : a.e.p));
}

/** Para os testes */
export const _teste = { limpar: () => { diretorio = null; } };
