// Cidades com página própria e que a pessoa pode escolher como "as minhas cidades" (a app filtra as linhas por elas).
// raioKm: as paragens a esta distância do centro contam como "da cidade".
export interface Cidade { slug: string; nome: string; lat: number; lon: number; raioKm: number }

export const CIDADES: Cidade[] = [
  ['lisboa', 'Lisboa', 38.7223, -9.1393, 6], ['porto', 'Porto', 41.1579, -8.6291, 5], ['braga', 'Braga', 41.5454, -8.4265, 5],
  ['coimbra', 'Coimbra', 40.2033, -8.4103, 5], ['aveiro', 'Aveiro', 40.6405, -8.6538, 4], ['faro', 'Faro', 37.0194, -7.9322, 4],
  ['setubal', 'Setúbal', 38.5244, -8.8882, 4], ['leiria', 'Leiria', 39.7438, -8.8078, 4], ['viseu', 'Viseu', 40.6575, -7.9143, 4],
  ['evora', 'Évora', 38.5714, -7.907, 3], ['santarem', 'Santarém', 39.2369, -8.6855, 3], ['viana-do-castelo', 'Viana do Castelo', 41.6932, -8.8329, 4],
  ['vila-real', 'Vila Real', 41.3006, -7.7441, 3], ['braganca', 'Bragança', 41.8058, -6.7572, 3], ['guarda', 'Guarda', 40.5373, -7.2658, 3],
  ['castelo-branco', 'Castelo Branco', 39.8222, -7.4932, 3], ['portalegre', 'Portalegre', 39.2938, -7.4312, 3], ['beja', 'Beja', 38.0151, -7.8632, 3],
  ['funchal', 'Funchal', 32.6500, -16.9089, 5], ['ponta-delgada', 'Ponta Delgada', 37.7412, -25.6756, 4],
  ['maia', 'Maia', 41.2357, -8.6199, 5], ['matosinhos', 'Matosinhos', 41.1844, -8.6963, 4], ['vila-nova-de-gaia', 'Vila Nova de Gaia', 41.1239, -8.6118, 5],
  ['gondomar', 'Gondomar', 41.1446, -8.5323, 4], ['valongo', 'Valongo', 41.1886, -8.4983, 4], ['povoa-de-varzim', 'Póvoa de Varzim', 41.3804, -8.7609, 4],
  ['vila-do-conde', 'Vila do Conde', 41.3533, -8.7472, 4], ['espinho', 'Espinho', 41.0076, -8.6410, 3], ['guimaraes', 'Guimarães', 41.4425, -8.2918, 4],
  ['vila-nova-de-famalicao', 'Vila Nova de Famalicão', 41.4076, -8.5198, 4], ['santa-maria-da-feira', 'Santa Maria da Feira', 40.9268, -8.5436, 4],
  ['amadora', 'Amadora', 38.7538, -9.2308, 3], ['sintra', 'Sintra', 38.8029, -9.3817, 6], ['cascais', 'Cascais', 38.6979, -9.4215, 5],
  ['oeiras', 'Oeiras', 38.6913, -9.3110, 4], ['loures', 'Loures', 38.8309, -9.1685, 5], ['odivelas', 'Odivelas', 38.7929, -9.1838, 3],
  ['almada', 'Almada', 38.6790, -9.1569, 4], ['seixal', 'Seixal', 38.6401, -9.1013, 5], ['barreiro', 'Barreiro', 38.6631, -9.0724, 4],
  ['montijo', 'Montijo', 38.7067, -8.9739, 4], ['vila-franca-de-xira', 'Vila Franca de Xira', 38.9553, -8.9897, 5],
  ['figueira-da-foz', 'Figueira da Foz', 40.1508, -8.8618, 4], ['torres-vedras', 'Torres Vedras', 39.0911, -9.2586, 4],
  ['caldas-da-rainha', 'Caldas da Rainha', 39.4036, -9.1386, 3], ['portimao', 'Portimão', 37.1386, -8.5372, 4], ['albufeira', 'Albufeira', 37.0889, -8.2503, 4],
  ['loule', 'Loulé', 37.1377, -8.0197, 4], ['lagos', 'Lagos', 37.1028, -8.6730, 3], ['olhao', 'Olhão', 37.0260, -7.8411, 3], ['covilha', 'Covilhã', 40.2806, -7.5043, 3],
].map(([slug, nome, lat, lon, raioKm]) => ({ slug: slug as string, nome: nome as string, lat: lat as number, lon: lon as number, raioKm: raioKm as number }));

// ------------------------------------------------------------------------------------------------
// Margens dos rios: Lisboa e a margem sul (Almada, Seixal, Barreiro, Montijo), e o Porto e Gaia, ficam a poucos km umas
// das outras, e o círculo de cada cidade apanhava paragens da outra margem (o Metro Sul do Tejo em Cacilhas contava como
// Lisboa; o Cais de Gaia contava como Porto). As linhas abaixo são o meio do Tejo e do Douro no OpenStreetMap
// (waterway=river, lidas a 24/11/2026), de montante para a foz, com um ponto a cada ~300 m: [lon, lat].
// Quem desce o rio tem a margem sul à esquerda (no Tejo, no troço do estuário que vai para sudoeste, a margem do Montijo
// e de Alcochete também fica à esquerda), por isso "margem sul" = à esquerda do troço do rio mais perto.
// ------------------------------------------------------------------------------------------------
type Rio = ReadonlyArray<readonly [number, number]>;
const TEJO: Rio = [[-9.0264, 38.8594], [-9.0286, 38.849], [-9.0313, 38.8205], [-9.0323, 38.8094], [-9.0352, 38.7921], [-9.0416, 38.775], [-9.0523, 38.7587], [-9.062, 38.7414], [-9.075, 38.7258], [-9.0819, 38.7202], [-9.0929, 38.7108], [-9.1075, 38.7035], [-9.1299, 38.6972], [-9.1361, 38.6958], [-9.1667, 38.6912], [-9.1742, 38.6901], [-9.2028, 38.6858], [-9.2321, 38.6835], [-9.2529, 38.6848], [-9.2674, 38.6857], [-9.2781, 38.6829], [-9.2853, 38.681], [-9.2964, 38.6781], [-9.3017, 38.6747], [-9.3079, 38.6707], [-9.3082, 38.6704]];
const DOURO: Rio = [[-8.4482, 41.0536], [-8.4522, 41.0566], [-8.4549, 41.0586], [-8.4582, 41.0611], [-8.4601, 41.0641], [-8.4631, 41.0689], [-8.4687, 41.0735], [-8.4733, 41.0755], [-8.481, 41.0748], [-8.4831, 41.074], [-8.4915, 41.0715], [-8.4973, 41.0706], [-8.5024, 41.0705], [-8.5079, 41.0707], [-8.5137, 41.0728], [-8.5177, 41.0763], [-8.5196, 41.0803], [-8.5217, 41.086], [-8.5239, 41.092], [-8.5255, 41.0957], [-8.5284, 41.1008], [-8.5319, 41.1039], [-8.5364, 41.1063], [-8.5394, 41.1106], [-8.5424, 41.1148], [-8.5445, 41.1175], [-8.5485, 41.1216], [-8.554, 41.1233], [-8.5596, 41.124], [-8.5654, 41.1244], [-8.5687, 41.1257], [-8.571, 41.128], [-8.5726, 41.1335], [-8.5744, 41.1384], [-8.5775, 41.141], [-8.5825, 41.1417], [-8.586, 41.1408], [-8.5903, 41.139], [-8.594, 41.1386], [-8.5976, 41.14], [-8.6014, 41.141], [-8.6051, 41.1409], [-8.613, 41.139], [-8.6171, 41.1391], [-8.6206, 41.1408], [-8.6264, 41.1436], [-8.6314, 41.1445], [-8.6347, 41.1461], [-8.6385, 41.1473], [-8.6432, 41.1468], [-8.6506, 41.1455], [-8.6513, 41.1454], [-8.6559, 41.1442], [-8.6617, 41.1446], [-8.6668, 41.1451], [-8.6712, 41.1455], [-8.6759, 41.1456]];
const MARGEM: Record<string, { rio: Rio; sul: boolean }> = {
  lisboa: { rio: TEJO, sul: false }, oeiras: { rio: TEJO, sul: false }, loures: { rio: TEJO, sul: false },
  odivelas: { rio: TEJO, sul: false }, amadora: { rio: TEJO, sul: false }, 'vila-franca-de-xira': { rio: TEJO, sul: false },
  almada: { rio: TEJO, sul: true }, seixal: { rio: TEJO, sul: true }, barreiro: { rio: TEJO, sul: true }, montijo: { rio: TEJO, sul: true },
  porto: { rio: DOURO, sul: false }, gondomar: { rio: DOURO, sul: false }, valongo: { rio: DOURO, sul: false },
  matosinhos: { rio: DOURO, sul: false }, maia: { rio: DOURO, sul: false },
  'vila-nova-de-gaia': { rio: DOURO, sul: true },
};

/** O ponto fica na margem esquerda (sul) do rio: lado do troço mais perto (km, projeção local) */
function margemSul(rio: Rio, lat: number, lon: number): boolean {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.54;
  let melhor = Infinity, lado = 0;
  for (let i = 0; i < rio.length - 1; i++) {
    const ax = (rio[i][0] - lon) * kx, ay = (rio[i][1] - lat) * ky;
    const bx = (rio[i + 1][0] - lon) * kx, by = (rio[i + 1][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    // produto vetorial: positivo = o ponto (na origem) fica à esquerda de quem segue de a para b
    if (d < melhor) { melhor = d; lado = dx * (-ay) - dy * (-ax); }
  }
  return lado > 0;
}

/** O ponto fica a sul do Tejo (entre a foz e Vila Franca de Xira) */
export function aSulDoTejo(lat: number, lon: number): boolean { return margemSul(TEJO, lat, lon); }
/** O ponto fica a sul do Douro (entre a foz e Melres) */
export function aSulDoDouro(lat: number, lon: number): boolean { return margemSul(DOURO, lat, lon); }

function kmEntre(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** A paragem (ou ponto) conta como da cidade: dentro do raio e, à volta do Tejo e do Douro, na mesma margem que a cidade */
export function naCidade(c: Cidade, lat: number, lon: number): boolean {
  if (!(Math.abs(lat - c.lat) <= c.raioKm / 111 + 0.001)) return false;
  if (kmEntre(c.lat, c.lon, lat, lon) > c.raioKm) return false;
  const m = MARGEM[c.slug];
  if (m && margemSul(m.rio, lat, lon) !== m.sul) return false;
  return true;
}
