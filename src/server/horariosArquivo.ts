// Horários de cada dia, guardados para sempre (historico.db, tabela horarios_dia): quantas viagens cada linha tem nesse dia,
// a primeira e a última. Os horários dos operadores são substituídos todos os dias; sem isto não se consegue mostrar
// "a linha X perdeu 20% das viagens desde setembro". Feito a partir do motor em memória do planeador (rápido, sem SQL pesado),
// uma vez por dia, para o próprio dia.
import { DateTime } from 'luxon';
import { indicePronto, type Indice } from './planeadorIndice';
import { getActiveServiceIds, getDatabase } from './db/gtfsDatabase';
import { baseHistorico } from './historico';

const ZONA = 'Europe/Lisbon';

export interface LinhaDoDia { feed: string; linha: string; nome: string; viagens: number; primeira: number; ultima: number }

/** Viagens de cada linha num dia de serviço (aaaammdd), pelo motor em memória */
export function horariosDoDia(ix: Indice, dia: DateTime): LinhaDoDia[] {
  const dataStr = dia.toFormat('yyyyMMdd'), diaSemana = dia.setLocale('en').toFormat('cccc').toLowerCase();
  const ativos = new Map<string, Set<string>>();
  const ativo = (feed: string) => { let s = ativos.get(feed); if (!s) { s = getActiveServiceIds(feed, dataStr, diaSemana); ativos.set(feed, s); } return s; };
  const porLinha = new Map<string, LinhaDoDia>();
  for (const pd of ix.padroes) {
    if (pd.freq) continue; // linhas sem horários (estimadas) não contam
    const nS = pd.stops.length;
    const servicos = ativo(pd.feed);
    for (let t = 0; t < pd.nT; t++) {
      if (!servicos.has(pd.service[t])) continue;
      const chave = `${pd.feed}|${pd.route}`;
      let l = porLinha.get(chave);
      if (!l) { l = { feed: pd.feed, linha: pd.route, nome: '', viagens: 0, primeira: Infinity, ultima: -Infinity }; porLinha.set(chave, l); }
      l.viagens++;
      const p = pd.dep[t * nS], u = pd.arr[t * nS + nS - 1];
      if (p >= 0 && p < l.primeira) l.primeira = p;
      if (u >= 0 && u > l.ultima) l.ultima = u;
    }
  }
  // nomes das linhas (o número que as pessoas conhecem)
  const nomes = new Map<string, string>();
  try {
    for (const r of getDatabase().prepare('SELECT route_id AS id, route_short_name AS c, route_long_name AS n FROM routes').all() as Array<{ id: string; c: string | null; n: string | null }>) {
      nomes.set(r.id, String(r.c || r.n || '').slice(0, 80));
    }
  } catch { /* sem nomes fica o código */ }
  const out = [...porLinha.values()];
  for (const l of out) {
    l.nome = nomes.get(l.linha) || nomes.get(l.linha.replace(/^cmh:/, 'cm:').replace(/^unirh:/, 'unir:')) || l.linha.split(':').pop() || '';
    if (!Number.isFinite(l.primeira)) l.primeira = -1;
    if (!Number.isFinite(l.ultima)) l.ultima = -1;
  }
  return out;
}

/** Guarda as viagens de hoje (substitui o que já houver deste dia: a última leitura é a que conta) */
export function arquivarHorariosDoDia(agora: DateTime = DateTime.now().setZone(ZONA)): number {
  const ix = indicePronto();
  if (!ix) return 0;
  const dia = agora.setZone(ZONA).startOf('day');
  const linhas = horariosDoDia(ix, dia);
  if (!linhas.length) return 0;
  const b = baseHistorico();
  const d = dia.toFormat('yyyy-MM-dd');
  const ins = b.prepare('INSERT OR REPLACE INTO horarios_dia (dia, feed, linha, nome, viagens, primeira, ultima) VALUES (?, ?, ?, ?, ?, ?, ?)');
  b.exec('BEGIN');
  try {
    b.prepare('DELETE FROM horarios_dia WHERE dia = ?').run(d);
    for (const l of linhas) ins.run(d, l.feed, l.linha, l.nome, l.viagens, l.primeira, l.ultima);
    b.exec('COMMIT');
  } catch (e) {
    try { b.exec('ROLLBACK'); } catch { /* já desfeita */ }
    throw e;
  }
  return linhas.length;
}

let iniciado = false;
/** Uma vez por dia (às 05:10, depois dos dados novos da madrugada) e 5 min depois de arrancar se hoje ainda não está guardado */
export function iniciarArquivoHorarios(): void {
  if (iniciado) return;
  iniciado = true;
  const correr = () => {
    try { const n = arquivarHorariosDoDia(); if (n) console.log(`[Histórico] horários de hoje guardados: ${n} linhas`); } catch (e: any) { console.warn('[Histórico] horários:', e?.message || e); }
  };
  const agendar = () => {
    const agora = DateTime.now().setZone(ZONA);
    let alvo = agora.set({ hour: 5, minute: 10, second: 0, millisecond: 0 });
    if (alvo <= agora) alvo = alvo.plus({ days: 1 });
    setTimeout(() => { correr(); agendar(); }, alvo.toMillis() - agora.toMillis()).unref?.();
  };
  agendar();
  setTimeout(() => {
    try {
      const hoje = DateTime.now().setZone(ZONA).toFormat('yyyy-MM-dd');
      const ja = baseHistorico().prepare('SELECT COUNT(*) AS n FROM horarios_dia WHERE dia = ?').get(hoje) as { n: number };
      if (!ja.n) correr();
    } catch { correr(); }
  }, 5 * 60_000).unref?.();
}
