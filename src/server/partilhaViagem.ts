// =====================================================================================
// PAROU.PT — Partilhar a viagem (posição e hora de chegada) com alguém, por uma ligação
//
// Quem partilha recebe uma ligação (parou.pt/v/<id>) e um segredo só seu para atualizar a posição. Quem abre a ligação
// vê o destino, a hora prevista de chegada, os transportes e a última posição (nunca o histórico). Tudo apaga-se quando
// a partilha acaba: ao chegar, ao carregar em «Parar» ou, no máximo, 30 min depois da hora prevista (até 4 h).
// =====================================================================================
import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ipDe, dentroDoLimite } from './limites';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const FICH_DB = path.join(PASTA, 'partilhas.db');
export const DURACAO_MAX_MS = 4 * 3600_000;
export const DEPOIS_DA_CHEGADA_MS = 30 * 60_000;
/** A posição deixa de se mostrar se não é atualizada há mais do que isto (a app pode estar fechada) */
export const POSICAO_VELHA_MS = 10 * 60_000;
const RAIO_CHEGADA_M = 150;

export interface TrocoPartilhado { modo: string; linha: string; cor?: string; de: string; para: string; sai: string; chega: string }
export interface Partilha {
  id: string;
  destino: { nome: string; lat: number; lon: number };
  chegada: number;
  trocos: TrocoPartilhado[];
  criado: number;
  expira: number;
  estado: 'a-caminho' | 'chegou' | 'terminada';
  pos?: { lat: number; lon: number; acc: number; t: number };
  chegouEm?: number;
}

let db: DatabaseSync | null = null;
function base(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(PASTA, { recursive: true });
  db = new DatabaseSync(FICH_DB);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS partilhas (
    id TEXT PRIMARY KEY,
    segredo TEXT NOT NULL,
    dados TEXT NOT NULL,
    expira INTEGER NOT NULL
  )`);
  return db;
}

const texto = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
const hora = (v: unknown) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v) : '');
const numero = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : NaN; };

function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, p = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * p) / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Valida o pedido de uma partilha nova (o que a app manda). Devolve null se algo não serve. */
export function partilhaDoPedido(c: any, agora = Date.now()): Omit<Partilha, 'id'> | null {
  const lat = numero(c?.destino?.lat, 30, 44), lon = numero(c?.destino?.lon, -32, -6);
  const nome = texto(c?.destino?.nome, 80);
  const chegada = numero(c?.chegada, agora - 10 * 60_000, agora + DURACAO_MAX_MS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !nome || !Number.isFinite(chegada)) return null;
  const trocos: TrocoPartilhado[] = (Array.isArray(c?.trocos) ? c.trocos : []).slice(0, 8).map((x: any) => ({
    modo: texto(x?.modo, 20), linha: texto(x?.linha, 12), cor: /^#[0-9a-f]{6}$/i.test(String(x?.cor || '')) ? String(x.cor) : undefined,
    de: texto(x?.de, 60), para: texto(x?.para, 60), sai: hora(x?.sai), chega: hora(x?.chega),
  })).filter((x: TrocoPartilhado) => x.linha || x.de);
  return {
    destino: { nome, lat, lon }, chegada, trocos, criado: agora,
    expira: Math.min(agora + DURACAO_MAX_MS, chegada + DEPOIS_DA_CHEGADA_MS), estado: 'a-caminho',
  };
}

/** Junta uma posição nova; ao chegar perto do destino, a partilha passa a «chegou» */
export function comPosicao(p: Partilha, lat: number, lon: number, acc: number, agora = Date.now()): Partilha {
  const n: Partilha = { ...p, pos: { lat, lon, acc: Math.round(acc), t: agora } };
  if (p.estado === 'a-caminho' && distM(lat, lon, p.destino.lat, p.destino.lon) <= Math.max(RAIO_CHEGADA_M, Math.min(acc, 300))) {
    n.estado = 'chegou';
    n.chegouEm = agora;
    // depois de chegar fica visível mais 15 min (para quem espera ver «chegou») e apaga-se
    n.expira = Math.min(p.expira, agora + 15 * 60_000);
  }
  return n;
}

/** O que quem abre a ligação vê: sem a posição se ela já é velha (nunca o histórico) */
export function vistaPublica(p: Partilha, agora = Date.now()) {
  const posRecente = p.pos && agora - p.pos.t <= POSICAO_VELHA_MS && p.estado === 'a-caminho' ? p.pos : undefined;
  return {
    destino: p.destino, chegada: p.chegada, trocos: p.trocos, estado: p.estado, expira: p.expira,
    chegouEm: p.chegouEm, pos: posRecente, atualizado: p.pos?.t,
  };
}

function ler(id: string): { p: Partilha; segredo: string } | null {
  const r = base().prepare('SELECT segredo, dados, expira FROM partilhas WHERE id = ?').get(id) as any;
  if (!r) return null;
  if (r.expira < Date.now()) { base().prepare('DELETE FROM partilhas WHERE id = ?').run(id); return null; }
  try { return { p: JSON.parse(r.dados), segredo: r.segredo }; } catch { return null; }
}
function gravar(p: Partilha, segredo?: string) {
  if (segredo) base().prepare('INSERT INTO partilhas (id, segredo, dados, expira) VALUES (?, ?, ?, ?)').run(p.id, segredo, JSON.stringify(p), p.expira);
  else base().prepare('UPDATE partilhas SET dados = ?, expira = ? WHERE id = ?').run(JSON.stringify(p), p.expira, p.id);
}
const segredoCerto = (a: string, b: string) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const ID = /^[a-z0-9]{12}$/;

export function registarRotasPartilha(app: Express) {
  // limpeza das que acabaram
  setInterval(() => { try { base().prepare('DELETE FROM partilhas WHERE expira < ?').run(Date.now()); } catch { /* volta a tentar */ } }, 10 * 60_000).unref();

  app.post('/api/partilha', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!dentroDoLimite(`partilha:${ipDe(req)}`, 20, 3600_000)) return res.status(429).json({ erro: 'demasiadas partilhas' });
    try {
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      const dados = partilhaDoPedido(corpo);
      if (!dados) return res.status(400).json({ erro: 'viagem inválida' });
      const id = Array.from(crypto.randomBytes(12)).map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
      const segredo = crypto.randomBytes(24).toString('hex');
      const p: Partilha = { id, ...dados };
      const lat = numero(corpo?.pos?.lat, 30, 44), lon = numero(corpo?.pos?.lon, -32, -6);
      gravar(Number.isFinite(lat) && Number.isFinite(lon) ? comPosicao(p, lat, lon, numero(corpo?.pos?.acc, 0, 5000) || 50) : p, segredo);
      res.json({ id, segredo, url: `https://parou.pt/v/${id}`, expira: p.expira });
    } catch {
      res.status(500).json({ erro: 'indisponível' });
    }
  });

  app.post('/api/partilha/:id', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = String(req.params.id || '');
    if (!ID.test(id)) return res.status(404).json({ erro: 'não existe' });
    if (!dentroDoLimite(`partilha-pos:${id}`, 40, 10 * 60_000)) return res.status(429).json({ erro: 'devagar' });
    try {
      const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
      const atual = ler(id);
      if (!atual) return res.status(404).json({ erro: 'acabou' });
      if (!segredoCerto(corpo?.segredo, atual.segredo)) return res.status(403).json({ erro: 'sem autorização' });
      if (corpo?.parar) {
        base().prepare('DELETE FROM partilhas WHERE id = ?').run(id);
        return res.json({ ok: true, estado: 'terminada' });
      }
      const lat = numero(corpo?.lat, 30, 44), lon = numero(corpo?.lon, -32, -6);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ erro: 'posição inválida' });
      const n = comPosicao(atual.p, lat, lon, numero(corpo?.acc, 0, 5000) || 50);
      gravar(n);
      res.json({ ok: true, estado: n.estado, expira: n.expira });
    } catch {
      res.status(500).json({ erro: 'indisponível' });
    }
  });

  app.get('/api/partilha/:id', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    const id = String(req.params.id || '');
    if (!ID.test(id) || !dentroDoLimite(`partilha-ver:${ipDe(req)}`, 240, 10 * 60_000)) return res.status(404).json({ erro: 'não existe' });
    try {
      const atual = ler(id);
      if (!atual) return res.status(404).json({ erro: 'acabou' });
      res.json(vistaPublica(atual.p));
    } catch {
      res.status(500).json({ erro: 'indisponível' });
    }
  });
}
