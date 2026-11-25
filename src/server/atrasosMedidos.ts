// Atrasos reais dos autocarros, medidos pelo servidor de 5 em 5 min com as previsões em direto dos operadores (Carris
// Metropolitana, UNIR, TUB). Para cada viagem a andar, o atraso na próxima paragem; guarda-se só a contagem por dia, feed,
// linha, hora do dia e minuto de atraso (nada sobre quem usa a app).
//
// Serve para o "pode ainda não ter passado" do planeador: um autocarro sem previsão que, pelo horário, passou há pouco ainda
// pode estar para vir. Quanto tempo depois da hora vale a pena dizer isso depende do operador e da hora: a janela é o maior
// atraso (1 a 5 min) que pelo menos 35% dos autocarros desse operador têm a essa hora, nos últimos 14 dias.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { indicePronto } from './planeadorIndice';
import { atualizarTempoReal, camadaTempoReal, NAO } from './tempoRealPlaneador';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const ZONA = 'Europe/Lisbon';
const INTERVALO_MS = 5 * 60 * 1000;
/** Dias que contam para a janela */
export const DIAS_JANELA = 14;
/** Amostras mínimas (feed e hora) para confiar na medição; abaixo disto usam-se todos os operadores medidos */
export const MIN_AMOSTRAS = 300;
/** Parte dos autocarros que tem de vir pelo menos tão atrasada como a janela */
export const PROPORCAO = 0.35;
/** Sem medições nenhumas (antes da primeira semana, ou num servidor novo) */
export const JANELA_SEM_DADOS_S = 120;
/** Guarda-se tudo durante este tempo (dados que mais ninguém tem) */
const RETENCAO_DIAS = 400;

let _bd: DatabaseSync | null = null;
function bd(): DatabaseSync {
  if (_bd) return _bd;
  fs.mkdirSync(PASTA, { recursive: true });
  const b = new DatabaseSync(path.join(PASTA, 'atrasos.db'));
  b.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS atrasos (
      dia TEXT NOT NULL,       -- aaaammdd (Lisboa)
      feed TEXT NOT NULL,      -- cmh, unirh, tub_braga
      linha TEXT NOT NULL,     -- route_id
      hora INTEGER NOT NULL,   -- hora do dia em Lisboa (0–23)
      minuto INTEGER NOT NULL, -- minutos inteiros de atraso (negativo = adiantado), de -10 a 30
      n INTEGER NOT NULL,
      PRIMARY KEY (dia, feed, linha, hora, minuto)
    ) WITHOUT ROWID;
  `);
  _bd = b;
  return b;
}

export interface Amostra { feed: string; linha: string; atrasoS: number }

/** Junta amostras (no instante `quando`) às contagens */
export function registarAmostras(amostras: Amostra[], quando: DateTime = DateTime.now().setZone(ZONA)): number {
  if (!amostras.length) return 0;
  const l = quando.setZone(ZONA);
  const dia = l.toFormat('yyyyMMdd'), hora = l.hour;
  const b = bd();
  const ins = b.prepare('INSERT INTO atrasos (dia, feed, linha, hora, minuto, n) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT (dia, feed, linha, hora, minuto) DO UPDATE SET n = n + 1');
  b.exec('BEGIN');
  try {
    for (const a of amostras) {
      const minuto = Math.max(-10, Math.min(30, Math.floor(a.atrasoS / 60)));
      ins.run(dia, a.feed, a.linha, hora, minuto);
    }
    b.exec('COMMIT');
  } catch (e) {
    b.exec('ROLLBACK');
    throw e;
  }
  cacheJanela.clear();
  return amostras.length;
}

/**
 * Atraso agora de cada viagem com previsão: o da próxima paragem por onde vai passar (as anteriores já passaram), só se essa
 * passagem for entre 5 min atrás e 20 min à frente (assim não contam previsões de viagens que só saem daqui a horas).
 */
export function amostrasAgora(agora: DateTime = DateTime.now().setZone(ZONA)): Amostra[] {
  const ix = indicePronto();
  if (!ix) return [];
  const l = agora.setZone(ZONA);
  const camada = camadaTempoReal(ix, l.toFormat('yyyyMMdd'));
  if (!camada) return [];
  const agoraSegs = l.hour * 3600 + l.minute * 60 + l.second;
  const out: Amostra[] = [];
  for (const [p, rp] of camada) {
    const pd = ix.padroes[p], nS = pd.stops.length;
    for (const [t, atrasos] of rp.viagens) {
      let pos = -1;
      for (let j = 0; j < nS; j++) if (atrasos[j] !== NAO) { pos = j; break; }
      if (pos < 0) continue; // suprimida
      const prevista = pd.dep[t * nS + pos] + atrasos[pos];
      if (prevista < agoraSegs - 300 || prevista > agoraSegs + 1200) continue;
      out.push({ feed: pd.feed, linha: pd.route, atrasoS: atrasos[pos] });
    }
  }
  return out;
}

const cacheJanela = new Map<string, number>();

/** Janela (segundos) depois da hora do horário em que um autocarro deste feed, sem previsão, ainda pode estar para vir */
export function janelaTalvez(feed: string, agora: DateTime = DateTime.now().setZone(ZONA)): number {
  const l = agora.setZone(ZONA);
  const h = l.hour;
  const chave = `${feed}|${h}|${l.toFormat('yyyyMMdd')}`;
  const ja = cacheJanela.get(chave);
  if (ja !== undefined) return ja;
  let janela = JANELA_SEM_DADOS_S;
  try {
    const desde = l.minus({ days: DIAS_JANELA }).toFormat('yyyyMMdd');
    // a hora e as vizinhas (as 7:59 e as 8:01 são a mesma hora de ponta)
    const horas = [(h + 23) % 24, h, (h + 1) % 24];
    const q = (soFeed: boolean) => bd().prepare(
      `SELECT minuto, SUM(n) AS n FROM atrasos WHERE dia >= ? AND hora IN (?, ?, ?) ${soFeed ? 'AND feed = ?' : ''} GROUP BY minuto`,
    ).all(...(soFeed ? [desde, ...horas, feed] : [desde, ...horas])) as Array<{ minuto: number; n: number }>;
    let linhas = q(true);
    if (soma(linhas) < MIN_AMOSTRAS) linhas = q(false); // operador sem previsões (STCP, Vamus…): o que se mede nos outros
    if (soma(linhas) >= MIN_AMOSTRAS) janela = janelaDe(linhas);
  } catch { /* sem base: fica a janela por omissão */ }
  if (cacheJanela.size > 500) cacheJanela.clear();
  cacheJanela.set(chave, janela);
  return janela;
}

const soma = (linhas: Array<{ n: number }>) => linhas.reduce((a, x) => a + Number(x.n), 0);

/** O maior atraso, em minutos inteiros de 1 a 5, que pelo menos PROPORCAO dos autocarros têm (0 = vêm a horas) */
export function janelaDe(linhas: Array<{ minuto: number; n: number }>): number {
  const total = soma(linhas);
  if (!total) return JANELA_SEM_DADOS_S;
  let melhor = 0;
  for (let m = 1; m <= 5; m++) {
    const pelosMenos = linhas.filter((x) => x.minuto >= m).reduce((a, x) => a + Number(x.n), 0);
    if (pelosMenos / total >= PROPORCAO) melhor = m;
  }
  return melhor * 60;
}

/** Resumo para o servidor: atrasos por feed nos últimos dias (para ver se a medição anda) */
export function resumoAtrasos(dias = 7): Array<{ feed: string; amostras: number; janelaAgora: number }> {
  const desde = DateTime.now().setZone(ZONA).minus({ days: dias }).toFormat('yyyyMMdd');
  const linhas = bd().prepare('SELECT feed, SUM(n) AS n FROM atrasos WHERE dia >= ? GROUP BY feed').all(desde) as Array<{ feed: string; n: number }>;
  return linhas.map((x) => ({ feed: x.feed, amostras: Number(x.n), janelaAgora: janelaTalvez(x.feed) }));
}

async function medir(): Promise<void> {
  try {
    if (!indicePronto()) return;
    await atualizarTempoReal(4000);
    registarAmostras(amostrasAgora());
  } catch (e: any) {
    console.warn('[Atrasos] não consegui medir:', e?.message || e);
  }
}

let iniciado = false;
/** Mede de 5 em 5 min e apaga o que tem mais de RETENCAO_DIAS */
export function iniciarMedicaoAtrasos(): void {
  if (iniciado) return;
  iniciado = true;
  const t = setInterval(() => { void medir(); }, INTERVALO_MS);
  t.unref?.();
  const limpar = () => {
    try { bd().prepare('DELETE FROM atrasos WHERE dia < ?').run(DateTime.now().setZone(ZONA).minus({ days: RETENCAO_DIAS }).toFormat('yyyyMMdd')); } catch { /* fica para amanhã */ }
  };
  const tl = setInterval(limpar, 24 * 3600 * 1000);
  tl.unref?.();
  setTimeout(() => { void medir(); }, 90_000).unref?.();
}
