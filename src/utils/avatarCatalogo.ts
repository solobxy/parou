// Catálogo do avatar da PAROU: sete personagens (as três primeiras livres, as outras abrem com
// reputação: 25, 50, 75 e 100) que se vestem com as mesmas peças.
// Fica num ficheiro à parte, sem desenhos nem textos traduzidos, porque o servidor e a app usam as
// mesmas regras: o servidor confirma sempre que as peças escolhidas existem e que a pessoa já tem
// reputação para as usar.
//
// Cada peça tem um código fixo (que fica guardado na conta) e, se for caso disso, a reputação mínima.
// Os códigos já existentes nunca mudam (há contas que os usam).

export type CategoriaId = 'personagem' | 'cor' | 'chapeu' | 'expressao' | 'cara' | 'roupa' | 'calcado' | 'mao' | 'fundo';

export interface ItemAvatar {
  id: string;
  nome: string; // texto em português; a app traduz com t()
  rep?: number; // reputação mínima para usar a peça
  hex?: string; // só nas cores
  cor?: string; // só nas personagens: cor que lhes assenta bem (a app sugere-a ao escolher)
}

export interface CategoriaAvatar {
  id: CategoriaId;
  nome: string;
  itens: ItemAvatar[];
}

export type ConfigAvatar = Record<CategoriaId, string>;

export const CATEGORIAS_AVATAR: CategoriaAvatar[] = [
  {
    id: 'personagem', nome: 'Personagem', itens: [
      { id: 'paro', nome: 'Paro', cor: 'laranja' },
      { id: 'estrela', nome: 'Estrela', cor: 'amarelo' },
      { id: 'gato', nome: 'Gato', cor: 'grafite' },
      { id: 'cato', nome: 'Cato', rep: 25, cor: 'verde' },
      { id: 'camaleao', nome: 'Camaleão', rep: 50, cor: 'roxo' },
      { id: 'autocarro', nome: 'Autocarro', rep: 75, cor: 'vermelho' },
      { id: 'paragem', nome: 'Paragem', rep: 100, cor: 'azul' },
    ],
  },
  {
    id: 'cor', nome: 'Cor', itens: [
      { id: 'laranja', nome: 'Laranja', hex: '#FF6B1A' },
      { id: 'azul', nome: 'Azul', hex: '#3F7BE8' },
      { id: 'verde', nome: 'Verde', hex: '#2FB67C' },
      { id: 'rosa', nome: 'Rosa', hex: '#F27AA6' },
      { id: 'creme', nome: 'Creme', hex: '#F3DFB5' },
      { id: 'grafite', nome: 'Grafite', hex: '#6C7482' },
      { id: 'roxo', nome: 'Roxo', hex: '#8B5CF6', rep: 10 },
      { id: 'amarelo', nome: 'Amarelo', hex: '#F5B800' },
      { id: 'vermelho', nome: 'Vermelho', hex: '#E5484D', rep: 50 },
    ],
  },
  {
    id: 'chapeu', nome: 'Chapéu', itens: [
      { id: 'nenhum', nome: 'Sem chapéu' },
      { id: 'boné', nome: 'Boné' },
      { id: 'gorro', nome: 'Gorro' },
      { id: 'boina', nome: 'Boina' },
      { id: 'auscultadores', nome: 'Auscultadores', rep: 10 },
      { id: 'festa', nome: 'Chapéu de festa', rep: 10 },
      { id: 'capacete', nome: 'Capacete de obra', rep: 25 },
      { id: 'cowboy', nome: 'Chapéu de cowboy', rep: 40 },
      { id: 'pescador', nome: 'Chapéu de pescador', rep: 50 },
      { id: 'revisor', nome: 'Boné de revisor', rep: 100 },
      { id: 'cartola', nome: 'Cartola', rep: 150 },
      { id: 'coroa', nome: 'Coroa', rep: 250 },
    ],
  },
  {
    id: 'expressao', nome: 'Expressão', itens: [
      { id: 'feliz', nome: 'Feliz' },
      { id: 'cool', nome: 'Descontraído' },
      { id: 'surpreso', nome: 'Surpreso' },
      { id: 'piscadela', nome: 'Piscadela', rep: 10 },
      { id: 'sono', nome: 'Com sono', rep: 10 },
      { id: 'zangado', nome: 'Zangado', rep: 25 },
      { id: 'apaixonado', nome: 'Apaixonado', rep: 50 },
    ],
  },
  {
    id: 'cara', nome: 'Cara', itens: [
      { id: 'nenhum', nome: 'Normal' },
      { id: 'oculos', nome: 'Óculos' },
      { id: 'sardas', nome: 'Sardas' },
      { id: 'sol', nome: 'Óculos de sol', rep: 25 },
      { id: 'bigode', nome: 'Bigode', rep: 50 },
      { id: 'barba', nome: 'Barba', rep: 75 },
      { id: 'monoculo', nome: 'Monóculo', rep: 150 },
    ],
  },
  {
    id: 'roupa', nome: 'Roupa', itens: [
      { id: 'nenhum', nome: 'Sem roupa' },
      { id: 'riscas', nome: 'Camisola às riscas' },
      { id: 'cachecol', nome: 'Cachecol' },
      { id: 'laco', nome: 'Laço', rep: 10 },
      { id: 'colete', nome: 'Colete refletor', rep: 25 },
      { id: 'impermeavel', nome: 'Impermeável', rep: 50 },
      { id: 'casaco', nome: 'Casaco de revisor', rep: 100 },
      { id: 'capa', nome: 'Capa de herói', rep: 200 },
    ],
  },
  {
    id: 'calcado', nome: 'Calçado', itens: [
      { id: 'nenhum', nome: 'Descalço' },
      { id: 'ténis', nome: 'Ténis' },
      { id: 'chinelos', nome: 'Chinelos' },
      { id: 'galochas', nome: 'Galochas', rep: 25 },
      { id: 'botas', nome: 'Botas', rep: 50 },
      { id: 'patins', nome: 'Patins', rep: 100 },
    ],
  },
  {
    id: 'mao', nome: 'Mão', itens: [
      { id: 'nenhum', nome: 'Livre' },
      { id: 'bilhete', nome: 'Bilhete' },
      { id: 'cafe', nome: 'Café' },
      { id: 'flor', nome: 'Flor', rep: 10 },
      { id: 'balao', nome: 'Balão', rep: 10 },
      { id: 'telemovel', nome: 'Telemóvel', rep: 25 },
      { id: 'mapa', nome: 'Mapa', rep: 40 },
      { id: 'guardachuva', nome: 'Guarda-chuva', rep: 50 },
      { id: 'megafone', nome: 'Megafone', rep: 100 },
      { id: 'trofeu', nome: 'Troféu', rep: 200 },
    ],
  },
  {
    id: 'fundo', nome: 'Fundo', itens: [
      { id: 'auto', nome: 'Cor da personagem' },
      { id: 'menta', nome: 'Menta' },
      { id: 'ceu', nome: 'Céu' },
      { id: 'sol', nome: 'Sol' },
      { id: 'lilas', nome: 'Lilás', rep: 10 },
      { id: 'noite', nome: 'Noite', rep: 50 },
      { id: 'raios', nome: 'Raios', rep: 100 },
    ],
  },
];

export const AVATAR_PADRAO: ConfigAvatar = {
  personagem: 'paro', cor: 'laranja', chapeu: 'boné', expressao: 'feliz', cara: 'nenhum', roupa: 'nenhum', calcado: 'ténis', mao: 'nenhum', fundo: 'auto',
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

/**
 * Confirma uma escolha de avatar: as peças indicadas têm de existir e a reputação tem de chegar.
 * Categorias em falta ficam com o valor padrão (versões antigas da app não conhecem as novas).
 */
export function validarAvatar(entrada: unknown, reputacao: number): { ok: true; config: ConfigAvatar } | { ok: false; erro: string } {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, erro: 'Avatar inválido.' };
  const config = { ...AVATAR_PADRAO };
  for (const cat of CATEGORIAS_AVATAR) {
    const v = (entrada as Record<string, unknown>)[cat.id];
    if (v === undefined) continue;
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
