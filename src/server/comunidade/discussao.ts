// Conversas da comunidade: publicações, respostas em cadeia, votos, denúncias, bloqueios e moderação.
// Regras principais:
//  - ler é público; publicar, responder e votar exigem conta (e a conta não pode estar suspensa);
//  - nunca se mostra o email nem o identificador interno de quem escreveu: só o nome, o avatar e as medalhas;
//  - sem links, emails nem telefones nos textos (spam e dados pessoais);
//  - 3 denúncias de contas diferentes escondem o conteúdo até a administração o rever;
//  - quem apaga a conta fica como "Utilizador PAROU" e o texto mantém-se (como nas ocorrências).
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';
import { Conta, ErroConta, avatarDaLinha, contaPioneira, ganharPontos } from './contas';
import { pareceSpam } from './conteudo';
import { avatarOuPadrao, ConfigAvatar } from '../../utils/avatarCatalogo';

export const TIPOS_CONVERSA = ['queixa', 'pergunta', 'elogio', 'conversa'] as const;
export const MOTIVOS_DENUNCIA = ['spam', 'insulto', 'dados-pessoais', 'falso', 'outro'] as const;
const DENUNCIAS_PARA_ESCONDER = 3;
const TAMANHO_PAGINA = 20;
const PROFUNDIDADE_MAXIMA = 4;
const HORA = 3600_000;
const DIA = 24 * HORA;

const novoId = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
const idValido = (id: unknown): id is string => typeof id === 'string' && /^(pub|res)-[a-z0-9]{1,12}-[a-f0-9]{10}$/.test(id);
const limpar = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const umaLinha = (v: unknown, max: number) => limpar(v, max).replace(/\s+/g, ' ');

// ------------------------------- o que não pode estar nos textos -------------------------------
const LIGACAO = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(com|pt|net|org|eu|io|me|ly|gl|app|info|xyz|ru|cn)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const TELEFONE = /(?:\+?\d{2,3}[\s.-]?)?\b[29]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/;

export function validarTextoPublico(...textos: string[]) {
  for (const t of textos) {
    if (EMAIL.test(t) || TELEFONE.test(t)) throw new ErroConta('dados_pessoais', 'Não publiques dados pessoais (emails ou telefones).');
    if (LIGACAO.test(t)) throw new ErroConta('ligacao', 'Não são permitidas ligações (links) nas publicações.');
  }
  if (pareceSpam(...textos)) throw new ErroConta('spam', 'Conteúdo contém padrões suspeitos.');
}

// ------------------------------- tipos de saída -------------------------------
export interface AutorPublico {
  nome: string;
  avatar: ConfigAvatar;
  pioneiro: boolean;
  pontos: number;
  operador?: string;
  apagada?: boolean; // a conta foi apagada
}

export interface PublicacaoSaida {
  id: string;
  titulo: string;
  texto: string;
  tipo: string;
  operador?: string;
  linha?: string;
  concelho?: string;
  distrito?: string;
  comLocalizacao: boolean;
  distanciaKm?: number;
  criado: number;
  pontos: number;
  respostas: number;
  estado: string;
  meuVoto: number;
  meu: boolean;
  denunciei: boolean;
  autor: AutorPublico;
}

export interface RespostaSaida {
  id: string;
  publicacaoId: string;
  paiId: string | null;
  texto: string;
  oficial?: string;
  criado: number;
  profundidade: number;
  pontos: number;
  estado: string;
  meuVoto: number;
  meu: boolean;
  denunciei: boolean;
  escondida?: boolean; // oculta por denúncias (só o autor e a administração veem o texto)
  apagada?: boolean;
  bloqueada?: boolean; // autor bloqueado por quem vê
  autor: AutorPublico;
}

function autorDe(l: any): AutorPublico {
  if (!l.u_id) return { nome: 'Utilizador PAROU', avatar: avatarOuPadrao(null), pioneiro: false, pontos: 0, apagada: true };
  return {
    nome: String(l.u_nome),
    avatar: avatarDaLinha(l.u_avatar),
    pioneiro: contaPioneira(Number(l.u_criado)),
    pontos: Number(l.u_pontos) || 0,
    ...(l.u_operador ? { operador: String(l.u_operador) } : {}),
  };
}

const COLUNAS_AUTOR = 'u.id AS u_id, u.nome AS u_nome, u.avatar AS u_avatar, u.pontos AS u_pontos, u.criado AS u_criado, u.operador AS u_operador';

function marcar(lista: string[]) { return lista.map(() => '?').join(','); }

function votosDe(viewer: Conta | null, ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  if (!viewer || ids.length === 0) return m;
  for (let i = 0; i < ids.length; i += 200) {
    const parte = ids.slice(i, i + 200);
    const linhas = base().prepare(`SELECT alvo_id, valor FROM votos_comunidade WHERE utilizador_id = ? AND alvo_id IN (${marcar(parte)})`).all(viewer.id, ...parte) as Array<{ alvo_id: string; valor: number }>;
    for (const l of linhas) m.set(l.alvo_id, Number(l.valor));
  }
  return m;
}

function denunciasDe(viewer: Conta | null, ids: string[]): Set<string> {
  const s = new Set<string>();
  if (!viewer || ids.length === 0) return s;
  for (let i = 0; i < ids.length; i += 200) {
    const parte = ids.slice(i, i + 200);
    const linhas = base().prepare(`SELECT alvo_id FROM denuncias_comunidade WHERE utilizador_id = ? AND alvo_id IN (${marcar(parte)})`).all(viewer.id, ...parte) as Array<{ alvo_id: string }>;
    for (const l of linhas) s.add(l.alvo_id);
  }
  return s;
}

function bloqueadosDe(viewer: Conta | null): Set<string> {
  if (!viewer) return new Set();
  const linhas = base().prepare('SELECT bloqueado_id FROM bloqueios WHERE utilizador_id = ?').all(viewer.id) as Array<{ bloqueado_id: string }>;
  return new Set(linhas.map((l) => l.bloqueado_id));
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function paraPublicacao(l: any, viewer: Conta | null, votos: Map<string, number>, denuncias: Set<string>, origem?: { lat: number; lon: number }): PublicacaoSaida {
  const tem = l.lat !== null && l.lat !== undefined && l.lon !== null && l.lon !== undefined;
  return {
    id: l.id,
    titulo: l.estado === 'apagada' ? '' : String(l.titulo),
    texto: l.estado === 'apagada' ? '' : String(l.texto || ''),
    tipo: String(l.tipo),
    ...(l.operador ? { operador: String(l.operador) } : {}),
    ...(l.linha ? { linha: String(l.linha) } : {}),
    ...(l.concelho ? { concelho: String(l.concelho) } : {}),
    ...(l.distrito ? { distrito: String(l.distrito) } : {}),
    comLocalizacao: tem,
    ...(origem && tem ? { distanciaKm: Math.round(distanciaKm(origem.lat, origem.lon, Number(l.lat), Number(l.lon)) * 10) / 10 } : {}),
    criado: Number(l.criado),
    pontos: Number(l.pontos),
    respostas: Number(l.respostas),
    estado: String(l.estado),
    meuVoto: votos.get(l.id) || 0,
    meu: !!viewer && l.autor_id === viewer.id,
    denunciei: denuncias.has(l.id),
    autor: autorDe(l),
  };
}

// ------------------------------- listar -------------------------------
export interface FiltrosLista {
  ordem?: unknown; tipo?: unknown; operador?: unknown; linha?: unknown; concelho?: unknown;
  lat?: unknown; lon?: unknown; raioKm?: unknown; pagina?: unknown; soMinhas?: unknown;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function listarConversas(viewer: Conta | null, admin: boolean, filtros?: FiltrosLista): { itens: PublicacaoSaida[]; proxima: number | null } {
  const f: FiltrosLista = filtros || {};
  const pagina = Math.max(0, Math.min(200, Math.floor(Number(f.pagina) || 0)));
  const ordem = f.ordem === 'em-alta' ? 'em-alta' : 'novas';
  const cond: string[] = [`(p.estado = 'visivel' OR (p.estado = 'oculta' AND (p.autor_id = ? OR ? = 1)))`];
  const par: any[] = [viewer ? viewer.id : '', admin ? 1 : 0];
  if (viewer) { cond.push('(p.autor_id IS NULL OR p.autor_id NOT IN (SELECT bloqueado_id FROM bloqueios WHERE utilizador_id = ?))'); par.push(viewer.id); }
  const tipo = String(f.tipo || '');
  if ((TIPOS_CONVERSA as readonly string[]).includes(tipo)) { cond.push('p.tipo = ?'); par.push(tipo); }
  const operador = umaLinha(f.operador, 60);
  if (operador) { cond.push('p.operador = ? COLLATE NOCASE'); par.push(operador); }
  const linha = umaLinha(f.linha, 20);
  if (linha) { cond.push('p.linha = ? COLLATE NOCASE'); par.push(linha); }
  const concelho = umaLinha(f.concelho, 80);
  if (concelho) { cond.push('p.concelho = ? COLLATE NOCASE'); par.push(concelho); }
  if (f.soMinhas && viewer) { cond.push('p.autor_id = ?'); par.push(viewer.id); }

  const lat = numeroOuNulo(f.lat), lon = numeroOuNulo(f.lon);
  const perto = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const raio = Math.max(1, Math.min(60, numeroOuNulo(f.raioKm) ?? 15));
  if (perto) {
    const dLat = raio / 111, dLon = raio / (111 * Math.max(0.2, Math.cos((lat! * Math.PI) / 180)));
    cond.push('p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?');
    par.push(lat! - dLat, lat! + dLat, lon! - dLon, lon! + dLon);
  }

  const sql = `SELECT p.*, ${COLUNAS_AUTOR} FROM publicacoes p LEFT JOIN utilizadores u ON u.id = p.autor_id WHERE ${cond.join(' AND ')}`;
  let linhas: any[];
  let proxima: number | null = null;
  if (ordem === 'novas' && !perto) {
    linhas = base().prepare(`${sql} ORDER BY p.criado DESC LIMIT ? OFFSET ?`).all(...par, TAMANHO_PAGINA + 1, pagina * TAMANHO_PAGINA) as any[];
    if (linhas.length > TAMANHO_PAGINA) { proxima = pagina + 1; linhas = linhas.slice(0, TAMANHO_PAGINA); }
  } else {
    const desde = Date.now() - (ordem === 'em-alta' ? 7 : 60) * DIA;
    let todas = base().prepare(`${sql} AND p.criado >= ? ORDER BY p.criado DESC LIMIT 400`).all(...par, desde) as any[];
    if (perto) todas = todas.filter((l) => distanciaKm(lat!, lon!, Number(l.lat), Number(l.lon)) <= raio);
    if (ordem === 'em-alta') {
      const agora = Date.now();
      const nota = (l: any) => (Number(l.pontos) + 1 + Math.min(10, Number(l.respostas)) * 0.5) / Math.pow((agora - Number(l.criado)) / HORA + 2, 1.4);
      todas.sort((a, b) => nota(b) - nota(a));
    }
    const inicio = pagina * TAMANHO_PAGINA;
    linhas = todas.slice(inicio, inicio + TAMANHO_PAGINA);
    if (todas.length > inicio + TAMANHO_PAGINA) proxima = pagina + 1;
  }
  const ids = linhas.map((l) => l.id);
  const votos = votosDe(viewer, ids), den = denunciasDe(viewer, ids);
  return { itens: linhas.map((l) => paraPublicacao(l, viewer, votos, den, perto ? { lat: lat!, lon: lon! } : undefined)), proxima };
}

// ------------------------------- uma conversa com respostas -------------------------------
export function obterConversa(viewer: Conta | null, admin: boolean, id: unknown): { publicacao: PublicacaoSaida; respostas: RespostaSaida[] } | null {
  if (!idValido(id) || !id.startsWith('pub-')) return null;
  const l = base().prepare(`SELECT p.*, ${COLUNAS_AUTOR} FROM publicacoes p LEFT JOIN utilizadores u ON u.id = p.autor_id WHERE p.id = ?`).get(id) as any;
  if (!l) return null;
  const meu = !!viewer && l.autor_id === viewer.id;
  if (l.estado === 'oculta' && !meu && !admin) return null;
  const linhas = base().prepare(`SELECT r.*, ${COLUNAS_AUTOR} FROM respostas r LEFT JOIN utilizadores u ON u.id = r.autor_id WHERE r.publicacao_id = ? ORDER BY r.criado ASC LIMIT 500`).all(id) as any[];
  const ids = [id, ...linhas.map((r) => r.id)];
  const votos = votosDe(viewer, ids), den = denunciasDe(viewer, ids), bloq = bloqueadosDe(viewer);
  const respostas: RespostaSaida[] = linhas.map((r) => {
    const meuR = !!viewer && r.autor_id === viewer.id;
    const apagada = r.estado === 'apagada';
    const escondida = r.estado === 'oculta' && !meuR && !admin;
    const bloqueada = !!r.autor_id && bloq.has(r.autor_id);
    const semTexto = apagada || escondida || bloqueada;
    return {
      id: r.id, publicacaoId: r.publicacao_id, paiId: r.pai_id || null,
      texto: semTexto ? '' : String(r.texto),
      ...(r.oficial ? { oficial: String(r.oficial) } : {}),
      criado: Number(r.criado), profundidade: Number(r.profundidade), pontos: Number(r.pontos), estado: String(r.estado),
      meuVoto: votos.get(r.id) || 0, meu: meuR, denunciei: den.has(r.id),
      ...(escondida ? { escondida: true } : {}), ...(apagada ? { apagada: true } : {}), ...(bloqueada ? { bloqueada: true } : {}),
      autor: semTexto ? { nome: '', avatar: avatarOuPadrao(null), pioneiro: false, pontos: 0 } : autorDe(r),
    };
  });
  return { publicacao: paraPublicacao(l, viewer, votos, den), respostas };
}

// ------------------------------- escrever -------------------------------
function verificarConta(viewer: Conta | null): Conta {
  if (!viewer) throw new ErroConta('sem_sessao', 'Entra na tua conta para participar.', 401);
  if (viewer.suspensoAte > Date.now()) throw new ErroConta('suspensa', 'A tua conta está suspensa e não pode participar por agora.', 403);
  return viewer;
}

function contar(tabela: 'publicacoes' | 'respostas', autor: string, desde: number): number {
  return Number((base().prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE autor_id = ? AND criado > ?`).get(autor, desde) as any).n);
}

function coordenada(v: unknown, min: number, max: number): number | null {
  const n = numeroOuNulo(v);
  if (n === null || n < min || n > max) return null;
  return Math.round(n * 100) / 100; // ~1 km: nunca se guarda a posição exata
}

export function criarConversa(viewer: Conta | null, entrada: any): string {
  const conta = verificarConta(viewer);
  const titulo = umaLinha(entrada?.titulo, 120);
  const texto = limpar(entrada?.texto, 2000);
  if (titulo.length < 4) throw new ErroConta('titulo', 'Escreve um título com pelo menos 4 letras.');
  const tipo = (TIPOS_CONVERSA as readonly string[]).includes(String(entrada?.tipo)) ? String(entrada.tipo) : 'conversa';
  validarTextoPublico(titulo, texto);
  const operador = umaLinha(entrada?.operador, 60), linha = umaLinha(entrada?.linha, 20);
  const concelho = umaLinha(entrada?.concelho, 80), distrito = umaLinha(entrada?.distrito, 60);
  validarTextoPublico(operador, linha, concelho, distrito);
  let lat = coordenada(entrada?.lat, 29, 43), lon = coordenada(entrada?.lon, -32, -6);
  if (lat === null || lon === null) { lat = null; lon = null; }

  const agora = Date.now();
  const nova = agora - conta.criado < DIA;
  if (contar('publicacoes', conta.id, agora - HORA) >= 3 || contar('publicacoes', conta.id, agora - DIA) >= (nova ? 3 : 10)) {
    throw new ErroConta('limite', nova ? 'Contas novas podem publicar 3 vezes por dia. Volta amanhã.' : 'Já publicaste bastante hoje. Tenta mais tarde.', 429);
  }
  const igual = base().prepare('SELECT 1 FROM publicacoes WHERE autor_id = ? AND criado > ? AND titulo = ? AND texto = ?').get(conta.id, agora - 6 * HORA, titulo, texto);
  if (igual) throw new ErroConta('repetida', 'Já publicaste isto.', 409);

  const id = novoId('pub');
  emTransacao(() => {
    base().prepare(`INSERT INTO publicacoes (id, autor_id, titulo, texto, tipo, operador, linha, concelho, distrito, lat, lon, criado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, conta.id, titulo, texto, tipo, operador || null, linha || null, concelho || null, distrito || null, lat, lon, agora);
    ganharPontos(conta.id, 'publicar', 3, 9);
  });
  return id;
}

export function responder(viewer: Conta | null, publicacaoId: unknown, paiId: unknown, textoBruto: unknown): string {
  const conta = verificarConta(viewer);
  if (!idValido(publicacaoId) || !publicacaoId.startsWith('pub-')) throw new ErroConta('nao_existe', 'Publicação não encontrada.', 404);
  const texto = limpar(textoBruto, 1000);
  if (!texto) throw new ErroConta('texto', 'Escreve a tua resposta.');
  validarTextoPublico(texto);
  const agora = Date.now();
  const nova = agora - conta.criado < DIA;
  if (contar('respostas', conta.id, agora - HORA) >= 20 || contar('respostas', conta.id, agora - DIA) >= (nova ? 10 : 80)) {
    throw new ErroConta('limite', 'Estás a responder muito depressa. Espera um pouco.', 429);
  }
  const igual = base().prepare('SELECT 1 FROM respostas WHERE autor_id = ? AND criado > ? AND texto = ?').get(conta.id, agora - HORA, texto);
  if (igual) throw new ErroConta('repetida', 'Já escreveste isto.', 409);

  const id = novoId('res');
  emTransacao(() => {
    const p = base().prepare('SELECT estado FROM publicacoes WHERE id = ?').get(publicacaoId) as { estado: string } | undefined;
    if (!p || p.estado !== 'visivel') throw new ErroConta('nao_existe', 'Esta publicação já não aceita respostas.', 404);
    let pai: string | null = null, profundidade = 0;
    if (paiId !== undefined && paiId !== null && paiId !== '') {
      if (!idValido(paiId) || !paiId.startsWith('res-')) throw new ErroConta('nao_existe', 'Resposta não encontrada.', 404);
      const r = base().prepare('SELECT publicacao_id, pai_id, profundidade, estado FROM respostas WHERE id = ?').get(paiId) as any;
      if (!r || r.publicacao_id !== publicacaoId || r.estado !== 'visivel') throw new ErroConta('nao_existe', 'Esta resposta já não aceita respostas.', 404);
      // Em cadeias muito fundas a resposta fica ao lado (no mesmo nível), para a conversa continuar legível
      if (Number(r.profundidade) >= PROFUNDIDADE_MAXIMA) { pai = r.pai_id; profundidade = PROFUNDIDADE_MAXIMA; }
      else { pai = paiId; profundidade = Number(r.profundidade) + 1; }
    }
    base().prepare(`INSERT INTO respostas (id, publicacao_id, pai_id, autor_id, texto, oficial, criado, profundidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, publicacaoId, pai, conta.id, texto, conta.operador || null, agora, profundidade);
    base().prepare('UPDATE publicacoes SET respostas = respostas + 1 WHERE id = ?').run(publicacaoId);
    ganharPontos(conta.id, 'responder', 1, 10);
  });
  return id;
}

// ------------------------------- votos, denúncias, bloqueios -------------------------------
function lerAlvo(id: string): { tabela: 'publicacoes' | 'respostas'; linha: any } | null {
  const tabela = id.startsWith('pub-') ? 'publicacoes' : 'respostas';
  const linha = base().prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
  return linha ? { tabela, linha } : null;
}

export function votar(viewer: Conta | null, alvoId: unknown, valorBruto: unknown): { pontos: number; meuVoto: number } {
  const conta = verificarConta(viewer);
  if (!idValido(alvoId)) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  const valor = Number(valorBruto);
  if (valor !== -1 && valor !== 0 && valor !== 1) throw new ErroConta('voto', 'Voto inválido.');
  return emTransacao(() => {
    const alvo = lerAlvo(alvoId);
    if (!alvo || alvo.linha.estado !== 'visivel') throw new ErroConta('nao_existe', 'Não encontrado.', 404);
    if (alvo.linha.autor_id === conta.id) throw new ErroConta('proprio', 'Não podes votar no que escreveste.', 400);
    const antes = base().prepare('SELECT valor FROM votos_comunidade WHERE alvo_id = ? AND utilizador_id = ?').get(alvoId, conta.id) as { valor: number } | undefined;
    const anterior = antes ? Number(antes.valor) : 0;
    const delta = valor - anterior;
    if (delta !== 0) {
      base().prepare(`INSERT INTO votos_comunidade (alvo_id, utilizador_id, valor, criado) VALUES (?, ?, ?, ?)
        ON CONFLICT(alvo_id, utilizador_id) DO UPDATE SET valor = excluded.valor, criado = excluded.criado`).run(alvoId, conta.id, valor, Date.now());
      base().prepare(`UPDATE ${alvo.tabela} SET pontos = pontos + ? WHERE id = ?`).run(delta, alvoId);
      // O autor ganha 1 ponto só no primeiro voto positivo que recebe daquela pessoa (e com limite diário)
      if (valor === 1 && !antes) ganharPontos(alvo.linha.autor_id, 'voto-recebido', 1, 20);
    }
    const pontos = Number((base().prepare(`SELECT pontos FROM ${alvo.tabela} WHERE id = ?`).get(alvoId) as any).pontos);
    return { pontos, meuVoto: valor };
  });
}

export function denunciar(viewer: Conta | null, alvoId: unknown, motivoBruto: unknown): { estado: string } {
  const conta = verificarConta(viewer);
  if (!idValido(alvoId)) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  const motivo = (MOTIVOS_DENUNCIA as readonly string[]).includes(String(motivoBruto)) ? String(motivoBruto) : 'outro';
  return emTransacao(() => {
    const alvo = lerAlvo(alvoId);
    if (!alvo || alvo.linha.estado === 'apagada') throw new ErroConta('nao_existe', 'Não encontrado.', 404);
    if (alvo.linha.autor_id === conta.id) throw new ErroConta('proprio', 'Não podes denunciar o que escreveste.', 400);
    const ja = base().prepare('SELECT 1 FROM denuncias_comunidade WHERE alvo_id = ? AND utilizador_id = ?').get(alvoId, conta.id);
    if (ja) return { estado: String(alvo.linha.estado) };
    base().prepare('INSERT INTO denuncias_comunidade (alvo_id, utilizador_id, motivo, criado) VALUES (?, ?, ?, ?)').run(alvoId, conta.id, motivo, Date.now());
    const n = Number(alvo.linha.denuncias) + 1;
    let estado = String(alvo.linha.estado);
    if (n >= DENUNCIAS_PARA_ESCONDER && estado === 'visivel' && !Number(alvo.linha.revisto)) estado = 'oculta';
    base().prepare(`UPDATE ${alvo.tabela} SET denuncias = ?, estado = ? WHERE id = ?`).run(n, estado, alvoId);
    return { estado };
  });
}

export function bloquearAutor(viewer: Conta | null, alvoId: unknown): void {
  const conta = verificarConta(viewer);
  if (!idValido(alvoId)) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  const alvo = lerAlvo(alvoId);
  if (!alvo || !alvo.linha.autor_id) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  if (alvo.linha.autor_id === conta.id) throw new ErroConta('proprio', 'Não te podes bloquear a ti.', 400);
  base().prepare('INSERT OR IGNORE INTO bloqueios (utilizador_id, bloqueado_id, criado) VALUES (?, ?, ?)').run(conta.id, alvo.linha.autor_id, Date.now());
}

const refBloqueio = (donoId: string, bloqueadoId: string) => crypto.createHash('sha256').update(`${donoId}|${bloqueadoId}`).digest('hex').slice(0, 16);

export function listarBloqueados(viewer: Conta | null): Array<{ ref: string; nome: string }> {
  if (!viewer) return [];
  const linhas = base().prepare('SELECT b.bloqueado_id AS id, u.nome AS nome FROM bloqueios b JOIN utilizadores u ON u.id = b.bloqueado_id WHERE b.utilizador_id = ? ORDER BY b.criado DESC').all(viewer.id) as Array<{ id: string; nome: string }>;
  return linhas.map((l) => ({ ref: refBloqueio(viewer.id, l.id), nome: String(l.nome) }));
}

export function desbloquear(viewer: Conta | null, ref: unknown): void {
  if (!viewer) throw new ErroConta('sem_sessao', 'Entra na tua conta.', 401);
  const linhas = base().prepare('SELECT bloqueado_id FROM bloqueios WHERE utilizador_id = ?').all(viewer.id) as Array<{ bloqueado_id: string }>;
  for (const l of linhas) {
    if (refBloqueio(viewer.id, l.bloqueado_id) === String(ref)) {
      base().prepare('DELETE FROM bloqueios WHERE utilizador_id = ? AND bloqueado_id = ?').run(viewer.id, l.bloqueado_id);
      return;
    }
  }
}

// ------------------------------- apagar e moderar -------------------------------
/** O autor (ou a administração) apaga: o texto desaparece mas a conversa à volta mantém-se. */
export function apagarConteudo(viewer: Conta | null, admin: boolean, alvoId: unknown): void {
  if (!idValido(alvoId)) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  emTransacao(() => {
    const alvo = lerAlvo(alvoId);
    if (!alvo) return;
    const eAutor = !!viewer && alvo.linha.autor_id === viewer.id;
    if (!eAutor && !admin) throw new ErroConta('proibido', 'Sem permissão.', 403);
    if (alvo.tabela === 'publicacoes') base().prepare(`UPDATE publicacoes SET estado = 'apagada', titulo = '', texto = '' WHERE id = ?`).run(alvoId);
    else base().prepare(`UPDATE respostas SET estado = 'apagada', texto = '' WHERE id = ?`).run(alvoId);
  });
}

export function filaDeModeracao() {
  const publicacoes = base().prepare(`SELECT p.id, p.titulo, p.texto, p.estado, p.denuncias, p.criado, u.email AS email, u.nome AS nome
    FROM publicacoes p LEFT JOIN utilizadores u ON u.id = p.autor_id
    WHERE p.estado <> 'apagada' AND p.revisto = 0 AND (p.estado = 'oculta' OR p.denuncias > 0) ORDER BY p.criado DESC LIMIT 100`).all() as any[];
  const respostas = base().prepare(`SELECT r.id, r.publicacao_id AS publicacaoId, r.texto, r.estado, r.denuncias, r.criado, u.email AS email, u.nome AS nome
    FROM respostas r LEFT JOIN utilizadores u ON u.id = r.autor_id
    WHERE r.estado <> 'apagada' AND r.revisto = 0 AND (r.estado = 'oculta' OR r.denuncias > 0) ORDER BY r.criado DESC LIMIT 100`).all() as any[];
  const motivos = (ids: string[]) => {
    const m = new Map<string, string[]>();
    for (const id of ids) {
      const l = base().prepare('SELECT motivo FROM denuncias_comunidade WHERE alvo_id = ?').all(id) as Array<{ motivo: string }>;
      m.set(id, l.map((x) => x.motivo));
    }
    return m;
  };
  const mp = motivos([...publicacoes.map((x) => x.id), ...respostas.map((x) => x.id)]);
  const juntar = (l: any, tipo: string) => ({ ...l, tipo, motivos: mp.get(l.id) || [] });
  return { itens: [...publicacoes.map((l) => juntar(l, 'publicacao')), ...respostas.map((l) => juntar(l, 'resposta'))] };
}

/** Administração: restaurar (fica marcado como revisto: já não volta a esconder-se por denúncias), esconder ou apagar. */
export function moderar(alvoId: unknown, acao: unknown): void {
  if (!idValido(alvoId)) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  const alvo = lerAlvo(alvoId);
  if (!alvo) throw new ErroConta('nao_existe', 'Não encontrado.', 404);
  const t = alvo.tabela;
  if (acao === 'restaurar') base().prepare(`UPDATE ${t} SET estado = 'visivel', revisto = 1, denuncias = 0 WHERE id = ?`).run(alvoId);
  else if (acao === 'esconder') base().prepare(`UPDATE ${t} SET estado = 'oculta' WHERE id = ?`).run(alvoId);
  else if (acao === 'apagar') apagarConteudo(null, true, alvoId);
  else throw new ErroConta('acao', 'Ação inválida.');
  if (acao === 'restaurar') base().prepare('DELETE FROM denuncias_comunidade WHERE alvo_id = ?').run(alvoId);
}
