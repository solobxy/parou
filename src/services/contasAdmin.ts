// Lista de contas para o Criador (só administração): nome, email, datas e idioma de cada conta.
import { cabecalhosAdmin } from '../utils/admin';

export interface ContaAdmin { nome: string; email: string; criado: number; ultimoAcesso: number; idioma: string | null }
export interface ListaContasAdmin { geradoEm: string; total: number; contas: ContaAdmin[] }

export async function fetchContasAdmin(): Promise<ListaContasAdmin> {
  const r = await fetch('/api/comunidade/admin/contas', { headers: cabecalhosAdmin(), credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 403) throw new Error('Esta conta não tem acesso à lista de contas.');
  if (!r.ok) throw new Error('Não foi possível carregar as contas.');
  return (await r.json()) as ListaContasAdmin;
}
