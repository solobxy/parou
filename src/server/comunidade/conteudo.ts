// Ocorrências da comunidade (e das fontes públicas) e reclamações/opiniões, no servidor.
// Tudo o que antes o telemóvel escrevia diretamente na base da Google passa a ser validado aqui:
// quem escreve não pode fazer-se passar por outra pessoa, nem inventar votos de outra conta.
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';
import { Conta, ErroConta, darPontos } from './contas';
import { calculateConfidence } from '../../utils/confidenceUtils';

const TIPOS = ['ACIDENTE', 'ATRASOS', 'AVARIA', 'GREVE', 'OBRAS', 'CORTE', 'SERVICO_PUBLICO'];
const GRAVIDADES = ['Grave', 'Moderada', 'Informação'];
const ESTADOS_OCORRENCIA = ['Ativa', 'Em resolução', 'Resolvida', 'Em análise', 'Ocultada'];
const ESTADOS_RECLAMACAO = ['Pública', 'Respondida', 'Em análise', 'Ocultada'];
const JANELA_OCORRENCIAS_MS = 30 * 24 * 3600_000;
const MAX_LISTA = 400;

// Número que muda a cada gravação: o telemóvel só descarrega a lista se tiver mudado (ETag)
let versao = Date.now();
export const versaoConteudo = () => versao;
const mudou = () => { versao = Math.max(versao + 1, Date.now()); };

const novoId = (prefixo: string) => `${prefixo}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const txt = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const idValido = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_\-]{1,128}$/.test(id);

const SPAM = [/casino/i, /cripto/i, /crypto/i, /bitcoin/i, /telegram\s*@/i, /whatsapp\s*\+?[0-9]{8,}/i, /bit\.ly/i, /t\.me\//i, /viagra/i, /bet365/i, /(.)\1{7,}/];
export const pareceSpam = (...textos: string[]) => SPAM.some((re) => textos.some((t) => re.test(t)));

/** Quem vota: a conta (se houver sessão) ou o identificador anónimo do telemóvel. */
export function identificarVotante(conta: Conta | null, votanteAnonimo: unknown): string {
  if (conta) return conta.id;
  const v = String(votanteAnonimo || '');
  if (/^[A-Za-z0-9_\-]{6,80}$/.test(v)) return v;
  throw new ErroConta('votante', 'Não foi possível identificar o dispositivo.', 400);
}

// ======================================================================================
// OCORRÊNCIAS
// ======================================================================================
function paraOcorrencia(id: string, d: any) {
  const confirmacoes = typeof d.confirmationsCount === 'number' ? d.confirmationsCount : (d.upvotes || 0);
  const naoConfirmadas = typeof d.unconfirmedCount === 'number' ? d.unconfirmedCount : 0;
  const avaliacao = calculateConfidence({
    confirmationsCount: confirmacoes,
    unconfirmedCount: naoConfirmadas,
    isCommunityVerified: !!d.isCommunityVerified || confirmacoes >= 3,
    sourceName: d.sourceName,
    companyOrService: d.companyOrService,
    status: d.status,
    reportsCount: d.reportsCount,
    updatedAt: d.updatedAt || d.sourceFetchedAt || d.timestamp,
  });
  return {
    id,
    title: d.title || '',
    description: d.description || '',
    type: d.type || 'AVARIA',
    severity: d.severity || 'Moderada',
    district: d.district || 'Lisboa',
    concelho: d.concelho || d.district || '',
    locationDetails: d.locationDetails || '',
    companyOrService: d.companyOrService || '',
    reportedAt: d.reportedAt || 'agora mesmo',
    timestamp: d.timestamp || Date.now(),
    updatedAt: d.updatedAt || d.sourceFetchedAt || d.timestamp || Date.now(),
    commentsCount: typeof d.commentsCount === 'number' ? d.commentsCount : 0,
    imagesCount: typeof d.imagesCount === 'number' ? d.imagesCount : 0,
    status: d.status || 'Ativa',
    verificationStatus: d.verificationStatus || avaliacao.status,
    confidenceScore: typeof d.confidenceScore === 'number' ? d.confidenceScore : avaliacao.score,
    confidenceLevel: d.confidenceLevel || avaliacao.level,
    upvotes: confirmacoes,
    confirmationsCount: confirmacoes,
    unconfirmedCount: naoConfirmadas,
    confirmedBy: Array.isArray(d.confirmedBy) ? d.confirmedBy : [],
    unconfirmedBy: Array.isArray(d.unconfirmedBy) ? d.unconfirmedBy : [],
    reportsCount: typeof d.reportsCount === 'number' ? d.reportsCount : 0,
    isCommunityVerified: !!d.isCommunityVerified || confirmacoes >= 3,
    isBreaking: !!d.isBreaking,
    imageUrl: d.imageUrl || undefined,
    authorId: d.authorId || undefined,
    authorName: d.authorName || undefined,
    sourceName: d.sourceName || undefined,
    sourceType: d.sourceType || undefined,
    sourceUrl: d.sourceUrl || undefined,
    sourceFetchedAt: typeof d.sourceFetchedAt === 'number' ? d.sourceFetchedAt : undefined,
    externalId: d.externalId || undefined,
  };
}

function lerOcorrencia(id: string): { d: any; autor: string | null } | null {
  const l = base().prepare('SELECT dados, autor_id FROM ocorrencias WHERE id = ?').get(id) as { dados: string; autor_id: string | null } | undefined;
  if (!l) return null;
  try { return { d: JSON.parse(l.dados), autor: l.autor_id }; } catch { return null; }
}

function gravarOcorrencia(id: string, d: any) {
  base().prepare('UPDATE ocorrencias SET dados = ?, momento = ? WHERE id = ?').run(JSON.stringify(d), Number(d.timestamp) || Date.now(), id);
  mudou();
}

export function listarOcorrencias(comOcultas: boolean) {
  const desde = Date.now() - JANELA_OCORRENCIAS_MS;
  const linhas = base().prepare('SELECT id, dados FROM ocorrencias WHERE momento >= ? ORDER BY momento DESC LIMIT ?').all(desde, MAX_LISTA) as Array<{ id: string; dados: string }>;
  const out: any[] = [];
  for (const l of linhas) {
    try {
      const o = paraOcorrencia(l.id, JSON.parse(l.dados));
      if (!comOcultas && o.status === 'Ocultada') continue;
      out.push(o);
    } catch {}
  }
  return out;
}

export function obterOcorrencia(id: string, comOcultas: boolean) {
  if (!idValido(id)) return null;
  const o = lerOcorrencia(id);
  if (!o) return null;
  const r = paraOcorrencia(id, o.d);
  return !comOcultas && r.status === 'Ocultada' ? null : r;
}

export function criarOcorrencia(entrada: any, autor: Conta | null): string {
  const titulo = txt(entrada?.title, 200);
  const distrito = txt(entrada?.district, 100);
  const tipo = String(entrada?.type || '');
  const gravidade = String(entrada?.severity || '');
  if (!titulo) throw new ErroConta('titulo', 'Falta o título da ocorrência.');
  if (!distrito) throw new ErroConta('distrito', 'Falta o distrito.');
  if (!TIPOS.includes(tipo)) throw new ErroConta('tipo', 'Tipo de ocorrência inválido.');
  if (!GRAVIDADES.includes(gravidade)) throw new ErroConta('gravidade', 'Gravidade inválida.');
  const descricao = txt(entrada?.description, 1000);
  const local = txt(entrada?.locationDetails, 250);
  if (pareceSpam(titulo, descricao, local)) throw new ErroConta('spam', 'Conteúdo contém padrões suspeitos ou links não permitidos.');

  const id = novoId('report');
  const agora = Date.now();
  const d: any = {
    title: titulo,
    description: descricao,
    type: tipo,
    severity: gravidade,
    district: distrito,
    concelho: txt(entrada?.concelho, 100) || distrito,
    locationDetails: local,
    companyOrService: txt(entrada?.companyOrService, 100),
    reportedAt: 'agora mesmo',
    timestamp: agora,
    updatedAt: agora,
    commentsCount: 0,
    imagesCount: 0,
    status: 'Ativa',
    upvotes: 1,
    confirmationsCount: 1,
    unconfirmedCount: 0,
    confirmedBy: autor ? [autor.id] : [],
    unconfirmedBy: [],
    reportsCount: 0,
    reportedBy: [],
    isCommunityVerified: false,
    isBreaking: false,
    imageUrl: '',
  };
  if (autor) { d.authorId = autor.id; d.authorName = autor.nome; }
  const av = calculateConfidence({ ...d, authorId: d.authorId, authorName: d.authorName });
  d.verificationStatus = av.status; d.confidenceScore = av.score; d.confidenceLevel = av.level;

  emTransacao(() => {
    base().prepare('INSERT INTO ocorrencias (id, dados, momento, id_externo, autor_id) VALUES (?, ?, ?, NULL, ?)')
      .run(id, JSON.stringify(d), agora, autor ? autor.id : null);
    if (autor) darPontos(autor.id, 20, true);
  });
  mudou();
  return id;
}

export function votarOcorrencia(id: string, acao: unknown, votante: string, contaVotante: Conta | null) {
  if (!idValido(id)) return { success: false, status: 'already_voted' as const };
  if (acao !== 'confirm' && acao !== 'unconfirm') throw new ErroConta('acao', 'Ação inválida.');
  return emTransacao(() => {
    const o = lerOcorrencia(id);
    if (!o) return { success: false, status: 'already_voted' as const };
    const d = o.d;
    const confirmedBy: string[] = Array.isArray(d.confirmedBy) ? [...d.confirmedBy] : [];
    const unconfirmedBy: string[] = Array.isArray(d.unconfirmedBy) ? [...d.unconfirmedBy] : [];
    let confirmacoes = typeof d.confirmationsCount === 'number' ? d.confirmationsCount : (d.upvotes || 0);
    let nao = typeof d.unconfirmedCount === 'number' ? d.unconfirmedCount : 0;
    const jaConfirmou = confirmedBy.includes(votante);
    const jaNegou = unconfirmedBy.includes(votante);

    if (acao === 'confirm') {
      if (jaConfirmou) return { success: false, status: 'already_voted' as const };
      if (jaNegou) { unconfirmedBy.splice(unconfirmedBy.indexOf(votante), 1); nao = Math.max(0, nao - 1); }
      confirmedBy.push(votante);
      confirmacoes += 1;
      if (d.authorId && d.authorId !== votante) darPontos(d.authorId, 5);
      if (contaVotante && contaVotante.id !== d.authorId) darPontos(contaVotante.id, 2);
    } else {
      if (jaNegou) return { success: false, status: 'already_voted' as const };
      if (jaConfirmou) { confirmedBy.splice(confirmedBy.indexOf(votante), 1); confirmacoes = Math.max(0, confirmacoes - 1); }
      unconfirmedBy.push(votante);
      nao += 1;
    }
    const verificada = confirmacoes >= 3;
    const av = calculateConfidence({
      confirmationsCount: confirmacoes, unconfirmedCount: nao, isCommunityVerified: verificada,
      sourceName: d.sourceName, companyOrService: d.companyOrService, status: d.status, reportsCount: d.reportsCount,
    });
    Object.assign(d, {
      confirmationsCount: confirmacoes, unconfirmedCount: nao, confirmedBy, unconfirmedBy,
      isCommunityVerified: verificada, upvotes: confirmacoes,
      verificationStatus: av.status, confidenceScore: av.score, confidenceLevel: av.level, updatedAt: Date.now(),
    });
    gravarOcorrencia(id, d);
    return { success: true, status: (acao === 'confirm' ? 'confirmed' : 'unconfirmed') as 'confirmed' | 'unconfirmed' };
  });
}

/** Denúncia de uma ocorrência: 2 denúncias = em análise; 4 ou mais = ocultada. */
export function denunciarOcorrencia(id: string, denunciante: string) {
  if (!idValido(id)) return { success: false, status: 'Ativa' };
  return emTransacao(() => {
    const o = lerOcorrencia(id);
    if (!o) return { success: false, status: 'Ativa' };
    const d = o.d;
    const por: string[] = Array.isArray(d.reportedBy) ? [...d.reportedBy] : [];
    if (por.includes(denunciante)) return { success: false, status: d.status || 'Ativa' };
    por.push(denunciante);
    const n = (typeof d.reportsCount === 'number' ? d.reportsCount : 0) + 1;
    let estado = d.status || 'Ativa';
    if (n >= 4) estado = 'Ocultada'; else if (n >= 2 && estado === 'Ativa') estado = 'Em análise';
    Object.assign(d, { reportedBy: por, reportsCount: n, status: estado });
    gravarOcorrencia(id, d);
    return { success: true, status: estado };
  });
}

/** Só o estado pode mudar (o autor ou a administração). */
export function mudarEstadoOcorrencia(id: string, estado: unknown, quem: { admin: boolean; contaId?: string }, zerarDenuncias = false) {
  if (!idValido(id) || !ESTADOS_OCORRENCIA.includes(String(estado))) throw new ErroConta('estado', 'Estado inválido.');
  emTransacao(() => {
    const o = lerOcorrencia(id);
    if (!o) throw new ErroConta('nao_existe', 'Ocorrência não encontrada.', 404);
    const eAutor = !!quem.contaId && o.autor === quem.contaId;
    if (!quem.admin && !eAutor) throw new ErroConta('proibido', 'Sem permissão.', 403);
    // O autor só pode resolver a sua ocorrência; esconder e restaurar é da administração
    if (!quem.admin && !['Ativa', 'Em resolução', 'Resolvida'].includes(String(estado))) throw new ErroConta('proibido', 'Sem permissão.', 403);
    o.d.status = estado;
    o.d.updatedAt = Date.now();
    if (zerarDenuncias && quem.admin) { o.d.reportsCount = 0; o.d.reportedBy = []; }
    gravarOcorrencia(id, o.d);
  });
}

export function apagarOcorrencia(id: string, quem: { admin: boolean; contaId?: string }) {
  if (!idValido(id)) return;
  emTransacao(() => {
    const o = lerOcorrencia(id);
    if (!o) return;
    if (!quem.admin && !(quem.contaId && o.autor === quem.contaId)) throw new ErroConta('proibido', 'Sem permissão.', 403);
    base().prepare('DELETE FROM ocorrencias WHERE id = ?').run(id);
  });
  mudou();
}

/** Importa as ocorrências das fontes públicas oficiais (feito só pelo servidor, nunca por um telemóvel). */
export function importarOcorrenciasPublicas(lista: any[]): { added: number; updated: number } {
  let added = 0, updated = 0;
  if (!Array.isArray(lista)) return { added, updated };
  emTransacao(() => {
    for (const occ of lista.slice(0, 400)) {
      const titulo = txt(occ?.title, 200);
      if (!titulo) continue;
      const extId = txt(occ?.externalId || occ?.id, 200);
      const existente = (extId
        ? base().prepare('SELECT id, dados FROM ocorrencias WHERE id_externo = ?').get(extId)
        : undefined) as { id: string; dados: string } | undefined;
      const agora = Date.now();
      if (existente) {
        let d: any = {};
        try { d = JSON.parse(existente.dados); } catch {}
        Object.assign(d, {
          status: ESTADOS_OCORRENCIA.includes(occ?.status) ? occ.status : 'Ativa',
          sourceFetchedAt: Number(occ?.sourceFetchedAt) || agora,
          reportedAt: txt(occ?.reportedAt, 100) || 'agora mesmo',
          severity: GRAVIDADES.includes(occ?.severity) ? occ.severity : d.severity,
          verificationStatus: 'Confirmado', confidenceScore: 95, confidenceLevel: 'Alta', updatedAt: agora,
        });
        base().prepare('UPDATE ocorrencias SET dados = ? WHERE id = ?').run(JSON.stringify(d), existente.id);
        updated++;
      } else {
        const id = novoId('pub');
        const gravidade = GRAVIDADES.includes(occ?.severity) ? occ.severity : 'Informação';
        const d = {
          title: titulo,
          description: txt(occ?.description, 1000),
          type: TIPOS.includes(occ?.type) ? occ.type : 'AVARIA',
          severity: gravidade,
          district: txt(occ?.district, 100) || 'Lisboa',
          concelho: txt(occ?.concelho || occ?.district, 100),
          locationDetails: txt(occ?.locationDetails, 250),
          companyOrService: txt(occ?.companyOrService, 100),
          reportedAt: txt(occ?.reportedAt, 100) || 'agora mesmo',
          timestamp: Number(occ?.timestamp) || agora,
          updatedAt: agora,
          commentsCount: 0, imagesCount: 0,
          status: ESTADOS_OCORRENCIA.includes(occ?.status) ? occ.status : 'Ativa',
          verificationStatus: 'Confirmado', confidenceScore: 95, confidenceLevel: 'Alta',
          upvotes: 1, confirmationsCount: 1, unconfirmedCount: 0,
          confirmedBy: ['fonte-oficial'], unconfirmedBy: [], reportsCount: 0, reportedBy: [],
          isCommunityVerified: true, isBreaking: !!occ?.isBreaking || gravidade === 'Grave',
          authorName: txt(occ?.authorName || occ?.sourceName, 100) || 'Fonte Oficial',
          sourceName: txt(occ?.sourceName, 150) || 'Fonte Oficial',
          sourceType: txt(occ?.sourceType, 50) || 'API',
          sourceUrl: txt(occ?.sourceUrl, 500),
          sourceFetchedAt: Number(occ?.sourceFetchedAt) || agora,
          externalId: extId,
        };
        base().prepare('INSERT INTO ocorrencias (id, dados, momento, id_externo, autor_id) VALUES (?, ?, ?, ?, NULL)')
          .run(id, JSON.stringify(d), d.timestamp, extId || null);
        added++;
      }
    }
  });
  if (added || updated) mudou();
  return { added, updated };
}

// ======================================================================================
// RECLAMAÇÕES E OPINIÕES
// ======================================================================================
function paraReclamacao(id: string, d: any) {
  return {
    id,
    title: d.title || '',
    text: d.text || '',
    companyOrService: d.companyOrService || '',
    serviceType: d.serviceType || 'Outro',
    rating: typeof d.rating === 'number' ? d.rating : undefined,
    district: d.district || 'Lisboa',
    concelho: d.concelho || '',
    locationDetails: d.locationDetails || '',
    incidentDate: d.incidentDate || '',
    timestamp: d.timestamp || Date.now(),
    authorId: d.authorId || undefined,
    authorName: d.authorName || 'Utilizador Anónimo',
    status: d.status || 'Pública',
    commentsCount: typeof d.commentsCount === 'number' ? d.commentsCount : 0,
    upvotes: typeof d.upvotes === 'number' ? d.upvotes : 0,
    upvotedBy: Array.isArray(d.upvotedBy) ? d.upvotedBy : [],
    reportsCount: typeof d.reportsCount === 'number' ? d.reportsCount : 0,
    reportedBy: Array.isArray(d.reportedBy) ? d.reportedBy : [],
    isOpinion: true,
  };
}

function lerReclamacao(id: string): any | null {
  const l = base().prepare('SELECT dados FROM reclamacoes WHERE id = ?').get(id) as { dados: string } | undefined;
  if (!l) return null;
  try { return JSON.parse(l.dados); } catch { return null; }
}
function gravarReclamacao(id: string, d: any) {
  base().prepare('UPDATE reclamacoes SET dados = ? WHERE id = ?').run(JSON.stringify(d), id);
  mudou();
}

export function listarReclamacoes(comOcultas: boolean) {
  const linhas = base().prepare('SELECT id, dados FROM reclamacoes ORDER BY momento DESC LIMIT 500').all() as Array<{ id: string; dados: string }>;
  const out: any[] = [];
  for (const l of linhas) {
    try {
      const r = paraReclamacao(l.id, JSON.parse(l.dados));
      if (!comOcultas && r.status === 'Ocultada') continue;
      out.push(r);
    } catch {}
  }
  return out;
}

export function criarReclamacao(entrada: any, autor: Conta | null): string {
  const titulo = txt(entrada?.title, 200);
  const texto = txt(entrada?.text, 2000);
  const empresa = txt(entrada?.companyOrService, 100);
  const distrito = txt(entrada?.district, 100);
  if (!titulo || !texto || !empresa || !distrito) throw new ErroConta('campos', 'Faltam campos obrigatórios.');
  if (pareceSpam(titulo, texto)) throw new ErroConta('spam', 'Conteúdo contém padrões suspeitos ou links não permitidos.');
  const nota = Number(entrada?.rating);
  const id = novoId('comp');
  const agora = Date.now();
  const d: any = {
    title: titulo, text: texto, companyOrService: empresa,
    serviceType: txt(entrada?.serviceType, 50) || 'Outro',
    ...(Number.isFinite(nota) && nota >= 1 && nota <= 5 ? { rating: Math.round(nota) } : {}),
    district: distrito,
    concelho: txt(entrada?.concelho, 100),
    locationDetails: txt(entrada?.locationDetails, 200),
    incidentDate: txt(entrada?.incidentDate, 50),
    timestamp: agora,
    authorName: autor ? autor.nome : (txt(entrada?.authorName, 100) || 'Utilizador Anónimo'),
    status: 'Pública', commentsCount: 0, upvotes: 0, upvotedBy: [], reportsCount: 0, reportedBy: [], isOpinion: true,
  };
  if (autor) d.authorId = autor.id;
  base().prepare('INSERT INTO reclamacoes (id, dados, momento, autor_id) VALUES (?, ?, ?, ?)').run(id, JSON.stringify(d), agora, autor ? autor.id : null);
  mudou();
  return id;
}

/** Concordar (ou retirar a concordância) com uma reclamação. */
export function votarReclamacao(id: string, votante: string): boolean {
  if (!idValido(id)) return false;
  return emTransacao(() => {
    const d = lerReclamacao(id);
    if (!d) return false;
    const por: string[] = Array.isArray(d.upvotedBy) ? [...d.upvotedBy] : [];
    let votos = typeof d.upvotes === 'number' ? d.upvotes : 0;
    const ja = por.includes(votante);
    if (ja) { por.splice(por.indexOf(votante), 1); votos = Math.max(0, votos - 1); }
    else { por.push(votante); votos += 1; }
    d.upvotedBy = por; d.upvotes = votos;
    gravarReclamacao(id, d);
    return !ja;
  });
}

export function denunciarReclamacao(id: string, denunciante: string) {
  if (!idValido(id)) return { success: false, status: 'Pública' };
  return emTransacao(() => {
    const d = lerReclamacao(id);
    if (!d) return { success: false, status: 'Pública' };
    const por: string[] = Array.isArray(d.reportedBy) ? [...d.reportedBy] : [];
    if (por.includes(denunciante)) return { success: false, status: d.status || 'Pública' };
    por.push(denunciante);
    const n = (typeof d.reportsCount === 'number' ? d.reportsCount : 0) + 1;
    let estado = d.status || 'Pública';
    if (n >= 4) estado = 'Ocultada'; else if (n >= 2 && estado === 'Pública') estado = 'Em análise';
    Object.assign(d, { reportedBy: por, reportsCount: n, status: estado });
    gravarReclamacao(id, d);
    return { success: true, status: estado };
  });
}

export function mudarEstadoReclamacao(id: string, estado: unknown, zerarDenuncias = false) {
  if (!idValido(id) || !ESTADOS_RECLAMACAO.includes(String(estado))) throw new ErroConta('estado', 'Estado inválido.');
  emTransacao(() => {
    const d = lerReclamacao(id);
    if (!d) throw new ErroConta('nao_existe', 'Reclamação não encontrada.', 404);
    d.status = estado;
    if (zerarDenuncias) { d.reportsCount = 0; d.reportedBy = []; }
    gravarReclamacao(id, d);
  });
}

export function apagarReclamacao(id: string, quem: { admin: boolean; contaId?: string }) {
  if (!idValido(id)) return;
  emTransacao(() => {
    const l = base().prepare('SELECT autor_id FROM reclamacoes WHERE id = ?').get(id) as { autor_id: string | null } | undefined;
    if (!l) return;
    if (!quem.admin && !(quem.contaId && l.autor_id === quem.contaId)) throw new ErroConta('proibido', 'Sem permissão.', 403);
    base().prepare('DELETE FROM reclamacoes WHERE id = ?').run(id); // os comentários vão atrás
  });
  mudou();
}

export function listarComentarios(reclamacaoId: string) {
  if (!idValido(reclamacaoId)) return [];
  const linhas = base().prepare('SELECT id, dados FROM comentarios WHERE reclamacao_id = ? ORDER BY momento ASC LIMIT 500').all(reclamacaoId) as Array<{ id: string; dados: string }>;
  const out: any[] = [];
  for (const l of linhas) {
    try {
      const d = JSON.parse(l.dados);
      out.push({ id: l.id, complaintId: reclamacaoId, text: d.text || '', authorId: d.authorId || undefined, authorName: d.authorName || 'Comentador', timestamp: d.timestamp || Date.now() });
    } catch {}
  }
  return out;
}

export function criarComentario(reclamacaoId: string, texto: unknown, nomeAnonimo: unknown, autor: Conta | null): string {
  if (!idValido(reclamacaoId)) throw new ErroConta('nao_existe', 'Reclamação não encontrada.', 404);
  const t = txt(texto, 1000);
  if (!t) throw new ErroConta('campos', 'Escreve um comentário.');
  if (pareceSpam(t)) throw new ErroConta('spam', 'Conteúdo contém padrões suspeitos ou links não permitidos.');
  const id = novoId('comm');
  const agora = Date.now();
  emTransacao(() => {
    const d = lerReclamacao(reclamacaoId);
    if (!d) throw new ErroConta('nao_existe', 'Reclamação não encontrada.', 404);
    const dados = { text: t, authorName: autor ? autor.nome : (txt(nomeAnonimo, 100) || 'Comentador'), ...(autor ? { authorId: autor.id } : {}), timestamp: agora };
    base().prepare('INSERT INTO comentarios (id, reclamacao_id, dados, momento) VALUES (?, ?, ?, ?)').run(id, reclamacaoId, JSON.stringify(dados), agora);
    d.commentsCount = (typeof d.commentsCount === 'number' ? d.commentsCount : 0) + 1;
    gravarReclamacao(reclamacaoId, d);
  });
  return id;
}
