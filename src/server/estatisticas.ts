// Contagem anónima de utilizadores da PAROU (só a administração vê os números).
//
// Como funciona, em simples:
//  - Quando a app abre (ou uma página pública do site, como a de uma linha ou paragem), avisa o servidor ("abri"). O servidor dá a cada telemóvel/browser um número
//    aleatório num cookie (parou_visita, 13 meses) e guarda só uma versão cifrada desse número (SHA-256).
//  - Assim, abrir e fechar a app 50 vezes no mesmo dia conta como UMA pessoa nesse dia, e quem volta
//    noutro dia é reconhecido como a mesma pessoa (não como uma pessoa nova).
//  - Não se guarda IP, nem tipo de browser, nem nome, nem email, nem posição. Só: o dia, o número cifrado,
//    se abriu pela app Android / app instalada / site, e o idioma, e se chegou pela app ou por uma página pública.
//  - Não se liga à conta de ninguém e não há terceiros (nada de Google Analytics).
//  - Quem não quiser ser contado desliga na página de Privacidade (cookie parou_sem_contagem).
//
// Os números ficam na comunidade.db (que tem cópias de segurança de 6 em 6 horas).
import type { Express, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import path from 'path';
import { base, emTransacao } from './comunidade/baseDados';
import { dentroDoLimite } from './limites';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const COOKIE_VISITA = 'parou_visita';
const COOKIE_SAIR = 'parou_sem_contagem';
const VALIDADE_S = 400 * 24 * 3600; // o máximo que os browsers aceitam (≈13 meses)
const GUARDAR_VISITANTES_MS = VALIDADE_S * 1000;
const ID_VALIDO = /^[a-f0-9-]{36}$/;
const ORIGENS = new Set(['android', 'instalada', 'site']);
type Entrada = 'app' | 'pagina';
// Robôs, rastreadores, monitores e ferramentas automáticas: não são pessoas. (Os que não executam JavaScript
// nem chegam a avisar; aqui ficam os que executam, ou que fingem ser um browser.)
const ROBOS = new RegExp([
  'bot\\b', 'crawl', 'spider', 'slurp', 'scrape', 'fetch', 'scan', 'headless', 'phantom', 'puppeteer', 'playwright', 'selenium', 'webdriver', 'jsdom',
  'lighthouse', 'pagespeed', 'gtmetrix', 'ptst', 'webpagetest', 'google-inspectiontool', 'googleother', 'mediapartners', 'feedfetcher', 'google-read-aloud', 'google-site-verification',
  'preview', 'facebookexternalhit', 'embedly', 'quora link', 'validator', 'w3c', '^whatsapp/',
  'curl', 'wget', 'python', 'axios', 'go-http', 'java/', 'libwww', 'httpclient', 'http-client', 'okhttp/', 'apache-httpclient', 'postman', 'insomnia', 'scrapy', 'aiohttp', 'httpx',
  'monitor', 'uptime', 'pingdom', 'statuscake', 'site24x7', 'checkly', 'datadog', 'newrelic', 'zabbix', 'nagios', 'siteimprove', 'screaming frog',
  'ahrefs', 'semrush', 'claude-', 'anthropic', 'perplexity', 'chatgpt-user', 'oai-searchbot', 'ia_archiver',
].join('|'), 'i');

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
function colunasDe(b: DatabaseSync, tabela: string): Set<string> {
  return new Set((b.prepare(`PRAGMA table_info(${tabela})`).all() as any[]).map((c) => String(c.name)));
}
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
      CREATE TABLE IF NOT EXISTS leituras_flyer (
        dia TEXT NOT NULL,
        local TEXT NOT NULL,
        n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (dia, local)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS resumo_dia (
        dia TEXT PRIMARY KEY,
        visitantes INTEGER NOT NULL DEFAULT 0,
        novos INTEGER NOT NULL DEFAULT 0,
        aberturas INTEGER NOT NULL DEFAULT 0
      );
    `);
    // Por onde a pessoa chegou: pela app ou por uma página pública do site (linha, paragem, greve…).
    // Antes só se contava a app, por isso quem chegava pelo Google a uma página pública não aparecia.
    if (!colunasDe(b, 'visitantes').has('primeira_entrada')) b.exec("ALTER TABLE visitantes ADD COLUMN primeira_entrada TEXT NOT NULL DEFAULT 'app'");
    if (!colunasDe(b, 'visitas_dia').has('entrada')) b.exec("ALTER TABLE visitas_dia ADD COLUMN entrada TEXT NOT NULL DEFAULT 'app'");
    pronto = true;
  }
  return b;
}

/** Conta uma leitura do código QR do flyer: só o dia e o sítio (nunca a pessoa, o IP ou o aparelho). */
export function registarLeituraFlyer(local: string, agora = Date.now()): void {
  const sitio = /^[a-z0-9-]{1,24}$/.test(local) ? local : 'geral';
  bd().prepare('INSERT INTO leituras_flyer (dia, local, n) VALUES (?, ?, 1) ON CONFLICT(dia, local) DO UPDATE SET n = n + 1').run(diaDe(agora), sitio);
}
function resumoDoFlyer(hoje: string) {
  const b = bd();
  const soma = (desde: string) => Number((b.prepare('SELECT COALESCE(SUM(n), 0) AS c FROM leituras_flyer WHERE dia >= ?').get(desde) as any)?.c || 0);
  const porLocal = Object.fromEntries((b.prepare('SELECT local AS k, SUM(n) AS c FROM leituras_flyer GROUP BY local ORDER BY c DESC LIMIT 20').all() as any[]).map((r) => [r.k, Number(r.c)]));
  return { hoje: soma(hoje), ultimos7Dias: soma(somarDias(hoje, -6)), ultimos30Dias: soma(somarDias(hoje, -29)), total: soma('0000-00-00'), porLocal };
}

const resumirId = (idBruto: string) => crypto.createHash('sha256').update(idBruto).digest('hex').slice(0, 32);
function visitanteExiste(idBruto: string): boolean {
  return Boolean(bd().prepare('SELECT 1 AS x FROM visitantes WHERE id = ?').get(resumirId(idBruto)));
}

/** Regista uma abertura da app ou de uma página pública (uma pessoa por dia, mesmo que abra muitas vezes). */
export function registarVisita(idBruto: string, origem: string, idioma: string, agora = Date.now(), entrada: Entrada = 'app'): void {
  const b = bd();
  const id = resumirId(idBruto);
  const dia = diaDe(agora);
  emTransacao(() => {
    const existente = b.prepare('SELECT 1 AS x FROM visitantes WHERE id = ?').get(id);
    const novo = !existente;
    if (novo) {
      b.prepare('INSERT INTO visitantes (id, primeiro_dia, ultimo_instante, origem, idioma, primeira_entrada) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, dia, agora, origem, idioma, entrada);
    } else {
      // O "último instante" nunca recua (pedidos que chegam fora de ordem)
      b.prepare('UPDATE visitantes SET ultimo_instante = MAX(ultimo_instante, ?), origem = ?, idioma = ? WHERE id = ?').run(agora, origem, idioma, id);
    }
    const r = b.prepare('INSERT OR IGNORE INTO visitas_dia (dia, visitante, aberturas, entrada) VALUES (?, ?, 1, ?)').run(dia, id, entrada);
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

/**
 * Confere que o resumo por dia (o que o painel soma) bate certo com as tabelas de pessoas e de visitas (a fonte).
 * Com `reparar`, corrige o resumo dos dias que não batem. Só olha aos últimos 45 dias (as tabelas antigas são apagadas aos 13 meses).
 */
export function verificarIntegridade(agora = Date.now(), reparar = false) {
  const b = bd();
  const hoje = diaDe(agora);
  const limitePoda = somarDias(diaDe(agora - GUARDAR_VISITANTES_MS), 1);
  const desde = somarDias(hoje, -45) > limitePoda ? somarDias(hoje, -45) : limitePoda;
  const resumo = new Map((b.prepare('SELECT dia, visitantes, novos, aberturas FROM resumo_dia WHERE dia >= ?').all(desde) as any[]).map((r) => [String(r.dia), r]));
  const visitas = new Map((b.prepare('SELECT dia, COUNT(*) AS n, COALESCE(SUM(aberturas), 0) AS a FROM visitas_dia WHERE dia >= ? GROUP BY dia').all(desde) as any[]).map((r) => [String(r.dia), r]));
  const novos = new Map((b.prepare('SELECT primeiro_dia AS dia, COUNT(*) AS n FROM visitantes WHERE primeiro_dia >= ? GROUP BY primeiro_dia').all(desde) as any[]).map((r) => [String(r.dia), r]));
  const dias = Array.from(new Set([...resumo.keys(), ...visitas.keys(), ...novos.keys()])).sort();
  const diferencas: Array<{ dia: string; campo: string; resumo: number; real: number }> = [];
  const aCorrigir: Array<{ dia: string; visitantes: number; novos: number; aberturas: number }> = [];
  for (const dia of dias) {
    const r = resumo.get(dia);
    const real = { visitantes: Number(visitas.get(dia)?.n || 0), novos: Number(novos.get(dia)?.n || 0), aberturas: Number(visitas.get(dia)?.a || 0) };
    let difere = false;
    for (const campo of ['visitantes', 'novos', 'aberturas'] as const) {
      const registado = Number(r?.[campo] || 0);
      if (registado !== real[campo]) { difere = true; diferencas.push({ dia, campo, resumo: registado, real: real[campo] }); }
    }
    if (difere) aCorrigir.push({ dia, ...real });
  }
  let reparado = false;
  if (reparar && aCorrigir.length > 0) {
    emTransacao(() => {
      const gravar = b.prepare(`
        INSERT INTO resumo_dia (dia, visitantes, novos, aberturas) VALUES (?, ?, ?, ?)
        ON CONFLICT (dia) DO UPDATE SET visitantes = excluded.visitantes, novos = excluded.novos, aberturas = excluded.aberturas`);
      for (const x of aCorrigir) gravar.run(x.dia, x.visitantes, x.novos, x.aberturas);
    });
    reparado = true;
    console.warn(`[Estatísticas] Resumo corrigido em ${aCorrigir.length} dia(s): ${aCorrigir.map((x) => x.dia).join(', ')}`);
  }
  return { verificadoEm: new Date(agora).toISOString(), diasVerificados: dias.length, ok: diferencas.length === 0, reparado, diferencas: diferencas.slice(0, 10) };
}

export function resumoEstatisticas(agora = Date.now()) {
  const b = bd();
  const um = (sql: string, ...p: any[]): any => b.prepare(sql).get(...p) || {};
  const todos = (sql: string, ...p: any[]): any[] => b.prepare(sql).all(...p) as any[];
  const hoje = diaDe(agora);
  const ontem = somarDias(hoje, -1);
  const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 1000) / 10 : null);
  const primeiroDia: string | null = um('SELECT MIN(dia) AS d FROM resumo_dia').d || null;

  // Pessoas e novas pessoas entre dois dias (inclusive)
  const janela = (de: string, ate: string) => {
    const dias = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
    const a = um('SELECT COUNT(DISTINCT visitante) AS c, COUNT(*) AS pd, COALESCE(SUM(aberturas), 0) AS ab FROM visitas_dia WHERE dia BETWEEN ? AND ?', de, ate);
    const n = um("SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN primeira_entrada = 'pagina' THEN 1 ELSE 0 END), 0) AS pg FROM visitantes WHERE primeiro_dia BETWEEN ? AND ?", de, ate);
    const pessoas = Number(a.c);
    const novas = Number(n.c);
    return {
      de, ate, dias, pessoas, novas, aberturas: Number(a.ab),
      novasViaPaginas: Number(n.pg),
      mediaPessoasPorDia: Math.round((Number(a.pd) / dias) * 10) / 10,
      // A janela só vale para comparar se a contagem já existia no primeiro dia dela (o 1.º dia de dados é parcial)
      completa: primeiroDia !== null && primeiroDia < de,
      queJaConheciamos: pessoas - novas,
    };
  };
  const periodo = (dias: number) => {
    const j = janela(somarDias(hoje, -(dias - 1)), hoje);
    return { desde: j.de, pessoas: j.pessoas, novas: j.novas, queJaConheciamos: j.queJaConheciamos, aberturas: j.aberturas, novasViaPaginas: j.novasViaPaginas };
  };
  const doDia = (dia: string) => {
    const r = um('SELECT visitantes, novos, aberturas FROM resumo_dia WHERE dia = ?', dia);
    return { dia, pessoas: Number(r.visitantes || 0), novas: Number(r.novos || 0), aberturas: Number(r.aberturas || 0) };
  };

  // Evolução: os N dias completos mais recentes (sem contar hoje, que ainda não acabou) contra os N anteriores
  const variacao = (atual: number, anterior: number) => (anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null);
  const evolucao = (dias: number) => {
    const atual = janela(somarDias(ontem, -(dias - 1)), ontem);
    const anterior = janela(somarDias(ontem, -(2 * dias - 1)), somarDias(ontem, -dias));
    const comparavel = atual.completa && anterior.completa;
    return {
      dias, comparavel, atual, anterior,
      variacaoPessoas: comparavel ? variacao(atual.pessoas, anterior.pessoas) : null,
      variacaoNovas: comparavel ? variacao(atual.novas, anterior.novas) : null,
    };
  };

  const desde30 = somarDias(hoje, -29);
  const serie = new Map(todos('SELECT dia, visitantes, novos, aberturas FROM resumo_dia WHERE dia >= ?', desde30).map((r) => [r.dia, r]));
  const viaPaginas = new Map(todos("SELECT dia, COUNT(*) AS c FROM visitas_dia WHERE dia >= ? AND entrada = 'pagina' GROUP BY dia", desde30).map((r) => [r.dia, Number(r.c)]));
  const ultimos30 = Array.from({ length: 30 }, (_, i) => {
    const dia = somarDias(desde30, i);
    const r = serie.get(dia);
    return { dia, pessoas: Number(r?.visitantes || 0), novas: Number(r?.novos || 0), aberturas: Number(r?.aberturas || 0), viaPaginas: viaPaginas.get(dia) || 0 };
  });

  const sempre = um('SELECT COALESCE(SUM(novos), 0) AS pessoas, COALESCE(SUM(aberturas), 0) AS aberturas, MIN(dia) AS desde FROM resumo_dia');

  // Quem volta: só entram pessoas com tempo suficiente para voltar (senão quem chegou ontem puxava a percentagem para baixo).
  //  - no dia seguinte: 1.ª visita há 2 a 31 dias; voltou exatamente no dia a seguir
  //  - na primeira semana: 1.ª visita há 8 a 37 dias; voltou em algum dos 7 dias a seguir
  const retorno = (idadeMinima: number, idadeMaxima: number, diasParaVoltar: number) => {
    const r = um(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN EXISTS (
               SELECT 1 FROM visitas_dia d
               WHERE d.visitante = v.id AND d.dia > v.primeiro_dia AND d.dia <= date(v.primeiro_dia, '+' || ? || ' day')
             ) THEN 1 ELSE 0 END), 0) AS voltaram
      FROM visitantes v WHERE v.primeiro_dia BETWEEN ? AND ?`,
      diasParaVoltar, somarDias(hoje, -idadeMaxima), somarDias(hoje, -idadeMinima));
    const amostra = Number(r.total);
    const voltaram = Number(r.voltaram);
    return { amostra, voltaram, percentagem: pct(voltaram, amostra) };
  };
  const frequentes = Number(um('SELECT COUNT(*) AS c FROM (SELECT visitante FROM visitas_dia WHERE dia >= ? GROUP BY visitante HAVING COUNT(*) >= 3)', desde30).c);

  const ult30ms = agora - 30 * 24 * 3600_000;
  const por = (coluna: 'origem' | 'idioma') => Object.fromEntries(
    todos(`SELECT ${coluna} AS k, COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ? GROUP BY ${coluna} ORDER BY c DESC`, ult30ms)
      .map((r) => [r.k, Number(r.c)]));

  const p30 = periodo(30);
  const semana = evolucao(7);
  const pessoasPaginas30 = Number(um("SELECT COUNT(DISTINCT visitante) AS c FROM visitas_dia WHERE dia >= ? AND entrada = 'pagina'", desde30).c);
  return {
    geradoEm: new Date(agora).toISOString(),
    fusoHorario: 'Europe/Lisbon',
    ultimas24Horas: Number(um('SELECT COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ?', agora - 24 * 3600_000).c),
    ultimosMinutos30: Number(um('SELECT COUNT(*) AS c FROM visitantes WHERE ultimo_instante >= ?', agora - 30 * 60_000).c),
    hoje: doDia(hoje),
    ontem: doDia(ontem),
    ultimos7Dias: periodo(7),
    ultimos30Dias: p30,
    ultimos365Dias: periodo(365),
    desdeSempre: { pessoas: Number(sempre.pessoas), aberturas: Number(sempre.aberturas), desde: sempre.desde || null },
    evolucao: {
      semana,
      mes: evolucao(30),
      // Quantas pessoas, em média, usam num dia e que parte das do mês isso representa
      usoRegular: { mediaPessoasPorDia7Dias: semana.atual.mediaPessoasPorDia, pessoasDoMes: p30.pessoas, percentagem: pct(semana.atual.mediaPessoasPorDia, p30.pessoas) },
    },
    fidelidade: {
      noDiaSeguinte: retorno(2, 31, 1),
      naPrimeiraSemana: retorno(8, 37, 7),
      pessoasQueUsaramEm3OuMaisDiasNosUltimos30: frequentes,
      percentagemDoMes: pct(frequentes, p30.pessoas),
    },
    flyer: resumoDoFlyer(hoje),
    porOrigemUltimos30Dias: por('origem'),
    porIdiomaUltimos30Dias: por('idioma'),
    // Como chegam as pessoas novas: pela app ou por uma página pública do site (linha, paragem, greve…)
    comoChegamUltimos30Dias: { novasPelaApp: p30.novas - p30.novasViaPaginas, novasPorPaginasPublicas: p30.novasViaPaginas, pessoasQueUsaramPaginasPublicas: pessoasPaginas30 },
    serieDiaria30Dias: ultimos30,
    integridade: verificarIntegridade(agora, false),
    outrosNumeros: {
      contasCriadas: contagemDe('comunidade.db', 'utilizadores'),
      ocorrenciasGuardadas: contagemDe('comunidade.db', 'ocorrencias'),
      reclamacoesGuardadas: contagemDe('comunidade.db', 'reclamacoes'),
      telemoveisComCopiaDeFavoritos: contagemDe('utilizadores.db', 'dados_utilizador'),
      subscricoesDeNotificacoes: contagemDe('push.db', 'subscricoes'),
    },
  };
}

/** Contas registadas e o que fazem na Comunidade (só números; nunca nomes nem emails). */
export function resumoDeContas(agora = Date.now()) {
  const b = bd();
  const um = (sql: string, ...p: any[]): any => b.prepare(sql).get(...p) || {};
  const hoje = diaDe(agora);
  const desde30 = somarDias(hoje, -29);
  const limite30 = agora - 31 * 24 * 3600_000;
  const criadas = new Map<string, number>();
  for (const r of b.prepare('SELECT criado FROM utilizadores WHERE criado >= ?').all(limite30) as any[]) {
    const dia = diaDe(Number(r.criado));
    criadas.set(dia, (criadas.get(dia) || 0) + 1);
  }
  const serie = Array.from({ length: 30 }, (_, i) => { const dia = somarDias(desde30, i); return { dia, novas: criadas.get(dia) || 0 }; });
  const soma = (dias: number) => serie.slice(-dias).reduce((a, x) => a + x.novas, 0);
  const comSessao = (ms: number) => Number(um('SELECT COUNT(DISTINCT utilizador_id) AS c FROM sessoes WHERE renovada >= ? AND expira > ?', agora - ms, agora).c);
  const ms7 = 7 * 24 * 3600_000, ms30 = 30 * 24 * 3600_000;
  const autores = (ms: number) => Number(um(
    `SELECT COUNT(*) AS c FROM (SELECT autor_id FROM publicacoes WHERE criado >= ? AND autor_id IS NOT NULL UNION SELECT autor_id FROM respostas WHERE criado >= ? AND autor_id IS NOT NULL)`,
    agora - ms, agora - ms).c);
  const primeira = um('SELECT MIN(criado) AS m FROM utilizadores').m;
  return {
    total: Number(um('SELECT COUNT(*) AS c FROM utilizadores').c),
    primeiraConta: primeira ? diaDe(Number(primeira)) : null,
    novasHoje: soma(1),
    novasUltimos7Dias: soma(7),
    novasUltimos30Dias: soma(30),
    novasUltimos365Dias: Number(um('SELECT COUNT(*) AS c FROM utilizadores WHERE criado >= ?', agora - 365 * 24 * 3600_000).c),
    comSessaoNasUltimas24Horas: comSessao(24 * 3600_000),
    comSessaoNosUltimos7Dias: comSessao(ms7),
    serieDiaria30Dias: serie,
    comunidade: {
      publicacoes: Number(um("SELECT COUNT(*) AS c FROM publicacoes WHERE estado = 'visivel'").c),
      publicacoesUltimos7Dias: Number(um("SELECT COUNT(*) AS c FROM publicacoes WHERE estado = 'visivel' AND criado >= ?", agora - ms7).c),
      respostas: Number(um("SELECT COUNT(*) AS c FROM respostas WHERE estado = 'visivel'").c),
      respostasUltimos7Dias: Number(um("SELECT COUNT(*) AS c FROM respostas WHERE estado = 'visivel' AND criado >= ?", agora - ms7).c),
      pessoasQueEscreveramNosUltimos30Dias: autores(ms30),
      votos: Number(um('SELECT COUNT(*) AS c FROM votos_comunidade').c),
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
function passaLimites(ip: string, id: string, conhecido: boolean): boolean {
  const agora = Date.now();
  // Muitas pessoas partilham o mesmo IP (redes móveis, universidades, escritórios). Quem já tem o número de
  // visita (cookie) pode vir muitas vezes; o que trava os robôs é o limite, mais baixo, de pessoas NOVAS por IP.
  const lista = (porIp.get(ip) || []).filter((t) => agora - t < 3600_000);
  const novas = lista.length;
  if (!conhecido) { lista.push(agora); porIp.set(ip, lista); }
  if (!conhecido && novas >= 600) return false;
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
  // Todos os dias confere que o resumo bate certo com as pessoas e visitas guardadas (e corrige se não bater)
  const conferir = () => { try { verificarIntegridade(Date.now(), true); } catch (err: any) { console.warn('[Estatísticas] Erro ao conferir:', err?.message || err); } };
  setTimeout(conferir, 90_000).unref?.();
  setInterval(conferir, 24 * 3600_000).unref?.();

  // Código QR do flyer: conta a leitura (só dia e sítio) e leva para a página inicial.
  // /f é o flyer geral; /f/<sítio> serve para separar distribuições (ex.: /f/universidade).
  const aoFlyer = (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const ua = String(req.headers['user-agent'] || '');
      if (ua && !ROBOS.test(ua) && dentroDoLimite(`flyer:${ipDe(req)}`, 20, 3600_000)) registarLeituraFlyer(String(req.params.local || 'geral').toLowerCase());
    } catch (err: any) { console.warn('[Estatísticas] Flyer:', err?.message || err); }
    res.redirect(302, '/');
  };
  app.get('/f', aoFlyer);
  app.get('/f/:local', aoFlyer);

  // A app avisa que foi aberta. Responde sempre 204 e nunca diz se contou ou não.
  app.post('/api/estatisticas/visita', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!origemPermitida(req)) return res.status(204).end();
      if (lerCookie(req, COOKIE_SAIR) === '1') return res.status(204).end();
      const ua = String(req.headers['user-agent'] || '');
      if (!ua || ROBOS.test(ua)) return res.status(204).end();
      // Os browsers dizem de onde vem o pedido; um pedido de outro site (ou de um robô que finge ser browser) não conta
      const sitio = String(req.headers['sec-fetch-site'] || '');
      if (sitio && sitio !== 'same-origin' && sitio !== 'same-site') return res.status(204).end();
      const origem = ORIGENS.has(String(req.body?.o)) ? String(req.body.o) : 'site';
      const pedido = String(req.body?.i);
      const idioma = pedido === 'en' || pedido === 'de' || pedido === 'fr' ? pedido : 'pt';
      const entrada: Entrada = req.body?.e === 'pagina' ? 'pagina' : 'app';
      let id = lerCookie(req, COOKIE_VISITA);
      // "Conhecido" = o número do cookie já existe nas nossas contas (um número inventado não escapa ao limite de pessoas novas)
      const conhecido = Boolean(id && ID_VALIDO.test(id) && visitanteExiste(id));
      if (!id || !ID_VALIDO.test(id)) id = crypto.randomUUID();
      pôrCookie(req, res, COOKIE_VISITA, id, VALIDADE_S);
      if (passaLimites(ipDe(req), id, conhecido)) registarVisita(id, origem, idioma, Date.now(), entrada);
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
