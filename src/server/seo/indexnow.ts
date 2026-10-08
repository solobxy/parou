// IndexNow: avisa o Bing (e DuckDuckGo, Yahoo, Ecosia, Yandex…) das páginas da PAROU para as
// indexarem logo. Só começa quando o parou.pt já responde neste servidor (o domínio aponta cá).
// Na primeira vez envia todas as páginas; depois, uma vez por semana, as principais.
import type { Express, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { todosOsEnderecos, PAGINAS_APP } from './paginas';
import { obterIndice } from './indice';

const PASTA = process.env.PAROU_DATA_DIR || '/tmp/parou-dados';
const FICH_CHAVE = path.join(PASTA, 'indexnow-chave.txt');
const FICH_ESTADO = path.join(PASTA, 'indexnow-estado.json');
const HOST = 'parou.pt';

function chave(): string {
  try {
    const k = fs.readFileSync(FICH_CHAVE, 'utf8').trim();
    if (/^[a-f0-9]{32}$/.test(k)) return k;
  } catch {}
  const k = crypto.randomBytes(16).toString('hex');
  try { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(FICH_CHAVE, k); } catch {}
  return k;
}

function lerEstado(): { tudo?: number; principais?: number } {
  try { return JSON.parse(fs.readFileSync(FICH_ESTADO, 'utf8')); } catch { return {}; }
}
function gravarEstado(e: { tudo?: number; principais?: number }) {
  try { fs.writeFileSync(FICH_ESTADO, JSON.stringify(e)); } catch {}
}

async function enviar(k: string, urls: string[]): Promise<boolean> {
  for (let i = 0; i < urls.length; i += 9000) {
    const parte = urls.slice(i, i + 9000).map((u) => `https://${HOST}${u}`);
    try {
      const r = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: k, keyLocation: `https://${HOST}/${k}.txt`, urlList: parte }),
        signal: AbortSignal.timeout(30000),
      });
      console.log(`[IndexNow] ${parte.length} endereços → HTTP ${r.status}`);
      if (r.status >= 400 && r.status !== 429) return false;
    } catch (err: any) {
      console.warn('[IndexNow] Falhou:', err?.message || err);
      return false;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  return true;
}

let dominioAtivo = false;
let aEnviar = false;

async function talvezEnviar(k: string) {
  if (!dominioAtivo || aEnviar || !obterIndice()) return;
  const e = lerEstado();
  const agora = Date.now();
  aEnviar = true;
  try {
    if (!e.tudo) {
      if (await enviar(k, todosOsEnderecos())) { e.tudo = agora; e.principais = agora; gravarEstado(e); }
    } else if (!e.principais || agora - e.principais > 7 * 24 * 3600_000) {
      const ix = obterIndice();
      const principais = [...PAGINAS_APP.map((p) => p.loc), ...(ix?.operadores || []).map((o) => `/linhas/${o.slug}`)];
      if (await enviar(k, principais)) { e.principais = agora; gravarEstado(e); }
    }
  } finally {
    aEnviar = false;
  }
}

export function registarIndexNow(app: Express) {
  const k = chave();
  app.get(`/${k}.txt`, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(k);
  });
  // Quando chegam visitas pelo parou.pt, o domínio já aponta para aqui
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!dominioAtivo && String(req.headers.host || '').toLowerCase() === HOST) {
      dominioAtivo = true;
      setTimeout(() => void talvezEnviar(k), 5 * 60_000);
    }
    next();
  });
  setInterval(() => void talvezEnviar(k), 6 * 3600_000);
}
