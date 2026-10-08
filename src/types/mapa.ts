// Pontos do separador Mapa (vêm de /api/mapa): o que está a acontecer agora
export type TipoPontoMapa = 'incendio' | 'acidente' | 'inundacao' | 'protecao_civil' | 'aviso_tempo' | 'greve' | 'perturbacao' | 'obras';

export interface PontoMapa {
  id: string;
  tipo: TipoPontoMapa;
  lat: number;
  lon: number;
  titulo: string;
  subtitulo: string;
  cor: string;
  gravidade: 'Grave' | 'Moderada' | 'Informativo';
  fonte: string;
  url?: string;
  inicio?: string | null;
  fim?: string | null;
  distrito?: string;
}

export interface RespostaMapa {
  atualizado: string;
  incendiosAtualizado: string | null;
  pontos: PontoMapa[];
}

export type GrupoCamada = 'incendios' | 'tempo' | 'estrada' | 'transportes' | 'comunidade';

export function grupoDoPonto(t: TipoPontoMapa): GrupoCamada {
  if (t === 'incendio') return 'incendios';
  if (t === 'aviso_tempo' || t === 'inundacao') return 'tempo';
  if (t === 'acidente' || t === 'protecao_civil') return 'estrada';
  return 'transportes';
}
