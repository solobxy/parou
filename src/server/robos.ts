// Visitas dos robôs de pesquisa e de IA (Google, Bing, ChatGPT, Perplexity…), por dia.
// Serve para ver se o Google volta a ler o site depois da quebra de 24-25/10/2026 (a app deixou de responder
// enquanto o Google lia as paragens) e para dar por isso logo se um robô começar a receber erros.
// Só contagens: robô, tipo de página, código de resposta e tempo total. Nada sobre pessoas.
// Fica em PAROU_DATA_DIR/robos.json (últimos 40 dias), gravado de 5 em 5 minutos.
import fs from 'node:fs';
import path from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';

const ROBOS: Array<[string, RegExp]> = [
  ['Googlebot', /Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google|AdsBot-Google/i],
  ['Bingbot', /bingbot|BingPreview|msnbot/i],
  ['OAI-SearchBot', /OAI-SearchBot/i],
  ['ChatGPT-User', /ChatGPT-User/i],
  ['GPTBot', /GPTBot/i],
  ['PerplexityBot', /PerplexityBot|Perplexity-User/i],
  ['ClaudeBot', /ClaudeBot|Claude-User|Claude-SearchBot/i],
  ['Applebot', /Applebot/i],
  ['DuckDuckBot', /DuckDuckBot|DuckAssistBot/i],
  ['YandexBot', /YandexBot/i],
];

export function qualRobo(ua: string | undefined): string | null {
  if (!ua) return null;
  for (const [nome, re] of ROBOS) if (re.test(ua)) return nome;
  return null;
}

export function tipoDeCaminho(caminho: string): string {
  const c = caminho.replace(/^\/(en|de|fr)(?=\/|$)/, '') || '/';
  if (/^\/sitemap[^/]*\.xml$/.test(c) || c === '/robots.txt') return 'sitemap';
  if (c.startsWith('/api/')) return 'api';
  if (/^\/linhas\/[^/]+\/[^/]+/.test(c)) return 'linha';
  if (/^\/paragens\/[^/]+\/[^/]+/.test(c)) return 'paragem';
  if (/^\/(linhas|paragens)(\/[^/]+)?$/.test(c)) return 'operador';
  if (/^\/(cidade|cidades|greves|incendios)/.test(c)) return 'informacao';
  if (/\.(js|css|png|svg|ico|woff2?|webmanifest|json|txt)$/.test(c)) return 'ficheiro';
  return 'outra';
}

interface Conta { n: number; ms: number; lentos: number; estados: Record<string, number>; tipos: Record<string, number> }
type Dados = Record<string, Record<string, Conta>>; // dia -> robô -> contagens

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const FICHEIRO = path.join(PASTA, 'robos.json');
const DIAS = 40;
let dados: Dados = {};
let mudou = false;

function hojeLisboa(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function carregarRobos(ficheiro = FICHEIRO) {
  try { dados = JSON.parse(fs.readFileSync(ficheiro, 'utf8')) || {}; } catch { dados = {}; }
}

export function gravarRobos(ficheiro = FICHEIRO) {
  if (!mudou) return;
  const dias = Object.keys(dados).sort();
  for (const d of dias.slice(0, Math.max(0, dias.length - DIAS))) delete dados[d];
  try {
    fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
    fs.writeFileSync(`${ficheiro}.tmp`, JSON.stringify(dados));
    fs.renameSync(`${ficheiro}.tmp`, ficheiro);
    mudou = false;
  } catch (e) { console.warn('[Robôs] Não consegui gravar:', (e as Error).message); }
}

export function registarPedidoRobo(robo: string, caminho: string, estado: number, ms: number, quando = new Date()) {
  const dia = hojeLisboa(quando);
  const porRobo = (dados[dia] ||= {});
  const c = (porRobo[robo] ||= { n: 0, ms: 0, lentos: 0, estados: {}, tipos: {} });
  c.n++;
  c.ms += Math.round(ms);
  if (ms > 2000) c.lentos++;
  c.estados[String(estado)] = (c.estados[String(estado)] || 0) + 1;
  const t = tipoDeCaminho(caminho);
  c.tipos[t] = (c.tipos[t] || 0) + 1;
  mudou = true;
}

export function resumoRobos(): Dados { return dados; }

/** Liga a contagem a todos os pedidos (antes das rotas). Não atrasa nada: só conta quando a resposta acaba. */
export function registarRobos(app: Express) {
  carregarRobos();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const robo = qualRobo(req.headers['user-agent']);
    if (robo) {
      const inicio = performance.now();
      const caminho = req.path;
      res.on('finish', () => { try { registarPedidoRobo(robo, caminho, res.statusCode, performance.now() - inicio); } catch { /* nunca trava um pedido */ } });
      res.on('close', () => { if (!res.writableFinished) { try { registarPedidoRobo(robo, caminho, 499, performance.now() - inicio); } catch { /* idem */ } } });
    }
    next();
  });
  // Sem tratar o SIGTERM (mudaria a forma de a app desligar): num reinício perdem-se no máximo 5 minutos de contagens
  setInterval(() => gravarRobos(), 5 * 60_000).unref?.();
}
