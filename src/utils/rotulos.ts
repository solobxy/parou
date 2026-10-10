import { t } from '../i18n';

// Nome legível de cada tipo de ocorrência (iguais aos do formulário "Reportar ocorrência")
const ROTULOS_TIPO: Record<string, string> = {
  ACIDENTE: 'Acidente',
  ATRASOS: 'Atrasos',
  AVARIA: 'Avaria',
  GREVE: 'Greve',
  OBRAS: 'Obras',
  CORTE: 'Via cortada',
  SERVICO_PUBLICO: 'Outro',
};

export const rotuloTipoOcorrencia = (tipo: string): string => t(ROTULOS_TIPO[tipo] || tipo);
