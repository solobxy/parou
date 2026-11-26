// =====================================================================================
// PAROU.PT — Greves anunciadas nas notícias
//
// Nem todos os operadores publicam as greves num sítio que se possa ler (a Metro do Porto anunciou a greve de 27/11/2026
// só por comunicado às redações; o site continuava a mostrar "Ok" em todas as linhas). Os órgãos de comunicação social
// publicam esses comunicados em minutos. Aqui lêem-se os RSS de órgãos nacionais e, quando um título anuncia uma greve
// de um operador de transportes com o dia indicado, cria-se um aviso de greve com a notícia como fonte (dito como tal).
// Regras:
//  - só títulos com "greve"/"paralisação" e o nome do operador; nunca greves desconvocadas;
//  - o dia tem de vir no texto ("27 de novembro", "sexta-feira", "amanhã", "hoje"), contado a partir da data da notícia;
//  - só notícias dos últimos 10 dias e greves que ainda não acabaram;
//  - se o operador já tem aviso oficial de greve para esse dia, a notícia não acrescenta nada (fica o oficial).
// =====================================================================================
import { DateTime } from 'luxon';
import type { CentralAlert } from '../types/alerts';

const ZONA = 'Europe/Lisbon';
const UA = 'PAROU.PT/AlertCenter/2.0 (+https://parou.pt)';

export const FONTES_RSS_GREVES = [
  { nome: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss/pais' },
  { nome: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss/economia' },
  { nome: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss' },
  { nome: 'Observador', url: 'https://observador.pt/feed/' },
  { nome: 'SAPO 24', url: 'https://24.sapo.pt/rss' },
  { nome: 'Público', url: 'https://feeds.feedburner.com/PublicoRSS' },
  { nome: 'Público', url: 'https://feeds.feedburner.com/PublicoLocal' },
  { nome: 'Diário de Notícias', url: 'https://www.dn.pt/feed' },
  { nome: 'Correio da Manhã', url: 'https://www.cmjornal.pt/rss' },
  { nome: 'ECO', url: 'https://eco.sapo.pt/feed/' },
];

export interface NoticiaBruta {
  titulo: string;
  /** texto da notícia que vem no RSS (descrição), sem HTML */
  resumo: string;
  fonte: string;
  url: string;
  /** data de publicação (ISO) */
  data: string;
}

/** Operadores reconhecidos nos títulos: nome com que o aviso fica (o mesmo que grevesPlaneador conhece) e região */
const OPERADORES: Array<{ re: RegExp; nome: string; regiao: string; municipios: string[]; soMaiusculas?: boolean }> = [
  { re: /\bmetro do porto\b|\bmetro porto\b/, nome: 'Metro do Porto', regiao: 'Área Metropolitana do Porto', municipios: ['Porto', 'Matosinhos', 'Vila Nova de Gaia', 'Maia', 'Gondomar', 'Vila do Conde', 'Póvoa de Varzim'] },
  { re: /\bmetro(?:politano)? de lisboa\b/, nome: 'Metro de Lisboa', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Amadora', 'Odivelas'] },
  { re: /\bcarris metropolitana\b/, nome: 'Carris Metropolitana', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa'] },
  { re: /\bcarris\b(?! metropolitana)/, nome: 'Carris', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa'] },
  { re: /\bstcp\b/, nome: 'STCP', regiao: 'Área Metropolitana do Porto', municipios: ['Porto'] },
  { re: /\bfertagus\b/, nome: 'Fertagus', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Almada', 'Seixal', 'Setúbal'] },
  { re: /\btranstejo\b|\bsoflusa\b/, nome: 'Transtejo Soflusa', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Almada', 'Seixal', 'Montijo', 'Barreiro'] },
  { re: /\bmetro sul do tejo\b|\bmetro transportes do sul\b/, nome: 'Metro Sul do Tejo', regiao: 'Área Metropolitana de Lisboa', municipios: ['Almada', 'Seixal'] },
  { re: /\bmetro mondego\b|\bmetrobus de coimbra\b/, nome: 'Metro Mondego', regiao: 'Coimbra', municipios: ['Coimbra'] },
  { re: /\bsmtuc\b/, nome: 'SMTUC', regiao: 'Coimbra', municipios: ['Coimbra'] },
  { re: /\btub\b|\btransportes urbanos de braga\b/, nome: 'TUB', regiao: 'Braga', municipios: ['Braga'] },
  { re: /\bUNIR\b/, nome: 'UNIR', regiao: 'Área Metropolitana do Porto', municipios: ['Porto'], soMaiusculas: true },
  // A CP tem avisos oficiais lidos diretamente (cp.pt/avisos): a notícia só entra se o aviso oficial ainda não existir
  { re: /\bcp\b|\bcomboios de portugal\b/, nome: 'CP', regiao: 'Nacional', municipios: ['Portugal'] },
];

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA: Record<string, number> = { segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, domingo: 7 };

export const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const RE_GREVE = /\bgreves?\b|\bparalisac/;
/** Greve desconvocada, suspensa, adiada ou acabada: não cria aviso (e retira o que houver para esse operador e dia) */
const RE_ANULADA = /\bdesconvoc|\bsuspend\w* (?:a |da )?greve|\bgreve (?:foi |e )?(?:suspensa|cancelada|adiada|desconvocada)|\bcancela\w* (?:a )?greve|\bsem greve\b|\bfim da greve|\bacordo (?:poe fim|evita)/;
/** Notícias que falam de greves noutros setores ou de balanços (não anunciam uma greve de transportes) */
const RE_NAO_E = /\b(medicos|enfermeiros|professores|escolas|hospitais|tribunais|oficiais de justica|guardas prisionais|bombeiros|jornalistas|futebol|ryanair|easyjet)\b/;

/** Data mais provável para um dia da semana citado: o próximo a partir do dia da notícia (o próprio dia só com "hoje"/"esta") */
function proximoDiaSemana(base: DateTime, dia: number, incluiHoje: boolean): DateTime {
  let d = base.startOf('day');
  for (let i = 0; i < 8; i++) {
    if (d.weekday === dia && (i > 0 || incluiHoje)) return d;
    d = d.plus({ days: 1 });
  }
  return d;
}

/**
 * Dias da greve citados no texto. Ordem de confiança: datas com o mês ("27 de novembro", "de 23 a 27 de novembro",
 * "dias 27 e 28 de novembro"), depois o dia da semana ("sexta-feira"), "amanhã" e "hoje" contados a partir da notícia.
 */
export function diasDaGreve(texto: string, publicada: DateTime): DateTime[] {
  const t = semAcentos(texto);
  const base = publicada.setZone(ZONA);
  const dias = new Map<string, DateTime>();
  const juntar = (d: DateTime) => { if (d.isValid) dias.set(d.toISODate()!, d.startOf('day')); };
  const comAno = (dia: number, mes: number) => {
    let d = DateTime.fromObject({ year: base.year, month: mes, day: dia }, { zone: ZONA });
    // notícia de dezembro sobre janeiro: ano seguinte; datas muito antigas não contam
    if (d.isValid && d < base.minus({ months: 6 })) d = d.plus({ years: 1 });
    return d;
  };
  const meses = MESES.join('|');
  // intervalo: "de 23 a 27 de novembro", "entre 23 e 27 de novembro"
  for (const m of t.matchAll(new RegExp(`\\b(?:de|entre)\\s+(\\d{1,2})\\s+(?:a|e|ate)\\s+(\\d{1,2})\\s+de\\s+(${meses})`, 'g'))) {
    const a = Number(m[1]), b = Number(m[2]), mes = MESES.indexOf(m[3]) + 1;
    if (a >= 1 && b <= 31 && b >= a && b - a <= 14) for (let n = a; n <= b; n++) juntar(comAno(n, mes));
  }
  // lista: "27 e 28 de novembro", "27, 28 e 29 de novembro", "dia 27 de novembro"
  for (const m of t.matchAll(new RegExp(`((?:\\b\\d{1,2}\\s*(?:,|e)\\s*)*\\b\\d{1,2})\\s+de\\s+(${meses})`, 'g'))) {
    const mes = MESES.indexOf(m[2]) + 1;
    for (const n of m[1].split(/\s*(?:,|e)\s*/).map(Number)) if (n >= 1 && n <= 31) juntar(comAno(n, mes));
  }
  if (dias.size) return [...dias.values()].sort((a, b) => a.toMillis() - b.toMillis());
  // dia da semana: só o primeiro citado (os outros costumam ser "impactos já na quinta-feira", tratados à parte)
  // «desta quinta-feira» / «deste sábado» também são o próprio dia (sem «desta», a RTP de 26/11 virava uma greve falsa a 3/12)
  const ds = /\b(?:(esta|nesta|desta|na|proxima|este|neste|deste|no|proximo)\s+)?(segunda|terca|quarta|quinta|sexta)(?:-feira)?\b|\b(?:(este|neste|deste|no|proximo)\s+)?(sabado|domingo)\b/.exec(t);
  if (ds) {
    const nome = ds[2] || ds[4];
    const pref = ds[1] || ds[3] || '';
    juntar(proximoDiaSemana(base, DIAS_SEMANA[nome], /^(esta|nesta|desta|este|neste|deste)$/.test(pref) || /\bhoje\b/.test(t)));
    return [...dias.values()];
  }
  if (/\bamanha\b/.test(t)) return [base.plus({ days: 1 }).startOf('day')];
  if (/\bhoje\b/.test(t)) return [base.startOf('day')];
  return [];
}

/**
 * Véspera com serviço a acabar mais cedo ("os efeitos começam já na quinta-feira, com o serviço a terminar por volta das
 * 23h00"): devolve a hora (Lisboa) a partir da qual a véspera já conta, ou null.
 */
export function inicioNaVespera(texto: string, primeiro: DateTime): DateTime | null {
  const t = semAcentos(texto);
  const vespera = primeiro.minus({ days: 1 });
  const nomes = Object.keys(DIAS_SEMANA).filter((k) => DIAS_SEMANA[k] === vespera.weekday);
  const citaVespera = /\bvespera\b/.test(t) || nomes.some((n) => new RegExp(`\\bja (?:na |no |n[ae]sta |n[ae]ste )?${n}`).test(t));
  if (!citaVespera) return null;
  const h = /(?:terminar|termina|acabar|acaba|ultimas? (?:partidas|viagens|composicoes))[^.]{0,40}?\b(\d{1,2})h(\d{2})?\b/.exec(t);
  // sem hora no texto: o mais habitual nestes comunicados (últimas partidas por volta das 23h)
  const hora = h ? Number(h[1]) : 23;
  if (!(hora >= 12 && hora <= 23)) return null;
  // uma hora antes da última partida anunciada (as últimas viagens já não chegam ao fim da linha)
  return vespera.set({ hour: Math.max(12, hora - 1), minute: 0 });
}

/** Linhas pelo nome da cor (Metro do Porto e Metro de Lisboa) */
const CORES = ['amarela', 'azul', 'vermelha', 'verde', 'violeta', 'laranja', 'rosa', 'rubi'];

/** O que continua a funcionar durante a greve, quando a notícia o diz ("operando apenas na linha Amarela e entre Senhora
 *  da Hora e Estádio do Dragão", "frequências de 15 minutos entre as 07h00 e as 20h00") */
export interface ServicoNaGreve {
  /** linhas inteiras a funcionar (cor, sem acentos: "amarela") */
  linhas: string[];
  /** troços a funcionar, pelos nomes das estações das pontas (sem acentos) */
  trocos: Array<[string, string]>;
  /** "15 min (7h–20h)" */
  frequencia?: string;
}

const limparEstacao = (s: string) => s.replace(/\bsra\.?\s/g, 'senhora ').replace(/\bsr\.?\s/g, 'senhor ').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

export function servicoNaGreve(texto: string): ServicoNaGreve | undefined {
  // abreviaturas com ponto ("Sra. da Hora", "S. João") partiam a frase em duas
  const t = semAcentos(texto).replace(/\bsra\.\s/g, 'senhora ').replace(/\bsr\.\s/g, 'senhor ').replace(/\bs\.\s(?=[a-z])/g, 'sao ').replace(/\bsto\.\s/g, 'santo ');
  const linhas = new Set<string>();
  const trocos: Array<[string, string]> = [];
  for (const frase of t.split(/(?<=[.;!?])\s+|:\s+/)) {
    if (!/\b(apenas|so|exclusivamente|unicamente)\b/.test(frase) || !/\b(opera\w*|funciona\w*|circula\w*|servico|ligac\w*|percurso)\b/.test(frase)) continue;
    for (const m of frase.matchAll(new RegExp(`\\blinhas? (${CORES.join('|')})\\b(?:\\s*\\([a-z]\\))?`, 'g'))) linhas.add(m[1]);
    for (const m of frase.matchAll(/\bentre (?:a |o |as |os )?([a-z0-9 .'-]{3,40}?) e (?:a |o |as |os )?([a-z0-9 .'-]{3,40}?)(?=[,;.]|\s+(?:devido|com|na|no|nas|nos|e (?:na|no|entre)|durante|a partir|ate|das|entre as)\b|$)/g)) {
      const a = limparEstacao(m[1]), b = limparEstacao(m[2]);
      // "entre as 07h00 e as 20h00" é uma hora, não um troço
      if (/\d/.test(a) || /\d/.test(b)) continue;
      trocos.push([a, b]);
    }
  }
  const f = /\b(\d{1,2}) minutos entre as (\d{1,2})h\d{0,2} e as (\d{1,2})h/.exec(t);
  if (!linhas.size && !trocos.length) return undefined;
  return { linhas: [...linhas], trocos, ...(f ? { frequencia: `${f[1]} min (${Number(f[2])}h–${Number(f[3])}h)` } : {}) };
}

function idDe(operador: string, dia: string) {
  return `noticia-greve-${semAcentos(operador).replace(/[^a-z0-9]+/g, '-')}-${dia}`;
}

/** Peso das fontes (a primeira com o mesmo operador e dia fica como fonte do aviso) */
const PRIORIDADE = ['RTP Notícias', 'Observador', 'Público', 'SAPO 24', 'Jornal de Notícias', 'ECO', 'Diário de Notícias', 'Correio da Manhã'];

/**
 * Avisos de greve tirados das notícias. Puro (sem rede), para testar.
 * `oficiais` = avisos já lidos dos operadores (se cobrem o mesmo operador e dia, a notícia não entra).
 */
export function grevesDasNoticias(noticias: NoticiaBruta[], agora: Date = new Date(), oficiais: CentralAlert[] = []): CentralAlert[] {
  const agoraL = DateTime.fromJSDate(agora).setZone(ZONA);
  const candidatos = new Map<string, { n: NoticiaBruta; operador: typeof OPERADORES[0]; dias: DateTime[]; inicio: DateTime; fim: DateTime; fontes: Set<string> }>();
  const anuladas = new Set<string>();
  const ordenadas = [...noticias].sort((a, b) => {
    const pa = PRIORIDADE.indexOf(a.fonte), pb = PRIORIDADE.indexOf(b.fonte);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || String(a.data).localeCompare(String(b.data));
  });
  for (const n of ordenadas) {
    const publicada = DateTime.fromISO(n.data, { zone: 'utc' });
    if (!publicada.isValid || publicada < agoraL.minus({ days: 10 }) || publicada > agoraL.plus({ hours: 1 })) continue;
    const titulo = semAcentos(n.titulo);
    if (!RE_GREVE.test(titulo) || RE_NAO_E.test(titulo)) continue;
    const operador = OPERADORES.find((o) => (o.soMaiusculas ? o.re.test(n.titulo) : o.re.test(titulo)));
    if (!operador) continue;
    const texto = `${n.titulo}. ${n.resumo || ''}`;
    // o dia vem primeiro do título (é o que a notícia anuncia), depois do resumo
    let dias = diasDaGreve(n.titulo, publicada);
    if (!dias.length) dias = diasDaGreve(texto, publicada);
    if (!dias.length) continue;
    const anulada = RE_ANULADA.test(semAcentos(texto));
    for (const d of dias) {
      const chave = `${operador.nome}|${d.toISODate()}`;
      if (anulada) { anuladas.add(chave); continue; }
    }
    if (anulada) continue;
    const primeiro = dias[0], ultimo = dias[dias.length - 1];
    const fim = ultimo.endOf('day');
    if (fim < agoraL) continue;
    const chave = `${operador.nome}|${primeiro.toISODate()}`;
    const atual = candidatos.get(chave);
    if (atual) { atual.fontes.add(n.fonte); continue; }
    const inicio = inicioNaVespera(texto, primeiro) || primeiro;
    candidatos.set(chave, { n, operador, dias, inicio, fim, fontes: new Set([n.fonte]) });
  }
  const out: CentralAlert[] = [];
  for (const [chave, c] of candidatos) {
    if (anuladas.has(chave)) continue;
    // aviso oficial do mesmo operador que cobre o mesmo dia: fica o oficial
    const coberto = oficiais.some((a) => a.tipo === 'greve' && semAcentos(a.operador) === semAcentos(c.operador.nome) && a.status !== 'Cancelado'
      && Date.parse(a.start_datetime) <= c.fim.toMillis() && (a.end_datetime ? Date.parse(a.end_datetime) : Date.parse(a.start_datetime) + 86_400_000) >= c.dias[0].toMillis());
    if (coberto) continue;
    const dia = c.dias[0].toISODate()!;
    const resumo = (c.n.resumo || '').replace(/\s+/g, ' ').trim();
    const outras = [...c.fontes].filter((f) => f !== c.n.fonte);
    // a fonte vai à frente (o resumo é cortado nos cartões): quem lê sabe logo que vem de uma notícia
    const fontes = [c.n.fonte, ...outras];
    const listaFontes = fontes.length > 1 ? `${fontes.slice(0, -1).join(', ')} e ${fontes[fontes.length - 1]}` : fontes[0];
    const descricao = `Fonte: ${listaFontes} (o operador ainda não publicou aviso no site). ${resumo || c.n.titulo}`.slice(0, 1500);
    // a greve começa no dia anunciado; a véspera (serviço a acabar mais cedo) fica à parte, como perturbação prevista
    const start = c.dias[0].toUTC().toISO()!;
    const end = c.fim.toUTC().toISO()!;
    const vespera = c.inicio < c.dias[0] ? c.inicio.toUTC().toISO()! : undefined;
    const servico = servicoNaGreve(`${c.n.titulo}. ${c.n.resumo || ''}`);
    out.push({
      ...(servico ? { servico_na_greve: servico } : {}),
      ...(vespera ? { vespera_desde: vespera } : {}),
      id: idDe(c.operador.nome, dia),
      external_id: idDe(c.operador.nome, dia),
      tipo: 'greve',
      título: c.n.titulo.replace(/\s+/g, ' ').trim(),
      descrição: descricao,
      operador: c.operador.nome,
      linhas: [],
      paragens: [],
      região: c.operador.regiao,
      municípios: c.operador.municipios,
      start_datetime: start,
      end_datetime: end,
      published_datetime: DateTime.fromISO(c.n.data).toUTC().toISO() || start,
      source: `Notícia — ${c.n.fonte}`,
      source_url: c.n.url,
      last_update: agora.toISOString(),
      status: Date.parse(start) > agora.getTime() ? 'Futuro' : Date.parse(end) <= agora.getTime() ? 'Terminado' : 'Ativo',
      severity: 'Grave',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------- leitura dos RSS
const ENTIDADES: Record<string, string> = {
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ndash: '–', mdash: '—', hellip: '…', ordm: 'º', ordf: 'ª', euro: '€',
};
function decodificar(s: string): string {
  return s
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function limpar(s: string): string {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decodificar(t).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ');
  return decodificar(t).replace(/\s+/g, ' ').trim();
}
function campo(item: string, nome: string): string {
  const m = item.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
  return m ? m[1] : '';
}

/** Notícias de um RSS (só as que falam de greve ou paralisação no título) */
export function noticiasDoRss(xml: string, fonte: string): NoticiaBruta[] {
  const out: NoticiaBruta[] = [];
  for (const it of (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 80)) {
    const titulo = limpar(campo(it, 'title'));
    if (!titulo || !RE_GREVE.test(semAcentos(titulo))) continue;
    let url = limpar(campo(it, 'link'));
    if (!url) url = limpar(campo(it, 'guid'));
    if (!/^https?:\/\//.test(url)) continue;
    const bruta = limpar(campo(it, 'pubDate')) || limpar(campo(it, 'dc:date'));
    const dt = DateTime.fromRFC2822(bruta).isValid ? DateTime.fromRFC2822(bruta) : DateTime.fromISO(bruta);
    if (!dt.isValid) continue;
    out.push({ titulo, resumo: limpar(campo(it, 'description')).slice(0, 1200), fonte, url, data: dt.toUTC().toISO()! });
  }
  return out;
}

let cacheRss: { quando: number; noticias: NoticiaBruta[]; erros: string[] } | null = null;
let emCurso: Promise<NoticiaBruta[]> | null = null;

/** Notícias de greve de todos os RSS (cache de 5 min; cada fonte que falhar fica de fora sem estragar as outras) */
export async function noticiasDeGreves(): Promise<NoticiaBruta[]> {
  if (cacheRss && Date.now() - cacheRss.quando < 5 * 60_000) return cacheRss.noticias;
  if (emCurso) return emCurso;
  emCurso = (async () => {
    const erros: string[] = [];
    const listas = await Promise.all(FONTES_RSS_GREVES.map(async (f) => {
      try {
        const r = await fetch(f.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return noticiasDoRss(await r.text(), f.nome);
      } catch (e: any) {
        erros.push(`${f.url}: ${e?.message || e}`);
        return [];
      }
    }));
    const vistas = new Set<string>();
    const noticias = listas.flat().filter((n) => (vistas.has(n.url) ? false : (vistas.add(n.url), true)));
    // se tudo falhou, mantém o que havia (uma falha de rede não apaga avisos)
    if (noticias.length || !cacheRss) cacheRss = { quando: Date.now(), noticias, erros };
    else cacheRss = { ...cacheRss, quando: Date.now() - 4 * 60_000, erros };
    return cacheRss.noticias;
  })().finally(() => { emCurso = null; });
  return emCurso;
}

export const errosDasFontesDeGreves = () => cacheRss?.erros || [];
