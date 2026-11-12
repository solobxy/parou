// Zonas de aviso do IPMA nas ilhas. Não são distritos e algumas nem têm cidade na lista do IPMA
// (distrits-islands.json): na Madeira só vêm o Funchal (costa sul) e o Porto Santo, por isso os avisos
// da costa norte e das serras ficavam de fora do mapa, das notificações e de quem está em Santana.

export interface ZonaIpma {
  area: string;
  nome: string;
  globalIdLocal: number;
  lat: number;
  lon: number;
  idRegiao: number;
}

/** Nome a mostrar num aviso de cada zona das ilhas (no continente usa-se o nome do distrito) */
export const NOME_ZONA_AVISO: Record<string, string> = {
  MCS: 'Madeira (costa sul)',
  MCN: 'Madeira (costa norte)',
  MRM: 'Madeira (serras)',
  MPS: 'Porto Santo',
  AOR: 'Açores (grupo oriental)',
  ACE: 'Açores (grupo central)',
  AOC: 'Açores (grupo ocidental)',
};

/** Zonas da Madeira que o IPMA não põe na lista de cidades (previsão de São Vicente e do Funchal) */
export const ZONAS_EXTRA: ZonaIpma[] = [
  { area: 'MCN', nome: 'Madeira (costa norte)', globalIdLocal: 2311000, lat: 32.8, lon: -16.96, idRegiao: 2 },
  { area: 'MRM', nome: 'Madeira (serras)', globalIdLocal: 2310300, lat: 32.735, lon: -16.93, idRegiao: 2 },
];

/** Cidade que representa cada zona dos Açores (a lista do IPMA tem várias por zona) */
const CIDADE_DA_ZONA: Record<string, string> = { AOR: 'Ponta Delgada', ACE: 'Angra do Heroísmo', AOC: 'Santa Cruz das Flores' };

/** Na Madeira, a costa norte (Porto Moniz, São Vicente, Santana, Porto da Cruz) fica a norte disto */
const LATITUDE_COSTA_NORTE = 32.77;

/** Avisos que contam como "aqui": na ilha da Madeira, a costa onde se está e as serras */
export function areasLocaisAviso(area: string): string[] {
  return area === 'MCS' || area === 'MCN' ? [area, 'MRM'] : [area];
}

/** Pelo GPS: quem está na ilha da Madeira a norte da cordilheira fica na zona da costa norte */
export function areaPelaPosicao(area: string, lat: number): string {
  return area === 'MCS' && lat >= LATITUDE_COSTA_NORTE ? 'MCN' : area;
}

/** Lista do IPMA com as zonas da Madeira que lhe faltam (só se a lista já tiver a Madeira) */
export function comZonasExtra<T extends ZonaIpma>(lista: T[]): T[] {
  if (!lista.some((d) => d.idRegiao === 2)) return lista;
  return [...lista, ...(ZONAS_EXTRA.filter((z) => !lista.some((d) => d.area === z.area)) as T[])];
}

/** Uma cidade por zona de aviso: Ponta Delgada (e não Vila do Porto) para o grupo oriental, etc. */
export function porAreaPreferida<T extends ZonaIpma>(lista: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const d of comZonasExtra(lista)) {
    const atual = m.get(d.area);
    if (!atual || (CIDADE_DA_ZONA[d.area] === d.nome && atual.nome !== d.nome)) m.set(d.area, d);
  }
  return m;
}

/** Nome para um aviso desta zona: nas ilhas a zona do IPMA, no continente o distrito */
export function nomeDaZona(area: string, porArea: Map<string, { nome: string }>): string {
  return NOME_ZONA_AVISO[area] || porArea.get(area)?.nome || area;
}

/** Região do aviso, para as notificações de quem escolheu "Funchal (Madeira)" ou "Ponta Delgada (Açores)" */
export function regiaoDaZona(idRegiao: number): string | null {
  return idRegiao === 2 ? 'Madeira' : idRegiao === 3 ? 'Açores' : null;
}
