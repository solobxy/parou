// Base de dados da comunidade (contas, sessões, favoritos na conta, ocorrências e reclamações).
// Fica num ficheiro SQLite à parte (comunidade.db) na pasta de dados do servidor, separado dos
// horários: os horários são refeitos todos os dias, estes dados nunca podem ser substituídos.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
export const FICHEIRO_COMUNIDADE = path.join(PASTA, 'comunidade.db');
const PASTA_COPIAS = path.join(PASTA, 'copias');
const COPIAS_A_GUARDAR = 14;

let db: DatabaseSync | null = null;

export function base(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(PASTA, { recursive: true });
  const nova = new DatabaseSync(FICHEIRO_COMUNIDADE);
  nova.exec('PRAGMA journal_mode = WAL;');
  nova.exec('PRAGMA busy_timeout = 5000;');
  nova.exec('PRAGMA synchronous = FULL;'); // contas e reclamações: nunca se perde uma gravação
  nova.exec('PRAGMA foreign_keys = ON;');
  nova.exec(`
    CREATE TABLE IF NOT EXISTS utilizadores (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      palavra_passe TEXT NOT NULL,
      nome TEXT NOT NULL,
      foto TEXT,
      pontos INTEGER NOT NULL DEFAULT 50,
      ocorrencias INTEGER NOT NULL DEFAULT 0,
      criado INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      resumo TEXT PRIMARY KEY,
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      criada INTEGER NOT NULL,
      expira INTEGER NOT NULL,
      renovada INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessoes_utilizador ON sessoes (utilizador_id);
    CREATE TABLE IF NOT EXISTS pedidos_email (
      resumo TEXT PRIMARY KEY,
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      expira INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS favoritos (
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      dados TEXT NOT NULL,
      atualizado INTEGER NOT NULL,
      PRIMARY KEY (utilizador_id, id)
    );
    CREATE TABLE IF NOT EXISTS ocorrencias (
      id TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      momento INTEGER NOT NULL,
      id_externo TEXT,
      autor_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_momento ON ocorrencias (momento DESC);
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_externo ON ocorrencias (id_externo);
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_autor ON ocorrencias (autor_id);
    CREATE TABLE IF NOT EXISTS reclamacoes (
      id TEXT PRIMARY KEY,
      dados TEXT NOT NULL,
      momento INTEGER NOT NULL,
      autor_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reclamacoes_momento ON reclamacoes (momento DESC);
    CREATE INDEX IF NOT EXISTS idx_reclamacoes_autor ON reclamacoes (autor_id);
    CREATE TABLE IF NOT EXISTS comentarios (
      id TEXT PRIMARY KEY,
      reclamacao_id TEXT NOT NULL REFERENCES reclamacoes(id) ON DELETE CASCADE,
      dados TEXT NOT NULL,
      momento INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comentarios_reclamacao ON comentarios (reclamacao_id, momento);
  `);
  db = nova;
  return nova;
}

/** Executa várias gravações como uma só: ou ficam todas, ou nenhuma. */
export function emTransacao<T>(f: () => T): T {
  const b = base();
  b.exec('BEGIN IMMEDIATE');
  try {
    const r = f();
    b.exec('COMMIT');
    return r;
  } catch (err) {
    try { b.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Cópias de segurança: de 6 em 6 horas fica uma cópia completa do dia (guardam-se as últimas 14).
// ---------------------------------------------------------------------------------------------
function fazerCopia() {
  try {
    fs.mkdirSync(PASTA_COPIAS, { recursive: true });
    const hoje = new Date().toISOString().slice(0, 10);
    const destino = path.join(PASTA_COPIAS, `comunidade-${hoje}.db`);
    const temporario = `${destino}.novo`;
    try { fs.rmSync(temporario, { force: true }); } catch {}
    base().exec(`VACUUM INTO '${temporario.replace(/'/g, "''")}'`);
    fs.renameSync(temporario, destino);
    const antigas = fs.readdirSync(PASTA_COPIAS).filter((f) => /^comunidade-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of antigas.slice(0, Math.max(0, antigas.length - COPIAS_A_GUARDAR))) {
      try { fs.rmSync(path.join(PASTA_COPIAS, f), { force: true }); } catch {}
    }
  } catch (err: any) {
    console.warn('[Comunidade] Erro ao fazer a cópia de segurança:', err?.message || err);
  }
}

export function iniciarCopiasDeSeguranca() {
  setTimeout(fazerCopia, 2 * 60_000);
  setInterval(fazerCopia, 6 * 3600_000);
}
