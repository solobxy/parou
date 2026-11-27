// Imagem de cada aviso para o canal do WhatsApp (1080×1080), desenhada no momento a partir do próprio aviso:
// zona em grande (PORTO, LISBOA, BRAGA…), silhueta da cidade, o transporte desenhado atrás (metro, autocarro,
// comboio, barco) e a cor e o ícone do tipo de aviso (greve, avaria, obras, desvio, mau tempo, serviço normal…).
// As funções de cima são puras (testadas sem browser); o desenho usa a Canvas 2D do browser.
// Ícones: Lucide (licença ISC).
import type { CentralAlert } from '../types/alerts';
import { categoriaDoAviso, type CategoriaAviso } from './imagemAviso';

export const LADO = 1080;

const semAc = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------------------------------------
// Zona
// ---------------------------------------------------------------------------------------------------------
export type Silhueta = 'porto' | 'lisboa' | 'braga' | 'coimbra' | 'norte' | 'centro' | 'alentejo' | 'algarve' | 'acores' | 'madeira' | 'portugal';
export interface ZonaCartaz { nome: string; silhueta: Silhueta }

const Z = (nome: string, silhueta: Silhueta): ZonaCartaz => ({ nome, silhueta });

// Operadores com zona certa (o texto da notícia às vezes engana a região)
const POR_OPERADOR: Array<[RegExp, ZonaCartaz]> = [
  [/\b(metro do porto|stcp|unir|via porto)\b/, Z('PORTO', 'porto')],
  [/\b(carris metropolitana|carris|metro de lisboa|metropolitano de lisboa|mobicascais|transtejo|soflusa|ttsl|fertagus|mts|metro sul do tejo|tcb|transportes colectivos do barreiro|scotturb|barraqueiro)\b/, Z('LISBOA', 'lisboa')],
  [/\btuba\b/, Z('BARCELOS', 'norte')],
  [/\btub\b/, Z('BRAGA', 'braga')],
  [/\bguimabus\b/, Z('GUIMARÃES', 'norte')],
  [/\bmobiave\b/, Z('FAMALICÃO', 'norte')],
  [/\b(smtuc|metro mondego)\b/, Z('COIMBRA', 'coimbra')],
  [/\b(horarios do funchal|sam madeira|rodoeste)\b/, Z('MADEIRA', 'madeira')],
  [/\b(azoresbus|crp|evt|transmacor)\b/, Z('AÇORES', 'acores')],
  [/\b(vamus|proximo)\b/, Z('ALGARVE', 'algarve')],
];

// Cidades (município) -> nome e desenho
const CIDADES: Array<[RegExp, ZonaCartaz]> = [
  [/\b(ponta delgada|angra do heroismo|horta|ribeira grande|lagoa \(acores\)|acores|azores)\b/, Z('AÇORES', 'acores')],
  [/\b(funchal|madeira|machico|santa cruz|camara de lobos)\b/, Z('MADEIRA', 'madeira')],
  [/\bbraga\b/, Z('BRAGA', 'braga')],
  [/\bcoimbra\b/, Z('COIMBRA', 'coimbra')],
  [/\bguimaraes\b/, Z('GUIMARÃES', 'norte')],
  [/\bbarcelos\b/, Z('BARCELOS', 'norte')],
  [/\b(vila nova de famalicao|famalicao)\b/, Z('FAMALICÃO', 'norte')],
  [/\bviana do castelo\b/, Z('VIANA DO CASTELO', 'norte')],
  [/\bvila real\b/, Z('VILA REAL', 'norte')],
  [/\bbraganca\b/, Z('BRAGANÇA', 'norte')],
  [/\baveiro\b/, Z('AVEIRO', 'centro')],
  [/\bleiria\b/, Z('LEIRIA', 'centro')],
  [/\bviseu\b/, Z('VISEU', 'centro')],
  [/\bcastelo branco\b/, Z('CASTELO BRANCO', 'centro')],
  [/\bguarda\b/, Z('GUARDA', 'centro')],
  [/\bevora\b/, Z('ÉVORA', 'alentejo')],
  [/\bbeja\b/, Z('BEJA', 'alentejo')],
  [/\bportalegre\b/, Z('PORTALEGRE', 'alentejo')],
  [/\b(faro|portimao|lagos|loule|albufeira|tavira|olhao)\b/, Z('ALGARVE', 'algarve')],
];

const AMP = /\b(porto|matosinhos|maia|vila nova de gaia|gaia|gondomar|valongo|vila do conde|povoa de varzim|trofa|santo tirso|espinho|paredes|santa maria da feira|oliveira de azemeis|sao joao da madeira|arouca|vale de cambra)\b/;
const AML = /\b(lisboa|amadora|odivelas|loures|oeiras|cascais|sintra|almada|seixal|barreiro|moita|montijo|alcochete|palmela|setubal|sesimbra|vila franca de xira|mafra)\b/;

/** Zona que aparece em grande na imagem. */
export function zonaDoAviso(a: Pick<CentralAlert, 'operador'> & { 'região'?: string; 'municípios'?: string[] }): ZonaCartaz {
  const op = semAc(a.operador);
  const regiao = semAc(a['região'] || '');
  const munis = (a['municípios'] || []).map(semAc).filter((m) => m && m !== 'portugal');
  const cp = /\b(cp|comboios de portugal|flixbus|rede expressos)\b/.test(op);
  if (!cp) for (const [re, z] of POR_OPERADOR) if (re.test(op)) return z;
  if (/acores/.test(regiao)) return Z('AÇORES', 'acores');
  if (/madeira/.test(regiao)) return Z('MADEIRA', 'madeira');
  if (/metropolitana do porto/.test(regiao)) return Z('PORTO', 'porto');
  if (/metropolitana de lisboa/.test(regiao)) return Z('LISBOA', 'lisboa');
  if (regiao === 'nacional' || regiao === 'portugal') {
    // nacional mas só com municípios de uma área (ex.: Lisboa e Cascais) -> essa área
    if (munis.length && munis.every((m) => AMP.test(m))) return Z('PORTO', 'porto');
    if (munis.length && munis.every((m) => AML.test(m))) return Z('LISBOA', 'lisboa');
    return Z('PORTUGAL', 'portugal');
  }
  if (munis.length === 1 || (munis.length > 1 && !cp)) {
    for (const [re, z] of CIDADES) if (re.test(munis[0])) return z;
    if (AMP.test(munis[0])) return Z('PORTO', 'porto');
    if (AML.test(munis[0])) return Z('LISBOA', 'lisboa');
  }
  for (const [re, z] of CIDADES) if (re.test(regiao)) return z;
  if (/norte|minho|cavado|douro|tras-os-montes|ave\b|tamega/.test(regiao)) return Z('NORTE', 'norte');
  if (/centro|beira|oeste|dao|leiria|aveiro/.test(regiao)) return Z('CENTRO', 'centro');
  if (/alentejo|lezíria|leziria/.test(regiao)) return Z('ALENTEJO', 'alentejo');
  if (/algarve/.test(regiao)) return Z('ALGARVE', 'algarve');
  if (munis.length > 1) return Z('PORTUGAL', 'portugal');
  return Z('PORTUGAL', 'portugal');
}

// ---------------------------------------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------------------------------------
export type ModoCartaz = 'metro' | 'autocarro' | 'comboio' | 'barco';

export function modoDoAviso(a: Pick<CentralAlert, 'operador'> & { 'título'?: string; 'descrição'?: string }): ModoCartaz {
  const op = semAc(a.operador);
  if (/\b(metro do porto|metro de lisboa|metropolitano|mts|metro sul do tejo)\b/.test(op)) return 'metro';
  if (/\b(cp|comboios de portugal|fertagus)\b/.test(op)) return 'comboio';
  if (/\b(transtejo|soflusa|ttsl|atlantic ferries|transmacor|atlanticoline|travessias)\b/.test(op)) return 'barco';
  const t = semAc(`${a['título'] || ''}`);
  if (/\b(comboio|comboios|ferrovia|linha do norte|linha de cascais|linha de sintra)\b/.test(t)) return 'comboio';
  if (/\b(barco|barcos|ferry|travessia fluvial|catamara)\b/.test(t)) return 'barco';
  if (/\bmetro\b/.test(t) && !/metro mondego/.test(t)) return 'metro';
  return 'autocarro';
}

// ---------------------------------------------------------------------------------------------------------
// Tipo do aviso: palavra, cor e ícone
// ---------------------------------------------------------------------------------------------------------
export type IconeCartaz = 'megafone' | 'chave' | 'triangulo' | 'relogio' | 'cone' | 'desvio' | 'proibido' | 'calendario'
  | 'mais' | 'estrela' | 'chuva' | 'chama' | 'sismo' | 'info' | 'visto' | 'octogono' | 'raio';

export interface TipoCartaz { rotulo: string; cor: string; icone: IconeCartaz }

const TIPOS: Record<CategoriaAviso, TipoCartaz> = {
  greve: { rotulo: 'GREVE', cor: '#F5B70A', icone: 'megafone' },
  incendio: { rotulo: 'INCÊNDIO', cor: '#FF5A2A', icone: 'chama' },
  acidente: { rotulo: 'ACIDENTE', cor: '#FF4D3D', icone: 'triangulo' },
  sismo: { rotulo: 'SISMO', cor: '#FF4D3D', icone: 'sismo' },
  tempo: { rotulo: 'MAU TEMPO', cor: '#5AC8FA', icone: 'chuva' },
  desvio: { rotulo: 'DESVIO', cor: '#FFB020', icone: 'desvio' },
  obras: { rotulo: 'OBRAS', cor: '#FF8A1F', icone: 'cone' },
  interrupcao: { rotulo: 'INTERRUPÇÃO', cor: '#FF4D3D', icone: 'octogono' },
  suspensa: { rotulo: 'SUSPENSO', cor: '#FF4D3D', icone: 'octogono' },
  paragem: { rotulo: 'PARAGEM FECHADA', cor: '#FF6B4A', icone: 'proibido' },
  atraso: { rotulo: 'ATRASOS', cor: '#FF8A1F', icone: 'relogio' },
  horario: { rotulo: 'HORÁRIOS', cor: '#4DA3FF', icone: 'calendario' },
  reforco: { rotulo: 'REFORÇO', cor: '#3DDC84', icone: 'mais' },
  evento: { rotulo: 'EVENTO', cor: '#B98CFF', icone: 'estrela' },
  info: { rotulo: 'AVISO', cor: '#FF6B1A', icone: 'info' },
};

const RE_NORMAL = /\b(normalizad[oa]s?|normalizou|retomad[oa]|retoma a circulacao|retomou|reposta a circulacao|reaberto|reaberta|ja circula|circulacao normal|servico normal)\b/;
const RE_AVARIA = /\b(avaria|avariad[oa]|falha tecnica|problema tecnico|incidente tecnico|falha de energia|falta de energia|catenaria|sinalizacao)\b/;

/** Palavra grande, cor e ícone. O texto manda (avaria, serviço normal) sobre o tipo oficial. */
export function tipoDoCartaz(a: Parameters<typeof categoriaDoAviso>[0] & { status?: string; plenario?: boolean }, categoria?: CategoriaAviso): TipoCartaz {
  const cat = categoria || categoriaDoAviso(a);
  const t = semAc(`${a['título'] || ''} ${(a['descrição'] || '').slice(0, 200)}`);
  if (cat === 'greve' && a.status === 'Cancelado') return { rotulo: 'GREVE DESCONVOCADA', cor: '#3DDC84', icone: 'visto' };
  if (a.plenario) return { rotulo: 'PLENÁRIO', cor: '#F5B70A', icone: 'megafone' };
  if (!categoria || categoria === categoriaDoAviso(a)) {
    if (RE_NORMAL.test(semAc(a['título'] || ''))) return { rotulo: 'SERVIÇO NORMAL', cor: '#3DDC84', icone: 'visto' };
    if (cat !== 'greve' && cat !== 'incendio' && cat !== 'acidente' && RE_AVARIA.test(t)) {
      return /energia|catenaria/.test(t) ? { rotulo: 'AVARIA', cor: '#FF4D3D', icone: 'raio' } : { rotulo: 'AVARIA', cor: '#FF4D3D', icone: 'chave' };
    }
  }
  return TIPOS[cat] || TIPOS.info;
}

// ---------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

function partesLisboa(iso: string): { ano: number; mes: number; dia: number; hora: number; min: number; sem: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const sem = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(String(p.weekday));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour % 24, min: +p.minute, sem };
}

const dd = (n: number) => String(n).padStart(2, '0');

/**
 * «SEX 27/11», «QUA 02/12 ATÉ 14:00», «02/12 → 05/12», «ATÉ SEX 27/11», «EM CURSO».
 * Sempre com o dia escrito (nunca «hoje» ou «amanhã»): a imagem fica no canal e na Comunidade e continua certa nos dias seguintes.
 */
export function quandoCurto(a: Pick<CentralAlert, 'status' | 'start_datetime'> & { end_datetime?: string | null }, _agora: Date = new Date()): string {
  const ini = a.start_datetime ? partesLisboa(a.start_datetime) : null;
  const fim0 = a.end_datetime ? partesLisboa(a.end_datetime) : null;
  // termina às 00:00 = acaba no dia anterior
  const fim = fim0 && fim0.hora === 0 && fim0.min === 0 && a.end_datetime ? partesLisboa(new Date(new Date(a.end_datetime).getTime() - 60000).toISOString()) : fim0;
  const mesmoDia = (x: typeof ini, y: typeof ini) => !!x && !!y && x.ano === y.ano && x.mes === y.mes && x.dia === y.dia;
  const dia = (x: NonNullable<typeof ini>) => `${DIAS[x.sem]} ${dd(x.dia)}/${dd(x.mes)}`;
  const ate = (x: NonNullable<typeof ini>) => (x.hora === 23 && x.min >= 59) ? '' : ` ATÉ ${dd(x.hora)}:${dd(x.min)}`;
  if (a.status === 'Ativo') {
    if (fim && ini && mesmoDia(ini, fim)) return `${dia(fim)}${ate(fim)}`;
    if (fim) return `ATÉ ${dia(fim)}`;
    return 'EM CURSO';
  }
  if (ini && fim && !mesmoDia(ini, fim)) return `${dd(ini.dia)}/${dd(ini.mes)} → ${dd(fim.dia)}/${dd(fim.mes)}`;
  if (ini && fim) return `${dia(ini)}${ate(fim)}`;
  if (ini) return a.status === 'Futuro' ? `A PARTIR DE ${dia(ini)}` : dia(ini);
  return '';
}

/** Linha de destaque: o que funciona numa greve ou as linhas afetadas. */
export function destaqueDoAviso(a: Pick<CentralAlert, 'linhas'> & { servico_na_greve?: CentralAlert['servico_na_greve'] }): { etiqueta: string; texto: string } | null {
  const s = a.servico_na_greve;
  if (s && (s.trocos?.length || s.linhas?.length)) {
    const partes = [
      ...(s.linhas || []).map((l) => `Linha ${l}`),
      ...(s.trocos || []).map(([x, y]) => `${x} ↔ ${y}`),
    ].slice(0, 2);
    return { etiqueta: 'SÓ FUNCIONA', texto: partes.join('\n') };
  }
  const linhas = (a.linhas || []).filter(Boolean);
  if (linhas.length) {
    const mostrar = linhas.slice(0, 8).join(', ') + (linhas.length > 8 ? ` e mais ${linhas.length - 8}` : '');
    return { etiqueta: linhas.length > 1 ? 'LINHAS' : 'LINHA', texto: mostrar };
  }
  return null;
}

/** Nome do operador para a imagem (em maiúsculas, curto). */
export function operadorCurto(op: string): string {
  const o = (op || '').trim();
  if (/^cp$/i.test(o) || /comboios de portugal/i.test(o)) return 'CP';
  return o.replace(/\s*\([^)]*\)\s*/g, ' ').trim().toUpperCase();
}

export interface DadosCartaz {
  /** null: sem transporte desenhado (incêndio, mau tempo, feriado) — fica o ícone do tipo em grande */
  zona: ZonaCartaz; modo: ModoCartaz | null; tipo: TipoCartaz; operador: string; quando: string; titulo: string;
  destaque: { etiqueta: string; texto: string } | null;
}

export function dadosDoCartaz(a: CentralAlert, categoria?: CategoriaAviso, agora: Date = new Date()): DadosCartaz {
  return {
    zona: zonaDoAviso(a),
    modo: modoDoAviso(a),
    tipo: tipoDoCartaz(a, categoria),
    operador: operadorCurto(a.operador),
    quando: quandoCurto(a, agora),
    titulo: (a['título'] || '').replace(/\s+/g, ' ').replace(/\*/g, '').trim(),
    destaque: destaqueDoAviso(a),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------------------------------------
const C = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

// Ícones Lucide (24×24, traço)
const ICONES: Record<IconeCartaz, string[]> = {
  megafone: ['M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14', 'M8 6v8'],
  chave: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z'],
  triangulo: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  relogio: [C(12, 12, 10), 'M12 6v6l4 2'],
  cone: ['M3 6h18a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z', 'M17 14v7', 'M7 14v7', 'M17 3v3', 'M7 3v3', 'M10 14 2.3 6.3', 'm14 6 7.7 7.7', 'm8 6 8 8'],
  desvio: ['M16 3h5v5', 'M8 3H3v5', 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3', 'm15 9 6-6'],
  proibido: [C(12, 12, 10), 'M4.929 4.929 19.07 19.071'],
  calendario: ['M8 2v4', 'M16 2v4', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'],
  mais: [C(12, 12, 10), 'M8 12h8', 'M12 8v8'],
  estrela: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  chuva: ['M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', 'M16 14v6', 'M8 14v6', 'M12 16v6'],
  chama: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'],
  sismo: ['M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2'],
  info: [C(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  visto: [C(12, 12, 10), 'm9 12 2 2 4-4'],
  octogono: ['m15 9-6 6', 'M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z', 'm9 9 6 6'],
  raio: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'],
};

// Transportes desenhados à mão, de frente (caixa 500×500), só com traço
const TRANSPORTES: Record<ModoCartaz, string[]> = {
  autocarro: [
    'M110 40H390Q440 40 440 90V440Q440 470 410 470H90Q60 470 60 440V90Q60 40 110 40Z',
    'M108 62H392Q404 62 404 74V96Q404 108 392 108H108Q96 108 96 96V74Q96 62 108 62Z',
    'M110 128H390Q412 128 412 150V300Q412 318 394 318H106Q88 318 88 300V150Q88 128 110 128Z',
    'M250 128V318',
    C(130, 390, 24), C(370, 390, 24), C(130, 390, 10), C(370, 390, 10),
    'M200 380H300', 'M200 400H300', 'M80 440H420',
    'M60 140Q22 140 22 180V230', 'M12 230H34V290H12Z', 'M440 140Q478 140 478 180V230', 'M466 230H488V290H466Z',
    'M96 470V496H156V470', 'M344 470V496H404V470',
  ],
  metro: [
    'M250 8V64', 'M150 8H350', 'M200 64L250 24L300 64', 'M196 64H304',
    'M140 64H360Q392 64 404 100L432 300V448Q432 472 408 472H92Q68 472 68 448V300L96 100Q108 64 140 64Z',
    'M132 104H368Q382 104 386 118L404 262Q406 278 390 278H110Q94 278 96 262L114 118Q118 104 132 104Z',
    'M170 82H330',
    C(130, 360, 22), C(370, 360, 22), 'M196 356H304',
    'M68 410H432', 'M220 472V496H280V472', 'M200 496H300',
  ],
  comboio: [
    'M250 6V52', 'M160 6H340', 'M206 52L250 22L294 52', 'M200 52H300',
    'M180 52H320Q372 52 400 120L440 310V450Q440 474 416 474H84Q60 474 60 450V310L100 120Q128 52 180 52Z',
    'M178 96H322Q350 96 362 128L384 236Q388 256 368 256H132Q112 256 116 236L138 128Q150 96 178 96Z',
    C(120, 340, 20), C(380, 340, 20), 'M60 390H440', 'M60 410H440',
    'M150 474L60 500', 'M350 474L440 500', 'M196 474L180 500', 'M304 474L320 500',
  ],
  barco: [
    'M30 300H470L430 392Q424 404 410 404H90Q76 404 70 392Z',
    'M90 300V236H410V300', 'M130 236V176H340V236',
    'M120 252H160V284H120Z', 'M184 252H224V284H184Z', 'M248 252H288V284H248Z', 'M312 252H352V284H312Z', 'M376 252H396V284H376',
    'M160 190H200V222H160Z', 'M224 190H264V222H224Z', 'M288 190H320V222H288Z',
    'M360 176V120H396V236', 'M360 138H396',
    'M30 440Q60 424 90 440T150 440T210 440T270 440T330 440T390 440T450 440T480 432',
    'M60 476Q90 460 120 476T180 476T240 476T300 476T360 476T420 476',
  ],
};

// Silhuetas das zonas (largura 1080, chão em y=160), só com traço
const SILHUETAS: Record<Silhueta, string[]> = {
  porto: [
    // casario da Ribeira
    'M0 160V112L28 92L56 112V80L84 60L112 80V104L140 84L168 104V72L196 52L224 72V160',
    'M36 124H48V138H36Z', 'M92 98H104V112H92Z', 'M148 116H160V130H148Z', 'M204 92H216V106H204Z',
    // Torre dos Clérigos
    'M262 160V44H286V160', 'M258 44H290', 'M264 44V28H284V44', 'M268 28L274 6L280 28', 'M268 70H280', 'M268 100H280',
    'M300 160V100L330 84L360 100V160', 'M380 160V116L404 102L428 116V160',
    // Ponte D. Luís I: arco, tabuleiros e pilares
    'M560 160Q770 -40 980 160', 'M540 52H1000', 'M560 132H980', 'M540 52V160', 'M1000 52V160',
    'M620 52V96', 'M680 52V68', 'M860 52V68', 'M920 52V96', 'M770 52V58',
    // rio
    'M440 172Q470 166 500 172T560 172', 'M1000 172Q1030 166 1060 172',
  ],
  lisboa: [
    // casario em colina e castelo
    'M0 160V120L40 104V88L70 76V60L100 52L130 60V44H150V60L180 52L200 64V84L240 96V160',
    'M100 52V40H112V52', 'M130 44V34H138V44', 'M150 44V34H158V44',
    'M260 160V122L290 108L320 122V160', 'M340 160V132L366 120L392 132V160',
    // Ponte 25 de Abril
    'M430 112H1080', 'M430 122H1080',
    'M600 160V18', 'M626 160V18', 'M600 18H626', 'M600 60H626', 'M600 100H626',
    'M900 160V18', 'M926 160V18', 'M900 18H926', 'M900 60H926', 'M900 100H926',
    'M626 22Q763 150 900 22', 'M600 22Q520 90 440 112', 'M926 22Q1000 80 1080 100',
    'M680 70V112', 'M730 92V112', 'M780 100V112', 'M830 92V112', 'M870 60V112',
    'M430 172Q460 166 490 172T550 172T610 172', 'M940 172Q970 166 1000 172T1060 172',
  ],
  braga: [
    // casario e Sé
    'M0 160V118L30 100L60 118V96L90 80L120 96V160', 'M150 160V60H176V160', 'M146 60H180', 'M152 60L163 36L174 60',
    'M200 160V108L230 92L260 108V160',
    // escadório do Bom Jesus em ziguezague
    'M560 160L620 140L560 120L620 100L560 80', 'M720 160L660 140L720 120L660 100L720 80', 'M560 80H720',
    // igreja com duas torres
    'M580 80V40H700V80', 'M580 40V10H604V40', 'M676 40V10H700V40', 'M584 10L592 0L600 10', 'M680 10L688 0L696 10',
    'M620 40L640 24L660 40', 'M632 80V58H648V80',
    // monte
    'M380 160Q470 70 560 80', 'M720 80Q840 70 980 160',
  ],
  coimbra: [
    // colina da Alta com casario
    'M0 160Q200 150 330 100Q440 56 540 50Q660 56 760 100Q890 150 1080 160',
    'M300 112V92L320 80L340 92V104', 'M380 92V72L400 60L420 72V84', 'M640 72V60L660 48L680 60V74', 'M740 96V80L760 68L780 80V102',
    // Torre da Universidade
    'M524 50V-6H556V50', 'M520 -6H560', 'M528 -6V-22H552V-6', 'M534 -22L540 -34L546 -22', C(540, 12, 8),
    'M460 56V30H500V54', 'M580 54V30H620V56',
    // ponte e rio
    'M60 172H1020', 'M120 160Q150 140 180 160', 'M200 160Q230 140 260 160',
  ],
  norte: [
    'M0 160L120 70L200 120L300 40L420 130L520 80L640 150', 'M560 160L700 60L820 120L900 70L1080 150',
    // socalcos do Douro
    'M220 140Q300 120 380 140', 'M240 126Q300 110 360 126', 'M700 140Q780 116 860 140', 'M720 124Q780 104 840 124',
    'M0 172Q60 166 120 172T240 172T360 172T480 172T600 172T720 172T840 172T960 172T1080 172',
  ],
  centro: [
    'M0 160Q150 100 300 130Q420 150 520 120', 'M760 130Q900 90 1080 140',
    // castelo
    'M520 160V80H560V60H580V80H700V60H720V80H760V160', 'M520 80V68H532V80', 'M548 80V68H560V80', 'M720 68V80', 'M748 80V68H760V80',
    'M620 160V120Q640 100 660 120V160', 'M580 60V40H600V60', 'M700 60V40H720V60',
  ],
  alentejo: [
    'M0 150Q300 140 540 146T1080 140',
    // sobreiro
    'M220 150V110', 'M220 116Q190 100 170 108', 'M220 112Q250 98 268 104', 'M140 100Q150 60 200 66Q220 40 256 56Q300 56 300 92Q280 112 250 104Q230 116 200 106Q160 116 140 100Z',
    // casa caiada com chaminé
    'M640 146V104H760V146', 'M630 104H770', 'M730 104V80H746V104', 'M690 146V122H710V146',
    // moinho
    'M900 146L912 80H936L948 146', 'M924 80L880 40', 'M924 80L968 40', 'M924 80L896 124', 'M924 80L952 124',
  ],
  algarve: [
    // falésias e arco de rocha
    'M0 160V90Q40 70 80 86L120 70Q160 80 180 110V160', 'M220 160V110Q260 80 320 92Q360 96 380 130V160', 'M260 160Q290 120 320 160',
    // sol e mar
    C(760, 70, 44), 'M700 160H1080', 'M740 140H780', 'M720 150H800',
    'M420 172Q460 160 500 172T580 172T660 172T740 172T820 172T900 172T980 172T1060 172',
  ],
  acores: [
    // vulcão com lagoa na cratera
    'M100 160L360 40Q400 24 440 40L700 160', 'M360 40Q400 60 440 40', 'M330 84Q400 100 470 84',
    // ilhas ao fundo
    'M720 160Q820 110 920 160', 'M900 160Q980 130 1060 160',
    // nuvem
    'M520 40Q540 20 570 28Q590 10 620 24Q650 22 652 44H520Z',
    'M0 172Q60 166 120 172T240 172T360 172T480 172T600 172T720 172T840 172T960 172T1080 172',
  ],
  madeira: [
    'M0 160L140 40L240 110L340 20L480 130L560 90L680 160',
    'M640 160L760 70L860 120L960 60L1080 140',
    'M120 140V124L136 114L152 124V140', 'M180 146V130L196 120L212 130V146', 'M780 140V126L794 118L808 126V140',
    'M0 172Q60 166 120 172T240 172T360 172T480 172T600 172T720 172T840 172T960 172T1080 172',
  ],
  portugal: [
    'M0 150Q200 100 400 130T800 120T1080 140',
    // Torre de Belém
    'M480 160V70H540V160', 'M470 70H550', 'M486 70V54H534V70', 'M496 54V40H524V54', 'M504 40L510 28L516 40', 'M500 100H520V120H500Z',
    'M0 172Q60 166 120 172T240 172T360 172T480 172T600 172T720 172T840 172T960 172T1080 172',
  ],
};

type Ctx = CanvasRenderingContext2D;

function tracos(ctx: Ctx, paths: string[], x: number, y: number, escala: number, cor: string, largura: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);
  ctx.strokeStyle = cor;
  ctx.lineWidth = largura / escala;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const p of paths) ctx.stroke(new Path2D(p));
  ctx.restore();
}

function quebrar(ctx: Ctx, texto: string, largura: number, max: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (let i = 0; i < palavras.length; i++) {
    const tentativa = atual ? `${atual} ${palavras[i]}` : palavras[i];
    if (ctx.measureText(tentativa).width <= largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavras[i];
      if (linhas.length === max) {
        atual = '';
        // não coube: a última linha acaba em reticências
        let ult = linhas[max - 1];
        while (ctx.measureText(`${ult}…`).width > largura && ult.includes(' ')) ult = ult.slice(0, ult.lastIndexOf(' '));
        linhas[max - 1] = `${ult.replace(/[,;:.\s]+$/, '')}…`;
        return linhas;
      }
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function arredondado(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONTE_C = '"Barlow Condensed", "Arial Narrow", sans-serif';
const FONTE = 'Barlow, Arial, sans-serif';

function comEspaco(ctx: Ctx, espacamento: string) {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = espacamento; } catch { /* browsers antigos */ }
}

/** Desenha a imagem do aviso num canvas 1080×1080. */
export function desenharCartaz(ctx: Ctx, d: DadosCartaz): void {
  const M = 72;
  const W = LADO;
  const cor = d.tipo.cor;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // fundo escuro com brilho da cor do tipo
  ctx.fillStyle = '#0D0D0D';
  ctx.fillRect(0, 0, W, W);
  const brilho = ctx.createRadialGradient(860, 330, 40, 860, 330, 720);
  brilho.addColorStop(0, `${cor}40`);
  brilho.addColorStop(1, `${cor}00`);
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, W, W);

  // transporte desenhado atrás, à direita (ou o ícone do tipo em grande, quando não é de um transporte)
  if (d.modo && TRANSPORTES[d.modo]) tracos(ctx, TRANSPORTES[d.modo], 600, 300, 0.92, `${cor}38`, 7);
  else tracos(ctx, ICONES[d.tipo.icone] || ICONES.info, 600, 290, 420 / 24, `${cor}30`, 6);

  // silhueta da zona por cima da faixa de baixo
  tracos(ctx, SILHUETAS[d.zona.silhueta], 0, 792, 1, 'rgba(255,255,255,0.22)', 4);

  // cabeçalho: marca e etiqueta do tipo
  ctx.save();
  ctx.translate(M, 64);
  ctx.scale(0.62, 0.62);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 11;
  ctx.lineJoin = 'miter';
  ctx.stroke(new Path2D('M10 88V12H52L66 26V60H44'));
  ctx.fillStyle = '#FF6B1A';
  ctx.beginPath(); ctx.arc(42, 60, 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 52px ${FONTE_C}`;
  comEspaco(ctx, '1px');
  ctx.fillText('PAROU', M + 56, 118);

  ctx.font = `700 34px ${FONTE_C}`;
  comEspaco(ctx, '3px');
  const largEt = ctx.measureText(d.tipo.rotulo).width + 40 + 52;
  const xEt = W - M - largEt;
  arredondado(ctx, xEt, 70, largEt, 62, 31);
  ctx.fillStyle = `${cor}1F`;
  ctx.fill();
  ctx.strokeStyle = cor;
  ctx.lineWidth = 3;
  ctx.stroke();
  tracos(ctx, ICONES[d.tipo.icone], xEt + 22, 85, 32 / 24, cor, 2.6);
  ctx.fillStyle = cor;
  ctx.fillText(d.tipo.rotulo, xEt + 22 + 44, 113);

  // ZONA em grande
  ctx.fillStyle = '#FFFFFF';
  comEspaco(ctx, '2px');
  let tam = 176;
  ctx.font = `800 ${tam}px ${FONTE_C}`;
  while (ctx.measureText(d.zona.nome).width > W - 2 * M && tam > 90) { tam -= 6; ctx.font = `800 ${tam}px ${FONTE_C}`; }
  const yZona = 186 + tam * 0.78;
  ctx.fillText(d.zona.nome, M - 4, yZona);
  // a barra fica por baixo das letras que descem (o Ç de AÇORES)
  const desce = Math.max(0, ctx.measureText(d.zona.nome).actualBoundingBoxDescent || 0);
  ctx.fillStyle = cor;
  ctx.fillRect(M, yZona + Math.max(26, desce + 14), 132, 10);

  // operador · quando
  ctx.font = `600 42px ${FONTE_C}`;
  comEspaco(ctx, '2px');
  ctx.fillStyle = '#D6D6D6';
  const sub = [d.operador, d.quando].filter(Boolean).join('  ·  ');
  let subTxt = sub;
  while (ctx.measureText(subTxt).width > W - 2 * M && subTxt.length > 10) subTxt = `${subTxt.slice(0, -2).trim()}…`;
  ctx.fillText(subTxt, M, yZona + 96);

  // título
  comEspaco(ctx, '0px');
  ctx.font = `700 58px ${FONTE}`;
  ctx.fillStyle = '#FFFFFF';
  const maxLinhas = d.destaque ? 3 : 4;
  const linhas = quebrar(ctx, d.titulo, W - 2 * M, maxLinhas);
  let y = yZona + 190;
  for (const l of linhas) { ctx.fillText(l, M, y); y += 70; }

  // destaque (o que funciona / linhas)
  if (d.destaque) {
    y += 14;
    ctx.font = `700 28px ${FONTE_C}`;
    comEspaco(ctx, '3px');
    ctx.fillStyle = cor;
    ctx.fillText(d.destaque.etiqueta, M, y);
    ctx.font = `600 44px ${FONTE_C}`;
    comEspaco(ctx, '0.5px');
    ctx.fillStyle = '#FFFFFF';
    // uma linha por troço (no máximo 2), cada uma cortada se não couber
    d.destaque.texto.split('\n').slice(0, 2).forEach((parte, i) => {
      ctx.fillText(quebrar(ctx, parte, W - 2 * M, 1)[0] || '', M, y + 52 + i * 54);
    });
  }

  // faixa de baixo
  ctx.fillStyle = '#FF6B1A';
  ctx.fillRect(0, W - 100, W, 100);
  ctx.fillStyle = '#111111';
  ctx.font = `600 36px ${FONTE}`;
  comEspaco(ctx, '0px');
  ctx.textAlign = 'center';
  ctx.fillText('Mais avisos em parou.pt/alertas', W / 2, W - 38);
  ctx.restore();
}

/** Gera a imagem (JPEG) de um aviso, já com as letras da marca carregadas. */
async function carregarLetras(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`800 100px "Barlow Condensed"`), document.fonts.load(`700 40px "Barlow Condensed"`),
      document.fonts.load(`600 40px "Barlow Condensed"`), document.fonts.load('700 40px Barlow'), document.fonts.load('600 40px Barlow'),
    ]);
  } catch { /* segue com as letras de recurso */ }
}

export async function gerarCartaz(a: CentralAlert, categoria?: CategoriaAviso): Promise<Blob> {
  return gerarCartazDeDados(dadosDoCartaz(a, categoria));
}

/** Nome do ficheiro da imagem (ex.: aviso-porto-greve.jpg). */
export function nomeDoCartaz(d: Pick<DadosCartaz, 'zona' | 'tipo'>): string {
  const s = (x: string) => semAc(x).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `aviso-${s(d.zona.nome)}-${s(d.tipo.rotulo)}.jpg`;
}

// ---------------------------------------------------------------------------------------------------------
// Comunidade: zona por nomes de lugares (concelhos, distritos do IPMA) e validação do que vem da base de dados
// ---------------------------------------------------------------------------------------------------------
const DISTRITOS: Array<[RegExp, ZonaCartaz]> = [
  [/porto/, Z('PORTO', 'porto')], [/lisboa/, Z('LISBOA', 'lisboa')], [/setubal/, Z('SETÚBAL', 'lisboa')],
  [/braga/, Z('BRAGA', 'braga')], [/coimbra/, Z('COIMBRA', 'coimbra')],
  [/viana do castelo/, Z('VIANA DO CASTELO', 'norte')], [/vila real/, Z('VILA REAL', 'norte')], [/braganca/, Z('BRAGANÇA', 'norte')],
  [/aveiro/, Z('AVEIRO', 'centro')], [/viseu/, Z('VISEU', 'centro')], [/guarda/, Z('GUARDA', 'centro')],
  [/castelo branco/, Z('CASTELO BRANCO', 'centro')], [/leiria/, Z('LEIRIA', 'centro')], [/santarem/, Z('SANTARÉM', 'alentejo')],
  [/portalegre/, Z('PORTALEGRE', 'alentejo')], [/evora/, Z('ÉVORA', 'alentejo')], [/beja/, Z('BEJA', 'alentejo')],
  [/faro/, Z('ALGARVE', 'algarve')], [/(madeira|funchal|porto santo)/, Z('MADEIRA', 'madeira')],
  [/(acores|ponta delgada|angra|horta|flores|corvo|graciosa|pico|faial|terceira|sao miguel|santa maria|sao jorge)/, Z('AÇORES', 'acores')],
];
const REGIAO_DA_SILHUETA: Partial<Record<Silhueta, string>> = { porto: 'NORTE', braga: 'NORTE', norte: 'NORTE', coimbra: 'CENTRO', centro: 'CENTRO', alentejo: 'ALENTEJO', algarve: 'ALGARVE', acores: 'AÇORES', madeira: 'MADEIRA', lisboa: 'LISBOA' };
const SILHUETA_DA_REGIAO: Record<string, Silhueta> = { NORTE: 'norte', CENTRO: 'centro', ALENTEJO: 'alentejo', ALGARVE: 'algarve', 'AÇORES': 'acores', MADEIRA: 'madeira', LISBOA: 'lisboa' };

/** Zona a partir de nomes de lugares: um só sítio -> esse; vários na mesma região -> a região; senão PORTUGAL. */
export function zonaDosLugares(lugares: string[]): ZonaCartaz {
  const zonas: ZonaCartaz[] = [];
  for (const l of lugares) {
    const n = semAc(l);
    const z = CIDADES.find(([re]) => re.test(n))?.[1] || DISTRITOS.find(([re]) => re.test(n))?.[1]
      || (AMP.test(n) ? Z('PORTO', 'porto') : AML.test(n) ? Z('LISBOA', 'lisboa') : null);
    if (z) zonas.push(z);
  }
  if (!zonas.length) return Z('PORTUGAL', 'portugal');
  if (zonas.every((z) => z.nome === zonas[0].nome)) return zonas[0];
  const regioes = zonas.map((z) => REGIAO_DA_SILHUETA[z.silhueta] || 'PORTUGAL');
  if (regioes.every((r) => r === regioes[0]) && SILHUETA_DA_REGIAO[regioes[0]]) return Z(regioes[0], SILHUETA_DA_REGIAO[regioes[0]]);
  return Z('PORTUGAL', 'portugal');
}

export const TIPOS_COMUNIDADE = {
  incendio: TIPOS.incendio,
  avisoVermelho: { rotulo: 'AVISO VERMELHO', cor: '#FF4D3D', icone: 'chuva' } as TipoCartaz,
  feriado: { rotulo: 'FERIADO', cor: '#4DA3FF', icone: 'calendario' } as TipoCartaz,
};

/** Dia por extenso curto a partir de AAAA-MM-DD (ex.: «SEG 08/12»). */
export function diaCurto(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data || '');
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return `${DIAS[d.getUTCDay()]} ${m[3]}/${m[2]}`;
}

const SILHUETAS_VALIDAS = new Set<string>(['porto', 'lisboa', 'braga', 'coimbra', 'norte', 'centro', 'alentejo', 'algarve', 'acores', 'madeira', 'portugal']);
const MODOS_VALIDOS = new Set<string>(['metro', 'autocarro', 'comboio', 'barco']);
const ICONES_VALIDOS = new Set<string>(['megafone', 'chave', 'triangulo', 'relogio', 'cone', 'desvio', 'proibido', 'calendario', 'mais', 'estrela', 'chuva', 'chama', 'sismo', 'info', 'visto', 'octogono', 'raio']);
const txt = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');

/** O que vem guardado numa publicação (ou de fora) só passa se tiver a forma certa; senão null. */
export function cartazValido(x: unknown): DadosCartaz | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, any>;
  const nome = txt(o.zona?.nome, 30).trim();
  const silhueta = String(o.zona?.silhueta || '');
  const rotulo = txt(o.tipo?.rotulo, 24).trim();
  const cor = String(o.tipo?.cor || '');
  const icone = String(o.tipo?.icone || '');
  if (!nome || !SILHUETAS_VALIDAS.has(silhueta) || !rotulo || !/^#[0-9A-Fa-f]{6}$/.test(cor) || !ICONES_VALIDOS.has(icone)) return null;
  const modo = o.modo == null ? null : MODOS_VALIDOS.has(String(o.modo)) ? (o.modo as ModoCartaz) : null;
  const destaque = o.destaque && typeof o.destaque === 'object' && txt(o.destaque.texto, 160).trim()
    ? { etiqueta: txt(o.destaque.etiqueta, 30).trim(), texto: txt(o.destaque.texto, 160).replace(/ {2,}/g, ' ').trim() } : null;
  // o \n do destaque (um troço por linha) foi trocado por espaço acima: repõe-se a partir do original
  if (destaque && typeof o.destaque.texto === 'string' && o.destaque.texto.includes('\n')) {
    destaque.texto = o.destaque.texto.split('\n').slice(0, 2).map((p: string) => txt(p, 80).trim()).join('\n');
  }
  return {
    zona: { nome, silhueta: silhueta as Silhueta }, modo, tipo: { rotulo, cor, icone: icone as IconeCartaz },
    operador: txt(o.operador, 40).trim(), quando: txt(o.quando, 40).trim(), titulo: txt(o.titulo, 160).trim(), destaque,
  };
}

/** Gera a imagem (JPEG) a partir de dados já prontos (publicações da Comunidade). */
export async function gerarCartazDeDados(d: DadosCartaz): Promise<Blob> {
  await carregarLetras();
  const canvas = document.createElement('canvas');
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  desenharCartaz(ctx, d);
  return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('imagem'))), 'image/jpeg', 0.9));
}
