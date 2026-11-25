// Relatórios da PAROU para a administração (ver src/server/relatorios.ts)
import { cabecalhosAdmin } from '../utils/admin';

export type PeriodoRelatorio = 'dia' | 'semana' | 'mes' | 'trimestre' | 'ano' | '2anos' | '3anos' | 'sempre';
export interface Histograma { amostras: number; mediana_min: number | null; pct_2min_ou_mais: number | null; pct_5min_ou_mais: number | null; pct_10min_ou_mais: number | null; pct_adiantado_1min_ou_mais: number | null }
export interface Relatorio {
  periodo: PeriodoRelatorio; desde: string; ate: string; gerado: string; notas: string;
  atrasos: Array<Histograma & { operador: string; feed: string; pior_hora: (Histograma & { hora: number }) | null; piores_linhas: Array<Histograma & { linha: string }> }>;
  pontualidade: Array<{ operador: string; passagens: number; dias: number; a_horas_pct: number; atrasado_mais_5min_pct: number; atrasado_mais_10min_pct: number; adiantado_mais_1min_pct: number; mediana_media_min: number }>;
  avisos: { total: number; por_tipo: Record<string, number>; por_operador: Record<string, Record<string, number>>; greves: Array<{ operador: string; titulo: string; inicio: string; fim: string | null; estado: string }> };
  viagens: { dias_com_dados: number; por_operador: Array<{ operador: string; feed: string; linhas: number; viagens_dia: number; antes: number; variacao_pct: number | null }>; linhas_que_perderam_viagens: Array<{ operador: string; linha: string; viagens_dia: number; antes: number; variacao_pct: number | null }> };
  noticias: Record<string, number>;
}

export async function fetchRelatorio(periodo: PeriodoRelatorio): Promise<Relatorio> {
  const r = await fetch(`/api/comunidade/admin/relatorio?periodo=${periodo}`, { headers: cabecalhosAdmin(), credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 403) throw new Error('Esta conta não tem acesso aos relatórios.');
  if (!r.ok) throw new Error('Não foi possível fazer o relatório.');
  return (await r.json()) as Relatorio;
}
