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
