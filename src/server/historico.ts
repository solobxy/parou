// Arquivo permanente da PAROU: tudo o que as fontes publicam e depois desaparece fica guardado para sempre, com cada mudança.
//  - avisos dos operadores e do IPMA (perturbações, greves, obras, desvios…): o estado atual de cada um e todas as versões
//    (o texto, as datas, as linhas e o estado de cada vez que mudam), com quando foi visto pela primeira e pela última vez;
//  - notícias de transportes, trânsito, greves, tempo e obras que a app mostra (título, resumo do feed, ligação, data).
// Nada sobre quem usa a app. Serve para relatórios (dia, semana, mês, trimestre, anos), para reportar aos operadores e
// para notícias. Não se apaga nada.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
export const FICHEIRO_HISTORICO = path.join(PASTA, 'historico.db');

let _bd: DatabaseSync | null = null;
export function baseHistorico(): DatabaseSync {
  if (_bd) return _bd;
  fs.mkdirSync(PASTA, { recursive: true });
  const b = new DatabaseSync(FICHEIRO_HISTORICO);
  b.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS avisos (
      id TEXT PRIMARY KEY,          -- o da fonte (ex.: tml:..., cp:..., ipma:...)
      fonte TEXT, operador TEXT, tipo TEXT, severidade TEXT, estado TEXT,
      titulo TEXT, descricao TEXT,
      linhas TEXT, paragens TEXT, regiao TEXT, municipios TEXT, dias_perturbacao TEXT, -- listas em JSON
      inicio TEXT, fim TEXT, publicado TEXT, url TEXT,
      primeiro_visto INTEGER NOT NULL, -- instante (ms) em que a PAROU o viu pela primeira vez
      ultimo_visto INTEGER NOT NULL,   -- última vez que a fonte ainda o publicava
      versoes INTEGER NOT NULL DEFAULT 1,
      assinatura TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS avisos_inicio ON avisos (inicio);
    CREATE INDEX IF NOT EXISTS avisos_operador ON avisos (operador, tipo);
    CREATE TABLE IF NOT EXISTS avisos_versoes (
      id TEXT NOT NULL, visto INTEGER NOT NULL, estado TEXT, assinatura TEXT NOT NULL,
      dados TEXT NOT NULL,             -- o aviso inteiro, como veio (JSON)
      PRIMARY KEY (id, visto)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS noticias (
      id TEXT PRIMARY KEY, fonte TEXT, categoria TEXT, titulo TEXT, resumo TEXT, url TEXT, data TEXT,
      primeiro_visto INTEGER NOT NULL, ultimo_visto INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS noticias_data ON noticias (data);
  `);
  _bd = b;
  return b;
}

/** Forma mínima de um aviso (a de CentralAlert, em types/alerts.ts) */
export interface AvisoParaArquivo {
  id: string; external_id?: string; tipo: string; título: string; descrição: string; operador: string;
  linhas?: string[]; paragens?: string[]; região?: string; municípios?: string[];
  start_datetime: string; end_datetime?: string | null; published_datetime?: string; source?: string; source_url?: string;
  status?: string; severity?: string; dias_perturbacao?: string[];
}

const json = (x: unknown) => JSON.stringify(x ?? null);
/** O que, se mudar, faz uma versão nova (não conta a hora da última atualização da fonte) */
function assinaturaDe(a: AvisoParaArquivo): string {
  const partes = [a.tipo, a.título, a.descrição, a.operador, a.linhas, a.paragens, a.municípios, a.start_datetime, a.end_datetime, a.status, a.severity, a.dias_perturbacao, a.source_url];
  return crypto.createHash('sha1').update(JSON.stringify(partes)).digest('base64url').slice(0, 16);
}

/** Guarda o estado atual de todos os avisos; cada mudança fica como uma versão nova. Devolve quantos são novos e quantos mudaram. */
export function arquivarAvisos(lista: AvisoParaArquivo[], agora = Date.now()): { novos: number; mudaram: number } {
  if (!lista.length) return { novos: 0, mudaram: 0 };
  const b = baseHistorico();
  const ler = b.prepare('SELECT assinatura FROM avisos WHERE id = ?');
  const novo = b.prepare(`INSERT INTO avisos (id, fonte, operador, tipo, severidade, estado, titulo, descricao, linhas, paragens, regiao, municipios,
    dias_perturbacao, inicio, fim, publicado, url, primeiro_visto, ultimo_visto, versoes, assinatura)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
  const mudou = b.prepare(`UPDATE avisos SET fonte = ?, operador = ?, tipo = ?, severidade = ?, estado = ?, titulo = ?, descricao = ?, linhas = ?,
    paragens = ?, regiao = ?, municipios = ?, dias_perturbacao = ?, inicio = ?, fim = ?, publicado = ?, url = ?, ultimo_visto = ?,
    versoes = versoes + 1, assinatura = ? WHERE id = ?`);
  const visto = b.prepare('UPDATE avisos SET ultimo_visto = ? WHERE id = ?');
  const versao = b.prepare('INSERT OR IGNORE INTO avisos_versoes (id, visto, estado, assinatura, dados) VALUES (?, ?, ?, ?, ?)');
  let novos = 0, mudaram = 0;
  b.exec('BEGIN');
  try {
    for (const a of lista) {
      if (!a?.id) continue;
      const assinatura = assinaturaDe(a);
      const antes = ler.get(a.id) as { assinatura: string } | undefined;
      const campos = [a.source || null, a.operador || null, a.tipo || null, a.severity || null, a.status || null, a.título || null, a.descrição || null,
        json(a.linhas || []), json(a.paragens || []), a.região || null, json(a.municípios || []), json(a.dias_perturbacao || []),
        a.start_datetime || null, a.end_datetime || null, a.published_datetime || null, a.source_url || null];
      if (!antes) {
        novo.run(a.id, ...campos, agora, agora, assinatura);
        novos++;
      } else if (antes.assinatura !== assinatura) {
        mudou.run(...campos, agora, assinatura, a.id);
        mudaram++;
      } else {
        visto.run(agora, a.id);
        continue;
      }
      versao.run(a.id, agora, a.status || null, assinatura, JSON.stringify(a));
    }
    b.exec('COMMIT');
  } catch (e) {
    try { b.exec('ROLLBACK'); } catch { /* já desfeita */ }
    throw e;
  }
  return { novos, mudaram };
}

export interface NoticiaParaArquivo { id: string; fonte: string; categoria: string; titulo: string; resumo?: string; url: string; data: string }

/** Guarda as notícias (uma vez cada; depois só se atualiza a última vez que o feed ainda a trazia) */
export function arquivarNoticias(lista: NoticiaParaArquivo[], agora = Date.now()): number {
  if (!lista.length) return 0;
  const b = baseHistorico();
  const ins = b.prepare(`INSERT INTO noticias (id, fonte, categoria, titulo, resumo, url, data, primeiro_visto, ultimo_visto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET ultimo_visto = excluded.ultimo_visto`);
  let n = 0;
  b.exec('BEGIN');
  try {
    for (const x of lista) {
      if (!x?.id) continue;
      ins.run(x.id, x.fonte, x.categoria, x.titulo, x.resumo || null, x.url, x.data, agora, agora);
      n++;
    }
    b.exec('COMMIT');
  } catch (e) {
    try { b.exec('ROLLBACK'); } catch { /* já desfeita */ }
    throw e;
  }
  return n;
}
