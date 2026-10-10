// Avisos que valem um post no canal do WhatsApp: greves, mau tempo grave, incêndios importantes e
// perturbações graves de operadores grandes. Só o administrador os pode ler (chave ou conta do Criador).
import { cabecalhosAdmin } from '../utils/admin';

export interface AvisoCanal {
  id: string;
  titulo: string;
  corpo: string;
  categoria?: string;
  urgente: boolean;
  url: string;
}

export async function fetchAvisosCanal(): Promise<AvisoCanal[]> {
  const r = await fetch('/api/comunidade/admin/avisos-canal', { headers: cabecalhosAdmin(), credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error(`Erro ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.itens) ? (j.itens as AvisoCanal[]) : [];
}
