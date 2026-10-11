// Textos das publicações automáticas da Comunidade (avisos importantes). Sem base de dados nem datas aqui,
// para poderem ser testados à parte. Escrevem-se na voz do Criador: diretos, em português de Portugal, sem alarmismo
// e sem inventar nada — só o que a fonte oficial (Proteção Civil, IPMA, operadores) diz, mais dicas de segurança conhecidas.

export const MAX_TITULO = 90;
export const MAX_TEXTO = 600;

export interface PostAviso {
  titulo: string;
  texto: string;
  /** Imagem da PAROU (public/avisos/<categoria>.jpg) */
  imagem: string;
}

const semAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function cortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const ultimo = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('\n'));
  return `${(ultimo > max * 0.6 ? corte.slice(0, ultimo + 1) : corte).trimEnd()}${ultimo > max * 0.6 ? '' : '…'}`;
}

function juntar(nomes: string[]): string {
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] || '';
}

// ------------------------------------------------------------------ incêndios
export interface IncendioGrave {
  concelho: string;
  distrito: string;
  humanos: number;
  terrestres: number;
  aereos: number;
}

const DICAS_INCENDIO =
  'Se estás perto: liga 112 se vires fumo ou chamas e segue sempre as indicações das autoridades. Sai da zona se to pedirem, não tentes combater o fogo e deixa as estradas livres para os meios de socorro. Não vás ver o fogo. Em casa, fecha portas e janelas por causa do fumo.';

export function postIncendios(lista: IncendioGrave[]): PostAviso {
  const ordenados = [...lista].sort((a, b) => b.humanos - a.humanos).slice(0, 3);
  const meios = (i: IncendioGrave) =>
    `${i.humanos} operacionais${i.terrestres ? `, ${i.terrestres} veículos` : ''}${i.aereos ? ` e ${i.aereos} meios aéreos` : ''}`;
  let titulo: string;
  let abertura: string;
  if (ordenados.length === 1) {
    const i = ordenados[0];
    titulo = `Incêndio grave · ${i.concelho}`;
    abertura = `Incêndio com muitos meios no terreno em ${i.concelho}${i.distrito && i.distrito !== i.concelho ? ` (${i.distrito})` : ''}: ${meios(i)} (Proteção Civil / Fogos.pt).`;
  } else {
    titulo = `Incêndios graves · ${juntar(ordenados.map((i) => i.concelho))}`;
    abertura = `Incêndios com muitos meios no terreno (Proteção Civil / Fogos.pt):\n${ordenados.map((i) => `• ${i.concelho}: ${meios(i)}`).join('\n')}`;
  }
  const texto = `${abertura}\n\n${DICAS_INCENDIO}\n\nPartilha com quem esteja na zona. O mapa em direto está na PAROU.`;
  return { titulo: cortar(titulo, MAX_TITULO), texto: cortar(texto, MAX_TEXTO), imagem: '/avisos/incendio.jpg' };
}

// ------------------------------------------------------------------ aviso vermelho (IPMA)
const DICAS_TEMPO: Array<[RegExp, string]> = [
  [/vento/, 'Afasta-te de árvores, andaimes e telhados soltos e recolhe o que possa voar.'],
  [/precipita|chuva/, 'Evita zonas baixas e passagens inundadas, a pé ou de carro, e não estaciones junto a ribeiras.'],
  [/trovoada/, 'Abriga-te dentro de edifícios e afasta-te de árvores isoladas e de zonas abertas.'],
  [/quente|calor/, 'Bebe água com frequência, evita esforços nas horas de mais calor e nunca deixes pessoas ou animais dentro do carro.'],
  [/frio/, 'Agasalha-te bem e cuida de quem é mais vulnerável, em especial idosos e crianças.'],
  [/neve/, 'Evita estradas de montanha; se tiveres mesmo de ir, leva correntes e agasalhos.'],
  [/nevoeiro/, 'Reduz a velocidade, usa as luzes de nevoeiro e aumenta a distância de segurança.'],
  [/agita|maritima/, 'Afasta-te da costa, de molhes e de arribas, e não vás para o mar.'],
];

export function dicasTempo(tipos: string[]): string[] {
  const dicas: string[] = [];
  for (const [re, dica] of DICAS_TEMPO) if (tipos.some((t) => re.test(semAcentos(t))) && !dicas.includes(dica)) dicas.push(dica);
  return dicas;
}

export function postAvisoVermelho(o: { distritos: string[]; tipos: string[]; quando?: string }): PostAviso {
  const distritos = Array.from(new Set(o.distritos));
  const tipos = Array.from(new Set(o.tipos.filter(Boolean)));
  const lista = distritos.length > 6 ? `${distritos.slice(0, 6).join(', ')} e mais ${distritos.length - 6}` : juntar(distritos);
  const dicas = dicasTempo(tipos).slice(0, 3).join(' ');
  const texto = [
    `O IPMA emitiu aviso vermelho, o nível mais grave, para ${lista}${tipos.length ? `: ${tipos.map((t) => t.toLowerCase()).join(', ')}` : ''}.${o.quando ? ` ${o.quando.charAt(0).toUpperCase()}${o.quando.slice(1)}.` : ''}`,
    `${dicas ? `${dicas} ` : ''}Em caso de emergência, liga 112.`,
    'Se puderes, adia deslocações: os transportes podem ser afetados. Acompanha os Alertas na PAROU.',
  ].join('\n\n');
  const titulo = `Aviso vermelho do IPMA · ${distritos.length > 3 ? `${distritos.slice(0, 3).join(', ')}…` : distritos.join(', ')}`;
  return { titulo: cortar(titulo, MAX_TITULO), texto: cortar(texto, MAX_TEXTO), imagem: '/avisos/tempo.jpg' };
}

// ------------------------------------------------------------------ greves
export function postGreve(o: { titulo: string; corpo: string }): PostAviso {
  const corpo = o.corpo.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '').replace(/\s·\s([^·]+)$/, ' ($1)');
  const texto = `${corpo}.\n\nSe vais precisar deste transporte, confirma o estado da tua linha na PAROU antes de saíres de casa e vê as alternativas. Os horários e os avisos dos operadores estão na página de greves.`;
  return { titulo: cortar(o.titulo, MAX_TITULO), texto: cortar(texto, MAX_TEXTO), imagem: '/avisos/greve.jpg' };
}

// ------------------------------------------------------------------ feriados
export function postFeriado(o: { nome: string; diaSemana: string }): PostAviso {
  const texto = `Amanhã, ${o.diaSemana}, é feriado nacional (${o.nome}).\n\nOs transportes costumam seguir o horário de domingos e feriados, por isso confirma a tua linha na PAROU antes de saíres: os horários seguem os dados oficiais de cada operador. Se houver greves ou alterações, vão aparecer nos Alertas.\n\nBom feriado!`;
  return { titulo: cortar(`Amanhã é feriado · ${o.nome}`, MAX_TITULO), texto: cortar(texto, MAX_TEXTO), imagem: '/avisos/horario.jpg' };
}
