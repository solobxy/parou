// Registo de segurança para a administração: só totais, rotas e códigos de origem do dia (nunca IPs).
import { cabecalhosAdmin } from '../utils/admin';

export interface AvisoSeguranca { nivel: 'alta' | 'media' | 'baixa'; codigo: string; texto: string; n: number; desde: string }
export interface ResumoSeguranca {
  atualizado: string;
  retencaoDias: number;
  ultimas24h: Record<string, number>;
  porDia: Record<string, Record<string, number>>;
  avisos: AvisoSeguranca[];
  rotasMaisAtivas: Array<{ tipo: string; rota: string; n: number }>;
  origensMaisAtivasHoje: Array<{ origem: string; n: number; tipos: string; clientes: string }>;
  porCliente: Array<{ cliente: string; n: number }>;
}

export async function fetchSegurancaAdmin(): Promise<ResumoSeguranca> {
  const r = await fetch('/api/comunidade/admin/seguranca', { headers: cabecalhosAdmin(), credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 403) throw new Error('Esta conta não tem acesso ao registo de segurança.');
  if (!r.ok) throw new Error('Não foi possível carregar o registo de segurança.');
  return (await r.json()) as ResumoSeguranca;
}
