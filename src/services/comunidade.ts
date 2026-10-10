// Conversas da comunidade (publicações e respostas), votos, denúncias e bloqueios.
// Tudo fala com o servidor da PAROU; ler é público, o resto exige conta.
import { pedido, atualizarSessao, ErroServidor } from './conta';
import { ConfigAvatar } from '../utils/avatarCatalogo';

export { ErroServidor };

export type TipoConversa = 'queixa' | 'pergunta' | 'elogio' | 'conversa';
export const TIPOS_CONVERSA: TipoConversa[] = ['queixa', 'pergunta', 'elogio', 'conversa'];
export type MotivoDenuncia = 'spam' | 'insulto' | 'dados-pessoais' | 'falso' | 'outro';

export interface AutorConversa {
  nome: string;
  avatar: ConfigAvatar;
  pioneiro: boolean;
  pontos: number;
  operador?: string;
  apagada?: boolean;
}

export interface Publicacao {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoConversa;
  operador?: string;
  linha?: string;
  concelho?: string;
  distrito?: string;
  comLocalizacao: boolean;
  distanciaKm?: number;
  criado: number;
  pontos: number;
  respostas: number;
  estado: 'visivel' | 'oculta' | 'apagada';
  meuVoto: number;
  meu: boolean;
  denunciei: boolean;
  autor: AutorConversa;
}

export interface Resposta {
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
  escondida?: boolean;
  apagada?: boolean;
  bloqueada?: boolean;
  autor: AutorConversa;
}

export interface FiltrosFeed {
  ordem?: 'novas' | 'em-alta';
  tipo?: TipoConversa | '';
  operador?: string;
  linha?: string;
  concelho?: string;
  lat?: number;
  lon?: number;
  raioKm?: number;
  pagina?: number;
  soMinhas?: boolean;
}

function consulta(f: FiltrosFeed): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listarConversas(f: FiltrosFeed = {}): Promise<{ itens: Publicacao[]; proxima: number | null }> {
  return pedido('GET', `/api/comunidade/conversas${consulta(f)}`);
}

export async function lerConversa(id: string): Promise<{ publicacao: Publicacao; respostas: Resposta[] }> {
  return pedido('GET', `/api/comunidade/conversas/${encodeURIComponent(id)}`);
}

export interface NovaPublicacao {
  titulo: string;
  texto?: string;
  tipo: TipoConversa;
  operador?: string;
  linha?: string;
  concelho?: string;
  distrito?: string;
  lat?: number;
  lon?: number;
}

export async function publicar(dados: NovaPublicacao): Promise<string> {
  const r = await pedido<{ id: string }>('POST', '/api/comunidade/conversas', dados);
  void atualizarSessao(); // os pontos ganhos aparecem logo
  return r.id;
}

export async function responder(publicacaoId: string, texto: string, paiId?: string | null): Promise<string> {
  const r = await pedido<{ id: string }>('POST', `/api/comunidade/conversas/${encodeURIComponent(publicacaoId)}/respostas`, { texto, paiId: paiId || undefined });
  void atualizarSessao();
  return r.id;
}

export async function votar(alvoId: string, valor: -1 | 0 | 1): Promise<{ pontos: number; meuVoto: number }> {
  return pedido('POST', '/api/comunidade/votos', { alvoId, valor });
}

export async function denunciar(alvoId: string, motivo: MotivoDenuncia): Promise<{ estado: string }> {
  return pedido('POST', '/api/comunidade/denuncias', { alvoId, motivo });
}

export async function bloquearAutor(alvoId: string): Promise<void> {
  await pedido('POST', '/api/comunidade/bloquear', { alvoId });
}

export async function listarBloqueados(): Promise<Array<{ ref: string; nome: string }>> {
  return (await pedido<{ itens: Array<{ ref: string; nome: string }> }>('GET', '/api/comunidade/bloqueados')).itens || [];
}

export async function desbloquear(ref: string): Promise<void> {
  await pedido('DELETE', `/api/comunidade/bloqueados/${encodeURIComponent(ref)}`);
}

export async function apagarConteudo(id: string): Promise<void> {
  await pedido('DELETE', `/api/comunidade/conteudo/${encodeURIComponent(id)}`);
}

export async function guardarAvatar(avatar: ConfigAvatar): Promise<ConfigAvatar> {
  const r = await pedido<{ avatar: ConfigAvatar }>('PUT', '/api/conta/avatar', { avatar });
  void atualizarSessao();
  return r.avatar;
}

// ---------- administração ----------
export interface ItemModeracao {
  id: string;
  tipo: 'publicacao' | 'resposta';
  titulo?: string;
  texto: string;
  estado: string;
  denuncias: number;
  email: string | null;
  nome: string | null;
  motivos: string[];
  criado: number;
}
export const filaDeModeracao = async (): Promise<ItemModeracao[]> => (await pedido<{ itens: ItemModeracao[] }>('GET', '/api/comunidade/admin/fila')).itens;
export const moderar = (alvoId: string, acao: 'restaurar' | 'esconder' | 'apagar') => pedido('POST', '/api/comunidade/admin/moderar', { alvoId, acao });
