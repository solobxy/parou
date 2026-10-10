// Contas e comunidade da PAROU: tudo fala com o servidor da própria PAROU (antes era o Firebase).
// - Conta: email e palavra-passe; a sessão fica num cookie seguro que o JavaScript não consegue ler.
// - Ocorrências e reclamações: o servidor valida tudo e a app vai buscar as novidades de 30 em 30 s
//   (só quando o ecrã está visível, e o servidor responde "sem alterações" quando nada mudou).
import { Occurrence, UserProfile, Complaint, ComplaintComment } from '../types';
import { cabecalhosAdmin } from '../utils/admin';

// ---------------------------------------------------------------------------------------------
// Pedidos ao servidor
// ---------------------------------------------------------------------------------------------
export class ErroServidor extends Error {
  constructor(mensagem: string, public codigo: string, public estado: number) { super(mensagem); }
}

export async function pedido<T = any>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  // Se o servidor estiver a reiniciar ou a ligação cair a meio (502/503/504), tenta mais uma vez
  // antes de mostrar o erro: o servidor recusa publicações repetidas, por isso é seguro.
  for (let tentativa = 0; ; tentativa++) {
    let r: Response;
    try {
      r = await fetch(url, {
        method: metodo,
        credentials: 'same-origin',
        headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...cabecalhosAdmin() },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ErroServidor('Sem ligação à internet. Verifica a rede e tenta outra vez.', 'rede', 0);
    }
    if (tentativa === 0 && (r.status === 502 || r.status === 503 || r.status === 504)) {
      await new Promise((ok) => setTimeout(ok, 800));
      continue;
    }
    let json: any = null;
    try { json = await r.json(); } catch {}
    if (!r.ok) {
      const semResposta = r.status >= 500 && !json?.erro;
      throw new ErroServidor(json?.erro || (semResposta ? 'O servidor está ocupado neste momento. Tenta outra vez daqui a pouco.' : 'Não foi possível concluir. Tenta outra vez.'), json?.codigo || 'erro', r.status);
    }
    return json as T;
  }
}

// ---------------------------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------------------------
export type Utilizador = UserProfile & { uid: string };

let utilizadorAtual: Utilizador | null = null;
let sessaoConhecida = false;
let emailAtivoNoServidor = false;
const ouvintesSessao = new Set<(u: Utilizador | null) => void>();
let aArrancar = false;

function definirUtilizador(u: Utilizador | null) {
  const mudou = (u?.userId || null) !== (utilizadorAtual?.userId || null);
  utilizadorAtual = u;
  sessaoConhecida = true;
  if (mudou) ouvintesSessao.forEach((f) => { try { f(u); } catch {} });
}

async function lerSessao(): Promise<void> {
  const r = await pedido<{ utilizador: Utilizador | null; emailAtivo?: boolean }>('GET', '/api/conta/eu');
  emailAtivoNoServidor = !!r.emailAtivo;
  definirUtilizador(r.utilizador);
  if (r.utilizador) perfilOuvintes.forEach((f) => { try { f(r.utilizador); } catch {} });
}

function arrancarSessao() {
  if (aArrancar) return;
  aArrancar = true;
  const tentar = () => lerSessao().catch(() => {
    // Sem rede agora: tenta outra vez quando voltar
    window.addEventListener('online', () => { void lerSessao().catch(() => {}); }, { once: true });
  });
  void tentar();
}

/** Utilizador com sessão iniciada (null se ainda não se sabe ou não há sessão) */
export function utilizadorAutenticado(): Utilizador | null {
  return utilizadorAtual;
}

/** Avisa quando se sabe quem está na sessão, e quando se entra ou sai */
export function observarSessao(cb: (u: Utilizador | null) => void): () => void {
  ouvintesSessao.add(cb);
  arrancarSessao();
  if (sessaoConhecida) setTimeout(() => { if (ouvintesSessao.has(cb)) cb(utilizadorAtual); }, 0);
  return () => { ouvintesSessao.delete(cb); };
}

export const recuperacaoPorEmailAtiva = () => emailAtivoNoServidor;

/** Volta a ler a sessão no servidor (pontos, avatar…) depois de uma ação que os muda. */
export function atualizarSessao(): Promise<void> {
  return lerSessao().catch(() => {});
}

// Perfil (pontos e distintivo): atualiza quando muda a sessão, depois de agir e de minuto a minuto
const perfilOuvintes = new Set<(p: Utilizador | null) => void>();

export function calculateBadge(points: number): string {
  if (points >= 500) return 'Embaixador da Mobilidade';
  if (points >= 250) return 'Sentinela de Trânsito';
  if (points >= 100) return 'Colaborador Ativo';
  return 'Novo Observador';
}

export async function ensureUserProfile(user: { userId?: string; uid?: string }): Promise<UserProfile> {
  if (utilizadorAtual && (utilizadorAtual.userId === user.userId || utilizadorAtual.userId === user.uid)) return utilizadorAtual;
  await lerSessao();
  if (!utilizadorAtual) throw new ErroServidor('Sem sessão.', 'sem_sessao', 401);
  return utilizadorAtual;
}

export function subscribeUserProfile(_userId: string, onProfileUpdate: (profile: UserProfile | null) => void): () => void {
  perfilOuvintes.add(onProfileUpdate);
  const temporizador = setInterval(() => { if (!document.hidden) void lerSessao().catch(() => {}); }, 60_000);
  return () => { perfilOuvintes.delete(onProfileUpdate); clearInterval(temporizador); };
}

function depoisDeAgir() {
  window.dispatchEvent(new CustomEvent('parou_comunidade_mudou'));
  if (utilizadorAtual) setTimeout(() => { void lerSessao().catch(() => {}); }, 400);
}

// ---------------------------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------------------------
export async function registerWithEmail(email: string, pass: string, name: string): Promise<UserProfile> {
  const r = await pedido<{ utilizador: Utilizador }>('POST', '/api/conta/registar', { email, palavraPasse: pass, nome: name });
  definirUtilizador(r.utilizador);
  return r.utilizador;
}

export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const r = await pedido<{ utilizador: Utilizador }>('POST', '/api/conta/entrar', { email, palavraPasse: pass });
  definirUtilizador(r.utilizador);
  return r.utilizador;
}

export async function logout(): Promise<void> {
  await pedido('POST', '/api/conta/sair', {});
  definirUtilizador(null);
}

/** Apaga a conta e os dados dela. Pede a palavra-passe para confirmar. */
export async function apagarConta(palavraPasse: string): Promise<'ok' | 'palavra-errada' | 'erro'> {
  try {
    await pedido('DELETE', '/api/conta', { palavraPasse });
    definirUtilizador(null);
    return 'ok';
  } catch (err: any) {
    return err?.codigo === 'credenciais' ? 'palavra-errada' : 'erro';
  }
}

/** Pede o email de recuperação. Devolve false se o servidor ainda não consegue enviar emails. */
export async function pedirRecuperacao(email: string): Promise<boolean> {
  const r = await pedido<{ enviado: boolean }>('POST', '/api/conta/esqueci', { email });
  return !!r.enviado;
}

export async function redefinirPalavraPasse(codigo: string, palavraPasse: string): Promise<UserProfile> {
  const r = await pedido<{ utilizador: Utilizador }>('POST', '/api/conta/redefinir', { codigo, palavraPasse });
  definirUtilizador(r.utilizador);
  return r.utilizador;
}

// ---------------------------------------------------------------------------------------------
// Favoritos na conta (usado por favoritesService)
// ---------------------------------------------------------------------------------------------
export const favoritosDaConta = {
  listar: async (): Promise<any[]> => (await pedido<{ itens: any[] }>('GET', '/api/conta/favoritos')).itens || [],
  guardar: async (itens: any[]): Promise<void> => { await pedido('PUT', '/api/conta/favoritos', { itens }); },
  apagar: async (id: string): Promise<void> => { await pedido('DELETE', `/api/conta/favoritos/${encodeURIComponent(id)}`); },
};

// ---------------------------------------------------------------------------------------------
// Atualização periódica ("em direto")
// ---------------------------------------------------------------------------------------------
function acompanhar<T>(url: string, extrair: (json: any) => T, aoReceber: (v: T) => void, aoFalhar?: (e: Error) => void, cadaMs = 30_000): () => void {
  let etag = '';
  let parado = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let aCorrer = false;

  const agendar = () => { if (!parado) temporizador = setTimeout(correr, cadaMs); };
  const correr = async () => {
    if (parado || aCorrer) return;
    if (document.hidden) { agendar(); return; }
    aCorrer = true;
    try {
      const r = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { ...cabecalhosAdmin(), ...(etag ? { 'If-None-Match': etag } : {}) },
        signal: AbortSignal.timeout(15000),
      });
      if (r.status === 304) { /* nada mudou */ }
      else if (r.ok) {
        etag = r.headers.get('ETag') || '';
        const json = await r.json();
        if (!parado) aoReceber(extrair(json));
      } else {
        throw new Error(`HTTP ${r.status}`);
      }
    } catch (err: any) {
      if (!parado && aoFalhar) aoFalhar(err instanceof Error ? err : new Error(String(err)));
    } finally {
      aCorrer = false;
      agendar();
    }
  };
  const agora = () => { if (temporizador) clearTimeout(temporizador); etag = ''; void correr(); };
  const aoVoltar = () => { if (!document.hidden) { if (temporizador) clearTimeout(temporizador); void correr(); } };

  window.addEventListener('parou_comunidade_mudou', agora);
  document.addEventListener('visibilitychange', aoVoltar);
  void correr();
  return () => {
    parado = true;
    if (temporizador) clearTimeout(temporizador);
    window.removeEventListener('parou_comunidade_mudou', agora);
    document.removeEventListener('visibilitychange', aoVoltar);
  };
}

// ---------------------------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------------------------
export function subscribeReports(onReportsUpdate: (reports: Occurrence[]) => void, onError?: (err: Error) => void): () => void {
  return acompanhar('/api/comunidade/ocorrencias', (j) => (Array.isArray(j?.ocorrencias) ? j.ocorrencias as Occurrence[] : []), onReportsUpdate, onError);
}

export async function fetchReportById(reportId: string): Promise<Occurrence | null> {
  try {
    const r = await pedido<{ ocorrencia: Occurrence }>('GET', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}`);
    return r.ocorrencia || null;
  } catch {
    return null;
  }
}

export async function createReport(reportData: Omit<Occurrence, 'id'> | Occurrence): Promise<string> {
  const r = await pedido<{ id: string }>('POST', '/api/comunidade/ocorrencias', reportData);
  depoisDeAgir();
  return r.id;
}

export function getVoterId(currentUserId?: string | null): string {
  if (currentUserId) return currentUserId;
  if (typeof window === 'undefined') return 'anon-user';
  try {
    let deviceId = localStorage.getItem('parou_voter_device_id');
    if (!deviceId) {
      deviceId = `dev_${crypto.randomUUID().replace(/-/g, '')}`;
      localStorage.setItem('parou_voter_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'anon-user';
  }
}

export async function voteOccurrence(
  reportId: string,
  action: 'confirm' | 'unconfirm',
  voterId: string,
  _registeredUserId?: string | null
): Promise<{ success: boolean; status: 'confirmed' | 'unconfirmed' | 'already_voted' }> {
  const r = await pedido<{ success: boolean; status: 'confirmed' | 'unconfirmed' | 'already_voted' }>(
    'POST', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}/voto`, { acao: action, votante: voterId });
  depoisDeAgir();
  return r;
}

export async function updateReport(reportId: string, updates: Partial<Occurrence>): Promise<void> {
  await pedido('PATCH', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}`, { status: updates.status });
  depoisDeAgir();
}

export async function upvoteReport(reportId: string, voterId?: string, registeredUserId?: string | null): Promise<void> {
  await voteOccurrence(reportId, 'confirm', voterId || getVoterId(registeredUserId), registeredUserId);
}

export async function flagReportOccurrence(
  reportId: string,
  reporterId: string,
  _reason?: string
): Promise<{ success: boolean; status: 'Ativa' | 'Em análise' | 'Ocultada' }> {
  const r = await pedido<{ success: boolean; status: any }>('POST', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}/denunciar`, { denunciante: reporterId });
  depoisDeAgir();
  return r;
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: 'Ativa' | 'Em resolução' | 'Resolvida' | 'Em análise' | 'Ocultada',
  resetReportsCount = false
): Promise<void> {
  await pedido('PATCH', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}`, { status, zerarDenuncias: resetReportsCount });
  depoisDeAgir();
}

export async function deleteReportDoc(reportId: string): Promise<void> {
  await pedido('DELETE', `/api/comunidade/ocorrencias/${encodeURIComponent(reportId)}`);
  depoisDeAgir();
}

// ---------------------------------------------------------------------------------------------
// Reclamações e opiniões
// ---------------------------------------------------------------------------------------------
export function subscribeComplaints(onUpdate: (complaints: Complaint[]) => void, onError?: (err: Error) => void): () => void {
  return acompanhar('/api/comunidade/reclamacoes', (j) => (Array.isArray(j?.reclamacoes) ? j.reclamacoes as Complaint[] : []), onUpdate, onError);
}

export async function createComplaint(
  data: Omit<Complaint, 'id' | 'status' | 'commentsCount' | 'upvotes' | 'reportsCount' | 'isOpinion'>
): Promise<string> {
  const r = await pedido<{ id: string }>('POST', '/api/comunidade/reclamacoes', data);
  depoisDeAgir();
  return r.id;
}

/** Concordar com uma reclamação (ou retirar a concordância). Devolve true se ficou a concordar. */
export async function voteComplaint(complaintId: string, voterId: string): Promise<boolean> {
  try {
    const r = await pedido<{ votado: boolean }>('POST', `/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}/voto`, { votante: voterId });
    depoisDeAgir();
    return r.votado;
  } catch {
    return false;
  }
}

export async function reportComplaint(
  complaintId: string,
  reporterId: string
): Promise<{ success: boolean; status: 'Pública' | 'Em análise' | 'Ocultada' }> {
  const r = await pedido<{ success: boolean; status: any }>('POST', `/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}/denunciar`, { denunciante: reporterId });
  depoisDeAgir();
  return r;
}

export async function adminUpdateComplaintStatus(
  complaintId: string,
  status: 'Pública' | 'Respondida' | 'Em análise' | 'Ocultada',
  resetReportsCount = false
): Promise<void> {
  await pedido('PATCH', `/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}`, { status, zerarDenuncias: resetReportsCount });
  depoisDeAgir();
}

export async function deleteComplaintDoc(complaintId: string): Promise<void> {
  await pedido('DELETE', `/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}`);
  depoisDeAgir();
}

export function subscribeComplaintComments(complaintId: string, onUpdate: (comments: ComplaintComment[]) => void): () => void {
  return acompanhar(`/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}/comentarios`, (j) => (Array.isArray(j?.comentarios) ? j.comentarios as ComplaintComment[] : []), onUpdate, undefined, 15_000);
}

export async function addComplaintComment(complaintId: string, text: string, authorName: string, _authorId?: string): Promise<string> {
  const r = await pedido<{ id: string }>('POST', `/api/comunidade/reclamacoes/${encodeURIComponent(complaintId)}/comentarios`, { texto: text, nome: authorName });
  depoisDeAgir();
  return r.id;
}

// ---------------------------------------------------------------------------------------------
// Anti-spam no telemóvel (o servidor repete estas verificações; aqui é só para avisar logo)
// ---------------------------------------------------------------------------------------------
const RATE_LIMIT_SECONDS = 45;
const STORAGE_KEY_LAST_REPORT = 'parou_last_report_ts';

export function checkReportRateLimit(): { allowed: boolean; remainingSeconds: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_REPORT);
    if (!raw) return { allowed: true, remainingSeconds: 0 };
    const elapsedSeconds = Math.floor((Date.now() - parseInt(raw, 10)) / 1000);
    if (elapsedSeconds < RATE_LIMIT_SECONDS) return { allowed: false, remainingSeconds: RATE_LIMIT_SECONDS - elapsedSeconds };
    return { allowed: true, remainingSeconds: 0 };
  } catch {
    return { allowed: true, remainingSeconds: 0 };
  }
}

export function recordReportSubmission(): void {
  try { localStorage.setItem(STORAGE_KEY_LAST_REPORT, Date.now().toString()); } catch {}
}

// Deteção heurística de duplicados recentes no mesmo concelho/distrito
export function detectDuplicateReport(
  candidate: { title: string; district: string; concelho?: string; locationDetails?: string; type?: string },
  existingReports: Occurrence[]
): { isDuplicate: boolean; duplicateReport?: Occurrence } {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  const cTitle = candidate.title.toLowerCase().trim();
  const cLoc = (candidate.locationDetails || '').toLowerCase().trim();
  const cDist = candidate.district.toLowerCase().trim();
  const cConc = (candidate.concelho || '').toLowerCase().trim();

  for (const existing of existingReports) {
    if (existing.status === 'Ocultada' || existing.status === 'Resolvida') continue;
    if (now - existing.timestamp > ONE_HOUR) continue;
    const eDist = existing.district.toLowerCase().trim();
    const eConc = (existing.concelho || '').toLowerCase().trim();
    if (eDist !== cDist) continue;
    const eTitle = existing.title.toLowerCase().trim();
    const eLoc = (existing.locationDetails || '').toLowerCase().trim();
    const titleMatch =
      cTitle === eTitle ||
      (cTitle.length > 8 && eTitle.includes(cTitle)) ||
      (eTitle.length > 8 && cTitle.includes(eTitle));
    const locationMatch = cLoc.length > 5 && (cLoc === eLoc || eLoc.includes(cLoc) || cLoc.includes(eLoc));
    if ((titleMatch && (cConc === eConc || !cConc)) || (locationMatch && existing.type === candidate.type)) {
      return { isDuplicate: true, duplicateReport: existing };
    }
  }
  return { isDuplicate: false };
}

const SPAM_PATTERNS = [
  /casino/i, /cripto/i, /crypto/i, /bitcoin/i, /telegram\s*@/i, /whatsapp\s*\+?[0-9]{8,}/i,
  /bit\.ly/i, /t\.me\//i, /viagra/i, /bet365/i, /(.)\1{7,}/,
];

export function detectSpamKeywords(text: string): { isSpam: boolean; reason?: string } {
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) return { isSpam: true, reason: 'Conteúdo contém padrões suspeitos ou links não permitidos.' };
  }
  return { isSpam: false };
}
