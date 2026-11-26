// Estações de um troço anunciado numa greve («entre a Senhora da Hora e o Estádio do Dragão»): o planeador, as partidas de
// uma paragem e o horário do dia usam-nas para saber se uma viagem fica na parte que continua a funcionar.
import { podarMapa } from './cacheLimitada';

export const semAcGreve = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(de|do|da|dos|das|o|a)\b/g, ' ').replace(/\s+/g, ' ').trim();
/** A estação tem todas as palavras procuradas ("estadio dragao" em "Estádio do Dragão") */
export function mesmaEstacao(nome: string, procurado: string): boolean {
  const n = ` ${semAcGreve(nome)} `, q = semAcGreve(procurado).split(' ').filter(Boolean);
  return q.length > 0 && q.every((w) => n.includes(` ${w} `));
}
export const chaveEstacao = (nome: string) => semAcGreve(nome);
const memoViagem = new Map<string, Array<{ id: string; nome: string }>>();
export function viagemNomes(db: any, trip: string): Array<{ id: string; nome: string }> {
  let l = memoViagem.get(trip);
  if (!l) {
    try {
      l = (db.prepare('SELECT st.stop_id AS id, s.stop_name AS nome FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id WHERE st.trip_id = ? ORDER BY st.stop_sequence').all(trip) as any[])
        .map((r) => ({ id: String(r.id), nome: String(r.nome || '') }));
    } catch { l = []; }
    memoViagem.set(trip, l);
    podarMapa(memoViagem, 2500);
  }
  return l;
}
const memoTroco = new Map<string, { quando: number; estacoes: Set<string> | null }>();
/** Estações entre a e b (nomes normalizados), numa viagem do operador que passa pelas duas; null se nenhuma passa */
export function estacoesEntre(db: any, feed: string, a: string, b: string): Set<string> | null {
  const chave = `${feed}|${a}|${b}`;
  const m = memoTroco.get(chave);
  if (m && Date.now() - m.quando < 6 * 3600_000) return m.estacoes;
  let estacoes: Set<string> | null = null;
  try {
    const paragens = db.prepare('SELECT stop_id AS id, stop_name AS nome FROM stops WHERE feed_id = ?').all(feed) as Array<{ id: string; nome: string }>;
    const idsA = paragens.filter((p) => mesmaEstacao(p.nome, a)).map((p) => p.id).slice(0, 20);
    const idsB = paragens.filter((p) => mesmaEstacao(p.nome, b)).map((p) => p.id).slice(0, 20);
    if (idsA.length && idsB.length) {
      const q = (n: number) => Array(n).fill('?').join(',');
      const r = db.prepare(`SELECT x.trip_id AS trip FROM stop_times x JOIN stop_times y ON y.trip_id = x.trip_id
        WHERE x.stop_id IN (${q(idsA.length)}) AND y.stop_id IN (${q(idsB.length)}) LIMIT 1`).get(...idsA, ...idsB) as any;
      if (r?.trip) {
        const nomes = viagemNomes(db, String(r.trip));
        const ia = nomes.findIndex((x) => mesmaEstacao(x.nome, a)), ib = nomes.findIndex((x) => mesmaEstacao(x.nome, b));
        if (ia >= 0 && ib >= 0) estacoes = new Set(nomes.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).map((x) => chaveEstacao(x.nome)));
      }
    }
  } catch { estacoes = null; }
  memoTroco.set(chave, { quando: Date.now(), estacoes });
  podarMapa(memoTroco, 50);
  return estacoes;
}
