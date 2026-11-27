// =====================================================================================
// PAROU.PT — Avisos de greve nos sites dos próprios operadores (país todo e ilhas)
//
// Muitos operadores só anunciam as greves e os serviços mínimos no seu site (SMTUC: «02/12: GREVE FESINAP»; MTS: «pré-aviso
// de greve do SMAQ … será assegurada a circulação na Linha 3 entre as 07h00 e as 09h00»). Aqui lê-se a página de avisos ou
// de notícias de cada um, de 10 em 10 minutos: as ligações que falam de greve abrem-se e o texto passa pelas mesmas regras
// das notícias (dias, véspera, o que funciona e a que horas). O leitor é genérico (título, data e texto de qualquer página),
// para continuar a funcionar quando um site muda de aspeto; se uma página deixar de responder, os avisos com data de fim
// mantêm-se até essa data e as notícias dos jornais continuam a cobrir o operador.
// =====================================================================================
import { DateTime } from 'luxon';
import { avisoGreveOficial } from './grevesNoticias';
import type { CentralAlert } from '../types/alerts';

export interface SiteOperador {
  operador: string;
  regiao: string;
  municipios: string[];
  /** Páginas com a lista de avisos ou notícias (a primeira que responder chega) */
  paginas: string[];
}

/** Sites oficiais com página de avisos ou notícias (verificados a 26/11/2026). Metro do Porto e CP têm leitores próprios. */
export const SITES_OPERADORES: SiteOperador[] = [
  { operador: 'STCP', regiao: 'Área Metropolitana do Porto', municipios: ['Porto', 'Matosinhos', 'Maia', 'Gondomar', 'Vila Nova de Gaia'], paginas: ['https://stcp.pt/pt/alteracoes-de-servico', 'https://stcp.pt/pt/noticias'] },
  { operador: 'UNIR', regiao: 'Área Metropolitana do Porto', municipios: ['Porto'], paginas: ['https://unir.pt/noticias/'] },
  { operador: 'Metro de Lisboa', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Amadora', 'Odivelas'], paginas: ['https://www.metrolisboa.pt/institucional/comunicar/noticias-2/', 'https://www.metrolisboa.pt/'] },
  { operador: 'Fertagus', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Almada', 'Seixal', 'Setúbal'], paginas: ['https://www.fertagus.pt/Fertagus-pt/Viajar/Comunicados-e-Campanhas', 'https://www.fertagus.pt/'] },
  { operador: 'Transtejo Soflusa', regiao: 'Área Metropolitana de Lisboa', municipios: ['Lisboa', 'Almada', 'Seixal', 'Montijo', 'Barreiro'], paginas: ['https://ttsl.pt/avisos/', 'https://ttsl.pt/noticias/'] },
  { operador: 'Metro Sul do Tejo', regiao: 'Área Metropolitana de Lisboa', municipios: ['Almada', 'Seixal'], paginas: ['https://www.mts.pt/category/noticias/', 'https://www.mts.pt/'] },
  { operador: 'TCB Barreiro', regiao: 'Área Metropolitana de Lisboa', municipios: ['Barreiro'], paginas: ['https://tcbarreiro.pt/noticias-tcb/'] },
  { operador: 'SMTUC', regiao: 'Coimbra', municipios: ['Coimbra'], paginas: ['https://www.smtuc.pt/category/avisos/', 'https://smtuc.pt/'] },
  { operador: 'Guimabus', regiao: 'Guimarães', municipios: ['Guimarães'], paginas: ['https://guimabus.pt/category/avisos/', 'https://guimabus.pt/category/noticias/'] },
  { operador: 'Vamus Algarve', regiao: 'Algarve', municipios: ['Faro', 'Loulé', 'Albufeira', 'Portimão'], paginas: ['https://vamus.pt/noticias/'] },
  { operador: 'Horários do Funchal', regiao: 'Madeira', municipios: ['Funchal'], paginas: ['https://www.horariosdofunchal.pt/index.php/institucional/noticias', 'https://www.horariosdofunchal.pt/'] },
  { operador: 'Atlânticoline', regiao: 'Açores', municipios: ['Ponta Delgada', 'Horta', 'Angra do Heroísmo'], paginas: ['https://www.atlanticoline.pt/comunicados/'] },
];

export const FONTE_AVISOS_OPERADORES = 'Operadores — avisos oficiais';

const semAcentosP = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const RE_PLENARIO = /\bplenario/;
const MESES_P = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Plenário de trabalhadores anunciado no site do operador (TTSL «Plenário TTSL | 7 mai.», MTS «Plenário de operadores de
 * condução – 24 de Setembro»). Não é greve: «preveem-se constrangimentos» nas horas indicadas, e as partidas nessas horas
 * ficam «pode não se realizar». Dia pelo título (ou pelo texto); ano pela publicação. Desconvocado → Cancelado.
 */
export function avisoPlenarioOficial(o: { operador: string; regiao: string; municipios: string[]; titulo: string; texto: string; publicada: string | null; url: string; fonte: string }, agora: Date = new Date()): CentralAlert | null {
  const pub = o.publicada ? DateTime.fromISO(o.publicada, { zone: 'Europe/Lisbon' }) : null;
  if (!pub?.isValid) return null; // sem data de publicação não se sabe o ano
  const titulo = o.titulo.replace(/\s+/g, ' ').trim();
  const texto = o.texto.replace(/\s+/g, ' ').trim();
  const meses = MESES_P.join('|');
  const achar = (s: string) => new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${meses})[a-z]*\\.?(?:\\s+de\\s+(20\\d{2}))?`).exec(semAcentosP(s));
  const m = achar(titulo) || achar(texto);
  if (!m) return null;
  let dia = DateTime.fromObject({ year: m[3] ? Number(m[3]) : pub.year, month: MESES_P.indexOf(m[2]) + 1, day: Number(m[1]) }, { zone: 'Europe/Lisbon' });
  if (!dia.isValid) return null;
  if (!m[3] && dia < pub.startOf('day').minus({ days: 7 })) dia = dia.plus({ years: 1 });
  // horas: «entre as 13h15 e as 18h15», «das 14h00 às 17h30»
  const t = semAcentosP(texto);
  const h = /\b(?:entre\s+as|das)\s+(\d{1,2})(?:[h:](\d{2})?)?\s*(?:h(?:oras)?)?\s+(?:e\s+as|as)\s+(\d{1,2})(?:[h:](\d{2})?)?/.exec(t);
  let inicio = dia.startOf('day'), fim = dia.endOf('day');
  if (h) {
    const a = dia.set({ hour: Number(h[1]), minute: Number(h[2] || 0) }), b = dia.set({ hour: Number(h[3]), minute: Number(h[4] || 0) });
    if (a.isValid && b.isValid && b > a) { inicio = a; fim = b; }
  }
  if (fim.toMillis() < agora.getTime()) return null;
  const cancelado = /desconvoca|foi cancelad|sem efeito|realizado na devida normalidade/.test(t);
  const id = `oficial-plenario-${semAcentosP(o.operador).replace(/[^a-z0-9]+/g, '-')}-${dia.toISODate()}`;
  const start = inicio.toUTC().toISO()!, end = fim.toUTC().toISO()!;
  return {
    id, external_id: id, tipo: 'atraso significativo', plenario: true, título: titulo, descrição: texto.slice(0, 1500),
    operador: o.operador, linhas: [], paragens: [], região: o.regiao, municípios: o.municipios,
    start_datetime: start, end_datetime: end, published_datetime: pub.toUTC().toISO() || start,
    source: o.fonte, source_url: o.url, last_update: agora.toISOString(),
    status: cancelado ? 'Cancelado' : Date.parse(start) > agora.getTime() ? 'Futuro' : 'Ativo',
    severity: 'Moderada',
  };
}

const ENT: Record<string, string> = {
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç',
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ordm: 'º', ordf: 'ª', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
};
export function textoLimpo(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h\d|li|div|br|tr)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m)
    .replace(/\s+/g, ' ')
    .replace(/(\s*\.\s*){2,}/g, '. ')
    .trim();
}

/** Palavras de um aviso de greve (no texto da ligação ou no endereço) */
const RE_LIGACAO_GREVE = /greve|paralisa|pre-?aviso|servicos?[ -]minimos|plenario/;
/** Palavras de um aviso do serviço: desvios, percursos, horários, paragens, interrupções, obras, supressões, reforços */
const RE_LIGACAO_SERVICO = /desvio|alterac|percurso|horario|interrup|condicionad|constrangiment|obras|supress|paragem|paragens|encerra|interdi|suspens|reforco|cancelad|cancelament|carreira|\blinhas?\b|comunicado|aviso/;
const semAc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ligações de uma página de avisos que falam de greve (do mesmo site; sem repetidos; no máximo 6) */
export function ligacoesDeGreve(html: string, base: string, re: RegExp = RE_LIGACAO_GREVE, maximo = 6): string[] {
  const out: string[] = [];
  const host = new URL(base).hostname.replace(/^www\./, '');
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const texto = semAc(textoLimpo(m[2]));
    let url: URL;
    try { url = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (url.hostname.replace(/^www\./, '') !== host || !/^https?:$/.test(url.protocol)) continue;
    let caminho = url.pathname;
    try { caminho = decodeURIComponent(url.pathname); } catch { /* endereço mal codificado */ }
    if (!re.test(texto) && !re.test(semAc(caminho))) continue;
    // páginas de listas («categoria», «avisos/») não são um aviso
    if (/\/(category|categoria|tag|page)\//.test(url.pathname)) continue;
    const s = url.toString();
    if (!out.includes(s) && s !== base) out.push(s);
    if (out.length >= maximo) break;
  }
  return out;
}

/** Ligações de avisos do serviço (desvios, horários, paragens…) numa página de avisos ou notícias (no máximo 15) */
export const ligacoesDeServico = (html: string, base: string) => ligacoesDeGreve(html, base, RE_LIGACAO_SERVICO, 15);

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Título, data de publicação (ISO, ou null se a página não a diz) e texto de um aviso, em qualquer site */
export function artigoGenerico(html: string): { titulo: string; publicada: string | null; texto: string } | null {
  const meta = (re: RegExp) => re.exec(html)?.[1];
  // título: og:title, o título dentro do artigo, o <title> da página (sem o nome do site) e só depois o primeiro <h1>
  // (na SMTUC o primeiro <h1> é «Blog», o cabeçalho da secção)
  const doArtigo = /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] || '';
  const limparTitulo = (t: string) => (t === h1NoTitle ? t : textoLimpo(t).replace(/\s+[-|–]\s+[^-|–]{2,60}$/, '').replace(/\.$/, '').trim());
  // um <h1> que está dentro do <title> é o título inteiro («Transtejo Soflusa | Plenário TTSL | 7 mai.»: cortar o fim do
  // <title> como se fosse o nome do site levava o dia)
  const h1 = textoLimpo(meta(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || '').replace(/\.$/, '').trim();
  const doTitle = textoLimpo(meta(/<title>([\s\S]*?)<\/title>/i) || '');
  const h1NoTitle = h1.length >= 8 && doTitle.includes(h1) ? h1 : undefined;
  const candidatos = [
    meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
    /<h[12][^>]*>([\s\S]*?)<\/h[12]>/i.exec(doArtigo)?.[1],
    h1NoTitle,
    meta(/<title>([\s\S]*?)<\/title>/i),
    meta(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
  ].map((t) => limparTitulo(t || '')).filter((t) => t.length >= 8 && !/^(blog|not[ií]cias?|avisos?|comunicados?|home|in[ií]cio)$/i.test(t));
  const titulo = candidatos[0] || '';
  // data: metadados (artigo, JSON-LD), depois «13 de Novembro de 2026» / «25 de Novembro, 2026» / 25/11/2026 no topo
  let publicada: string | null = meta(/<meta[^>]+(?:property|name)=["'](?:article:published_time|published_at|og:published_time|date|dc\.date)["'][^>]+content=["']([^"']+)["']/i)
    || meta(/"datePublished"\s*:\s*"([^"]+)"/i) || meta(/<time[^>]+datetime=["']([^"']+)["']/i) || null;
  // corpo: <article>, <main> ou o bloco do texto (WordPress e afins); senão a página toda
  const bloco = /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] || /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0]
    || /class=["'][^"']*(?:entry-content|post-content|article-body|news_detail|conteudo|the_content)[^"']*["'][\s\S]{0,30000}/i.exec(html)?.[0] || html;
  const texto = textoLimpo(bloco).slice(0, 6000);
  if (!publicada) {
    // perto do título (o topo da página pode ser só o menu)
    const iT = titulo ? texto.indexOf(titulo) : -1;
    const topo = semAc(texto.slice(Math.max(0, iT), Math.max(0, iT) + 1500));
    const d = new RegExp(`\\b(\\d{1,2}) (?:de )?(${MESES.join('|')}),? (?:de )?(20\\d{2})\\b`).exec(topo);
    const n = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/.exec(topo);
    const iso = (a: number, m: number, dd: number) => (m >= 1 && m <= 12 && dd >= 1 && dd <= 31 ? `${a}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}T12:00:00Z` : null);
    publicada = d ? iso(Number(d[3]), MESES.indexOf(d[2]) + 1, Number(d[1])) : n ? iso(Number(n[3]), Number(n[2]), Number(n[1])) : null;
  }
  if (!titulo || texto.length < 40) return null;
  return { titulo, publicada, texto };
}

/** Aviso de greve a partir de uma página de um operador (puro, para testar) */
export function avisoDoSite(site: SiteOperador, url: string, html: string, agora: Date = new Date()): CentralAlert | { anulada: string[] } | null {
  const a = artigoGenerico(html);
  if (!a) return null;
  // o texto do aviso começa no título (os menus e rodapés já saíram); o título conta para os dias
  const i = a.texto.indexOf(a.titulo);
  let texto = (i >= 0 ? a.texto.slice(i + a.titulo.length) : a.texto).trim();
  // carimbos de data das páginas («25 de Novembro, 2026 em Avisos», a data de alteração no fim do artigo, «Dia 13 de Novembro
  // de 2026 às 12:13») não são dias de greve: saem do texto (um aviso escreve «dia 2 de dezembro», sem vírgula nem hora)
  texto = texto.normalize('NFC')
    .replace(/(?:\bdia\s+)?\b\d{1,2}\s+de\s+[A-Za-zçÇ]+,\s*20\d{2}\b/g, ' ')
    .replace(/(?:\bdia\s+)?\b\d{1,2}\s+de\s+[A-Za-zçÇ]+\s+de\s+20\d{2}\s+(?:às|as)\s+\d{1,2}[:h]\d{2}/gi, ' ');
  // a data de publicação também sai, sempre que aparece com o ano
  if (a.publicada) {
    const p = DateTime.fromISO(a.publicada, { zone: 'Europe/Lisbon' });
    if (p.isValid) {
      const mes = MESES[p.month - 1];
      const reData = new RegExp(`(?:\\bdia\\s+)?\\b0?${p.day}\\s+de\\s+${mes.replace('c', '[cç]')},?\\s+(?:de\\s+)?${p.year}(?:\\s+(?:às|as)\\s+\\d{1,2}[:h]\\d{2})?`, 'gi');
      texto = texto.normalize('NFC').replace(reData, ' ');
      texto = texto.replace(new RegExp(`\\b0?${p.day}[/.-]0?${p.month}[/.-]${p.year}\\b`, 'g'), ' ');
    }
  }
  // plenário de trabalhadores (não é greve): «preveem-se constrangimentos … entre as 13h15 e as 18h15»
  if (RE_PLENARIO.test(semAcentosP(a.titulo)) && !/\bgreve/i.test(a.titulo)) {
    return avisoPlenarioOficial({ operador: site.operador, regiao: site.regiao, municipios: site.municipios, titulo: a.titulo, texto, publicada: a.publicada, url, fonte: FONTE_AVISOS_OPERADORES }, agora);
  }
  const greve = avisoGreveOficial({ operador: site.operador, regiao: site.regiao, municipios: site.municipios, titulo: a.titulo, texto, publicada: a.publicada || agora.toISOString(),
    semData: !a.publicada, url, fonte: FONTE_AVISOS_OPERADORES }, agora);
  if (greve || /\bgreve|paralisa|pre-?aviso/.test(semAc(a.titulo))) return greve;
  return avisoServicoOficial(site, url, a.titulo, texto, a.publicada, agora);
}

// ---------------------------------------------------------------------------------
// Avisos do serviço (não greves): desvios, alterações de percurso e de horário, paragens desativadas, interrupções, obras.
// Só com data de publicação (as páginas fixas de horários e serviços não têm) e publicados nos últimos 45 dias. Início: «a
// partir de [dia] D de mês» ou a publicação; fim: «até D de mês», «de D a D de mês», «entre D e D de mês»; sem fim escrito,
// fica 10 dias depois do início (um desvio sem prazo raramente passa disso e o aviso não fica esquecido para sempre).
// ---------------------------------------------------------------------------------
const RE_TITULO_SERVICO = /desvio|alterac|percurso|horario|interrup|condiciona|constrangiment|obras|supress|paragem|paragens|encerra|interdi|suspens|reforco|cancelad|cancelament|nova linha|\blinhas?\b|carreiras?\b|viage(m|ns)|ligac(ao|oes)|circulacao|servico (especial|reduzido)|transito|corte/;
const RE_FORA_SERVICO = /retorno|reposicao|reposto|retoma|volta ao (percurso )?normal|concurso|campanha|passatempo|sorteio|premio|recrutamento|emprego|candidatura|relatorio|contas|resultados|comissao europeia|financiamento|investimento|aniversario|parceria|protocolo|inaugura(?!cao das luzes)|exposicao|cultura|natal solidario|publicidade|fretamento|auditorio|fotografias|espacos comerciais|horario dos parques|acessibilidades/;
const MESES_RE = MESES.join('|');

function diaDe(dia: string, mes: string, ano: string | undefined, ref: DateTime): DateTime | null {
  const m = MESES.indexOf(mes.replace('ç', 'c')) + 1;
  if (m < 1) return null;
  let d = DateTime.fromObject({ year: ano ? Number(ano) : ref.year, month: m, day: Number(dia) }, { zone: 'Europe/Lisbon' });
  if (!d.isValid) return null;
  if (!ano && d < ref.minus({ months: 3 })) d = d.plus({ years: 1 });
  return d;
}

/** Tipo de um aviso do serviço pelo título e texto */
export function tipoDoAvisoDeServico(t: string): CentralAlert['tipo'] {
  if (/interrup|suspens|sem circulacao|nao ha (circulacao|servico)/.test(t)) return 'interrupção';
  if (/paragem (desativad|suprimid|encerrad)|desativacao (provisoria )?de paragem|paragens? (desativad|suprimid|encerrad)/.test(t)) return 'paragem encerrada';
  if (/supress|cancelad|cancelament/.test(t)) return 'cancelamento';
  if (/desvio/.test(t)) return 'desvio';
  if (/percurso|interdi|condiciona|constrangiment/.test(t)) return 'alteração de percurso';
  if (/reforco|prolongamento/.test(t)) return 'reforço de serviço';
  if (/novos? horarios?|nova linha/.test(t)) return 'novo horário';
  if (/horario/.test(t)) return 'alteração de horário';
  if (/obras/.test(t)) return 'obras';
  return 'outros alertas oficiais';
}

/** Linhas citadas («linhas 200, 201 e 300», «Linha 204», «linhas 072, 073», «carreira 3») */
export function linhasCitadas(texto: string): string[] {
  const out = new Set<string>();
  const juntar = (n: string) => out.add(/^\d+$/.test(n) ? String(Number(n)) : n.toUpperCase());
  for (const m of String(texto || '').matchAll(/\b(?:linhas?|carreiras?|carreira\(s\))\s*(?:n\.?\s*[ºo°]s?\s*:?\s*)?((?:[A-Z]?\d{1,3}[A-Z]{0,2}(?:\s*\([^)]{1,6}\))?\s*(?:,|\be\b|\/|-(?=\s*[A-Z]?\d))?\s*)+)/gi)) {
    for (const n of m[1].replace(/\([^)]*\)/g, ' ').match(/\b[A-Z]?\d{1,3}[A-Z]{0,2}\b/gi) || []) juntar(n);
  }
  // STCP: «402 IDA … VOLTA» (o percurso de cada linha)
  for (const m of String(texto || '').matchAll(/\b([A-Z]{0,2}\d{1,3}[A-Z]?)\s*\.?\s+(?:IDA|VOLTA)\b/g)) juntar(m[1]);
  return [...out].slice(0, 30);
}

export function avisoServicoOficial(site: SiteOperador, url: string, titulo: string, texto: string, publicada: string | null, agora: Date = new Date()): CentralAlert | null {
  const hoje = DateTime.fromJSDate(agora, { zone: 'Europe/Lisbon' });
  const tTit = semAc(titulo);
  if (!RE_TITULO_SERVICO.test(tTit) || RE_FORA_SERVICO.test(tTit) || tTit.trim().split(/\s+/).length < 3) return null;
  const t = semAc(`${titulo}. ${texto}`).replace(/\s+/g, ' ');
  // data: a da publicação; senão a do endereço (/2026/07/29/); senão o 1.º dia escrito no aviso («No dia 27 de novembro»)
  let pub: DateTime | null = publicada ? DateTime.fromISO(publicada, { zone: 'Europe/Lisbon' }) : null;
  const nUrl = /\/(20\d{2})\/(\d{2})\/(\d{2})\//.exec(url);
  if (!pub?.isValid && nUrl) pub = DateTime.fromObject({ year: +nUrl[1], month: +nUrl[2], day: +nUrl[3] }, { zone: 'Europe/Lisbon' });
  let doTexto = false;
  if (!pub?.isValid) {
    const d1 = new RegExp(`\\b(?:no\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(t.slice(0, 1200));
    let d = d1 ? diaDe(d1[1], d1[2], d1[3], hoje.minus({ months: 2 })) : null;
    // «No dia 28, a partir das 15h30» (sem mês): este mês, ou o seguinte se esse dia já passou há mais de 20 dias
    const sóDia = !d ? /\bno(?:\s+proximo)?\s+dia\s+(\d{1,2})\b(?!\s*(?:de|\/))/.exec(t.slice(0, 1200)) : null;
    if (sóDia) {
      let x = hoje.set({ day: Math.min(Number(sóDia[1]), hoje.daysInMonth || 28) }).startOf('day');
      if (hoje.diff(x, 'days').days > 20) x = x.plus({ months: 1 });
      d = x;
    }
    if (!d) return null;
    pub = d; doTexto = true;
  }
  if (!pub.isValid || pub > hoje.plus({ days: 60 }) || hoje.diff(pub, 'days').days > 45) return null;
  // a data de alguns sites (Horários do Funchal) é a da mudança, à frente: é o início
  let inicio: DateTime = pub.startOf('day');
  let fim: DateTime | null = null;
  // «de 3 a 7 de dezembro», «entre 3 e 7 de dezembro»
  const intervalo = new RegExp(`\\b(?:de|entre)\\s+(?:dia\\s+)?(\\d{1,2})\\s+(?:a|e|ate)\\s+(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(t);
  if (intervalo) {
    const a = diaDe(intervalo[1], intervalo[3], intervalo[4], pub), b = diaDe(intervalo[2], intervalo[3], intervalo[4], pub);
    if (a && b && b >= a) { inicio = a.startOf('day'); fim = b.endOf('day'); }
  }
  if (!fim) {
    const ap = new RegExp(`a partir d[eoa]s?\\s+(?:proxim[oa]\\s+)?(?:[a-z-]+(?:-feira)?,?\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(t);
    if (ap) { const d = diaDe(ap[1], ap[2], ap[3], pub); if (d) inicio = d.startOf('day'); }
    const ate = new RegExp(`\\bate\\s+(?:ao\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(t);
    if (ate) { const d = diaDe(ate[1], ate[2], ate[3], pub); if (d && d >= inicio) fim = d.endOf('day'); }
    // um só dia («… – 7 de dezembro» no título, «No dia 27 de novembro, entre as 22h00 e as 6h00 do dia seguinte»): esse
    // dia, até às 6h do seguinte (obras e eventos de noite)
    if (!fim && !ap && doTexto && !intervalo) { inicio = pub.startOf('day'); fim = pub.plus({ days: 1 }).set({ hour: 6, minute: 0 }); }
    if (!fim && !ap) {
      const um = new RegExp(`\\b(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(tTit)
        || new RegExp(`\\bno(?:\\s+proximo)?\\s+dia\\s+(\\d{1,2})\\s+de\\s+(${MESES_RE})(?:\\s+de\\s+(20\\d{2}))?`).exec(t.slice(0, 1200));
      if (um) { const d = diaDe(um[1], um[2], um[3], pub); if (d) { inicio = d.startOf('day'); fim = d.plus({ days: 1 }).set({ hour: 6, minute: 0 }); } }
    }
    // «a partir de …» sem fim: mudança que fica (percurso alternativo, horário novo): 30 dias; o resto 10
    if (!fim) fim = inicio.plus({ days: ap || /a partir d/.test(t.slice(0, 1500)) ? 30 : 10 }).endOf('day');
  }
  if (!fim) fim = inicio.plus({ days: 10 }).endOf('day');
  // horas num só dia: «entre as 22h00 e as 6h00 do dia seguinte», «das 9h às 17h», «a partir das 15h30»
  const hh = (h: string, m?: string) => ({ hour: Math.min(23, Number(h)), minute: Math.min(59, Number(m || 0)) });
  const corpo = t.slice(0, 1500);
  const janela = /\b(?:entre\s+as|das)\s+(\d{1,2})[h:](\d{2})?\s*(?:horas)?\s+(?:e\s+as|as)\s+(\d{1,2})(?:[h:](\d{2})?)?/.exec(corpo);
  if (fim.diff(inicio, 'hours').hours <= 31 && janela) {
    const a = inicio.set(hh(janela[1], janela[2]));
    let b = inicio.set(hh(janela[3], janela[4]));
    if (b <= a) b = b.plus({ days: 1 });
    inicio = a; fim = b;
  } else {
    const desde = /a partir das\s+(\d{1,2})[h:](\d{2})?/.exec(corpo);
    if (desde && inicio.hour === 0 && inicio.minute === 0) inicio = inicio.set(hh(desde[1], desde[2]));
  }
  if (fim.toMillis() < agora.getTime()) return null;
  const tipo = tipoDoAvisoDeServico(t.slice(0, 400));
  const opId = semAc(site.operador).replace(/[^a-z0-9]+/g, '-');
  let h = 0; for (const c of url) h = (h * 31 + c.charCodeAt(0)) | 0;
  const id = `oficial-servico-${opId}-${(h >>> 0).toString(36)}`;
  const start = inicio.toUTC().toISO()!, end = fim.toUTC().toISO()!;
  return {
    id, external_id: id, tipo, título: titulo.replace(/\s+/g, ' ').trim(), descrição: texto.replace(/\s+/g, ' ').trim().slice(0, 1500),
    operador: site.operador, linhas: linhasCitadas(`${titulo}. ${texto.slice(0, 1500)}`), paragens: [],
    região: site.regiao, municípios: site.municipios,
    start_datetime: start, end_datetime: end, published_datetime: pub.toUTC().toISO() || start,
    source: FONTE_AVISOS_OPERADORES, source_url: url, last_update: agora.toISOString(),
    status: Date.parse(start) > agora.getTime() ? 'Futuro' : 'Ativo',
    severity: tipo === 'interrupção' ? 'Grave' : 'Moderada',
  };
}

const UA = { 'User-Agent': 'PAROU.PT/AlertCenter/2.0 (+https://parou.pt)' };
const cache = new Map<string, { quando: number; html: string | null }>();
async function pagina(url: string, validadeMs: number): Promise<string | null> {
  const c = cache.get(url);
  if (c && Date.now() - c.quando < validadeMs) return c.html;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(9000), redirect: 'follow' });
    const html = r.ok ? await r.text() : null;
    cache.set(url, { quando: Date.now(), html: html ?? c?.html ?? null });
    if (cache.size > 300) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return html;
  } catch (e) {
    cache.set(url, { quando: Date.now() - validadeMs / 2, html: c?.html ?? null });
    throw e;
  }
}

let ultimaLeitura = 0;
/**
 * Lê os sites dos operadores (no máximo de 10 em 10 min). Devolve os avisos de greve, as greves anuladas e os operadores cujo
 * site não respondeu (para os erros das fontes).
 */
export async function lerAvisosDosOperadores(agora: Date = new Date(), forcar = false): Promise<{ avisos: CentralAlert[]; anuladas: Array<{ operador: string; dias: string[] }>; falhas: string[] } | null> {
  if (!forcar && Date.now() - ultimaLeitura < 10 * 60_000) return null;
  ultimaLeitura = Date.now();
  const avisos: CentralAlert[] = [];
  const anuladas: Array<{ operador: string; dias: string[] }> = [];
  const falhas: string[] = [];
  await Promise.all(SITES_OPERADORES.map(async (site) => {
    let lista: string | null = null;
    let base = '';
    for (const p of site.paginas) {
      try { lista = await pagina(p, 9 * 60_000); base = p; if (lista) break; } catch { /* a seguinte */ }
    }
    if (!lista) { falhas.push(site.operador); return; }
    const ligacoes = [...new Set([...ligacoesDeGreve(lista, base), ...ligacoesDeServico(lista, base)])];
    for (const url of ligacoes) {
      try {
        const html = await pagina(url, 30 * 60_000);
        if (!html) continue;
        const a = avisoDoSite(site, url, html, agora);
        if (!a) continue;
        if ('anulada' in a) anuladas.push({ operador: site.operador, dias: a.anulada });
        else if (!avisos.some((x) => x.id === a.id)) avisos.push(a);
      } catch { /* um aviso que falha não estraga os outros */ }
    }
  }));
  return { avisos, anuladas, falhas };
}
