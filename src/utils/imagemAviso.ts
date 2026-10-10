// Imagem fixa para cada tipo de aviso do canal do WhatsApp (public/avisos/<id>.jpg, 1080×1080).
// A imagem diz de que tipo é o aviso (incêndio, desvio, greve…); os pormenores vão no texto.
import type { CentralAlert } from '../types/alerts';

export type CategoriaAviso =
  | 'incendio' | 'acidente' | 'sismo' | 'tempo' | 'greve' | 'desvio' | 'obras'
  | 'interrupcao' | 'suspensa' | 'paragem' | 'atraso' | 'horario' | 'reforco' | 'evento' | 'info';

export const CATEGORIAS_AVISO: Array<{ id: CategoriaAviso; nome: string }> = [
  { id: 'incendio', nome: 'Incêndio' },
  { id: 'acidente', nome: 'Acidente' },
  { id: 'sismo', nome: 'Sismo' },
  { id: 'tempo', nome: 'Mau tempo' },
  { id: 'greve', nome: 'Greve' },
  { id: 'desvio', nome: 'Desvio' },
  { id: 'obras', nome: 'Obras' },
  { id: 'interrupcao', nome: 'Interrupção' },
  { id: 'suspensa', nome: 'Serviço suspenso' },
  { id: 'paragem', nome: 'Paragem encerrada' },
  { id: 'atraso', nome: 'Atrasos' },
  { id: 'horario', nome: 'Horários' },
  { id: 'reforco', nome: 'Reforço de serviço' },
  { id: 'evento', nome: 'Evento' },
  { id: 'info', nome: 'Aviso geral' },
];

export const imagemDaCategoria = (c: CategoriaAviso): string => `/avisos/${c}.jpg`;
export const nomeDaCategoria = (c: CategoriaAviso): string => CATEGORIAS_AVISO.find((x) => x.id === c)?.nome || 'Aviso';

const semAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Causas que merecem imagem própria, procuradas no título e no início da descrição.
const CAUSAS: Array<[CategoriaAviso, RegExp]> = [
  ['greve', /\b(greve|paralisacao)/],
  ['incendio', /\b(incendio|incendios|fogo|chamas)\b/],
  ['acidente', /\b(acidente|colisao|abalroamento|atropelamento|capotamento)/],
  ['sismo', /\b(sismo|sismos|terramoto|tremor de terra)\b/],
  ['tempo', /\b(chuva|chuvas|vento|temporal|tempestade|nevoeiro|neve|inundacao|inundacoes|cheia|cheias|trovoada|ondulacao|calor extremo|aviso (amarelo|laranja|vermelho)|mau tempo)\b/],
];
const EVENTO = /\b(festa|festas|festival|feira|romaria|procissao|maratona|meia maratona|corrida|concerto|jogo de|manifestacao|desfile|arraial|comemoracoes|cortejo)\b/;
const CONDICIONAMENTO = /\b(condicionamento|condicionado|trabalhos|obras|pavimentacao|repavimentacao)\b/;

/** Escolhe a imagem de um aviso: primeiro o que o texto diz (incêndio, acidente…), depois o tipo oficial. */
export function categoriaDoAviso(a: Pick<CentralAlert, 'tipo'> & { 'título'?: string; 'descrição'?: string }): CategoriaAviso {
  const titulo = semAcentos(a['título'] || '');
  const inicio = semAcentos((a['descrição'] || '').slice(0, 240));
  const tipo = a.tipo;
  // Um desvio por causa de obras continua a ser um desvio; só os avisos genéricos olham para a causa.
  const generico = tipo === 'interrupção' || tipo === 'atraso significativo' || tipo === 'outros alertas oficiais' || tipo === 'cancelamento' || tipo === 'linha suspensa';

  for (const [cat, re] of CAUSAS) {
    if (re.test(titulo)) return cat;
    if ((generico || cat === 'greve') && re.test(inicio)) return cat;
  }

  switch (tipo) {
    case 'greve': return 'greve';
    case 'interrupção': return 'interrupcao';
    case 'linha suspensa':
    case 'cancelamento': return 'suspensa';
    case 'paragem encerrada': return 'paragem';
    case 'desvio':
    case 'alteração de percurso': return 'desvio';
    case 'obras': return 'obras';
    case 'reforço de serviço': return 'reforco';
    case 'novo horário':
    case 'alteração de horário': return 'horario';
    case 'atraso significativo':
      if (EVENTO.test(titulo)) return 'evento';
      return CONDICIONAMENTO.test(titulo) || CONDICIONAMENTO.test(inicio) ? 'obras' : 'atraso';
    default:
      if (EVENTO.test(titulo)) return 'evento';
      if (/\b(encerrad[oa]s?|fechad[oa]s?)\b/.test(titulo)) return 'paragem';
      if (/\b(desvio|percurso|itinerario)\b/.test(titulo)) return 'desvio';
      if (CONDICIONAMENTO.test(titulo)) return 'obras';
      if (/\b(horario|horarios)\b/.test(titulo)) return 'horario';
      return 'info';
  }
}
