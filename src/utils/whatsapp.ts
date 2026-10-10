// Textos para o canal da PAROU no WhatsApp. O WhatsApp não deixa programas publicarem em canais, por
// isso o painel de administração prepara o texto e a pessoa só copia e cola. Formato do WhatsApp:
// *negrito* e _itálico_ (os asteriscos têm de ficar colados ao texto).
import type { CentralAlert, CentralAlertType } from '../types/alerts';

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

const TIPOS_IMPORTANTES: CentralAlertType[] = ['greve', 'interrupção', 'linha suspensa', 'paragem encerrada', 'cancelamento', 'desvio'];

/** Avisos que valem a pena no canal: graves, ou dos tipos que mudam mesmo a viagem de alguém. */
export function eImportante(a: CentralAlert): boolean {
  return a.severity === 'Grave' || TIPOS_IMPORTANTES.includes(a.tipo);
}

/** Ordem: ativos antes dos que ainda vão começar, depois os mais graves e os mais recentes. */
export function ordenarAvisos(lista: CentralAlert[]): CentralAlert[] {
  const peso = (a: CentralAlert) => (a.status === 'Ativo' ? 0 : 1) * 10 + (a.severity === 'Grave' ? 0 : a.severity === 'Moderada' ? 1 : 2);
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
