// Contagem anónima de utilizadores da PAROU (só a administração vê os números).
//
// Como funciona, em simples:
//  - Quando a app abre, avisa o servidor ("abri"). O servidor dá a cada telemóvel/browser um número
//    aleatório num cookie (parou_visita, 13 meses) e guarda só uma versão cifrada desse número (SHA-256).
//  - Assim, abrir e fechar a app 50 vezes no mesmo dia conta como UMA pessoa nesse dia, e quem volta
//    noutro dia é reconhecido como a mesma pessoa (não como uma pessoa nova).
//  - Não se guarda IP, nem tipo de browser, nem nome, nem email, nem posição. Só: o dia, o número cifrado,
//    se abriu pela app Android / app instalada / site, e o idioma.
//  - Não se liga à conta de ninguém e não há terceiros (nada de Google Analytics).
//  - Quem não quiser ser contado desliga na página de Privacidade (cookie parou_sem_contagem).
//
// Os números ficam na comunidade.db (que tem cópias de segurança de 6 em 6 horas).
import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import path from 'path';
import { base, emTransacao } from './comunidade/baseDados';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const COOKIE_VISITA = 'parou_visita';
const COOKIE_SAIR = 'parou_sem_contagem';
const VALIDADE_S = 400 * 24 * 3600; // o máximo que os browsers aceitam (≈13 meses)
const GUARDAR_VISITANTES_MS = VALIDADE_S * 1000;
const ID_VALIDO = /^[a-f0-9-]{36}$/;
const ORIGENS = new Set(['android', 'instalada', 'site']);
const ROBOS = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python|node-fetch|axios|go-http|java\/|monitor|uptime/i;

// ---------------------------------------------------------------------------------------------
// Datas (dia civil em Lisboa)
// ---------------------------------------------------------------------------------------------
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
export const diaDe = (ms: number): string => fmtDia.format(ms); // AAAA-MM-DD
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Base de dados
// ---------------------------------------------------------------------------------------------
let pronto = false;
function bd(): DatabaseSync {
  const b = base();
  if (!pronto) {
    b.exec(`
      CREATE TABLE IF NOT EXISTS visitantes (
        id TEXT PRIMARY KEY,
        primeiro_dia TEXT NOT NULL,
        ultimo_instante INTEGER NOT NULL,
        origem TEXT NOT NULL,
        idioma TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_visitantes_primeiro ON visitantes (primeiro_dia);
      CREATE INDEX IF NOT EXISTS idx_visitantes_ultimo ON visitantes (ultimo_instante);
      CREATE TABLE IF NOT EXISTS visitas_dia (
        dia TEXT NOT NULL,
        visitante TEXT NOT NULL,
        aberturas INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (dia, visitante)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS idx_visitas_visitante ON visitas_dia (visitante, dia);
      CREATE TABLE IF NOT EXISTS resumo_dia (
        dia TEXT PRIMARY KEY,
        visitantes INTEGER NOT NULL DEFAULT 0,
        novos INTEGER NOT NULL DEFAULT 0,
        aberturas INTEGER NOT NULL DEFAULT 0
      );
    `);
    pronto = true;
  }
  return b;
}

/** Regista uma abertura da app (uma pessoa por dia, mesmo que abra a app muitas vezes). */
export function registarVisita(idBruto: string, origem: string, idioma: string, agora = Date.now()): void {
  const b = bd();
  const id = crypto.createHash('sha256').update(idBruto).digest('hex').slice(0, 32);
  const dia = diaDe(agora);
  emTransacao(() => {
    const existente = b.prepare('SELECT 1 AS x FROM visitantes WHERE id = ?').get(id);
    const novo = !existente;
    if (novo) {
      b.prepare('INSERT INTO visitantes (id, primeiro_dia, ultimo_instante, origem, idioma) VALUES (?, ?, ?, ?, ?)')
        .run(id, dia, agora, origem, idioma);
    } else {
      b.prepare('UPDATE visitantes SET ultimo_instante = ?, origem = ?, idioma = ? WHERE id = ?').run(agora, origem, idioma, id);
    }
    const r = b.prepare('INSERT OR IGNORE INTO visitas_dia (dia, visitante, aberturas) VALUES (?, ?, 1)').run(dia, id);
    const primeiraDoDia = Number(r.changes) > 0;
    if (!primeiraDoDia) b.prepare('UPDATE visitas_dia SET aberturas = aberturas + 1 WHERE dia = ? AND visitante = ?').run(dia, id);
    b.prepare(`
      INSERT INTO resumo_dia (dia, visitantes, novos, aberturas) VALUES (?, ?, ?, 1)
      ON CONFLICT (dia) DO UPDATE SET visitantes = visitantes + excluded.visitantes, novos = novos + excluded.novos, aberturas = aberturas + 1
    `).run(dia, primeiraDoDia ? 1 : 0, novo ? 1 : 0);
  });
}

/** Apaga os visitantes que não aparecem há mais de 13 meses (os totais por dia ficam). */
function limparAntigos() {
  try {
    const b = bd();
    const limite = Date.now() - GUARDAR_VISITANTES_MS;
    b.prepare('DELETE FROM visitantes WHERE ultimo_instante < ?').run(limite);
    b.prepare('DELETE FROM visitas_dia WHERE dia < ?').run(diaDe(limite));
  } catch (err: any) {
    console.warn('[Estatísticas] Erro ao limpar:', err?.message || err);
  }
}

// ---------------------------------------------------------------------------------------------
// Números para a administração
// ---------------------------------------------------------------------------------------------
function contagemDe(ficheiro: string, tabela: string): number | null {
  let outra: DatabaseSync | null = null;
  try {
    outra = new DatabaseSync(path.join(PASTA, ficheiro), { readOnly: true });
    return Number((outra.prepare(`SELECT COUNT(*) AS c FROM ${tabela}`).get() as any).c);
  } catch {
    return null;
  } finally {
    try { outra?.close(); } catch {}
  }
}

export function resumoEstatisticas(agora = Date.now()) {
  const b = bd();
  const um = (sql: string, ...p: any[]): any => b.prepare(sql).get(...p) || {};
  const todos = (sql: string, ...p: any[]): any[] => b.prepare(sql).all(...p) as any[];
  const hoje = diaDe(agora);
  const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 1000) / 10 : null);

  const periodo = (dias: number) => {
    const desde = somarDias(hoje, -(dias - 1));
    const a = um('SELECT COUNT(DISTINCT visitante) AS c, COALESCE(SUM(aberturas), 0) AS ab FROM visitas_dia WHERE dia >= ?', desde);
    const novos = Number(um('SELECT COUNT(*) AS c FROM visitantes WHERE primeiro_dia >= ?', desde).c);
    const pessoas = Number(a.c);
    return { desde, pessoas, novas: novos, queJaConheciamos: pessoas - novos, aberturas: Number(a.ab) };
  };

  const ontem = somarDias(hoje, -1);
  const doDia = (dia: string) => {
    const r = um('SELECT visitantes, novos, aberturas FROM resumo_dia WHERE dia = ?', dia);
    return { dia, pessoas: Number(r.visitantes || 0), novas: Number(r.novos || 0), aberturas: Number(r.aberturas || 0) };
  };

  const desde30 = somarDias(hoje, -29);
  const serie = new Map(todos('SELECT dia, visitantes, novos, aberturas FROM resumo_dia WHERE dia >= ?', desde30).map((r) => [r.dia, r]));
  const ultimos30 = Array.from({ length: 30 }, (_, i) => {
    const dia = somarDias(desde30, i);
    const r = serie.get(dia);
    return { dia, pessoas: Number(r?.visitantes || 0), novas: Number(r?.novos || 0), aberturas: Number(r?.aberturas || 0) };
  });

  const sempre = um('SELECT COALESCE(SUM(novos), 0) AS pessoas, COALESCE(SUM(aberturas), 0) AS aberturas, MIN(dia) AS desde FROM resumo_dia');

  // Quem apareceu pela primeira vez nos 14 dias anteriores a hoje: quantos voltaram noutro dia?
  const coorte = um(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM visitas_dia d WHERE d.visitante = v.id AND d.dia > v.primeiro_dia) THEN 1 ELSE 0 END), 0) AS voltaram
    FROM visitantes v WHERE v.primeiro_dia >= ? AND v.primeiro_dia < ?`, somarDias(hoje, -14), hoje);
  const frequentes = Number(um('SELECT COUNT(*) AS c FROM (SELECT visitante FROM visitas_dia WHERE dia >= ? GROUP BY visitante HAVING COUNT(*) >= 3)', desde30).c);

  const ult30ms = agora - 30 * 24 * 3600_000;
  const por = (coluna: 'origem' | 'idioma') => Object.fromEntries(
    todos(`SELECT ${coluna} AS k, COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ? GROUP BY ${coluna} ORDER BY c DESC`, ult30ms)
      .map((r) => [r.k, Number(r.c)]));

  const total30 = periodo(30).pessoas;
  return {
    geradoEm: new Date(agora).toISOString(),
    fusoHorario: 'Europe/Lisbon',
    ultimas24Horas: Number(um('SELECT COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ?', agora - 24 * 3600_000).c),
    ultimosMinutos30: Number(um('SELECT COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ?', agora - 30 * 60_000).c),
    hoje: doDia(hoje),
    ontem: doDia(ontem),
    ultimos7Dias: periodo(7),
    ultimos30Dias: periodo(30),
    desdeSempre: { pessoas: Number(sempre.pessoas), aberturas: Number(sempre.aberturas), desde: sempre.desde || null },
    fidelidade: {
      novasNosUltimos14DiasSemHoje: Number(coorte.total),
      voltaramNoutroDia: Number(coorte.voltaram),
      percentagemQueVoltou: pct(Number(coorte.voltaram), Number(coorte.total)),
      pessoasQueUsaramEm3OuMaisDiasNosUltimos30: frequentes,
      percentagemDoMes: pct(frequentes, total30),
    },
    porOrigemUltimos30Dias: por('origem'),
    porIdiomaUltimos30Dias: por('idioma'),
    serieDiaria30Dias: ultimos30,
    outrosNumeros: {
      contasCriadas: contagemDe('comunidade.db', 'utilizadores'),
      ocorrenciasGuardadas: contagemDe('comunidade.db', 'ocorrencias'),
      reclamacoesGuardadas: contagemDe('comunidade.db', 'reclamacoes'),
      telemoveisComCopiaDeFavoritos: contagemDe('utilizadores.db', 'dados_utilizador'),
      subscricoesDeNotificacoes: contagemDe('push.db', 'subscricoes'),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------
function lerCookie(req: Request, nome: string): string | null {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) { try { return decodeURIComponent(v.join('=')); } catch { return null; } }
  }
  return null;
}
function emHttps(req: Request) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}
function pôrCookie(req: Request, res: Response, nome: string, valor: string, segundos: number, httpOnly = true) {
  res.append('Set-Cookie', `${nome}=${encodeURIComponent(valor)}; Max-Age=${segundos}; Path=/; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${emHttps(req) ? '; Secure' : ''}`);
}
function origemPermitida(req: Request): boolean {
  const origem = req.headers.origin;
  if (!origem) return true;
  let host = '';
  try { host = new URL(String(origem)).host; } catch { return false; }
  const meu = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return host === meu || /(^|\.)parou\.pt$/.test(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /\.sslip\.io$/.test(host);
}
function ipDe(req: Request): string {
  const remoto = req.socket.remoteAddress || '';
  const local = remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1';
  return (local ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || remoto;
}

const porIp = new Map<string, number[]>();
const ultimoPorId = new Map<string, number>();
function passaLimites(ip: string, id: string): boolean {
  const agora = Date.now();
  // Muitas pessoas partilham o mesmo IP nas redes móveis: o limite por IP é alto, só trava robôs
  const lista = (porIp.get(ip) || []).filter((t) => agora - t < 3600_000);
  lista.push(agora);
  porIp.set(ip, lista);
  if (lista.length > 600) return false;
  // O mesmo telemóvel não conta duas aberturas com menos de 20 segundos de intervalo
  const ant = ultimoPorId.get(id) || 0;
  ultimoPorId.set(id, agora);
  return agora - ant >= 20_000;
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of porIp) if (!v.some((t) => agora - t < 3600_000)) porIp.delete(k);
  for (const [k, t] of ultimoPorId) if (agora - t > 3600_000) ultimoPorId.delete(k);
}, 10 * 60_000).unref?.();

export function registarRotasEstatisticas(app: Express, opcoes: { eAdmin: (req: Request) => boolean }) {
  const { eAdmin } = opcoes;
  setTimeout(limparAntigos, 60_000);
  setInterval(limparAntigos, 24 * 3600_000).unref?.();

  // A app avisa que foi aberta. Responde sempre 204 e nunca diz se contou ou não.
  app.post('/api/estatisticas/visita', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!origemPermitida(req)) return res.status(204).end();
      if (lerCookie(req, COOKIE_SAIR) === '1') return res.status(204).end();
      const ua = String(req.headers['user-agent'] || '');
      if (!ua || ROBOS.test(ua)) return res.status(204).end();
      const origem = ORIGENS.has(String(req.body?.o)) ? String(req.body.o) : 'site';
      const idioma = String(req.body?.i) === 'en' ? 'en' : 'pt';
      let id = lerCookie(req, COOKIE_VISITA);
      if (!id || !ID_VALIDO.test(id)) id = crypto.randomUUID();
      pôrCookie(req, res, COOKIE_VISITA, id, VALIDADE_S);
      if (passaLimites(ipDe(req), id)) registarVisita(id, origem, idioma);
    } catch (err: any) {
      console.warn('[Estatísticas] Erro ao registar visita:', err?.message || err);
    }
    return res.status(204).end();
  });

  // Página de Privacidade: ver e mudar se esta pessoa quer ser contada
  app.get('/api/estatisticas/estado', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ contar: lerCookie(req, COOKIE_SAIR) !== '1' });
  });
  app.post('/api/estatisticas/preferencia', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!origemPermitida(req)) return res.status(403).json({ erro: 'Pedido de origem não permitida.' });
    const contar = req.body?.contar !== false;
    if (contar) {
      pôrCookie(req, res, COOKIE_SAIR, '', 0); // apaga o cookie de recusa
    } else {
      pôrCookie(req, res, COOKIE_SAIR, '1', VALIDADE_S);
      pôrCookie(req, res, COOKIE_VISITA, '', 0); // e esquece o número aleatório deste telemóvel
    }
    return res.json({ contar });
  });

  // Só para a administração (cabeçalho x-parou-admin)
  app.get('/api/estatisticas/resumo', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!eAdmin(req)) return res.status(403).json({ erro: 'Só para administração.' });
    try {
      return res.json(resumoEstatisticas());
    } catch (err: any) {
      console.error('[Estatísticas] Erro no resumo:', err?.message || err);
      return res.status(500).json({ erro: 'Erro ao calcular as estatísticas.' });
    }
  });
}
