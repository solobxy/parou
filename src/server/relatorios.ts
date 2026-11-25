// Relatórios da PAROU (dia, semana, mês, trimestre, ano, 2 anos, 3 anos e desde sempre), feitos com os dados guardados:
//  - atrasos medidos de 5 em 5 min (atrasos.db), por operador, hora e linha;
//  - pontualidade em bruto resumida por dia (/var/lib/parou-pontualidade/dias/*.json): Carris Metropolitana, TUB, UNIR, STCP;
//  - avisos dos operadores e greves (historico.db, avisos), notícias (noticias) e viagens programadas por linha (horarios_dia).
// Só números agregados (nada sobre quem usa a app). Servem para reportar aos operadores e para notícias. Todos os dias às 05:30
// fica guardada uma cópia de cada relatório que fecha nesse dia (relatorios/<período>/<data>.json), para sempre.
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { baseHistorico } from './historico';

const ZONA = 'Europe/Lisbon';
const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const PASTA_PONTUALIDADE = process.env.PAROU_PONTUALIDADE || '/var/lib/parou-pontualidade';
const PASTA_RELATORIOS = path.join(PASTA, 'relatorios');

export const PERIODOS = { dia: 1, semana: 7, mes: 30, trimestre: 91, ano: 365, '2anos': 730, '3anos': 1095, sempre: 0 } as const;
export type Periodo = keyof typeof PERIODOS;
export const NOMES_OPERADORES: Record<string, string> = { cmh: 'Carris Metropolitana', unirh: 'UNIR', tub_braga: 'TUB (Braga)', carris_metropolitana: 'Carris Metropolitana', unir: 'UNIR', stcp: 'STCP' };

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);

/** Intervalo [desde, até] em dias (aaaa-mm-dd) de um período que acaba ontem (o último dia completo) */
export function intervalo(periodo: Periodo, ate: DateTime = DateTime.now().setZone(ZONA).minus({ days: 1 })): { desde: string; ate: string } {
  const fim = ate.setZone(ZONA).startOf('day');
  const dias = PERIODOS[periodo];
  const ini = dias ? fim.minus({ days: dias - 1 }) : DateTime.fromISO('2020-01-01', { zone: ZONA });
  return { desde: ini.toFormat('yyyy-MM-dd'), ate: fim.toFormat('yyyy-MM-dd') };
}

/** Mediana aproximada de um histograma de minutos inteiros */
function medianaDe(h: Array<{ minuto: number; n: number }>): number | null {
  const tot = h.reduce((a, x) => a + Number(x.n), 0);
  if (!tot) return null;
  let acc = 0;
  for (const x of [...h].sort((a, b) => a.minuto - b.minuto)) { acc += Number(x.n); if (acc >= tot / 2) return x.minuto; }
  return null;
}

function resumoHistograma(h: Array<{ minuto: number; n: number }>) {
  const n = h.reduce((a, x) => a + Number(x.n), 0);
  const soma = (f: (m: number) => boolean) => h.filter((x) => f(x.minuto)).reduce((a, x) => a + Number(x.n), 0);
  return { amostras: n, mediana_min: medianaDe(h), pct_2min_ou_mais: pct(soma((m) => m >= 2), n), pct_5min_ou_mais: pct(soma((m) => m >= 5), n), pct_10min_ou_mais: pct(soma((m) => m >= 10), n), pct_adiantado_1min_ou_mais: pct(soma((m) => m <= -1), n) };
}

/** Atrasos medidos pelo servidor (previsões em direto), por operador, com a pior hora e as piores linhas */
export function atrasosDoPeriodo(desde: string, ate: string) {
  const f = path.join(PASTA, 'atrasos.db');
  if (!fs.existsSync(f)) return [];
  const b = new DatabaseSync(f, { readOnly: true });
  try {
    const d0 = desde.replace(/-/g, ''), d1 = ate.replace(/-/g, '');
    const feeds = (b.prepare('SELECT DISTINCT feed FROM atrasos WHERE dia BETWEEN ? AND ?').all(d0, d1) as Array<{ feed: string }>).map((x) => x.feed);
    return feeds.map((feed) => {
      const h = b.prepare('SELECT minuto, SUM(n) AS n FROM atrasos WHERE feed = ? AND dia BETWEEN ? AND ? GROUP BY minuto').all(feed, d0, d1) as Array<{ minuto: number; n: number }>;
      const porHora = b.prepare('SELECT hora, minuto, SUM(n) AS n FROM atrasos WHERE feed = ? AND dia BETWEEN ? AND ? GROUP BY hora, minuto').all(feed, d0, d1) as Array<{ hora: number; minuto: number; n: number }>;
      const horas = new Map<number, Array<{ minuto: number; n: number }>>();
      for (const x of porHora) { const l = horas.get(x.hora) || []; l.push(x); horas.set(x.hora, l); }
      const resumoHoras = [...horas.entries()].map(([hora, l]) => ({ hora, ...resumoHistograma(l) })).sort((a, b) => a.hora - b.hora);
      const piorHora = resumoHoras.filter((x) => x.amostras >= 100).sort((a, b) => (b.pct_5min_ou_mais ?? 0) - (a.pct_5min_ou_mais ?? 0))[0] || null;
      const porLinha = b.prepare('SELECT linha, minuto, SUM(n) AS n FROM atrasos WHERE feed = ? AND dia BETWEEN ? AND ? GROUP BY linha, minuto').all(feed, d0, d1) as Array<{ linha: string; minuto: number; n: number }>;
      const linhas = new Map<string, Array<{ minuto: number; n: number }>>();
      for (const x of porLinha) { const l = linhas.get(x.linha) || []; l.push(x); linhas.set(x.linha, l); }
      const pioresLinhas = [...linhas.entries()].map(([linha, l]) => ({ linha, ...resumoHistograma(l) }))
        .filter((x) => x.amostras >= 200).sort((a, b) => (b.pct_5min_ou_mais ?? 0) - (a.pct_5min_ou_mais ?? 0)).slice(0, 10);
      return { operador: NOMES_OPERADORES[feed] || feed, feed, ...resumoHistograma(h), pior_hora: piorHora, piores_linhas: pioresLinhas, por_hora: resumoHoras };
    });
  } finally { b.close(); }
}

/** Pontualidade das passagens gravadas em bruto (resumos diários), somada no período e pesada pelo número de passagens */
export function pontualidadeDoPeriodo(desde: string, ate: string) {
  const pasta = path.join(PASTA_PONTUALIDADE, 'dias');
  if (!fs.existsSync(pasta)) return [];
  const acum = new Map<string, { n: number; dias: number; a_horas: number; atrasado: number; muito: number; adiantado: number; mediana: number }>();
  for (const nome of fs.readdirSync(pasta)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(nome);
    if (!m || m[1] < desde || m[1] > ate) continue;
    let j: any;
    try { j = JSON.parse(fs.readFileSync(path.join(pasta, nome), 'utf8')); } catch { continue; }
    for (const op of ['carris_metropolitana', 'tub_braga', 'unir', 'stcp']) {
      const p = j?.[op]?.passagens;
      if (!p?.n) continue;
      const a = acum.get(op) || { n: 0, dias: 0, a_horas: 0, atrasado: 0, muito: 0, adiantado: 0, mediana: 0 };
      a.n += p.n; a.dias++;
      a.a_horas += (p.a_horas_pct || 0) * p.n; a.atrasado += (p.atrasado_pct || 0) * p.n; a.muito += (p.muito_atrasado_pct || 0) * p.n;
      a.adiantado += (p.adiantado_pct || 0) * p.n; a.mediana += (p.mediana_min || 0) * p.n;
      acum.set(op, a);
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return [...acum.entries()].map(([op, a]) => ({
    operador: NOMES_OPERADORES[op] || op, passagens: a.n, dias: a.dias,
    a_horas_pct: r1(a.a_horas / a.n), atrasado_mais_5min_pct: r1(a.atrasado / a.n), atrasado_mais_10min_pct: r1(a.muito / a.n),
    adiantado_mais_1min_pct: r1(a.adiantado / a.n), mediana_media_min: r1(a.mediana / a.n),
  }));
}

/** Avisos e greves que estiveram em vigor no período (pelo menos um dia dentro dele) */
export function avisosDoPeriodo(desde: string, ate: string) {
  const b = baseHistorico();
  const fimIso = `${ate}T23:59:59`;
  const linhas = b.prepare(`SELECT id, operador, tipo, titulo, inicio, fim, estado, primeiro_visto, ultimo_visto, versoes FROM avisos
    WHERE COALESCE(inicio, '') <= ? AND (fim IS NULL OR fim = '' OR fim >= ?)`).all(fimIso, desde) as any[];
  const porOperador: Record<string, Record<string, number>> = {};
  for (const l of linhas) { const o = l.operador || '?'; porOperador[o] ??= {}; porOperador[o][l.tipo || '?'] = (porOperador[o][l.tipo || '?'] || 0) + 1; }
  const greves = linhas.filter((l) => l.tipo === 'greve').map((l) => ({ operador: l.operador, titulo: l.titulo, inicio: l.inicio, fim: l.fim, estado: l.estado }))
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const tipos: Record<string, number> = {};
  for (const l of linhas) tipos[l.tipo || '?'] = (tipos[l.tipo || '?'] || 0) + 1;
  return { total: linhas.length, por_tipo: tipos, por_operador: porOperador, greves };
}

/** Viagens programadas por operador (média por dia) e as linhas que mais perderam, face ao período anterior do mesmo tamanho */
export function horariosDoPeriodo(desde: string, ate: string) {
  const b = baseHistorico();
  const dias = Math.max(1, Math.round(DateTime.fromISO(ate).diff(DateTime.fromISO(desde), 'days').days) + 1);
  const antes = { desde: DateTime.fromISO(desde).minus({ days: dias }).toFormat('yyyy-MM-dd'), ate: DateTime.fromISO(desde).minus({ days: 1 }).toFormat('yyyy-MM-dd') };
  const media = (d0: string, d1: string) => new Map((b.prepare(`SELECT feed, linha, MAX(nome) AS nome, SUM(viagens) * 1.0 / COUNT(DISTINCT dia) AS media, COUNT(DISTINCT dia) AS dias
    FROM horarios_dia WHERE dia BETWEEN ? AND ? GROUP BY feed, linha`).all(d0, d1) as any[]).map((r) => [`${r.feed}|${r.linha}`, r]));
  const agora = media(desde, ate), anterior = media(antes.desde, antes.ate);
  const porFeed = new Map<string, { agora: number; antes: number; linhas: number }>();
  for (const [k, r] of agora) { const f = porFeed.get(r.feed) || { agora: 0, antes: 0, linhas: 0 }; f.agora += r.media; f.linhas++; f.antes += anterior.get(k)?.media || 0; porFeed.set(r.feed, f); }
  const quedas = [...agora.entries()].map(([k, r]) => ({ operador: NOMES_OPERADORES[r.feed] || r.feed, linha: r.nome || r.linha, viagens_dia: Math.round(r.media * 10) / 10, antes: Math.round((anterior.get(k)?.media || 0) * 10) / 10 }))
    .filter((x) => x.antes >= 10 && x.viagens_dia <= x.antes * 0.8).map((x) => ({ ...x, variacao_pct: pct(x.viagens_dia - x.antes, x.antes) }))
    .sort((a, b) => (a.variacao_pct ?? 0) - (b.variacao_pct ?? 0)).slice(0, 20);
  const dados = agora.size > 0;
  return {
    dias_com_dados: dados ? (b.prepare('SELECT COUNT(DISTINCT dia) AS n FROM horarios_dia WHERE dia BETWEEN ? AND ?').get(desde, ate) as any).n : 0,
    por_operador: [...porFeed.entries()].map(([feed, f]) => ({ operador: NOMES_OPERADORES[feed] || feed, feed, linhas: f.linhas, viagens_dia: Math.round(f.agora), antes: Math.round(f.antes), variacao_pct: f.antes ? pct(f.agora - f.antes, f.antes) : null }))
      .sort((a, b) => b.viagens_dia - a.viagens_dia),
    linhas_que_perderam_viagens: quedas,
  };
}

export function noticiasDoPeriodo(desde: string, ate: string) {
  const linhas = baseHistorico().prepare('SELECT categoria, COUNT(*) AS n FROM noticias WHERE substr(data, 1, 10) BETWEEN ? AND ? GROUP BY categoria').all(desde, ate) as Array<{ categoria: string; n: number }>;
  return Object.fromEntries(linhas.map((l) => [l.categoria, Number(l.n)]));
}

export function gerarRelatorio(periodo: Periodo, ate?: DateTime) {
  const { desde, ate: fim } = intervalo(periodo, ate);
  const seguro = <T>(f: () => T, vazio: T): T => { try { return f(); } catch (e: any) { console.warn('[Relatórios]', e?.message || e); return vazio; } };
  return {
    periodo, desde, ate: fim, gerado: new Date().toISOString(),
    notas: 'Atrasos: previsões em direto dos operadores, medidas de 5 em 5 min (a próxima paragem de cada viagem). Pontualidade: passagens gravadas em bruto (a horas = -1 a +5 min). Avisos: os publicados pelos operadores e pelo IPMA. Viagens: horários de cada dia.',
    atrasos: seguro(() => atrasosDoPeriodo(desde, fim), []),
    pontualidade: seguro(() => pontualidadeDoPeriodo(desde, fim), []),
    avisos: seguro(() => avisosDoPeriodo(desde, fim), { total: 0, por_tipo: {}, por_operador: {}, greves: [] }),
    viagens: seguro(() => horariosDoPeriodo(desde, fim), { dias_com_dados: 0, por_operador: [], linhas_que_perderam_viagens: [] }),
    noticias: seguro(() => noticiasDoPeriodo(desde, fim), {}),
  };
}

/** Os relatórios que fecham neste dia: dia (sempre), semana (segundas), mês (dia 1), trimestre e ano (início), e o de sempre */
export function periodosQueFecham(hoje: DateTime): Periodo[] {
  const p: Periodo[] = ['dia', 'sempre'];
  if (hoje.weekday === 1) p.push('semana');
  if (hoje.day === 1) p.push('mes');
  if (hoje.day === 1 && [1, 4, 7, 10].includes(hoje.month)) p.push('trimestre');
  if (hoje.day === 1 && hoje.month === 1) p.push('ano', '2anos', '3anos');
  return p;
}

export function guardarRelatoriosDeHoje(hoje: DateTime = DateTime.now().setZone(ZONA)): string[] {
  const feitos: string[] = [];
  for (const periodo of periodosQueFecham(hoje)) {
    const r = gerarRelatorio(periodo, hoje.minus({ days: 1 }));
    const pasta = path.join(PASTA_RELATORIOS, periodo);
    fs.mkdirSync(pasta, { recursive: true });
    const nome = periodo === 'sempre' ? 'ultimo.json' : `${r.ate}.json`;
    fs.writeFileSync(path.join(pasta, nome), JSON.stringify(r, null, 1));
    feitos.push(`${periodo}/${nome}`);
  }
  return feitos;
}

/** Corre o relatório num processo à parte (somar anos de dados não pode parar a app); no máximo 2 min */
function aParte(args: string[]): Promise<any> {
  return new Promise((resolver, rejeitar) => {
    let ficheiro: string;
    try { ficheiro = fileURLToPath(new URL('./workers/relatorioProcesso.ts', import.meta.url)); } catch { ficheiro = path.join(process.cwd(), 'src/server/workers/relatorioProcesso.ts'); }
    const filho = fork(ficheiro, args, { execArgv: process.execArgv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const t = setTimeout(() => { filho.kill('SIGKILL'); rejeitar(new Error('O relatório demorou demais.')); }, 120_000);
    filho.once('message', (m: any) => { clearTimeout(t); if (m?.ok) resolver(m); else rejeitar(new Error(m?.erro || 'Falhou o relatório.')); });
    filho.once('error', (e) => { clearTimeout(t); rejeitar(e); });
    filho.once('exit', (c) => { clearTimeout(t); if (c) rejeitar(new Error(`O processo do relatório saiu (${c}).`)); });
  });
}

const cacheRelatorios = new Map<string, { t: number; r: unknown }>();
/** O relatório de um período, feito à parte e guardado 10 min em memória */
export async function relatorioAParte(periodo: Periodo): Promise<unknown> {
  const c = cacheRelatorios.get(periodo);
  if (c && Date.now() - c.t < 10 * 60_000) return c.r;
  const m = await aParte(['gerar', periodo]);
  cacheRelatorios.set(periodo, { t: Date.now(), r: m.relatorio });
  return m.relatorio;
}

let iniciado = false;
export function iniciarRelatorios(): void {
  if (iniciado) return;
  iniciado = true;
  const agendar = () => {
    const agora = DateTime.now().setZone(ZONA);
    let alvo = agora.set({ hour: 5, minute: 30, second: 0, millisecond: 0 });
    if (alvo <= agora) alvo = alvo.plus({ days: 1 });
    setTimeout(() => {
      aParte(['guardar']).then((m) => console.log('[Relatórios] guardados:', (m.feitos || []).join(', '))).catch((e) => console.warn('[Relatórios]', e?.message || e));
      agendar();
    }, alvo.toMillis() - agora.toMillis()).unref?.();
  };
  agendar();
}
