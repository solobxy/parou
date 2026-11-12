// Zonas de Portugal onde a PAROU ainda não tem horários de nenhum operador, para o Perto explicar
// porquê em vez de um «Sem paragens nesta área» que parece avaria.

export type ZonaSemHorarios = 'madeira' | 'acores';

/** Madeira e Porto Santo (fora da rede dos Horários do Funchal só há a SIGA, sem dados abertos) */
const MADEIRA = { sul: 32.55, norte: 33.15, oeste: -17.35, leste: -16.2 };
/** Açores, das Flores e do Corvo a Santa Maria */
const ACORES = { sul: 36.8, norte: 39.8, oeste: -31.4, leste: -24.9 };

function dentro(lat: number, lon: number, c: { sul: number; norte: number; oeste: number; leste: number }): boolean {
  return lat >= c.sul && lat <= c.norte && lon >= c.oeste && lon <= c.leste;
}

export function zonaSemHorarios(lat?: number | null, lon?: number | null): ZonaSemHorarios | null {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (dentro(lat, lon, MADEIRA)) return 'madeira';
  if (dentro(lat, lon, ACORES)) return 'acores';
  return null;
}

/** Horários oficiais da rede SIGA (Madeira e Porto Santo) */
export const HORARIOS_SIGA = 'https://siga.madeira.gov.pt/public/horarios';
