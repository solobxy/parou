// Catálogo do avatar "Paro" (a mascote da PAROU). Fica num ficheiro à parte, sem desenhos nem textos
// traduzidos, porque o servidor e a app usam as mesmas regras: o servidor confirma sempre que as peças
// escolhidas existem e que a pessoa já tem reputação para as usar.
//
// Cada peça tem um código fixo (que fica guardado na conta) e, se for caso disso, a reputação mínima.

export type CategoriaId = 'cor' | 'chapeu' | 'cara' | 'roupa' | 'calcado' | 'mao';

export interface ItemAvatar {
  id: string;
  nome: string; // texto em português; a app traduz com t()
  rep?: number; // reputação mínima para usar a peça
  hex?: string; // só nas cores
}

export interface CategoriaAvatar {
  id: CategoriaId;
  nome: string;
  itens: ItemAvatar[];
}

export type ConfigAvatar = Record<CategoriaId, string>;

export const CATEGORIAS_AVATAR: CategoriaAvatar[] = [
  {
    id: 'cor', nome: 'Cor', itens: [
      { id: 'laranja', nome: 'Laranja', hex: '#FF6B1A' },
      { id: 'azul', nome: 'Azul', hex: '#3F7BE8' },
      { id: 'verde', nome: 'Verde', hex: '#2FB67C' },
      { id: 'rosa', nome: 'Rosa', hex: '#F27AA6' },
      { id: 'creme', nome: 'Creme', hex: '#F3DFB5' },
      { id: 'grafite', nome: 'Grafite', hex: '#6C7482' },
    ],
  },
  {
    id: 'chapeu', nome: 'Chapéu', itens: [
      { id: 'nenhum', nome: 'Sem chapéu' },
      { id: 'boné', nome: 'Boné' },
      { id: 'gorro', nome: 'Gorro' },
      { id: 'capacete', nome: 'Capacete de obra', rep: 25 },
      { id: 'pescador', nome: 'Chapéu de pescador', rep: 50 },
      { id: 'revisor', nome: 'Boné de revisor', rep: 100 },
    ],
  },
  {
    id: 'cara', nome: 'Cara', itens: [
      { id: 'nenhum', nome: 'Normal' },
      { id: 'oculos', nome: 'Óculos' },
      { id: 'sardas', nome: 'Sardas' },
      { id: 'sol', nome: 'Óculos de sol', rep: 25 },
      { id: 'bigode', nome: 'Bigode', rep: 50 },
    ],
  },
  {
    id: 'roupa', nome: 'Roupa', itens: [
      { id: 'nenhum', nome: 'Sem roupa' },
      { id: 'riscas', nome: 'Camisola às riscas' },
      { id: 'cachecol', nome: 'Cachecol' },
      { id: 'colete', nome: 'Colete refletor', rep: 25 },
      { id: 'casaco', nome: 'Casaco de revisor', rep: 100 },
    ],
  },
  {
    id: 'calcado', nome: 'Calçado', itens: [
      { id: 'nenhum', nome: 'Descalço' },
      { id: 'ténis', nome: 'Ténis' },
      { id: 'botas', nome: 'Botas', rep: 50 },
    ],
  },
  {
    id: 'mao', nome: 'Mão', itens: [
      { id: 'nenhum', nome: 'Livre' },
      { id: 'bilhete', nome: 'Bilhete' },
      { id: 'cafe', nome: 'Café' },
      { id: 'telemovel', nome: 'Telemóvel', rep: 25 },
      { id: 'guardachuva', nome: 'Guarda-chuva', rep: 50 },
    ],
  },
];

export const AVATAR_PADRAO: ConfigAvatar = {
  cor: 'laranja', chapeu: 'boné', cara: 'nenhum', roupa: 'nenhum', calcado: 'ténis', mao: 'nenhum',
};

/** Junta o que vem da conta com o avatar padrão e ignora tudo o que não existe no catálogo. */
export function avatarOuPadrao(entrada: unknown): ConfigAvatar {
  const saida: ConfigAvatar = { ...AVATAR_PADRAO };
  if (!entrada || typeof entrada !== 'object') return saida;
  for (const cat of CATEGORIAS_AVATAR) {
    const v = (entrada as Record<string, unknown>)[cat.id];
    if (typeof v === 'string' && cat.itens.some((i) => i.id === v)) saida[cat.id] = v;
  }
  return saida;
}

/** Confirma uma escolha de avatar: todas as peças têm de existir e a reputação tem de chegar. */
export function validarAvatar(entrada: unknown, reputacao: number): { ok: true; config: ConfigAvatar } | { ok: false; erro: string } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, erro: 'Avatar inválido.' };
  const config = { ...AVATAR_PADRAO };
  for (const cat of CATEGORIAS_AVATAR) {
    const v = (entrada as Record<string, unknown>)[cat.id];
    if (typeof v !== 'string') return { ok: false, erro: 'Avatar inválido.' };
    const item = cat.itens.find((i) => i.id === v);
    if (!item) return { ok: false, erro: 'Avatar inválido.' };
    if ((item.rep || 0) > reputacao) return { ok: false, erro: 'Ainda não tens reputação para uma das peças escolhidas.' };
    config[cat.id] = v;
  }
  return { ok: true, config };
}

/** Reputação que falta para a próxima peça por abrir (ou null se já tem todas). */
export function proximaPeca(reputacao: number): { nome: string; falta: number } | null {
  let melhor: { nome: string; rep: number } | null = null;
  for (const cat of CATEGORIAS_AVATAR) {
    for (const i of cat.itens) {
      if ((i.rep || 0) > reputacao && (!melhor || (i.rep as number) < melhor.rep)) melhor = { nome: i.nome, rep: i.rep as number };
    }
  }
  return melhor ? { nome: melhor.nome, falta: melhor.rep - reputacao } : null;
}
