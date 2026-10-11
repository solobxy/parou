// Base de dados da comunidade (contas, sessões, favoritos na conta, ocorrências e reclamações).
// Fica num ficheiro SQLite à parte (comunidade.db) na pasta de dados do servidor, separado dos
// horários: os horários são refeitos todos os dias, estes dados nunca podem ser substituídos.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
export const FICHEIRO_COMUNIDADE = path.join(PASTA, 'comunidade.db');
const PASTA_COPIAS = path.join(PASTA, 'copias');

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
      pontos INTEGER NOT NULL DEFAULT 0,
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

    -- Conversas da comunidade: publicações com respostas em cadeia, votos, denúncias e bloqueios.
    -- Quando uma conta é apagada, o conteúdo fica mas sem autor ("Utilizador PAROU").
    CREATE TABLE IF NOT EXISTS publicacoes (
      id TEXT PRIMARY KEY,
      autor_id TEXT REFERENCES utilizadores(id) ON DELETE SET NULL,
      titulo TEXT NOT NULL,
      texto TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'conversa',
      operador TEXT,
      linha TEXT,
      concelho TEXT,
      distrito TEXT,
      lat REAL,
      lon REAL,
      criado INTEGER NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      respostas INTEGER NOT NULL DEFAULT 0,
      denuncias INTEGER NOT NULL DEFAULT 0,
      revisto INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'visivel'
    );
    CREATE INDEX IF NOT EXISTS idx_publicacoes_criado ON publicacoes (criado DESC);
    CREATE INDEX IF NOT EXISTS idx_publicacoes_autor ON publicacoes (autor_id, criado);
    CREATE INDEX IF NOT EXISTS idx_publicacoes_operador ON publicacoes (operador, criado DESC);
    CREATE TABLE IF NOT EXISTS respostas (
      id TEXT PRIMARY KEY,
      publicacao_id TEXT NOT NULL REFERENCES publicacoes(id) ON DELETE CASCADE,
      pai_id TEXT,
      autor_id TEXT REFERENCES utilizadores(id) ON DELETE SET NULL,
      texto TEXT NOT NULL DEFAULT '',
      oficial TEXT,
      criado INTEGER NOT NULL,
      profundidade INTEGER NOT NULL DEFAULT 0,
      pontos INTEGER NOT NULL DEFAULT 0,
      denuncias INTEGER NOT NULL DEFAULT 0,
      revisto INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'visivel'
    );
    CREATE INDEX IF NOT EXISTS idx_respostas_publicacao ON respostas (publicacao_id, criado);
    CREATE INDEX IF NOT EXISTS idx_respostas_autor ON respostas (autor_id, criado);
    CREATE TABLE IF NOT EXISTS votos_comunidade (
      alvo_id TEXT NOT NULL,
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      valor INTEGER NOT NULL,
      criado INTEGER NOT NULL,
      PRIMARY KEY (alvo_id, utilizador_id)
    );
    CREATE INDEX IF NOT EXISTS idx_votos_utilizador ON votos_comunidade (utilizador_id);
    CREATE TABLE IF NOT EXISTS denuncias_comunidade (
      alvo_id TEXT NOT NULL,
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      motivo TEXT NOT NULL,
      criado INTEGER NOT NULL,
      PRIMARY KEY (alvo_id, utilizador_id)
    );
    CREATE TABLE IF NOT EXISTS bloqueios (
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      bloqueado_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      criado INTEGER NOT NULL,
      PRIMARY KEY (utilizador_id, bloqueado_id)
    );
    -- Pontos de reputação ganhos por dia e por motivo (para haver um limite diário e ninguém "fabricar" pontos)
    CREATE TABLE IF NOT EXISTS ganhos_pontos (
      utilizador_id TEXT NOT NULL REFERENCES utilizadores(id) ON DELETE CASCADE,
      dia TEXT NOT NULL,
      motivo TEXT NOT NULL,
      pontos INTEGER NOT NULL,
      PRIMARY KEY (utilizador_id, dia, motivo)
    );
  `);
  migrar(nova);
  db = nova;
  return nova;
}

/** Alterações à base de dados que se fazem uma só vez (o número fica guardado em PRAGMA user_version). */
function migrar(b: DatabaseSync) {
  const versao = Number((b.prepare('PRAGMA user_version').get() as any)?.user_version || 0);
  if (versao < 1) {
    // A reputação passa a começar a zero: as contas que já existiam tinham 50 pontos de partida.
    // Antes de mexer, guarda-se uma cópia do ficheiro (se já tinha contas).
    try {
      const n = Number((b.prepare('SELECT COUNT(*) AS n FROM utilizadores').get() as any)?.n || 0);
      if (n > 0) {
        fs.mkdirSync(PASTA_COPIAS, { recursive: true });
        b.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        fs.copyFileSync(FICHEIRO_COMUNIDADE, path.join(PASTA_COPIAS, 'comunidade-antes-da-reputacao-a-zero.db'));
      }
    } catch (err: any) {
      console.warn('[Comunidade] Não foi possível guardar a cópia antes da migração:', err?.message || err);
    }
    b.exec('UPDATE utilizadores SET pontos = MAX(0, pontos - 50)');
    b.exec('PRAGMA user_version = 1');
  }
  if (versao < 2) {
    // Avatar da conta, conta oficial de operador (resposta oficial) e suspensão temporária
    const colunas = (b.prepare('PRAGMA table_info(utilizadores)').all() as Array<{ name: string }>).map((c) => c.name);
    if (!colunas.includes('avatar')) b.exec('ALTER TABLE utilizadores ADD COLUMN avatar TEXT');
    if (!colunas.includes('operador')) b.exec('ALTER TABLE utilizadores ADD COLUMN operador TEXT');
    if (!colunas.includes('suspenso_ate')) b.exec('ALTER TABLE utilizadores ADD COLUMN suspenso_ate INTEGER');
    b.exec('PRAGMA user_version = 2');
  }
  if (versao < 3) {
    // Imagens nas publicações (só as da própria PAROU nas novidades: lista de caminhos em JSON)
    const colunas = (b.prepare('PRAGMA table_info(publicacoes)').all() as Array<{ name: string }>).map((c) => c.name);
    if (!colunas.includes('imagens')) b.exec('ALTER TABLE publicacoes ADD COLUMN imagens TEXT');
    b.exec('PRAGMA user_version = 3');
  }
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
// Cópias de segurança: de 6 em 6 horas, uma cópia completa e consistente de cada base de dados
// de pessoas (contas e comunidade, cópia dos favoritos de cada telemóvel, subscrições de avisos).
// Guardam-se todas as dos últimos 2 dias e, para trás, a última de cada dia até 30 dias.
// A pasta copias/ultima tem sempre o conjunto mais recente, já verificado: é essa que o GitHub
// vai buscar todas as noites (cifrada) para existir também fora do servidor.
// ---------------------------------------------------------------------------------------------
const BASES_A_COPIAR = [
  { nome: 'comunidade', ficheiro: FICHEIRO_COMUNIDADE },
  { nome: 'utilizadores', ficheiro: path.join(PASTA, 'utilizadores.db') },
  { nome: 'push', ficheiro: path.join(PASTA, 'push.db') },
];
const DIAS_DE_COPIAS = 30;

function copiarBase(origem: DatabaseSync | null, ficheiro: string, destino: string): boolean {
  const temporario = `${destino}.novo`;
  try { fs.rmSync(temporario, { force: true }); } catch {}
  let propria: DatabaseSync | null = null;
  try {
    const bd = origem || (fs.existsSync(ficheiro) ? (propria = new DatabaseSync(ficheiro)) : null);
    if (!bd) return false;
    bd.exec('PRAGMA busy_timeout = 5000;');
    bd.exec(`VACUUM INTO '${temporario.replace(/'/g, "''")}'`);
  } finally { try { propria?.close(); } catch {} }
  // Confirma que a cópia abre e está íntegra antes de a aceitar
  const teste = new DatabaseSync(temporario);
  try {
    const r = (teste.prepare('PRAGMA integrity_check').get() as any)?.integrity_check;
    if (r !== 'ok') throw new Error(`cópia com problemas: ${r}`);
  } finally { teste.close(); }
  fs.renameSync(temporario, destino);
  return true;
}

function limparCopiasAntigas(nome: string) {
  const re = new RegExp(`^${nome}-(\\d{4}-\\d{2}-\\d{2})(?:T\\d{2})?\\.db$`);
  const todas = fs.readdirSync(PASTA_COPIAS).filter((f) => re.test(f)).sort();
  const dias = [...new Set(todas.map((f) => f.match(re)![1]))].sort();
  const recentes = new Set(dias.slice(-2));
  const limite = new Date(Date.now() - DIAS_DE_COPIAS * 86400_000).toISOString().slice(0, 10);
  const ultimaDoDia = new Map<string, string>();
  for (const f of todas) ultimaDoDia.set(f.match(re)![1], f);
  for (const f of todas) {
    const dia = f.match(re)![1];
    const manter = dia >= limite && (recentes.has(dia) || ultimaDoDia.get(dia) === f);
    if (!manter) { try { fs.rmSync(path.join(PASTA_COPIAS, f), { force: true }); } catch {} }
  }
}

export function fazerCopia() {
  try {
    fs.mkdirSync(path.join(PASTA_COPIAS, 'ultima'), { recursive: true });
    const agora = new Date();
    const carimbo = agora.toISOString().slice(0, 13); // 2026-10-11T01
    const resumo: string[] = [`quando=${agora.toISOString()}`];
    for (const b of BASES_A_COPIAR) {
      try {
        const destino = path.join(PASTA_COPIAS, `${b.nome}-${carimbo}.db`);
        if (!copiarBase(b.nome === 'comunidade' ? base() : null, b.ficheiro, destino)) { resumo.push(`${b.nome}=sem_ficheiro`); continue; }
        fs.copyFileSync(destino, path.join(PASTA_COPIAS, 'ultima', `${b.nome}.db.novo`));
        fs.renameSync(path.join(PASTA_COPIAS, 'ultima', `${b.nome}.db.novo`), path.join(PASTA_COPIAS, 'ultima', `${b.nome}.db`));
        resumo.push(`${b.nome}=ok(${fs.statSync(destino).size}b)`);
        limparCopiasAntigas(b.nome);
      } catch (err: any) {
        resumo.push(`${b.nome}=ERRO`);
        console.warn(`[Cópias] Erro na cópia de ${b.nome}:`, err?.message || err);
      }
    }
    fs.writeFileSync(path.join(PASTA_COPIAS, 'ultima', 'INFO.txt'), resumo.join('\n') + '\n');
    console.log(`[Cópias] ${resumo.join(' ')}`);
  } catch (err: any) {
    console.warn('[Cópias] Erro ao fazer a cópia de segurança:', err?.message || err);
  }
}

export function iniciarCopiasDeSeguranca() {
  setTimeout(fazerCopia, 2 * 60_000);
  setInterval(fazerCopia, 6 * 3600_000);
}
