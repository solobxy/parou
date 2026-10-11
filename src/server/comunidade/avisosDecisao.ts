// Decide, sem base de dados e sem relógio próprio, que avisos graves a Comunidade deve publicar agora.
// Fica à parte de avisos.ts para se poder testar com dados inventados. Regras (pedidas pelo Criador):
//   • incêndios gravíssimos e avisos vermelhos do IPMA: a qualquer hora, com dicas de segurança;
//   • greves e feriados nacionais: só de dia, com intervalo entre posts e um máximo por dia.
import type { PostAviso, IncendioGrave } from './avisosTextos';
import { postIncendios, postAvisoVermelho, postGreve, postFeriado } from './avisosTextos';

export interface CandidatoLike {
  id: string;
  grupo?: string;
  pausaHoras?: number;
  titulo: string;
  corpo: string;
  distritos: string[];
  urgente: boolean;
  categoria?: string;
}

export interface IncidenteLike {
  id: string;
  tipo: string;
  concelho: string;
  local: string;
  distrito: string;
  aAcalmar: boolean;
  importante: boolean;
  meios: { humanos: number; terrestres: number; aereos: number };
}

export interface FeriadoLike {
  data: string;
  nome: string;
  diaSemana: string;
  emDias: number;
}

export interface EstadoAvisos {
  agoraMs: number;
  /** Hora em Lisboa (0–23) */
  hora: number;
  jaPublicados: Set<string>;
  /** Último post de cada grupo (ms) */
  ultimoPorGrupo: Map<string, number>;
  naoUrgentes24h: number;
  ultimoNaoUrgenteMs: number;
  fogos24h: number;
  ultimoFogoMs: number;
}

export type TipoProposta = 'fogo' | 'tempo' | 'greve' | 'feriado';

export interface Proposta {
  tipo: TipoProposta;
  urgente: boolean;
  /** Tudo o que este post cobre (para não voltar a publicar) */
  ids: Array<{ id: string; grupo: string }>;
  post: PostAviso;
}

export const LIMITES = {
  /** Meios mínimos para um incêndio ser "gravíssimo" */
  FOGO_OPERACIONAIS: 300,
  FOGO_OPERACIONAIS_COM_AEREOS: 200,
  FOGO_AEREOS: 2,
  FOGO_INTERVALO_MS: 90 * 60_000,
  FOGO_MAX_24H: 4,
  NAO_URGENTE_INTERVALO_MS: 45 * 60_000,
  NAO_URGENTE_MAX_24H: 6,
  DIA_INICIO: 8,
  DIA_FIM: 23,
  FERIADO_DE: 16,
  FERIADO_ATE: 22,
};

const HORA = 3600_000;

export function incendioGravissimo(i: IncidenteLike): boolean {
  if (i.tipo !== 'incendio' || i.aAcalmar || !i.distrito) return false;
  const m = i.meios;
  return m.humanos >= LIMITES.FOGO_OPERACIONAIS || (i.importante && m.humanos >= LIMITES.FOGO_OPERACIONAIS_COM_AEREOS && m.aereos >= LIMITES.FOGO_AEREOS);
}

export function decidirAvisos(
  e: { candidatos: CandidatoLike[]; incidentes: IncidenteLike[]; feriados: FeriadoLike[] },
  s: EstadoAvisos,
): Proposta[] {
  const propostas: Proposta[] = [];
  const novo = (c: CandidatoLike) => {
    if (s.jaPublicados.has(c.id)) return false;
    const ultimo = c.grupo ? s.ultimoPorGrupo.get(c.grupo) : undefined;
    return !(ultimo && s.agoraMs - ultimo < (c.pausaHoras || 0) * HORA);
  };
  const grupoDe = (c: CandidatoLike) => c.grupo || c.id;

  // 1. Incêndios gravíssimos (a qualquer hora, com um intervalo e um máximo por dia)
  const graves = e.incidentes.filter((i) => incendioGravissimo(i) && !s.jaPublicados.has(`fogo:${i.id}`));
  if (graves.length && s.agoraMs - s.ultimoFogoMs >= LIMITES.FOGO_INTERVALO_MS && s.fogos24h < LIMITES.FOGO_MAX_24H) {
    const top = [...graves].sort((a, b) => b.meios.humanos - a.meios.humanos).slice(0, 3);
    const lista: IncendioGrave[] = top.map((i) => ({
      concelho: i.concelho || i.local, distrito: i.distrito, humanos: i.meios.humanos, terrestres: i.meios.terrestres, aereos: i.meios.aereos,
    }));
    propostas.push({ tipo: 'fogo', urgente: true, ids: top.map((i) => ({ id: `fogo:${i.id}`, grupo: 'fogo' })), post: postIncendios(lista) });
  }

  // 2. Avisos vermelhos do IPMA: juntos num só post
  const vermelhos = e.candidatos.filter((c) => c.id.startsWith('ipma:') && c.urgente && novo(c));
  if (vermelhos.length) {
    const partes = vermelhos.map((c) => {
      const [tipos, ...resto] = c.corpo.split(' · ');
      return { tipos: (tipos || '').split(', ').filter(Boolean), quando: resto.join(' · ') };
    });
    const quandos = new Set(partes.map((p) => p.quando).filter(Boolean));
    propostas.push({
      tipo: 'tempo', urgente: true,
      ids: vermelhos.map((c) => ({ id: c.id, grupo: grupoDe(c) })),
      post: postAvisoVermelho({ distritos: vermelhos.flatMap((c) => c.distritos), tipos: partes.flatMap((p) => p.tipos), quando: quandos.size === 1 ? Array.from(quandos)[0] : undefined }),
    });
  }

  // 3. Greves e feriados: só de dia, um por passagem, com intervalo e máximo por dia
  const podeNaoUrgente = s.naoUrgentes24h < LIMITES.NAO_URGENTE_MAX_24H && s.agoraMs - s.ultimoNaoUrgenteMs >= LIMITES.NAO_URGENTE_INTERVALO_MS;
  if (podeNaoUrgente) {
    const dia = s.hora >= LIMITES.DIA_INICIO && s.hora < LIMITES.DIA_FIM;
    const greve = dia ? e.candidatos.find((c) => c.id.startsWith('oficial:') && c.categoria === 'greve' && novo(c)) : undefined;
    if (greve) {
      propostas.push({ tipo: 'greve', urgente: false, ids: [{ id: greve.id, grupo: grupoDe(greve) }], post: postGreve({ titulo: greve.titulo, corpo: greve.corpo }) });
    } else if (s.hora >= LIMITES.FERIADO_DE && s.hora < LIMITES.FERIADO_ATE) {
      const f = e.feriados.find((x) => x.emDias === 1 && x.diaSemana !== 'sábado' && x.diaSemana !== 'domingo' && !s.jaPublicados.has(`feriado:${x.data}`));
      if (f) propostas.push({ tipo: 'feriado', urgente: false, ids: [{ id: `feriado:${f.data}`, grupo: 'feriado' }], post: postFeriado({ nome: f.nome, diaSemana: f.diaSemana }) });
    }
  }
  return propostas;
}
