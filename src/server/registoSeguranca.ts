// Registo de segurança da PAROU: serve para perceber se alguém anda a tentar entrar onde não deve, não para saber
// quem usa a app. Princípios:
//  - Só guarda EVENTOS de proteção (tentativa de aceder à administração sem chave, palavra-passe errada, pedidos
//    travados por excesso, erros internos, ferramentas à procura de ficheiros que não existem). NÃO guarda cada visita.
//  - Nunca guarda: cookies, palavras-passe, chaves, emails, texto dos pedidos, parâmetros do endereço (?x=...),
//    posição, nem o endereço IP em claro.
//  - O IP fica transformado num código curto que MUDA TODOS OS DIAS (HMAC com uma chave aleatória do dia, que é
//    apagada com os registos). Serve para ver "a mesma origem fez 40 tentativas hoje", não para seguir ninguém
//    de um dia para o outro.
//  - Em vez de hora exata guarda-se a hora cheia, e o tipo de cliente em grosso (browser / robô / ferramenta).
//  - Apaga-se sozinho ao fim de 30 dias (o prazo da política de privacidade).
//  - Há um resumo SEM códigos de origem nem rotas (só totais) que o servidor publica para a vigia automática,
//    que avisa o criador quando algo foge ao normal.
import type { Express, Request, Response, NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ipDe, aoExcederLimite } from './limites';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
export const RETENCAO_DIAS = 30;
const MAX_CHAVES_POR_HORA = 4000; // trava inundações: passado isto, as origens novas juntam-se numa só

export type TipoEvento =
  | 'admin_negado' // pedido a uma rota de administração sem nenhuma chave (robôs a passar: ruído normal)
  | 'chave_errada' // pedido à administração COM uma chave, mas errada (alguém a tentar entrar)
  | 'entrada_falhada' // email ou palavra-passe errados ao entrar
  | 'redefinir_falhada' // código de recuperação inválido
  | 'limite' // pedido travado por excesso (429)
  | 'origem_recusada' // pedido de escrita vindo de outro site
  | 'erro_servidor' // erro interno (5xx)
  | 'pedido_grande' // corpo grande demais (413)
  | 'sondagem'; // ferramenta à procura de ficheiros/painéis que não existem aqui

export const TIPOS: TipoEvento[] = ['chave_errada', 'admin_negado', 'entrada_falhada', 'redefinir_falhada', 'limite', 'origem_recusada', 'erro_servidor', 'pedido_grande', 'sondagem'];

const contexto = new AsyncLocalStorage<Request>();

// ---------------------------------------------------------------------------------------------
// Base de dados
// ---------------------------------------------------------------------------------------------
let _bd: DatabaseSync | null = null;
function bd(): DatabaseSync {
  if (_bd) return _bd;
  fs.mkdirSync(PASTA, { recursive: true });
  const b = new DatabaseSync(path.join(PASTA, 'seguranca.db'));
  b.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS contagens (
      hora INTEGER NOT NULL,            -- hora cheia (segundos Unix / 3600)
      tipo TEXT NOT NULL,
      rota TEXT NOT NULL,               -- padrão da rota (nunca o endereço pedido)
      estado INTEGER NOT NULL,
      origem TEXT NOT NULL,             -- código do IP, só válido nesse dia
      cliente TEXT NOT NULL,            -- browser | robo | ferramenta | sem | outro
      n INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (hora, tipo, rota, estado, origem, cliente)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS chaves_dia (dia TEXT PRIMARY KEY, chave BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS avisos (codigo TEXT PRIMARY KEY, instante INTEGER NOT NULL);
  `);
  try { fs.chmodSync(path.join(PASTA, 'seguranca.db'), 0o600); } catch { /* o sistema decide */ }
  _bd = b;
  return b;
}

const horaDe = (ms: number) => Math.floor(ms / 3_600_000);
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
const diaDe = (ms: number) => fmtDia.format(ms);

// ---------------------------------------------------------------------------------------------
// Código de origem (muda todos os dias)
// ---------------------------------------------------------------------------------------------
const chavesEmMemoria = new Map<string, Buffer>();
function chaveDoDia(dia: string): Buffer {
  let k = chavesEmMemoria.get(dia);
  if (k) return k;
  const b = bd();
  const linha = b.prepare('SELECT chave FROM chaves_dia WHERE dia = ?').get(dia) as { chave: Uint8Array } | undefined;
  if (linha) k = Buffer.from(linha.chave);
  else {
    k = crypto.randomBytes(32);
    b.prepare('INSERT OR IGNORE INTO chaves_dia (dia, chave) VALUES (?, ?)').run(dia, k);
  }
  if (chavesEmMemoria.size > 4) chavesEmMemoria.clear();
  chavesEmMemoria.set(dia, k);
  return k;
}

/** IPv4 inteiro; IPv6 só o prefixo /64 (uma casa tem milhões de endereços, o prefixo é o que identifica a ligação) */
function normalizarIp(ip: string): string {
  const limpo = ip.replace(/^::ffff:/i, '').trim();
  if (limpo.includes(':')) return limpo.split(':').slice(0, 4).join(':');
  return limpo;
}
export function codigoDeOrigem(ip: string, instante = Date.now()): string {
  if (!ip) return 'sem-ip';
  return crypto.createHmac('sha256', chaveDoDia(diaDe(instante))).update(normalizarIp(ip)).digest('hex').slice(0, 10);
}

function tipoDeCliente(ua: unknown): string {
  const t = String(ua || '');
  if (!t) return 'sem';
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(t)) return 'robo';
  if (/curl|wget|python|go-http|java\/|okhttp|axios|libwww|scrapy|httpclient|node-fetch|undici|postman|insomnia|masscan|zgrab|nmap|nikto|sqlmap/i.test(t)) return 'ferramenta';
  if (/mozilla|safari|chrome|firefox|edg\//i.test(t)) return 'browser';
  return 'outro';
}

/** Padrão da rota: nunca o endereço pedido (pode ter códigos, nomes ou paragens) */
function padraoDaRota(req: Request): string {
  const r = (req.route && typeof req.route.path === 'string') ? `${req.baseUrl || ''}${req.route.path}` : '';
  if (r) return r.slice(0, 80);
  const segs = String(req.path || '/').split('/').slice(0, 4).map((s) => (/^[a-z-]{1,24}$/i.test(s) ? s.toLowerCase() : s ? ':x' : ''));
  return segs.join('/').slice(0, 80) || '/';
}

// ---------------------------------------------------------------------------------------------
// Escrita (em lote: nunca atrasa um pedido)
// ---------------------------------------------------------------------------------------------
interface Pendente { hora: number; tipo: TipoEvento; rota: string; estado: number; origem: string; cliente: string; n: number }
const fila = new Map<string, Pendente>();
const chavesDaHora = new Map<number, number>();

function juntar(p: Omit<Pendente, 'n'>) {
  const k = `${p.hora}|${p.tipo}|${p.rota}|${p.estado}|${p.origem}|${p.cliente}`;
  const ja = fila.get(k);
  if (ja) { ja.n++; return; }
  const usadas = chavesDaHora.get(p.hora) || 0;
  if (usadas >= MAX_CHAVES_POR_HORA) {
    // inundação: junta tudo numa linha por tipo, para a base não crescer sem fim
    const kk = `${p.hora}|${p.tipo}|*|${p.estado}|muitas|${p.cliente}`;
    const j2 = fila.get(kk);
    if (j2) j2.n++; else fila.set(kk, { ...p, rota: '*', origem: 'muitas', n: 1 });
    return;
  }
  chavesDaHora.set(p.hora, usadas + 1);
  if (chavesDaHora.size > 3) for (const h of chavesDaHora.keys()) if (h < p.hora - 2) chavesDaHora.delete(h);
  fila.set(k, { ...p, n: 1 });
}

export function registarEvento(tipo: TipoEvento, estado: number, req?: Request, rota?: string) {
  try {
    const r = req || contexto.getStore();
    const agora = Date.now();
    juntar({
      hora: horaDe(agora),
      tipo,
      rota: rota || (r ? padraoDaRota(r) : '?'),
      estado,
      origem: r ? codigoDeOrigem(ipDe(r), agora) : 'sem-ip',
      cliente: r ? tipoDeCliente(r.headers['user-agent']) : 'sem',
    });
  } catch { /* o registo nunca pode partir um pedido */ }
}

function descarregar() {
  if (!fila.size) return;
  const lote = Array.from(fila.values());
  fila.clear();
  try {
    const b = bd();
    const ins = b.prepare(`INSERT INTO contagens (hora, tipo, rota, estado, origem, cliente, n) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (hora, tipo, rota, estado, origem, cliente) DO UPDATE SET n = n + excluded.n`);
    b.exec('BEGIN');
    try { for (const p of lote) ins.run(p.hora, p.tipo, p.rota, p.estado, p.origem, p.cliente, p.n); b.exec('COMMIT'); }
    catch (e) { try { b.exec('ROLLBACK'); } catch { /* já fechada */ } throw e; }
  } catch (e: any) { console.warn('[Segurança] não consegui gravar o registo:', e?.message || e); }
}

// ---------------------------------------------------------------------------------------------
// O que conta como "ferramenta à procura de portas abertas"
// ---------------------------------------------------------------------------------------------
const SONDAGENS: Array<[RegExp, string]> = [
  [/(^|\/)\.(env|git|svn|hg|htaccess|htpasswd|aws|ssh|npmrc|docker)/i, 'ficheiro_sensivel'],
  [/\.(bak|old|orig|sql|sqlite|db|zip|tar|gz|7z|rar|swp|ini|log|pem|key)(\/|$)/i, 'ficheiro_sensivel'],
  [/\.(php\d?|asp|aspx|jsp|cgi|pl|cfm)(\/|$)/i, 'script_alheio'],
  [/(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc|phpmyadmin|adminer|cpanel|manager\/html|actuator|jenkins|boaform|autodiscover|cgi-bin|vendor\/phpunit|\/solr\/|\/owa\/|\/ecp\/|geoserver|struts|console\/login)/i, 'painel_alheio'],
  [/(\.\.\/|\.\.%2f|%2e%2e|\/etc\/passwd|\/proc\/self|%00|<script|union\s+select|\$\{jndi)/i, 'injecao'],
];
function categoriaDeSondagem(req: Request): string | null {
  let alvo = String(req.originalUrl || req.url || '');
  try { alvo = decodeURIComponent(alvo); } catch { /* fica como veio */ }
  for (const [re, nome] of SONDAGENS) if (re.test(alvo)) return nome;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Resumos e avisos
// ---------------------------------------------------------------------------------------------
export interface Aviso { nivel: 'alta' | 'media' | 'baixa'; codigo: string; texto: string; n: number; desde: string }

function somasPorTipo(deHora: number, ateHora: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TIPOS) out[t] = 0;
  for (const r of bd().prepare('SELECT tipo, SUM(n) AS n FROM contagens WHERE hora >= ? AND hora <= ? GROUP BY tipo').all(deHora, ateHora) as Array<{ tipo: string; n: number }>) out[r.tipo] = Number(r.n) || 0;
  return out;
}

/** Regras simples e honestas: números altos num curto espaço de tempo. Calibrar com o uso real. */
function regras(agora: number): Array<{ nivel: Aviso['nivel']; codigo: string; texto: string; n: number }> {
  const h = horaDe(agora);
  const j = somasPorTipo(h - 1, h); // hora atual e anterior (até ~2 h)
  const out: Array<{ nivel: Aviso['nivel']; codigo: string; texto: string; n: number }> = [];
  if (j.chave_errada >= 3) out.push({ nivel: 'alta', codigo: 'chave_errada', n: j.chave_errada, texto: `${j.chave_errada} pedidos à administração com uma chave errada nas últimas ~2 horas (alguém a tentar entrar)` });
  if (j.admin_negado >= 100) out.push({ nivel: 'baixa', codigo: 'admin_negado', n: j.admin_negado, texto: `${j.admin_negado} pedidos à administração sem chave nas últimas ~2 horas (varrimento de robôs)` });
  if (j.erro_servidor >= 25) out.push({ nivel: 'alta', codigo: 'erro_servidor', n: j.erro_servidor, texto: `${j.erro_servidor} erros internos nas últimas ~2 horas` });
  const topEntrada = bd().prepare(`SELECT MAX(s) AS m FROM (SELECT SUM(n) AS s FROM contagens WHERE tipo = 'entrada_falhada' AND hora >= ? AND hora <= ? GROUP BY origem)`).get(h - 1, h) as { m: number | null };
  if ((topEntrada?.m || 0) >= 15 || j.entrada_falhada >= 40) out.push({ nivel: 'media', codigo: 'entrada_falhada', n: j.entrada_falhada, texto: `${j.entrada_falhada} entradas falhadas nas últimas ~2 horas (a origem mais ativa fez ${topEntrada?.m || 0})` });
  if (j.limite >= 300) out.push({ nivel: 'media', codigo: 'limite', n: j.limite, texto: `${j.limite} pedidos travados por excesso nas últimas ~2 horas` });
  if (j.origem_recusada >= 20) out.push({ nivel: 'baixa', codigo: 'origem_recusada', n: j.origem_recusada, texto: `${j.origem_recusada} pedidos de escrita vindos de outros sites` });
  if (j.sondagem >= 3000) out.push({ nivel: 'baixa', codigo: 'sondagem', n: j.sondagem, texto: `${j.sondagem} sondagens de ferramentas automáticas nas últimas ~2 horas` });
  return out;
}

/** Cada aviso só é anunciado uma vez de 6 em 6 horas, e fica no resumo 70 minutos (para a vigia horária o apanhar) */
const ANUNCIAR_DE_NOVO_MS = 6 * 3600_000;
const VISIVEL_MS = 70 * 60_000;
function avisosParaPublicar(agora: number): Aviso[] {
  const b = bd();
  for (const r of regras(agora)) {
    const x = b.prepare('SELECT instante FROM avisos WHERE codigo = ?').get(r.codigo) as { instante: number } | undefined;
    if (!x || agora - x.instante > ANUNCIAR_DE_NOVO_MS) b.prepare('INSERT OR REPLACE INTO avisos (codigo, instante) VALUES (?, ?)').run(r.codigo, agora);
  }
  const vistos = b.prepare('SELECT codigo, instante FROM avisos WHERE instante >= ?').all(agora - VISIVEL_MS) as Array<{ codigo: string; instante: number }>;
  const porCodigo = new Map(regras(agora).map((r) => [r.codigo, r]));
  const out: Aviso[] = [];
  for (const v of vistos) {
    const r = porCodigo.get(v.codigo);
    if (r) out.push({ ...r, desde: new Date(v.instante).toISOString() });
  }
  return out;
}

export function resumoPublico(agora = Date.now()) {
  const h = horaDe(agora);
  const dias: Record<string, Record<string, number>> = {};
  for (const r of bd().prepare('SELECT hora, tipo, SUM(n) AS n FROM contagens GROUP BY hora, tipo').all() as Array<{ hora: number; tipo: string; n: number }>) {
    const d = diaDe(r.hora * 3_600_000);
    (dias[d] ||= {})[r.tipo] = (dias[d][r.tipo] || 0) + Number(r.n);
  }
  return {
    atualizado: new Date(agora).toISOString(),
    retencaoDias: RETENCAO_DIAS,
    ultimas24h: somasPorTipo(h - 23, h),
    porDia: Object.fromEntries(Object.entries(dias).sort(([a], [b]) => (a < b ? -1 : 1))),
    avisos: avisosParaPublicar(agora),
  };
}

/** Só para a administração: mais pormenor (rotas e origens mais ativas de hoje), sempre em códigos e padrões */
export function resumoAdmin(agora = Date.now()) {
  const h = horaDe(agora);
  const b = bd();
  const de = h - 23;
  return {
    ...resumoPublico(agora),
    rotasMaisAtivas: b.prepare('SELECT tipo, rota, SUM(n) AS n FROM contagens WHERE hora >= ? AND hora <= ? GROUP BY tipo, rota ORDER BY n DESC LIMIT 15').all(de, h),
    origensMaisAtivasHoje: b.prepare(`SELECT origem, SUM(n) AS n, GROUP_CONCAT(DISTINCT tipo) AS tipos, GROUP_CONCAT(DISTINCT cliente) AS clientes FROM contagens WHERE hora >= ? AND hora <= ? AND origem NOT IN ('muitas','sem-ip') GROUP BY origem ORDER BY n DESC LIMIT 10`).all(de, h),
    porCliente: b.prepare('SELECT cliente, SUM(n) AS n FROM contagens WHERE hora >= ? AND hora <= ? GROUP BY cliente ORDER BY n DESC').all(de, h),
  };
}

function guardarResumo() {
  try {
    descarregar();
    const destino = path.join(PASTA, 'seguranca-resumo.json');
    fs.writeFileSync(`${destino}.tmp`, JSON.stringify(resumoPublico()), { mode: 0o640 });
    fs.renameSync(`${destino}.tmp`, destino);
  } catch (e: any) { console.warn('[Segurança] resumo:', e?.message || e); }
}

export function limparAntigos(agora = Date.now()) {
  try {
    const b = bd();
    const corte = horaDe(agora - RETENCAO_DIAS * 24 * 3_600_000);
    const n = b.prepare('DELETE FROM contagens WHERE hora < ?').run(corte).changes;
    b.prepare('DELETE FROM chaves_dia WHERE dia < ?').run(diaDe(agora - (RETENCAO_DIAS + 1) * 24 * 3_600_000));
    b.prepare('DELETE FROM avisos WHERE instante < ?').run(agora - 2 * 24 * 3_600_000);
    if (Number(n) > 0) { try { b.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* sem pressa */ } }
  } catch (e: any) { console.warn('[Segurança] limpeza:', e?.message || e); }
}

// ---------------------------------------------------------------------------------------------
// Ligação ao servidor
// ---------------------------------------------------------------------------------------------
/** 1.º: logo no início, antes de qualquer rota (precisa de ver todos os pedidos) */
export function registarSeguranca(app: Express) {
  try { bd(); } catch (e: any) { console.warn('[Segurança] registo desligado:', e?.message || e); return; }
  aoExcederLimite((chave) => {
    // só o início da chave ("entrar-ip", "registo", …): o resto pode ter o IP ou o email
    const nome = String(chave).split(':')[0].slice(0, 30);
    registarEvento('limite', 429, undefined, /^[a-z0-9_-]+$/i.test(nome) ? `limite:${nome}` : 'limite:outro');
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    contexto.run(req, () => {
      res.on('finish', () => {
        const s = res.statusCode;
        if (s >= 500) registarEvento('erro_servidor', s, req);
        else if (s === 413) registarEvento('pedido_grande', s, req);
        const sondagem = categoriaDeSondagem(req);
        if (sondagem) registarEvento('sondagem', s, req, sondagem);
      });
      next();
    });
  });
  setInterval(guardarResumo, 5 * 60_000).unref?.();
  setInterval(() => limparAntigos(), 6 * 3600_000).unref?.();
  setTimeout(() => { limparAntigos(); guardarResumo(); }, 20_000).unref?.();
  process.on('exit', () => { try { descarregar(); } catch { /* a sair */ } });
}

/** Para a rota de administração ver os números mais recentes */
export const descarregarRegisto = () => descarregar();

/** Para testes */
export const _teste = { categoriaDeSondagem, tipoDeCliente, normalizarIp, descarregar };
