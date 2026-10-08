// Cópia de segurança dos favoritos e preferências de cada telemóvel, no servidor.
//
// O browser pode apagar o que a app guarda no telemóvel (o Safari apaga ao fim de 7 dias
// sem abrir o site; limpar dados do browser também apaga). Para os favoritos nunca se
// perderem, cada telemóvel recebe um identificador anónimo num cookie do servidor (estes
// cookies não são apagados ao fim de 7 dias) e a app guarda aqui uma cópia dos favoritos.
// Não há dados pessoais: só um número aleatório e as listas de paragens/linhas favoritas.
import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const FICHEIRO = path.join(PASTA, 'utilizadores.db');
const COOKIE = 'parou_id';
const VALIDADE_COOKIE_S = 400 * 24 * 3600; // máximo que os browsers aceitam

// Só estas chaves são guardadas (favoritos e preferências)
export const CHAVES_DADOS_UTILIZADOR = [
  'parou_user_favorites',
  'parou_favorite_line_ids',
  'parou_favorite_stops_v1',
  'parou_alertas_area',
  'parou_notification_preferences_v1',
  'parou_central_alerts_prefs_v1',
];
const MAX_VALOR = 200_000;

let db: DatabaseSync | null = null;
function base(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(PASTA, { recursive: true });
  db = new DatabaseSync(FICHEIRO);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS dados_utilizador (
    id TEXT PRIMARY KEY,
    dados TEXT NOT NULL,
    atualizado INTEGER NOT NULL,
    visto INTEGER NOT NULL
  )`);
  return db;
}

function lerCookie(req: Request, nome: string): string | null {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

const ID_VALIDO = /^[a-f0-9-]{36}$/;

/** Devolve o id do telemóvel (cria um se não houver) e renova o cookie por mais 400 dias. */
function idDoTelemovel(req: Request, res: Response): string {
  let id = lerCookie(req, COOKIE);
  if (!id || !ID_VALIDO.test(id)) id = crypto.randomUUID();
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
  res.append(
    'Set-Cookie',
    `${COOKIE}=${id}; Max-Age=${VALIDADE_COOKIE_S}; Path=/; SameSite=Lax; HttpOnly${https ? '; Secure' : ''}`,
  );
  return id;
}

function limpar(dados: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!dados || typeof dados !== 'object') return out;
  for (const chave of CHAVES_DADOS_UTILIZADOR) {
    const v = (dados as Record<string, unknown>)[chave];
    if (typeof v === 'string' && v.length <= MAX_VALOR) out[chave] = v;
  }
  return out;
}

// Cópias sem uso há mais de 13 meses são apagadas (como diz a política de privacidade)
function limparAntigos() {
  try {
    const limite = Date.now() - 395 * 24 * 3600 * 1000;
    const r = base().prepare('DELETE FROM dados_utilizador WHERE visto < ?').run(limite);
    if (Number(r.changes) > 0) console.log(`[Dados utilizador] ${r.changes} cópias antigas apagadas`);
  } catch {}
}

export function registarRotasDadosUtilizador(app: Express) {
  setTimeout(limparAntigos, 60_000);
  setInterval(limparAntigos, 24 * 3600 * 1000);

  app.get('/api/dados-utilizador', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = idDoTelemovel(req, res);
      const linha = base().prepare('SELECT dados, atualizado FROM dados_utilizador WHERE id = ?').get(id) as
        | { dados: string; atualizado: number }
        | undefined;
      if (linha) base().prepare('UPDATE dados_utilizador SET visto = ? WHERE id = ?').run(Date.now(), id);
      res.json({ atualizado: linha?.atualizado || 0, dados: linha ? JSON.parse(linha.dados) : {} });
    } catch (err: any) {
      console.warn('[Dados utilizador] Erro ao ler:', err?.message || err);
      res.status(500).json({ erro: 'indisponível' });
    }
  });

  // POST (também usado pelo sendBeacon quando a app fecha)
  app.post('/api/dados-utilizador', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = idDoTelemovel(req, res);
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const dados = limpar(corpo?.dados);
      const atualizado = Math.min(Number(corpo?.atualizado) || Date.now(), Date.now() + 60_000);
      // Nunca troca uma cópia com dados por uma vazia (ex.: browser que perdeu tudo)
      if (Object.keys(dados).length === 0) return res.json({ guardado: false });
      const atual = base().prepare('SELECT atualizado FROM dados_utilizador WHERE id = ?').get(id) as
        | { atualizado: number }
        | undefined;
      if (atual && atual.atualizado > atualizado) {
        return res.json({ guardado: false, motivo: 'há uma cópia mais recente' });
      }
      base()
        .prepare(
          `INSERT INTO dados_utilizador (id, dados, atualizado, visto) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado, visto = excluded.visto`,
        )
        .run(id, JSON.stringify(dados), atualizado, Date.now());
      res.json({ guardado: true, atualizado });
    } catch (err: any) {
      console.warn('[Dados utilizador] Erro ao guardar:', err?.message || err);
      res.status(500).json({ erro: 'indisponível' });
    }
  });
}
