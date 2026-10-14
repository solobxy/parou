// Política de scripts (CSP): só corre código que veio da própria PAROU ou cujo conteúdo a PAROU escreveu.
// Se alguém conseguisse meter um <script> numa página (por exemplo, através de texto de uma publicação), o browser recusava-o.
//
// Como funciona:
//  - 'self' deixa correr os ficheiros .js da própria PAROU (/assets/…, /sw.js, …).
//  - Os pequenos scripts que as páginas trazem dentro do HTML (tema, idioma, contagem) são autorizados um a um pelo
//    "hash" do seu conteúdo (SHA-256), calculado a cada resposta. Um script novo, que não escrevemos, não tem hash.
//  - Dois modos: "teste" (por defeito: o browser só AVISA em /api/csp-report, não bloqueia nada) e "enforcar" (bloqueia).
//    Muda-se com a variável PAROU_CSP_SCRIPTS=enforcar. Primeiro corre-se em teste uns dias, para ver se algo legítimo falha.
import crypto from 'crypto';
import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { dentroDoLimite, ipDe } from './limites';
import { registarEvento } from './registoSeguranca';

export const MODO_CSP: 'teste' | 'enforcar' = process.env.PAROU_CSP_SCRIPTS === 'enforcar' ? 'enforcar' : 'teste';

/** Scripts dentro do HTML que o browser executa (JSON-LD e outros tipos de dados não contam) */
export function scriptsEmLinha(htmlDoc: string): string[] {
  const out: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(htmlDoc))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const tipo = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (tipo && tipo !== 'text/javascript' && tipo !== 'module' && tipo !== 'application/javascript') continue;
    if (m[2]) out.push(m[2]);
  }
  return out;
}

export function politicaDeScripts(htmlDoc: string): string {
  const hashes = Array.from(new Set(scriptsEmLinha(htmlDoc).map((s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`)));
  return ["script-src 'self'", ...hashes].join(' ');
}

/** Só o essencial do aviso: que regra, e de onde (apenas o servidor, sem caminho nem parâmetros) */
function resumirAviso(corpo: any): string {
  const r = (corpo && (corpo['csp-report'] || corpo)) || {};
  const diretiva = String(r['effective-directive'] || r['violated-directive'] || 'script-src').split(/\s+/)[0].replace(/[^a-z-]/gi, '').slice(0, 20) || 'script-src';
  const bloqueado = String(r['blocked-uri'] || r['blockedURL'] || '');
  let alvo = 'outro';
  if (!bloqueado || bloqueado === 'inline') alvo = 'em-linha';
  else if (bloqueado === 'eval') alvo = 'eval';
  else if (/^(data|blob):/i.test(bloqueado)) alvo = bloqueado.split(':')[0].toLowerCase();
  else {
    try { alvo = new URL(bloqueado).host.toLowerCase().replace(/[^a-z0-9.:-]/g, '').slice(0, 60) || 'outro'; } catch { alvo = 'outro'; }
  }
  return `${diretiva}|${alvo}`;
}

/**
 * Regista a política em todas as respostas HTML e a rota que recebe os avisos do browser.
 * `base` é a política que já vai em todos os pedidos (frame-ancestors, object-src…); em modo "enforcar" junta-se-lhe a dos scripts.
 */
export function registarCspScripts(app: Express, base: string) {
  const lerAviso = express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'], limit: '16kb' });
  app.post('/api/csp-report', (req: Request, res: Response, next: NextFunction) => lerAviso(req, res, (e) => (e ? void res.status(204).end() : next())), (req: Request, res: Response) => {
    try {
      if (dentroDoLimite(`csp:${ipDe(req)}`, 30, 60_000)) {
        const lista = Array.isArray(req.body) ? req.body.slice(0, 3).map((x: any) => x?.body || x) : [req.body];
        for (const x of lista) registarEvento('csp', 204, req, resumirAviso(x));
      }
    } catch { /* um aviso mal formado não é problema */ }
    res.status(204).end();
  });

  app.use((_req: Request, res: Response, next: NextFunction) => {
    const enviar = res.send.bind(res);
    res.send = ((corpo?: any) => {
      try {
        if (typeof corpo === 'string' && /^\s*<!doctype html/i.test(corpo) && !res.headersSent) {
          const scripts = politicaDeScripts(corpo);
          if (MODO_CSP === 'enforcar') res.setHeader('Content-Security-Policy', `${base}; ${scripts}`);
          else res.setHeader('Content-Security-Policy-Report-Only', `${scripts}; report-uri /api/csp-report`);
        }
      } catch { /* sem política nunca é pior do que antes */ }
      return enviar(corpo);
    }) as typeof res.send;
    next();
  });
}
