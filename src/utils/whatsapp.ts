// Textos para o canal da PAROU no WhatsApp. O WhatsApp não deixa programas publicarem em canais, por
// isso o painel de administração prepara o texto e a pessoa só copia e cola. Formato do WhatsApp:
// *negrito* e _itálico_ (os asteriscos têm de ficar colados ao texto).
import type { CentralAlert, CentralAlertType } from '../types/alerts';
import { categoriaDoAviso, type CategoriaAviso } from './imagemAviso';
import type { AvisoCanal } from '../services/avisosCanal';

const EMOJI: Record<CentralAlertType, string> = {
  greve: '🚨',
  'interrupção': '🚨',
  'atraso significativo': '⚠️',
  'alteração de horário': '🕒',
  'alteração de percurso': '🔀',
  'paragem encerrada': '🚏',
  'linha suspensa': '⛔',
  desvio: '🔀',
  obras: '🛠️',
  'reforço de serviço': '✅',
  'novo horário': '🕒',
  cancelamento: '⛔',
  'outros alertas oficiais': 'ℹ️',
};

// Operadores com muita gente: um problema aqui afeta milhares de pessoas, ao contrário de uma linha de bairro.
const OPERADOR_GRANDE = /metro|\bcp\b|comboios|fertagus|transtejo|soflusa|stcp|carris(?! metropolitana)|ipma|prote[cç][aã]o civil|fogos/i;
const MAXIMO_IMPORTANTES = 5;

/**
 * Só o que merece ir para o canal: greves, incêndios, acidentes, sismos, e interrupções ou avisos graves
 * que afetam muita gente. Desvios, obras, horários e reforços de uma linha ficam de fora (isso é para a app).
 */
export function eImportante(a: CentralAlert): boolean {
  if (a.status === 'Terminado' || a.status === 'Cancelado') return false;
  const cat = categoriaDoAviso(a);
  if (cat === 'greve') return true;
  if (cat === 'incendio' || cat === 'acidente' || cat === 'sismo') return a.status === 'Ativo';
  if (a.severity !== 'Grave') return false;
  return OPERADOR_GRANDE.test(a.operador || '') || (a.linhas?.length || 0) >= 3 || cat === 'tempo';
}

const semAcentos = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Identifica o mesmo aviso mesmo que chegue duas vezes da fonte (ids diferentes, texto igual). */
export const chaveDoAviso = (a: CentralAlert): string => `${a.tipo}|${semAcentos(a['título'])}|${semAcentos(a.operador)}`;

/** Tira os avisos repetidos (a mesma notícia chega por vezes duas vezes da fonte). */
export function semRepetidos(lista: CentralAlert[]): CentralAlert[] {
  const vistos = new Set<string>();
  return lista.filter((a) => {
    const chave = chaveDoAviso(a);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

// ---- Avisos que o servidor já escolheu como importantes (greves, mau tempo grave, incêndios…) ----
export const PREFIXO_CANAL = 'canal:';
export const eDoCanal = (a: CentralAlert): boolean => a.id.startsWith(PREFIXO_CANAL);

const CATEGORIAS_CANAL: CategoriaAviso[] = ['incendio', 'acidente', 'sismo', 'tempo', 'greve', 'desvio', 'obras', 'interrupcao', 'suspensa', 'paragem', 'atraso', 'horario', 'reforco', 'evento', 'info'];

/** Põe um aviso do canal no mesmo formato dos outros, para usar os mesmos cartões. */
export function avisoDoCanal(c: AvisoCanal, agora = new Date().toISOString()): CentralAlert {
  const categoria = CATEGORIAS_CANAL.includes(c.categoria as CategoriaAviso) ? (c.categoria as CategoriaAviso) : 'info';
  return {
    id: `${PREFIXO_CANAL}${c.id}`,
    external_id: c.id,
    tipo: categoria === 'greve' ? 'greve' : 'outros alertas oficiais',
    'título': c.titulo,
    'descrição': c.corpo,
    operador: '',
    linhas: [],
    paragens: [],
    'região': '',
    'municípios': [],
    start_datetime: agora,
    end_datetime: null,
    published_datetime: agora,
    source: `${PREFIXO_CANAL}${categoria}`,
    source_url: '',
    last_update: agora,
    status: 'Ativo',
    severity: 'Grave',
  };
}

/** Imagem de partida de um aviso: a que o servidor indicou (avisos do canal) ou a que o texto sugere. */
export function categoriaDoPainel(a: CentralAlert): CategoriaAviso {
  if (eDoCanal(a)) {
    const c = a.source.slice(PREFIXO_CANAL.length) as CategoriaAviso;
    if (CATEGORIAS_CANAL.includes(c)) return c;
  }
  return categoriaDoAviso(a);
}

const EMOJI_CANAL: Partial<Record<CategoriaAviso, string>> = { tempo: '⚠️', incendio: '🔥', sismo: '🌍', acidente: '🚧' };

/** Os poucos avisos que valem mesmo a pena publicar, do mais grave para o menos grave. */
export function avisosImportantes(lista: CentralAlert[]): CentralAlert[] {
  return ordenarAvisos(semRepetidos(lista).filter(eImportante)).slice(0, MAXIMO_IMPORTANTES);
}

/** Ordem: os mais graves primeiro; a igual gravidade, os ativos antes dos que ainda vão começar e os mais recentes antes. */
export function ordenarAvisos(lista: CentralAlert[]): CentralAlert[] {
  const peso = (a: CentralAlert) => (a.severity === 'Grave' ? 0 : a.severity === 'Moderada' ? 1 : 2) * 10 + (a.status === 'Ativo' ? 0 : 1);
  return [...lista].sort((x, y) => peso(x) - peso(y) || String(y.published_datetime).localeCompare(String(x.published_datetime)));
}

const fmtData = (iso: string, comHora: boolean): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const opcoes: Intl.DateTimeFormatOptions = comHora
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }
    : { day: '2-digit', month: '2-digit', timeZone: 'Europe/Lisbon' };
  return new Intl.DateTimeFormat('pt-PT', opcoes).format(d).replace(',', ' às');
};

/** "Até 16/10 às 18:00", "A partir de 15/10 às 06:00", "De 15/10 às 06:00 a 16/10 às 18:00". */
export function quandoDoAviso(a: CentralAlert): string {
  const ini = a.start_datetime ? fmtData(a.start_datetime, true) : '';
  const fim = a.end_datetime ? fmtData(a.end_datetime, true) : '';
  if (a.status === 'Ativo') return fim ? `Até ${fim}` : 'Em curso';
  if (ini && fim) return `De ${ini} a ${fim}`;
  return ini ? `A partir de ${ini}` : '';
}

/** Corta no fim de uma frase ou palavra, sem passar do limite. */
export function resumir(texto: string, max = 300): string {
  const limpo = (texto || '').replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const frase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '));
  if (frase > max * 0.5) return corte.slice(0, frase + 1);
  return corte.slice(0, corte.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
}

/** O texto do aviso pronto a colar no WhatsApp (a pessoa ainda o pode alterar). */
export function textoDoAviso(a: CentralAlert): string {
  if (eDoCanal(a)) {
    const emoji = EMOJI_CANAL[categoriaDoPainel(a)] || '🚨';
    const corpo = (a['descrição'] || '').replace(/\s+/g, ' ').trim();
    return [`${emoji} *${(a['título'] || '').replace(/\*/g, '').trim()}*`, corpo, '', 'Mais avisos em parou.pt/alertas'].filter((l, i) => i !== 1 || l).join('\n');
  }
  const linhas: string[] = [];
  linhas.push(`${EMOJI[a.tipo] || 'ℹ️'} *${(a['título'] || '').replace(/\*/g, '').trim()}*`);
  const onde = [a.operador, a.linhas && a.linhas.length ? `linha${a.linhas.length > 1 ? 's' : ''} ${a.linhas.slice(0, 6).join(', ')}` : ''].filter(Boolean).join(' · ');
  if (onde) linhas.push(onde);
  const quando = quandoDoAviso(a);
  if (quando) linhas.push(quando);
  const corpo = resumir(a['descrição'] || '');
  if (corpo && corpo.toLowerCase() !== (a['título'] || '').toLowerCase()) linhas.push('', corpo);
  linhas.push('', 'Mais avisos em parou.pt/alertas');
  return linhas.join('\n');
}

export type TipoNovidade = 'novidade' | 'aviso' | 'dica';
const CABECA: Record<TipoNovidade, string> = { novidade: '📣', aviso: '🚨', dica: '💡' };

/** Novidade, aviso ou dica escrita à mão. */
export function textoDeNovidade(tipo: TipoNovidade, titulo: string, texto: string): string {
  const t = titulo.replace(/\*/g, '').trim();
  const corpo = texto.trim();
  const cab = t ? `${CABECA[tipo]} *${t}*` : CABECA[tipo];
  return [cab, corpo ? '' : null, corpo || null, '', 'parou.pt'].filter((x) => x !== null).join('\n');
}

export const RASCUNHOS: Array<{ nome: string; tipo: TipoNovidade; titulo: string; texto: string }> = [
  {
    nome: 'Comunidade',
    tipo: 'novidade',
    titulo: 'Já há Comunidade na PAROU',
    texto: 'Perguntas, queixas e elogios sobre os transportes, sem anúncios. Pergunta como está a tua linha, avisa do que está mal, agradece a quem ajudou.\n\nParticipar dá reputação, e a reputação desbloqueia personagens e peças para o teu avatar.\n\nparou.pt/comunidade',
  },
  {
    nome: 'Avatares',
    tipo: 'novidade',
    titulo: 'Escolhe a tua personagem',
    texto: 'Há 7 personagens para o teu avatar: Paro, Estrela e Gato desde o início, e o Cato, o Camaleão, o Autocarro e a Paragem à medida que ganhas reputação. Todas se vestem com chapéus, óculos, roupas e objetos.',
  },
  {
    nome: 'Dica',
    tipo: 'dica',
    titulo: 'Avisos da tua linha',
    texto: 'Guarda as tuas paragens e linhas nos favoritos e ativa os avisos: só recebes o que te interessa.',
  },
];
