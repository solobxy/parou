// Nome canónico do distrito a partir de texto livre. Cuidado: «braga» está dentro de «bragança» (e «porto» de «porto santo»…),
// por isso procura-se a palavra inteira e ganha a mais comprida.

const DISTRITOS: Record<string, string> = {
  lisboa: 'Lisboa', porto: 'Porto', setubal: 'Setúbal', braga: 'Braga', aveiro: 'Aveiro', coimbra: 'Coimbra', leiria: 'Leiria',
  santarem: 'Santarém', faro: 'Faro', viseu: 'Viseu', 'viana do castelo': 'Viana do Castelo', 'vila real': 'Vila Real',
  braganca: 'Bragança', guarda: 'Guarda', 'castelo branco': 'Castelo Branco', portalegre: 'Portalegre', evora: 'Évora', beja: 'Beja',
  acores: 'Região Autónoma dos Açores', madeira: 'Região Autónoma da Madeira',
};
const CHAVES = Object.keys(DISTRITOS).sort((a, b) => b.length - a.length);

const simples = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Distrito (nome canónico) que o texto menciona como palavra inteira, ou null */
export function distritoNoTexto(texto: string): string | null {
  const t = ` ${simples(texto).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const k of CHAVES) if (t.includes(` ${k} `)) return DISTRITOS[k];
  return null;
}

/** Nome canónico do distrito; o que não se reconhece fica como veio; vazio dá Lisboa */
export function normalizeDistrict(input?: string): string {
  if (!input) return 'Lisboa';
  return distritoNoTexto(input) ?? (input.trim() || 'Lisboa');
}

/** Verdade se o texto tem alguma das palavras/expressões como palavra inteira («porto» não está em «aeroporto», «braga» não está em «bragança») */
export function temPalavra(texto: string, ...palavras: string[]): boolean {
  const t = ` ${simples(texto).replace(/[^a-z0-9]+/g, ' ')} `;
  return palavras.some(w => t.includes(` ${simples(w).replace(/[^a-z0-9]+/g, ' ')} `));
}

/** Distrito escrito no fim da descrição de uma ocorrência da Proteção Civil («… em Local, Concelho, Distrito. Estado: …»), ou null */
export function distritoDaDescricaoANEPC(descricao: string): string | null {
  const m = /^Ocorrência da Proteção Civil \(ANEPC\) em (.+?)\. Estado:/.exec(descricao || '');
  if (!m) return null;
  const partes = m[1].split(',');
  return distritoNoTexto(partes[partes.length - 1]);
}
