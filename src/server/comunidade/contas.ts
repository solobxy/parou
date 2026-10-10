// Contas com email e palavra-passe, sessões e favoritos guardados na conta.
// As palavras-passe nunca se guardam: só um resumo irreversível (scrypt, com sal único).
// A sessão é um número aleatório num cookie; no servidor guarda-se só o resumo dele.
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';

export const VALIDADE_SESSAO_MS = 30 * 24 * 3600_000;
const RENOVAR_APOS_MS = 24 * 3600_000;

export interface Conta {
  id: string;
  email: string;
  nome: string;
  foto: string | null;
  pontos: number;
  ocorrencias: number;
  criado: number;
}

export interface PerfilApp {
  userId: string;
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  reputationPoints: number;
  reportsCount: number;
  badge: string;
  createdAt: number;
}

export function distintivo(pontos: number): string {
  if (pontos >= 500) return 'Embaixador da Mobilidade';
  if (pontos >= 250) return 'Sentinela de Trânsito';
  if (pontos >= 100) return 'Colaborador Ativo';
  return 'Novo Observador';
}

export function perfilDaConta(c: Conta): PerfilApp {
  return {
    userId: c.id,
    uid: c.id,
    displayName: c.nome,
    email: c.email,
    ...(c.foto ? { photoURL: c.foto } : {}),
    reputationPoints: c.pontos,
    reportsCount: c.ocorrencias,
    badge: distintivo(c.pontos),
    createdAt: c.criado,
  };
}

export class ErroConta extends Error {
  constructor(public codigo: string, mensagem: string, public estado = 400) {
    super(mensagem);
  }
}

const resumo = (txt: string) => crypto.createHash('sha256').update(txt).digest('hex');

// ------------------------------- palavras-passe -------------------------------
function scrypt(palavra: string, sal: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, falha) => {
    crypto.scrypt(palavra.normalize('NFKC'), sal, 64, { N, r, p, maxmem: 128 * N * r + 1024 * 1024 }, (e, k) => (e ? falha(e) : ok(k)));
  });
}

async function criarResumo(palavra: string): Promise<string> {
  const sal = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const k = await scrypt(palavra, sal, N, r, p);
  return `scrypt$${N}$${r}$${p}$${sal.toString('base64')}$${k.toString('base64')}`;
}

async function verificarPalavra(palavra: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, esperado] = partes;
  try {
    const k = await scrypt(palavra, Buffer.from(sal, 'base64'), Number(N), Number(r), Number(p));
    const e = Buffer.from(esperado, 'base64');
    return k.length === e.length && crypto.timingSafeEqual(k, e);
  } catch {
    return false;
  }
}

// Resumo falso para gastar o mesmo tempo quando o email não existe (não revela quem tem conta)
let resumoFalso: Promise<string> | null = null;

// ------------------------------- validações -------------------------------
export function emailValido(email: string): boolean {
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
export function limparEmail(txt: unknown): string {
  return String(txt || '').trim().toLowerCase();
}
function validarPalavra(p: string) {
  if (p.length < 8) throw new ErroConta('palavra_curta', 'A palavra-passe tem de ter pelo menos 8 caracteres.');
  if (p.length > 200) throw new ErroConta('palavra_longa', 'A palavra-passe é demasiado longa.');
}
function limparNome(txt: unknown, email: string): string {
  const n = String(txt || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  return n || email.split('@')[0].slice(0, 100) || 'Utilizador PAROU';
}

// ------------------------------- contas -------------------------------
function lerConta(linha: any): Conta | null {
  if (!linha) return null;
  return {
    id: linha.id, email: linha.email, nome: linha.nome, foto: linha.foto || null,
    pontos: Number(linha.pontos), ocorrencias: Number(linha.ocorrencias), criado: Number(linha.criado),
  };
}

export function contaPorId(id: string): Conta | null {
  return lerConta(base().prepare('SELECT id, email, nome, foto, pontos, ocorrencias, criado FROM utilizadores WHERE id = ?').get(id));
}

export async function registar(emailBruto: unknown, palavra: unknown, nome: unknown): Promise<{ conta: Conta; token: string }> {
  const email = limparEmail(emailBruto);
  if (!emailValido(email)) throw new ErroConta('email_invalido', 'Escreve um email válido.');
  const pass = String(palavra || '');
  validarPalavra(pass);
  const resumoPalavra = await criarResumo(pass);
  const id = crypto.randomUUID();
  const agora = Date.now();
  try {
    base().prepare('INSERT INTO utilizadores (id, email, palavra_passe, nome, pontos, ocorrencias, criado) VALUES (?, ?, ?, ?, 50, 0, ?)')
      .run(id, email, resumoPalavra, limparNome(nome, email), agora);
  } catch (err: any) {
    if (/UNIQUE/i.test(String(err?.message))) {
      throw new ErroConta('email_existe', 'Já existe uma conta com este email. Entra ou recupera a palavra-passe.', 409);
    }
    throw err;
  }
  const conta = contaPorId(id)!;
  return { conta, token: criarSessao(id) };
}

export async function entrar(emailBruto: unknown, palavra: unknown): Promise<{ conta: Conta; token: string }> {
  const email = limparEmail(emailBruto);
  const pass = String(palavra || '');
  const linha = base().prepare('SELECT id, palavra_passe FROM utilizadores WHERE email = ?').get(email) as { id: string; palavra_passe: string } | undefined;
  let certo = false;
  if (linha) {
    certo = await verificarPalavra(pass, linha.palavra_passe);
  } else {
    resumoFalso = resumoFalso || criarResumo('palavra-falsa-para-igualar-o-tempo');
    await verificarPalavra(pass, await resumoFalso);
  }
  if (!linha || !certo) throw new ErroConta('credenciais', 'Email ou palavra-passe incorretos.', 401);
  return { conta: contaPorId(linha.id)!, token: criarSessao(linha.id) };
}

export async function confirmarPalavra(id: string, palavra: unknown): Promise<boolean> {
  const linha = base().prepare('SELECT palavra_passe FROM utilizadores WHERE id = ?').get(id) as { palavra_passe: string } | undefined;
  return !!linha && (await verificarPalavra(String(palavra || ''), linha.palavra_passe));
}

export async function mudarPalavra(id: string, nova: unknown, manterSessao?: string) {
  const pass = String(nova || '');
  validarPalavra(pass);
  const r = await criarResumo(pass);
  emTransacao(() => {
    base().prepare('UPDATE utilizadores SET palavra_passe = ? WHERE id = ?').run(r, id);
    // Todas as outras sessões fecham (quem tinha a palavra antiga fica de fora)
    if (manterSessao) base().prepare('DELETE FROM sessoes WHERE utilizador_id = ? AND resumo <> ?').run(id, resumo(manterSessao));
    else base().prepare('DELETE FROM sessoes WHERE utilizador_id = ?').run(id);
  });
}

export function mudarNome(id: string, nome: unknown) {
  const c = contaPorId(id);
  if (!c) return;
  base().prepare('UPDATE utilizadores SET nome = ? WHERE id = ?').run(limparNome(nome, c.email), id);
}

/** Apaga a conta e tudo o que é dela. As ocorrências e reclamações públicas ficam, sem o nome. */
export function apagarConta(id: string) {
  emTransacao(() => {
    for (const tabela of ['ocorrencias', 'reclamacoes']) {
      const linhas = base().prepare(`SELECT id, dados FROM ${tabela} WHERE autor_id = ?`).all(id) as Array<{ id: string; dados: string }>;
      for (const l of linhas) {
        let d: any = {};
        try { d = JSON.parse(l.dados); } catch {}
        delete d.authorId;
        d.authorName = 'Utilizador PAROU';
        base().prepare(`UPDATE ${tabela} SET dados = ?, autor_id = NULL WHERE id = ?`).run(JSON.stringify(d), l.id);
      }
    }
    base().prepare('DELETE FROM utilizadores WHERE id = ?').run(id); // sessões, favoritos e pedidos vão atrás
  });
}

export function darPontos(id: string | undefined | null, pontos: number, novaOcorrencia = false) {
  if (!id) return;
  base().prepare('UPDATE utilizadores SET pontos = MAX(0, pontos + ?), ocorrencias = ocorrencias + ? WHERE id = ?')
    .run(pontos, novaOcorrencia ? 1 : 0, id);
}

// ------------------------------- sessões -------------------------------
function criarSessao(utilizadorId: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const agora = Date.now();
  base().prepare('INSERT INTO sessoes (resumo, utilizador_id, criada, expira, renovada) VALUES (?, ?, ?, ?, ?)')
    .run(resumo(token), utilizadorId, agora, agora + VALIDADE_SESSAO_MS, agora);
  return token;
}

/** A conta dona da sessão (e se é altura de renovar o cookie), ou null. */
export function contaDaSessao(token: string | null | undefined): { conta: Conta; renovar: boolean } | null {
  if (!token || token.length < 20 || token.length > 100) return null;
  const r = resumo(token);
  const s = base().prepare('SELECT utilizador_id, expira, renovada FROM sessoes WHERE resumo = ?').get(r) as
    | { utilizador_id: string; expira: number; renovada: number } | undefined;
  if (!s) return null;
  const agora = Date.now();
  if (s.expira < agora) {
    base().prepare('DELETE FROM sessoes WHERE resumo = ?').run(r);
    return null;
  }
  const conta = contaPorId(s.utilizador_id);
  if (!conta) return null;
  let renovar = false;
  if (agora - s.renovada > RENOVAR_APOS_MS) {
    base().prepare('UPDATE sessoes SET expira = ?, renovada = ? WHERE resumo = ?').run(agora + VALIDADE_SESSAO_MS, agora, r);
    renovar = true;
  }
  return { conta, renovar };
}

export function terminarSessao(token: string | null | undefined) {
  if (token) base().prepare('DELETE FROM sessoes WHERE resumo = ?').run(resumo(token));
}

export function limparSessoesExpiradas() {
  try {
    base().prepare('DELETE FROM sessoes WHERE expira < ?').run(Date.now());
    base().prepare('DELETE FROM pedidos_email WHERE expira < ?').run(Date.now());
  } catch {}
}

// ------------------------------- recuperar palavra-passe -------------------------------
/** Cria o pedido de recuperação; devolve o código a enviar por email (ou null se não há conta). */
export function criarPedidoRecuperacao(emailBruto: unknown): { conta: Conta; token: string } | null {
  const email = limparEmail(emailBruto);
  const linha = base().prepare('SELECT id FROM utilizadores WHERE email = ?').get(email) as { id: string } | undefined;
  if (!linha) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  emTransacao(() => {
    base().prepare('DELETE FROM pedidos_email WHERE utilizador_id = ?').run(linha.id);
    base().prepare('INSERT INTO pedidos_email (resumo, utilizador_id, expira) VALUES (?, ?, ?)').run(resumo(token), linha.id, Date.now() + 3600_000);
  });
  return { conta: contaPorId(linha.id)!, token };
}

export async function redefinirPalavra(token: unknown, nova: unknown): Promise<{ conta: Conta; token: string }> {
  const t = String(token || '');
  const r = resumo(t);
  const p = base().prepare('SELECT utilizador_id, expira FROM pedidos_email WHERE resumo = ?').get(r) as { utilizador_id: string; expira: number } | undefined;
  if (!p || p.expira < Date.now()) throw new ErroConta('pedido_invalido', 'Este link já não é válido. Pede outro.', 400);
  await mudarPalavra(p.utilizador_id, nova);
  base().prepare('DELETE FROM pedidos_email WHERE utilizador_id = ?').run(p.utilizador_id);
  return { conta: contaPorId(p.utilizador_id)!, token: criarSessao(p.utilizador_id) };
}

// ------------------------------- favoritos da conta -------------------------------
const MAX_FAVORITOS = 300;
const MAX_FAVORITO_BYTES = 8000;

export function listarFavoritos(id: string): unknown[] {
  const linhas = base().prepare('SELECT dados FROM favoritos WHERE utilizador_id = ?').all(id) as Array<{ dados: string }>;
  const out: unknown[] = [];
  for (const l of linhas) { try { out.push(JSON.parse(l.dados)); } catch {} }
  return out;
}

export function guardarFavoritos(id: string, itens: unknown): number {
  if (!Array.isArray(itens)) return 0;
  let n = 0;
  emTransacao(() => {
    const total = Number((base().prepare('SELECT COUNT(*) AS n FROM favoritos WHERE utilizador_id = ?').get(id) as any).n);
    let restantes = Math.max(0, MAX_FAVORITOS - total);
    for (const it of itens.slice(0, MAX_FAVORITOS)) {
      if (!it || typeof it !== 'object') continue;
      const fid = String((it as any).id || '');
      if (!fid || fid.length > 200) continue;
      const json = JSON.stringify(it);
      if (json.length > MAX_FAVORITO_BYTES) continue;
      const existe = base().prepare('SELECT 1 FROM favoritos WHERE utilizador_id = ? AND id = ?').get(id, fid);
      if (!existe) { if (restantes <= 0) continue; restantes--; }
      const quando = Number((it as any).updatedAt || (it as any).addedAt) || Date.now();
      base().prepare(`INSERT INTO favoritos (utilizador_id, id, dados, atualizado) VALUES (?, ?, ?, ?)
        ON CONFLICT(utilizador_id, id) DO UPDATE SET dados = excluded.dados, atualizado = excluded.atualizado`).run(id, fid, json, quando);
      n++;
    }
  });
  return n;
}

export function apagarFavorito(id: string, favoritoId: string) {
  base().prepare('DELETE FROM favoritos WHERE utilizador_id = ? AND id = ?').run(id, favoritoId);
}
