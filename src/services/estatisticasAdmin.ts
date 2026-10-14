// Estatísticas de utilizadores para a administração (conta do Criador ou chave de administração).
// Só números agregados: quantas pessoas abrem a app, quantas contas há, o que se faz na Comunidade.
import { cabecalhosAdmin } from '../utils/admin';

interface DiaPessoas { dia: string; pessoas: number; novas: number; aberturas: number; viaPaginas?: number }
interface Periodo { desde: string; pessoas: number; novas: number; queJaConheciamos: number; aberturas: number; novasViaPaginas: number }
interface Janela { de: string; ate: string; dias: number; pessoas: number; novas: number; novasViaPaginas: number; mediaPessoasPorDia: number; completa: boolean }
interface Evolucao { dias: number; comparavel: boolean; atual: Janela; anterior: Janela; variacaoPessoas: number | null; variacaoNovas: number | null }
interface Retorno { amostra: number; voltaram: number; percentagem: number | null }

export interface EstatisticasAdmin {
  geradoEm: string;
  ultimosMinutos30: number;
  ultimas24Horas: number;
  hoje: DiaPessoas;
  ontem: DiaPessoas;
  ultimos7Dias: Periodo;
  ultimos30Dias: Periodo;
  ultimos365Dias: Periodo;
  desdeSempre: { pessoas: number; aberturas: number; desde: string | null };
  evolucao: {
    semana: Evolucao;
    mes: Evolucao;
    usoRegular: { mediaPessoasPorDia7Dias: number; pessoasDoMes: number; percentagem: number | null };
  };
  fidelidade: {
    noDiaSeguinte: Retorno;
    naPrimeiraSemana: Retorno;
    pessoasQueUsaramEm3OuMaisDiasNosUltimos30: number;
    percentagemDoMes: number | null;
  };
  comoChegamUltimos30Dias: { novasPelaApp: number; novasPorPaginasPublicas: number; pessoasQueUsaramPaginasPublicas: number };
  integridade: {
    verificadoEm: string;
    diasVerificados: number;
    ok: boolean;
    reparado: boolean;
    diferencas: Array<{ dia: string; campo: string; resumo: number; real: number }>;
  };
  porOrigemUltimos30Dias: Record<string, number>;
  porIdiomaUltimos30Dias: Record<string, number>;
  serieDiaria30Dias: DiaPessoas[];
  outrosNumeros: {
    contasCriadas: number | null;
    ocorrenciasGuardadas: number | null;
    reclamacoesGuardadas: number | null;
    telemoveisComCopiaDeFavoritos: number | null;
    subscricoesDeNotificacoes: number | null;
  };
  contas: {
    total: number;
    primeiraConta: string | null;
    novasHoje: number;
    novasUltimos7Dias: number;
    novasUltimos30Dias: number;
    novasUltimos365Dias: number;
    comSessaoNasUltimas24Horas: number;
    comSessaoNosUltimos7Dias: number;
    serieDiaria30Dias: Array<{ dia: string; novas: number }>;
    comunidade: {
      publicacoes: number;
      publicacoesUltimos7Dias: number;
      respostas: number;
      respostasUltimos7Dias: number;
      pessoasQueEscreveramNosUltimos30Dias: number;
      votos: number;
    };
  };
}

export async function fetchEstatisticasAdmin(): Promise<EstatisticasAdmin> {
  const r = await fetch('/api/comunidade/admin/estatisticas', {
    headers: cabecalhosAdmin(),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (r.status === 403) throw new Error('Esta conta não tem acesso às estatísticas.');
  if (!r.ok) throw new Error('Não foi possível carregar as estatísticas.');
  return (await r.json()) as EstatisticasAdmin;
}
