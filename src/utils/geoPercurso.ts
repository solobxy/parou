// Geometria simples para percursos de linhas. Não depende de nada (serve no servidor e na app).
// Os percursos são as paragens por ordem unidas em linha reta: serve para saber em que troço está um autocarro
// e para que lado vai, não para desenhar a estrada.

export interface Ponto { lat: number; lon: number }

const RAIO_TERRA_M = 6371000;
const rad = (g: number): number => (g * Math.PI) / 180;
const graus = (r: number): number => (r * 180) / Math.PI;

/** Distância em metros entre dois pontos (haversine) */
export function metros(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo (0–360°, 0 = norte) de a para b */
export function rumoEntre(a: Ponto, b: Ponto): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (graus(Math.atan2(y, x)) + 360) % 360;
}

/** Diferença entre dois rumos, de 0 a 180° */
export function diferencaRumo(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export interface ProjecaoNoPercurso {
  /** Troço entre pontos[segmento] e pontos[segmento + 1] */
  segmento: number;
  /** Posição dentro do troço: 0 = no primeiro ponto, 1 = no seguinte */
  t: number;
  /** Distância do ponto ao percurso, em metros */
  distanciaM: number;
  /** Rumo do troço, no sentido da viagem */
  rumoSegmento: number;
}

/**
 * Ponto mais próximo do percurso. `desde` limita a procura aos troços perto de uma posição já conhecida
 * (as linhas circulares e as que passam duas vezes no mesmo sítio não confundem o avanço); se o ponto
 * ficar longe desse intervalo, procura no percurso todo.
 */
export function projetarNoPercurso(pontos: Ponto[], p: Ponto, opcoes: { desde?: number; janela?: number } = {}): ProjecaoNoPercurso | null {
  if (pontos.length < 2) return null;
  const melhor = (de: number, ate: number): ProjecaoNoPercurso | null => {
    const cosLat = Math.cos(rad(p.lat));
    let res: ProjecaoNoPercurso | null = null;
    for (let i = Math.max(0, de); i < Math.min(pontos.length - 1, ate); i++) {
      const a = pontos[i];
      const b = pontos[i + 1];
      // Plano local em metros, com origem em p
      const ax = rad(a.lon - p.lon) * cosLat * RAIO_TERRA_M;
      const ay = rad(a.lat - p.lat) * RAIO_TERRA_M;
      const bx = rad(b.lon - p.lon) * cosLat * RAIO_TERRA_M;
      const by = rad(b.lat - p.lat) * RAIO_TERRA_M;
      const dx = bx - ax;
      const dy = by - ay;
      const comp2 = dx * dx + dy * dy;
      const t = comp2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / comp2));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = Math.sqrt(px * px + py * py);
      if (!res || d < res.distanciaM) res = { segmento: i, t, distanciaM: d, rumoSegmento: rumoEntre(a, b) };
    }
    return res;
  };
  if (opcoes.desde !== undefined && opcoes.desde >= 0) {
    const janela = opcoes.janela ?? 12;
    const local = melhor(opcoes.desde - 1, opcoes.desde + janela);
    if (local && local.distanciaM <= 150) return local;
  }
  return melhor(0, pontos.length - 1);
}

export interface ProgressoNoPercurso {
  /** Paragem seguinte (ou a paragem onde está, se `naParagem`) */
  indice: number;
  naParagem: boolean;
  distanciaAoPercursoM: number;
}

/** Em que ponto do percurso (paragens por ordem) está o veículo */
export function progressoNoPercurso(paragens: Ponto[], p: Ponto, opcoes: { desde?: number; raioParagemM?: number } = {}): ProgressoNoPercurso | null {
  const proj = projetarNoPercurso(paragens, p, { desde: opcoes.desde });
  if (!proj) return null;
  const raio = opcoes.raioParagemM ?? 25;
  const aqui = proj.segmento;
  const seguinte = proj.segmento + 1;
  if (metros(p, paragens[aqui]) <= raio) return { indice: aqui, naParagem: true, distanciaAoPercursoM: proj.distanciaM };
  if (metros(p, paragens[seguinte]) <= raio) return { indice: seguinte, naParagem: true, distanciaAoPercursoM: proj.distanciaM };
  return { indice: seguinte, naParagem: false, distanciaAoPercursoM: proj.distanciaM };
}

/**
 * Pontuação de um percurso para um veículo: distância ao percurso, com castigo se o veículo vai em sentido
 * contrário ao do troço (quando se sabe o rumo e ele não está parado). Menor é melhor.
 */
export function pontuarPercurso(paragens: Ponto[], p: Ponto, rumo?: number | null, aMover = true): { pontos: number; distanciaM: number } | null {
  const proj = projetarNoPercurso(paragens, p);
  if (!proj) return null;
  let pontos = proj.distanciaM;
  if (aMover && typeof rumo === 'number' && Number.isFinite(rumo)) {
    const dif = diferencaRumo(rumo, proj.rumoSegmento);
    if (dif > 100) pontos += 400; // contra o sentido: quase de certeza outro sentido da linha
    else if (dif > 60) pontos += 80;
  }
  return { pontos, distanciaM: proj.distanciaM };
}
