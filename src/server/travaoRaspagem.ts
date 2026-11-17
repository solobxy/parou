// Travão à cópia automática das páginas de paragens e linhas (raspagem).
//
// Porquê: em 17/11/2026 um robô abriu ~1500 páginas de paragens num dia, cada uma a partir de um IP diferente
// (47 páginas em 6 minutos vieram de 47 IPs), em Chrome de computador com o browser em chinês, sempre por
// navegação direta (sem vir de outro site), sem cookies e ~0 s em cada página. Um limite por IP não o apanha;
// o que o denuncia é a "pegada" do pedido. Em 30 dias houve só 2 visitas reais com essa pegada.
//
// Regras (só pedidos GET/HEAD de páginas de paragens e de linhas; o resto do site e a API não passam por aqui):
//  1. Por IP: no máximo 30 páginas por minuto e 300 por hora (ninguém abre tantas paragens à mão; as redes móveis
//     partilham IPs, mas a PAROU tem centenas de visitas por dia, não milhões).
//  2. Pegada do robô (1.ª língua do browser chinês, sem cookie, sem referer e sem vir de outro site):
//     no máximo 4 por hora no TOTAL, venha de que IP vier.
// Nunca são travados: robôs que dizem quem são (Google, Bing, ChatGPT, Exa, Amazon… seguem o robots.txt) e pedidos
// da própria máquina (testes e vigias locais; em produção tudo chega do Caddy com X-Forwarded-For).
// Quem passa do limite recebe 429 com uma página curta: não carrega a app nem as estatísticas.
// Memória: contadores por janela fixa, com um máximo de entradas (sai a mais antiga). Nada é guardado em disco.
import type { Express, NextFunction, Request, Response } from 'express';
import { ipDe } from './limites';
import { registarEvento } from './registoSeguranca';

export const LIMITES = { ipMinuto: 30, ipHora: 300, pegadaHora: 4 };
export const MAX_IPS = 50_000;

export type Regra = 'ip-minuto' | 'ip-hora' | 'pegada';

export interface Pedido {
  metodo: string;
  caminho: string;
  ua: string;
  idioma: string;
  cookie: string;
  referer: string;
  secFetchSite: string;
  ip: string;
}

const PAGINA_FUNDA = /^\/(?:(?:en|de|fr)\/)?(?:paragens|linhas)\/[^/]+\/[^/]+/i;
// Robôs que se identificam (o mesmo critério largo do registo de segurança, mais os nomes sem "bot")
const ROBO_DECLARADO = /bot|crawl|spider|slurp|facebookexternalhit|preview|Google-|GoogleOther|ChatGPT-User|Perplexity|Claude-User|Applebot/i;
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '']);

/** Contador por janela fixa, com limite de entradas (a mais antiga sai primeiro) */
class Contador {
  private readonly m = new Map<string, { ini: number; n: number }>();
  constructor(private readonly janelaMs: number, private readonly maxChaves: number) {}
  /** Conta mais um e devolve quantos vão na janela atual desta chave */
  mais(k: string, agora: number): number {
    let e = this.m.get(k);
    if (!e || agora - e.ini >= this.janelaMs) {
      if (e) this.m.delete(k);
      e = { ini: agora, n: 0 };
      this.m.set(k, e);
      while (this.m.size > this.maxChaves) this.m.delete(this.m.keys().next().value as string);
    }
    return ++e.n;
  }
  limpar(agora: number) { for (const [k, e] of this.m) if (agora - e.ini >= this.janelaMs) this.m.delete(k); }
  get tamanho() { return this.m.size; }
  reiniciar() { this.m.clear(); }
}

const porIpMinuto = new Contador(60_000, MAX_IPS);
const porIpHora = new Contador(3_600_000, MAX_IPS);
const pegada = new Contador(3_600_000, 1);

/** A pegada do robô de 17/11/2026: visitante novo, a abrir a página diretamente, com o browser em chinês */
export function ePegada(p: Pick<Pedido, 'idioma' | 'cookie' | 'referer' | 'secFetchSite'>): boolean {
  const primeira = String(p.idioma || '').split(',')[0].trim();
  if (!/^zh\b/i.test(primeira)) return false;
  if (String(p.cookie || '').trim()) return false;
  if (String(p.referer || '').trim()) return false;
  const site = String(p.secFetchSite || '').trim().toLowerCase();
  return site === '' || site === 'none';
}

/** null = pode seguir; senão, a regra que travou. Conta sempre este pedido. */
export function avaliarPedido(p: Pedido, agora = Date.now()): Regra | null {
  const metodo = String(p.metodo || '').toUpperCase();
  if (metodo !== 'GET' && metodo !== 'HEAD') return null;
  if (!PAGINA_FUNDA.test(String(p.caminho || ''))) return null;
  if (ROBO_DECLARADO.test(String(p.ua || ''))) return null;
  const ip = String(p.ip || '').trim();
  if (LOCAL.has(ip)) return null;
  const nMin = porIpMinuto.mais(ip, agora);
  const nHora = porIpHora.mais(ip, agora);
  if (nMin > LIMITES.ipMinuto) return 'ip-minuto';
  if (nHora > LIMITES.ipHora) return 'ip-hora';
  if (ePegada(p) && pegada.mais('todos', agora) > LIMITES.pegadaHora) return 'pegada';
  return null;
}

const PAGINA_429 = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Demasiados pedidos · PAROU</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#111;line-height:1.5"><h1 style="font-size:1.25rem">Demasiados pedidos seguidos</h1><p>Tenta outra vez daqui a uns minutos.</p><p lang="en" style="color:#555">Too many requests. Please try again in a few minutes.</p><p><a href="/" style="color:#c2410c">Ir para a PAROU</a></p></body></html>`;

const cabecalho = (req: Request, nome: string) => {
  const v = req.headers[nome];
  return Array.isArray(v) ? v.join(',') : String(v || '');
};

/** O passo do servidor (o relógio pode ser trocado nos testes) */
export function criarTravao(relogio: () => number = Date.now) {
  return (req: Request, res: Response, next: NextFunction) => {
    let regra: Regra | null = null;
    try {
      regra = avaliarPedido({
        metodo: req.method,
        caminho: req.path,
        ua: cabecalho(req, 'user-agent'),
        idioma: cabecalho(req, 'accept-language'),
        cookie: cabecalho(req, 'cookie'),
        referer: cabecalho(req, 'referer'),
        secFetchSite: cabecalho(req, 'sec-fetch-site'),
        ip: ipDe(req),
      }, relogio());
    } catch { regra = null; /* o travão nunca parte um pedido */ }
    if (!regra) return next();
    registarEvento('raspagem', 429, req, `raspagem:${regra}`);
    res.statusCode = 429;
    res.setHeader('Retry-After', regra === 'ip-minuto' ? '60' : '900');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PAGINA_429);
  };
}

/** Liga o travão (antes das páginas e dos prefixos de idioma) */
export function registarTravaoRaspagem(app: Express) {
  app.use(criarTravao());
  setInterval(() => { const agora = Date.now(); porIpMinuto.limpar(agora); porIpHora.limpar(agora); }, 10 * 60_000).unref?.();
}

/** Para testes */
export const _teste = {
  reiniciar() { porIpMinuto.reiniciar(); porIpHora.reiniciar(); pegada.reiniciar(); },
  tamanhos() { return { ipMinuto: porIpMinuto.tamanho, ipHora: porIpHora.tamanho, pegada: pegada.tamanho }; },
};
