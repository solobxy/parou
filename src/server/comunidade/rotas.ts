// Rotas da comunidade: contas, favoritos na conta, ocorrências e reclamações.
import type { Express, Request, Response, NextFunction } from 'express';
import {
  Conta, ErroConta, perfilDaConta, registar, entrar, contaDaSessao, terminarSessao, apagarConta, confirmarPalavra,
  mudarNome, mudarPalavra, criarPedidoRecuperacao, redefinirPalavra, listarFavoritos, guardarFavoritos, apagarFavorito,
  limparSessoesExpiradas, VALIDADE_SESSAO_MS, mudarAvatar, definirOperador, suspenderConta,
} from './contas';
import {
  listarConversas, obterConversa, criarConversa, responder, votar, denunciar, bloquearAutor, listarBloqueados, desbloquear,
  apagarConteudo, filaDeModeracao, moderar,
} from './discussao';
import {
  versaoConteudo, identificarVotante, listarOcorrencias, obterOcorrencia, criarOcorrencia, votarOcorrencia,
  denunciarOcorrencia, mudarEstadoOcorrencia, apagarOcorrencia, importarOcorrenciasPublicas, listarReclamacoes,
  criarReclamacao, votarReclamacao, denunciarReclamacao, mudarEstadoReclamacao, apagarReclamacao, listarComentarios,
  criarComentario,
} from './conteudo';
import { iniciarCopiasDeSeguranca } from './baseDados';
import { emailAtivo, enviarEmail } from './email';

const COOKIE = 'parou_sessao';

// ---------- limites por endereço (travam robôs e tentativas de adivinhar palavras-passe) ----------
const registos = new Map<string, number[]>();
/** true = pode continuar; false = passou do limite. Conta sempre este pedido. */
function dentroDoLimite(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const lista = (registos.get(chave) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  registos.set(chave, lista);
  return lista.length <= max;
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of registos) if (!v.some((t) => agora - t < 24 * 3600_000)) registos.delete(k);
}, 10 * 60_000).unref?.();

function ipDe(req: Request): string {
  const remoto = req.socket.remoteAddress || '';
  const local = remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1';
  return (local ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || remoto;
}

function lerCookie(req: Request, nome: string): string | null {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) { try { return decodeURIComponent(v.join('=')); } catch { return null; } }
  }
  return null;
}

function https(req: Request) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}

function pôrCookie(req: Request, res: Response, token: string) {
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(VALIDADE_SESSAO_MS / 1000)}; Path=/; SameSite=Lax; HttpOnly${https(req) ? '; Secure' : ''}`);
}
function tirarCookie(req: Request, res: Response) {
  res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; HttpOnly${https(req) ? '; Secure' : ''}`);
}

function contaDoPedido(req: Request, res: Response): Conta | null {
  const token = lerCookie(req, COOKIE);
  const s = contaDaSessao(token);
  if (!s) return null;
  if (s.renovar && token) pôrCookie(req, res, token);
  return s.conta;
}

function erro(res: Response, err: unknown) {
  if (err instanceof ErroConta) return res.status(err.estado).json({ erro: err.message, codigo: err.codigo });
  console.error('[Comunidade] Erro:', (err as any)?.message || err);
  return res.status(500).json({ erro: 'Algo correu mal. Tenta outra vez dentro de instantes.', codigo: 'interno' });
}

function semLimite(res: Response) {
  return res.status(429).json({ erro: 'Demasiados pedidos. Espera um pouco e tenta outra vez.', codigo: 'limite' });
}

export function registarRotasComunidade(app: Express, opcoes: { eAdmin: (req: Request) => boolean }) {
  const { eAdmin } = opcoes;
  setInterval(limparSessoesExpiradas, 3600_000).unref?.();
  setTimeout(limparSessoesExpiradas, 30_000);
  iniciarCopiasDeSeguranca();

  // Tudo isto muda sempre: nunca vai para a cache. E quem escreve tem de vir do próprio site.
  app.use(['/api/conta', '/api/comunidade'], (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const origem = req.headers.origin;
      if (origem) {
        let host = '';
        try { host = new URL(String(origem)).host; } catch {}
        const meu = String(req.headers['x-forwarded-host'] || req.headers.host || '');
        const permitido = host === meu || /(^|\.)parou\.pt$/.test(host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /\.sslip\.io$/.test(host);
        if (!permitido) return res.status(403).json({ erro: 'Pedido de origem não permitida.', codigo: 'origem' });
      }
    }
    next();
  });

  // ============================== CONTA ==============================
  app.get('/api/conta/eu', (req, res) => {
    const conta = contaDoPedido(req, res);
    res.json({ utilizador: conta ? perfilDaConta(conta) : null, emailAtivo: emailAtivo() });
  });

  app.post('/api/conta/registar', async (req, res) => {
    try {
      if (!dentroDoLimite(`registo:${ipDe(req)}`, 10, 3600_000)) return semLimite(res);
      const { conta, token } = await registar(req.body?.email, req.body?.palavraPasse, req.body?.nome);
      pôrCookie(req, res, token);
      res.json({ utilizador: perfilDaConta(conta) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/conta/entrar', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!dentroDoLimite(`entrar-ip:${ipDe(req)}`, 40, 10 * 60_000) || !dentroDoLimite(`entrar-email:${email}`, 10, 10 * 60_000)) return semLimite(res);
      const { conta, token } = await entrar(email, req.body?.palavraPasse);
      pôrCookie(req, res, token);
      res.json({ utilizador: perfilDaConta(conta) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/conta/sair', (req, res) => {
    terminarSessao(lerCookie(req, COOKIE));
    tirarCookie(req, res);
    res.json({ ok: true });
  });

  app.put('/api/conta/perfil', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
      if (req.body?.nome !== undefined) mudarNome(conta.id, req.body.nome);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  // Avatar da mascote (as peças têm de existir e a reputação tem de chegar)
  app.put('/api/conta/avatar', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
      if (!dentroDoLimite(`avatar:${conta.id}`, 60, 3600_000)) return semLimite(res);
      res.json({ avatar: mudarAvatar(conta.id, req.body?.avatar) });
    } catch (err) { erro(res, err); }
  });

  app.put('/api/conta/palavra-passe', async (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
      if (!dentroDoLimite(`mudar-palavra:${conta.id}`, 10, 3600_000)) return semLimite(res);
      if (!(await confirmarPalavra(conta.id, req.body?.atual))) throw new ErroConta('credenciais', 'A palavra-passe atual não está certa.', 401);
      await mudarPalavra(conta.id, req.body?.nova, lerCookie(req, COOKIE) || undefined);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  // Apagar a conta (RGPD): pede a palavra-passe para confirmar
  app.delete('/api/conta', async (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
      if (!dentroDoLimite(`apagar:${conta.id}`, 8, 3600_000)) return semLimite(res);
      if (!(await confirmarPalavra(conta.id, req.body?.palavraPasse))) throw new ErroConta('credenciais', 'A palavra-passe não está certa.', 401);
      apagarConta(conta.id);
      tirarCookie(req, res);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/conta/esqueci', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!dentroDoLimite(`esqueci-ip:${ipDe(req)}`, 8, 3600_000) || !dentroDoLimite(`esqueci-email:${email}`, 3, 3600_000)) return semLimite(res);
      if (!emailAtivo()) return res.json({ ok: true, enviado: false, motivo: 'O envio de emails ainda não está ativo.' });
      const pedido = criarPedidoRecuperacao(email);
      if (pedido) {
        const base = (process.env.PUBLIC_URL || 'https://parou.pt').replace(/\/$/, '');
        await enviarEmail(
          pedido.conta.email,
          'Recuperar a palavra-passe da PAROU',
          `Olá ${pedido.conta.nome},\n\nPediste para recuperar a palavra-passe. Abre este link (vale 1 hora):\n${base}/?redefinir=${pedido.token}\n\nSe não foste tu, ignora este email: a tua conta continua segura.\n\nPAROU.PT`,
        );
      }
      // Responde sempre o mesmo, haja conta ou não (não revela quem tem conta)
      res.json({ ok: true, enviado: true });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/conta/redefinir', async (req, res) => {
    try {
      if (!dentroDoLimite(`redefinir:${ipDe(req)}`, 15, 3600_000)) return semLimite(res);
      const { conta, token } = await redefinirPalavra(req.body?.codigo, req.body?.palavraPasse);
      pôrCookie(req, res, token);
      res.json({ utilizador: perfilDaConta(conta) });
    } catch (err) { erro(res, err); }
  });

  // ---------- favoritos guardados na conta ----------
  app.get('/api/conta/favoritos', (req, res) => {
    const conta = contaDoPedido(req, res);
    if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
    res.json({ itens: listarFavoritos(conta.id) });
  });
  app.put('/api/conta/favoritos', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
      if (!dentroDoLimite(`favoritos:${conta.id}`, 120, 60_000)) return semLimite(res);
      res.json({ guardados: guardarFavoritos(conta.id, req.body?.itens) });
    } catch (err) { erro(res, err); }
  });
  app.delete('/api/conta/favoritos/:id', (req, res) => {
    const conta = contaDoPedido(req, res);
    if (!conta) return res.status(401).json({ erro: 'Entra na tua conta.', codigo: 'sem_sessao' });
    apagarFavorito(conta.id, String(req.params.id).slice(0, 200));
    res.json({ ok: true });
  });

  // ============================== OCORRÊNCIAS ==============================
  app.get('/api/comunidade/ocorrencias', (req, res) => {
    try {
      const admin = eAdmin(req);
      const etag = `"o${admin ? 'a' : 'p'}${versaoConteudo()}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      res.json({ ocorrencias: listarOcorrencias(admin) });
    } catch (err) { erro(res, err); }
  });

  app.get('/api/comunidade/ocorrencias/:id', (req, res) => {
    try {
      const o = obterOcorrencia(req.params.id, eAdmin(req));
      if (!o) return res.status(404).json({ erro: 'Ocorrência não encontrada.', codigo: 'nao_existe' });
      res.json({ ocorrencia: o });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/ocorrencias', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      const ip = ipDe(req);
      if (!dentroDoLimite(`nova-ocorrencia:${ip}`, conta ? 8 : 4, 10 * 60_000) || !dentroDoLimite(`nova-ocorrencia-dia:${ip}`, 40, 24 * 3600_000)) return semLimite(res);
      res.status(201).json({ id: criarOcorrencia(req.body, conta) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/ocorrencias/:id/voto', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`voto:${ipDe(req)}`, 60, 60_000)) return semLimite(res);
      res.json(votarOcorrencia(req.params.id, req.body?.acao, identificarVotante(conta, req.body?.votante), conta));
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/ocorrencias/:id/denunciar', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`denuncia:${ipDe(req)}`, 30, 3600_000)) return semLimite(res);
      res.json(denunciarOcorrencia(req.params.id, identificarVotante(conta, req.body?.denunciante)));
    } catch (err) { erro(res, err); }
  });

  app.patch('/api/comunidade/ocorrencias/:id', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      mudarEstadoOcorrencia(req.params.id, req.body?.status, { admin: eAdmin(req), contaId: conta?.id }, !!req.body?.zerarDenuncias);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.delete('/api/comunidade/ocorrencias/:id', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      apagarOcorrencia(req.params.id, { admin: eAdmin(req), contaId: conta?.id });
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  // ============================== RECLAMAÇÕES ==============================
  app.get('/api/comunidade/reclamacoes', (req, res) => {
    try {
      const admin = eAdmin(req);
      const etag = `"r${admin ? 'a' : 'p'}${versaoConteudo()}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      res.json({ reclamacoes: listarReclamacoes(admin) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/reclamacoes', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      const ip = ipDe(req);
      if (!dentroDoLimite(`nova-reclamacao:${ip}`, conta ? 6 : 3, 10 * 60_000) || !dentroDoLimite(`nova-reclamacao-dia:${ip}`, 20, 24 * 3600_000)) return semLimite(res);
      res.status(201).json({ id: criarReclamacao(req.body, conta) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/reclamacoes/:id/voto', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`voto:${ipDe(req)}`, 60, 60_000)) return semLimite(res);
      res.json({ votado: votarReclamacao(req.params.id, identificarVotante(conta, req.body?.votante)) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/reclamacoes/:id/denunciar', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`denuncia:${ipDe(req)}`, 30, 3600_000)) return semLimite(res);
      res.json(denunciarReclamacao(req.params.id, identificarVotante(conta, req.body?.denunciante)));
    } catch (err) { erro(res, err); }
  });

  app.patch('/api/comunidade/reclamacoes/:id', (req, res) => {
    try {
      if (!eAdmin(req)) return res.status(403).json({ erro: 'Só para administração.', codigo: 'proibido' });
      mudarEstadoReclamacao(req.params.id, req.body?.status, !!req.body?.zerarDenuncias);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.delete('/api/comunidade/reclamacoes/:id', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      apagarReclamacao(req.params.id, { admin: eAdmin(req), contaId: conta?.id });
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.get('/api/comunidade/reclamacoes/:id/comentarios', (req, res) => {
    res.json({ comentarios: listarComentarios(req.params.id) });
  });

  app.post('/api/comunidade/reclamacoes/:id/comentarios', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`comentario:${ipDe(req)}`, 10, 10 * 60_000)) return semLimite(res);
      res.status(201).json({ id: criarComentario(req.params.id, req.body?.texto, req.body?.nome, conta) });
    } catch (err) { erro(res, err); }
  });

  // ============================== CONVERSAS (publicações e respostas) ==============================
  app.get('/api/comunidade/conversas', (req, res) => {
    try {
      if (!dentroDoLimite(`ler-conversas:${ipDe(req)}`, 240, 60_000)) return semLimite(res);
      res.json(listarConversas(contaDoPedido(req, res), eAdmin(req), (req.query || {}) as any));
    } catch (err) { erro(res, err); }
  });

  app.get('/api/comunidade/conversas/:id', (req, res) => {
    try {
      if (!dentroDoLimite(`ler-conversas:${ipDe(req)}`, 240, 60_000)) return semLimite(res);
      const c = obterConversa(contaDoPedido(req, res), eAdmin(req), req.params.id);
      if (!c) return res.status(404).json({ erro: 'Publicação não encontrada.', codigo: 'nao_existe' });
      res.json(c);
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/conversas', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`nova-conversa:${ipDe(req)}`, 12, 10 * 60_000)) return semLimite(res);
      res.status(201).json({ id: criarConversa(conta, req.body) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/conversas/:id/respostas', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`nova-resposta:${ipDe(req)}`, 40, 10 * 60_000)) return semLimite(res);
      res.status(201).json({ id: responder(conta, req.params.id, req.body?.paiId, req.body?.texto) });
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/votos', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`voto-conversa:${ipDe(req)}`, 120, 60_000)) return semLimite(res);
      res.json(votar(conta, req.body?.alvoId, req.body?.valor));
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/denuncias', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`denuncia-conversa:${ipDe(req)}`, 30, 3600_000)) return semLimite(res);
      res.json(denunciar(conta, req.body?.alvoId, req.body?.motivo));
    } catch (err) { erro(res, err); }
  });

  app.post('/api/comunidade/bloquear', (req, res) => {
    try {
      const conta = contaDoPedido(req, res);
      if (!dentroDoLimite(`bloquear:${ipDe(req)}`, 60, 3600_000)) return semLimite(res);
      bloquearAutor(conta, req.body?.alvoId);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.get('/api/comunidade/bloqueados', (req, res) => {
    res.json({ itens: listarBloqueados(contaDoPedido(req, res)) });
  });

  app.delete('/api/comunidade/bloqueados/:ref', (req, res) => {
    try {
      desbloquear(contaDoPedido(req, res), req.params.ref);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  app.delete('/api/comunidade/conteudo/:id', (req, res) => {
    try {
      apagarConteudo(contaDoPedido(req, res), eAdmin(req), req.params.id);
      res.json({ ok: true });
    } catch (err) { erro(res, err); }
  });

  // ---------- administração (só com a chave de administração) ----------
  const soAdmin = (req: Request, res: Response): boolean => {
    if (eAdmin(req)) return true;
    res.status(403).json({ erro: 'Só para administração.', codigo: 'proibido' });
    return false;
  };
  app.get('/api/comunidade/admin/fila', (req, res) => {
    if (!soAdmin(req, res)) return;
    try { res.json(filaDeModeracao()); } catch (err) { erro(res, err); }
  });
  app.post('/api/comunidade/admin/moderar', (req, res) => {
    if (!soAdmin(req, res)) return;
    try { moderar(req.body?.alvoId, req.body?.acao); res.json({ ok: true }); } catch (err) { erro(res, err); }
  });
  app.post('/api/comunidade/admin/operador', (req, res) => {
    if (!soAdmin(req, res)) return;
    try { res.json({ ok: definirOperador(req.body?.email, req.body?.operador) }); } catch (err) { erro(res, err); }
  });
  app.post('/api/comunidade/admin/suspender', (req, res) => {
    if (!soAdmin(req, res)) return;
    try { res.json({ ok: suspenderConta(req.body?.email, req.body?.dias) }); } catch (err) { erro(res, err); }
  });
}

export { importarOcorrenciasPublicas };
