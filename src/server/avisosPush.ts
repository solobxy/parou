// =====================================================================================
// PAROU.PT — Notificações push (Web Push), mesmo com a app fechada.
//
// Sem dependências externas: VAPID (RFC 8292) e cifra aes128gcm (RFC 8291) com node:crypto.
// As chaves VAPID são criadas na primeira vez e ficam em PAROU_DATA_DIR/vapid.json (se se
// perderem, as apps voltam a subscrever sozinhas quando abrem).
//
// O que se envia vem de candidatosPush() (alertasEngine): greves, avisos laranja/vermelhos,
// perturbações graves e incêndios importantes. Cada aviso vai uma só vez a quem escolheu
// esse distrito (sem distritos escolhidos = só o que é nacional). De noite (23h–7h) só o
// que é urgente; o resto espera pela manhã.
// =====================================================================================
import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import { candidatosPush, type CandidatoPush } from './alertasEngine';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const FICH_VAPID = path.join(PASTA, 'vapid.json');
const FICH_DB = path.join(PASTA, 'push.db');
const ASSUNTO = 'mailto:diniscash@gmail.com';
const INTERVALO_MS = 4 * 60_000;
const MAX_POR_DIA = 8;

// Só serviços de push conhecidos (evita usar o servidor para pedir endereços arbitrários)
const SERVICOS_PUSH = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;

const b64u = (b: Buffer) => b.toString('base64url');
const deB64u = (s: string) => Buffer.from(s, 'base64url');

// -------------------------------------------------------------------------------------
// Chaves VAPID
// -------------------------------------------------------------------------------------
let vapid: { publica: string; privada: string } | null = null;
function chavesVapid(): { publica: string; privada: string } {
  if (vapid) return vapid;
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (pub && priv) return (vapid = { publica: pub, privada: priv });
  try {
    const j = JSON.parse(fs.readFileSync(FICH_VAPID, 'utf8'));
    if (j?.publica && j?.privada) return (vapid = { publica: j.publica, privada: j.privada });
  } catch {}
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const p = ecdh.getPrivateKey();
  const privada = Buffer.concat([Buffer.alloc(Math.max(0, 32 - p.length)), p]);
  vapid = { publica: b64u(ecdh.getPublicKey()), privada: b64u(privada) };
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(FICH_VAPID, JSON.stringify(vapid), { mode: 0o600 });
  console.log('[Push] Chaves VAPID novas criadas');
  return vapid;
}

let chavePrivadaObj: crypto.KeyObject | null = null;
function chavePrivada(): crypto.KeyObject {
  if (chavePrivadaObj) return chavePrivadaObj;
  const { publica, privada } = chavesVapid();
  const pub = deB64u(publica);
  chavePrivadaObj = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  return chavePrivadaObj;
}

const jwts = new Map<string, { jwt: string; exp: number }>();
export function cabecalhoVapid(endpoint: string): string {
  const { publica } = chavesVapid();
  const aud = new URL(endpoint).origin;
  const agora = Math.floor(Date.now() / 1000);
  let c = jwts.get(aud);
  if (!c || c.exp - agora < 3600) {
    const exp = agora + 12 * 3600;
    const cab = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const corpo = b64u(Buffer.from(JSON.stringify({ aud, exp, sub: ASSUNTO })));
    const assinatura = crypto.sign('sha256', Buffer.from(`${cab}.${corpo}`), { key: chavePrivada(), dsaEncoding: 'ieee-p1363' });
    c = { jwt: `${cab}.${corpo}.${b64u(assinatura)}`, exp };
    jwts.set(aud, c);
  }
  return `vapid t=${c.jwt}, k=${publica}`;
}

// -------------------------------------------------------------------------------------
// Cifra aes128gcm (RFC 8291)
// -------------------------------------------------------------------------------------
const hmac = (chave: Buffer, dados: Buffer) => crypto.createHmac('sha256', chave).update(dados).digest();

export function cifrarPush(conteudo: Buffer, p256dh: string, auth: string, opcoes?: { salt?: Buffer; ecdh?: crypto.ECDH }): Buffer {
  const uaPub = deB64u(p256dh);
  const segredo = deB64u(auth);
  if (uaPub.length !== 65 || segredo.length < 16) throw new Error('chaves da subscrição inválidas');
  const salt = opcoes?.salt || crypto.randomBytes(16);
  const local = opcoes?.ecdh || crypto.createECDH('prime256v1');
  if (!opcoes?.ecdh) local.generateKeys();
  const asPub = local.getPublicKey();
  const partilhado = local.computeSecret(uaPub);
  const prkChave = hmac(segredo, partilhado);
  const infoChave = Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), uaPub, asPub]);
  const ikm = hmac(prkChave, Buffer.concat([infoChave, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0', 'latin1'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0', 'latin1'), Buffer.from([1])])).subarray(0, 12);
  const cifra = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([cifra.update(Buffer.concat([conteudo, Buffer.from([2])])), cifra.final(), cifra.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, cifrado]);
}

// -------------------------------------------------------------------------------------
// Base de dados
// -------------------------------------------------------------------------------------
let db: DatabaseSync | null = null;
function base(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(PASTA, { recursive: true });
  db = new DatabaseSync(FICH_DB);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS subscricoes (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    distritos TEXT NOT NULL DEFAULT '[]',
    criado INTEGER NOT NULL,
    visto INTEGER NOT NULL,
    falhas INTEGER NOT NULL DEFAULT 0,
    dia TEXT NOT NULL DEFAULT '',
    enviados_dia INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS vistos (id TEXT PRIMARY KEY, quando INTEGER NOT NULL)`);
  return db;
}

interface Subscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
  distritos: string;
  dia: string;
  enviados_dia: number;
  falhas: number;
}

// -------------------------------------------------------------------------------------
// Envio
// -------------------------------------------------------------------------------------
async function enviar(sub: { endpoint: string; p256dh: string; auth: string }, dados: object, urgente = false): Promise<number> {
  const corpo = cifrarPush(Buffer.from(JSON.stringify(dados), 'utf8'), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: cabecalhoVapid(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: urgente ? '21600' : '43200',
      Urgency: urgente ? 'high' : 'normal',
    },
    body: corpo,
    signal: AbortSignal.timeout(15000),
  });
  if (r.status >= 400 && r.status !== 404 && r.status !== 410) {
    const txt = await r.text().catch(() => '');
    console.warn(`[Push] ${new URL(sub.endpoint).host} respondeu ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.status;
}

/** Envia e trata da resposta (apaga subscrições que já não existem). Devolve true se entregou. */
async function enviarA(sub: Subscricao, dados: object, urgente: boolean): Promise<boolean> {
  try {
    const estado = await enviar(sub, dados, urgente);
    if (estado === 404 || estado === 410) {
      base().prepare('DELETE FROM subscricoes WHERE endpoint = ?').run(sub.endpoint);
      return false;
    }
    if (estado >= 200 && estado < 300) {
      base().prepare('UPDATE subscricoes SET falhas = 0 WHERE endpoint = ?').run(sub.endpoint);
      return true;
    }
    throw new Error(`HTTP ${estado}`);
  } catch (err: any) {
    const falhas = (sub.falhas || 0) + 1;
    // Muitas falhas seguidas (ex.: chaves estragadas): desiste desta subscrição
    if (falhas >= 20) base().prepare('DELETE FROM subscricoes WHERE endpoint = ?').run(sub.endpoint);
    else base().prepare('UPDATE subscricoes SET falhas = ? WHERE endpoint = ?').run(falhas, sub.endpoint);
    if (!String(err?.message || '').startsWith('HTTP')) console.warn('[Push] Falhou:', err?.message || err);
    return false;
  }
}

function normalizar(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Regiões autónomas: quem escolhe "Funchal (Madeira)" recebe toda a Madeira, e o mesmo nos Açores
const ILHAS: Record<string, string[]> = {
  madeira: ['madeira', 'funchal', 'porto santo', 'machico', 'camara de lobos', 'santa cruz', 'calheta', 'ponta do sol', 'ribeira brava', 'sao vicente', 'santana', 'porto moniz'],
  acores: ['acores', 'ponta delgada', 'angra do heroismo', 'horta', 'sao miguel', 'terceira', 'faial', 'pico', 'flores', 'graciosa', 'sao jorge', 'santa maria', 'corvo', 'ribeira grande', 'lagoa', 'praia da vitoria', 'velas', 'madalena'],
};

function termosDoDistrito(escolhido: string): string[] {
  const n = normalizar(escolhido);
  const principal = n.replace(/\(.*?\)/g, '').trim();
  const regiao = (n.match(/\((.*?)\)/) || [])[1]?.trim();
  const termos = [principal];
  if (regiao && ILHAS[regiao]) termos.push(...ILHAS[regiao]);
  if (ILHAS[principal]) termos.push(...ILHAS[principal]);
  return termos;
}

function interessa(c: CandidatoPush, distritosSub: string[]): boolean {
  if (c.distritos.length === 0) return true; // nacional
  if (distritosSub.length === 0) return false; // sem distritos: só o que é nacional
  const alvo = c.distritos.map(normalizar);
  return distritosSub.some((d) => termosDoDistrito(d).some((t) => alvo.includes(t)));
}

function horaDeSilencio(): boolean {
  const h = DateTime.now().setZone('Europe/Lisbon').hour;
  return h >= 23 || h < 7;
}

// Para os testes automáticos: permite trocar a fonte dos avisos e correr um ciclo à mão
let fonteCandidatos: () => Promise<CandidatoPush[]> = candidatosPush;
export function _testes() {
  return { definirFonte: (f: () => Promise<CandidatoPush[]>) => { fonteCandidatos = f; }, ciclo, interessa, base };
}

let ultimoCiclo: { quando: string; candidatos: number; novos: string[]; entregues: number; falhas: number } | null = null;
let emCiclo = false;
async function ciclo(): Promise<void> {
  if (emCiclo) return;
  emCiclo = true;
  try {
    const b = base();
    const candidatos = await fonteCandidatos();
    const primeiraVez = (b.prepare('SELECT COUNT(*) AS n FROM vistos').get() as { n: number }).n === 0;
    const agora = Date.now();
    const jaVisto = b.prepare('SELECT quando FROM vistos WHERE id = ?');
    const marcar = b.prepare('INSERT OR REPLACE INTO vistos (id, quando) VALUES (?, ?)');

    // Na primeira vez (servidor novo) só regista o que já há, para não enviar avisos antigos
    if (primeiraVez) {
      for (const c of candidatos) {
        marcar.run(c.id, agora);
        if (c.grupo) marcar.run(`grupo:${c.grupo}`, agora);
      }
      marcar.run('inicio', agora);
      console.log(`[Push] Início: ${candidatos.length} avisos atuais registados (não enviados)`);
      return;
    }

    ultimoCiclo = { quando: new Date().toISOString(), candidatos: candidatos.length, novos: [], entregues: 0, falhas: 0 };
    const silencio = horaDeSilencio();
    const novos: CandidatoPush[] = [];
    const gruposNoCiclo = new Set<string>();
    for (const c of candidatos) {
      if (jaVisto.get(c.id)) continue;
      if (silencio && !c.urgente) continue; // fica para de manhã
      marcar.run(c.id, agora);
      if (c.grupo) {
        const g = jaVisto.get(`grupo:${c.grupo}`) as { quando: number } | undefined;
        if (gruposNoCiclo.has(c.grupo)) continue;
        if (g && agora - g.quando < (c.pausaHoras || 12) * 3600_000) continue;
        marcar.run(`grupo:${c.grupo}`, agora);
        gruposNoCiclo.add(c.grupo);
      }
      novos.push(c);
    }
    if (novos.length === 0) return;

    const subs = b.prepare('SELECT endpoint, p256dh, auth, distritos, dia, enviados_dia, falhas FROM subscricoes').all() as unknown as Subscricao[];
    const hoje = DateTime.now().setZone('Europe/Lisbon').toISODate() || '';
    let entregues = 0;
    let falhas = 0;
    // Envia em pequenos lotes em paralelo
    const tarefas = subs.map((sub) => async () => {
      let distritos: string[] = [];
      try { distritos = JSON.parse(sub.distritos || '[]'); } catch {}
      const meus = novos.filter((c) => interessa(c, distritos));
      if (meus.length === 0) return;
      const jaHoje = sub.dia === hoje ? sub.enviados_dia : 0;
      const urgentes = meus.filter((c) => c.urgente);
      if (jaHoje >= MAX_POR_DIA && urgentes.length === 0) return;
      const lista = jaHoje >= MAX_POR_DIA ? urgentes : meus;
      // Até 2 avisos separados; mais do que isso vai num só resumo
      const mensagens = lista.length <= 2
        ? lista.map((c) => ({ title: c.titulo, body: c.corpo, url: c.url, tag: c.grupo || c.id, urgente: c.urgente }))
        : [{
            title: `${lista.length} novos alertas`,
            body: lista.map((c) => c.titulo).join(' · ').slice(0, 220),
            url: '/alertas',
            tag: 'parou-resumo',
            urgente: lista.some((c) => c.urgente),
          }];
      let n = 0;
      for (const m of mensagens) {
        const { urgente, ...dados } = m;
        if (await enviarA(sub, dados, urgente)) { n++; entregues++; } else { falhas++; break; }
      }
      if (n > 0) b.prepare('UPDATE subscricoes SET dia = ?, enviados_dia = ? WHERE endpoint = ?').run(hoje, jaHoje + n, sub.endpoint);
    });
    for (let i = 0; i < tarefas.length; i += 20) {
      await Promise.all(tarefas.slice(i, i + 20).map((t) => t().catch(() => {})));
    }
    ultimoCiclo = { quando: new Date().toISOString(), candidatos: candidatos.length, novos: novos.map((c) => c.titulo), entregues, falhas };
    console.log(`[Push] ${novos.length} avisos novos (${novos.map((c) => c.titulo).join(' | ').slice(0, 200)}); ${entregues} entregues, ${falhas} falhas, ${subs.length} subscrições`);
  } catch (err: any) {
    console.warn('[Push] Erro no ciclo:', err?.message || err);
  } finally {
    emCiclo = false;
  }
}

function limpeza() {
  try {
    const b = base();
    b.prepare('DELETE FROM vistos WHERE quando < ? AND id != ?').run(Date.now() - 21 * 24 * 3600_000, 'inicio');
    b.prepare('DELETE FROM subscricoes WHERE visto < ?').run(Date.now() - 395 * 24 * 3600_000);
  } catch {}
}

// -------------------------------------------------------------------------------------
// Rotas
// -------------------------------------------------------------------------------------
const pedidosPorIp = new Map<string, { n: number; desde: number }>();
function limitar(req: Request, max: number): boolean {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const agora = Date.now();
  const c = pedidosPorIp.get(ip);
  if (!c || agora - c.desde > 3600_000) {
    pedidosPorIp.set(ip, { n: 1, desde: agora });
    if (pedidosPorIp.size > 5000) pedidosPorIp.clear();
    return false;
  }
  c.n++;
  return c.n > max;
}

function subscricaoValida(s: any): { endpoint: string; p256dh: string; auth: string } | null {
  try {
    const endpoint = String(s?.endpoint || '');
    const p256dh = String(s?.keys?.p256dh || '');
    const auth = String(s?.keys?.auth || '');
    if (endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) return null;
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || !SERVICOS_PUSH.test(u.hostname)) return null;
    if (deB64u(p256dh).length !== 65 || deB64u(auth).length < 16) return null;
    return { endpoint, p256dh, auth };
  } catch {
    return null;
  }
}

export function registarRotasPush(app: Express) {
  try {
    chavesVapid();
  } catch (err: any) {
    console.warn('[Push] Sem chaves VAPID:', err?.message || err);
    return;
  }

  app.get('/api/push/chave', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ chave: chavesVapid().publica });
  });

  app.post('/api/push/subscrever', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (limitar(req, 60)) return res.status(429).json({ erro: 'demasiados pedidos' });
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const sub = subscricaoValida(corpo?.subscricao);
    if (!sub) return res.status(400).json({ erro: 'subscrição inválida' });
    const distritos = (Array.isArray(corpo?.distritos) ? corpo.distritos : [])
      .filter((d: unknown) => typeof d === 'string' && d.length > 0 && d.length <= 60)
      .slice(0, 30);
    try {
      const agora = Date.now();
      base()
        .prepare(
          `INSERT INTO subscricoes (endpoint, p256dh, auth, distritos, criado, visto) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
             distritos = excluded.distritos, visto = excluded.visto, falhas = 0`,
        )
        .run(sub.endpoint, sub.p256dh, sub.auth, JSON.stringify(distritos), agora, agora);
      res.json({ ok: true });
    } catch (err: any) {
      console.warn('[Push] Erro a guardar subscrição:', err?.message || err);
      res.status(500).json({ erro: 'indisponível' });
    }
  });

  app.post('/api/push/cancelar', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const endpoint = String(corpo?.endpoint || '').slice(0, 1000);
    try {
      if (endpoint) base().prepare('DELETE FROM subscricoes WHERE endpoint = ?').run(endpoint);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ erro: 'indisponível' });
    }
  });

  // Estado (para verificar que está a funcionar): nada de pessoal, só contagens e títulos públicos
  app.get('/api/push/estado', async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const n = (base().prepare('SELECT COUNT(*) AS n FROM subscricoes').get() as { n: number }).n;
      const candidatos = await fonteCandidatos();
      res.json({
        subscricoes: n,
        ultimoCiclo,
        candidatosAgora: candidatos.map((c) => ({ titulo: c.titulo, corpo: c.corpo, distritos: c.distritos, urgente: c.urgente })),
      });
    } catch (err: any) {
      res.status(500).json({ erro: err?.message || 'erro' });
    }
  });

  // Notificação de teste (botão "Testar notificação"): só para subscrições guardadas
  app.post('/api/push/teste', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (limitar(req, 20)) return res.status(429).json({ erro: 'demasiados pedidos' });
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const endpoint = String(corpo?.endpoint || '');
    const sub = base().prepare('SELECT endpoint, p256dh, auth, distritos, dia, enviados_dia, falhas FROM subscricoes WHERE endpoint = ?').get(endpoint) as Subscricao | undefined;
    if (!sub) return res.status(404).json({ erro: 'subscrição não encontrada' });
    const ok = await enviarA(sub, {
      title: 'PAROU · notificações ligadas',
      body: 'Vais receber aqui greves, avisos de mau tempo e perturbações graves nos distritos que escolheste.',
      url: '/alertas',
      tag: 'parou-teste',
    }, true);
    res.json({ ok });
  });

  setTimeout(() => void ciclo(), 90_000);
  setInterval(() => void ciclo(), INTERVALO_MS);
  setTimeout(limpeza, 120_000);
  setInterval(limpeza, 24 * 3600_000);
}
