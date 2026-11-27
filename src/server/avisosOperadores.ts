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
  { operador: 'STCP', regiao: 'Área Metropolitana do Porto', municipios: ['Porto', 'Matosinhos', 'Maia', 'Gondomar', 'Vila Nova de Gaia'], paginas: ['https://stcp.pt/pt/noticias', 'https://stcp.pt/'] },
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
const semAc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ligações de uma página de avisos que falam de greve (do mesmo site; sem repetidos; no máximo 6) */
export function ligacoesDeGreve(html: string, base: string): string[] {
  const out: string[] = [];
  const host = new URL(base).hostname.replace(/^www\./, '');
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const texto = semAc(textoLimpo(m[2]));
    let url: URL;
    try { url = new URL(m[1].replace(/&amp;/g, '&'), base); } catch { continue; }
    if (url.hostname.replace(/^www\./, '') !== host || !/^https?:$/.test(url.protocol)) continue;
    if (!RE_LIGACAO_GREVE.test(texto) && !RE_LIGACAO_GREVE.test(semAc(decodeURIComponent(url.pathname)))) continue;
    // páginas de listas («categoria», «avisos/») não são um aviso
    if (/\/(category|categoria|tag|page)\//.test(url.pathname)) continue;
    const s = url.toString();
    if (!out.includes(s) && s !== base) out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

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
  return avisoGreveOficial({ operador: site.operador, regiao: site.regiao, municipios: site.municipios, titulo: a.titulo, texto, publicada: a.publicada || agora.toISOString(),
    semData: !a.publicada, url, fonte: FONTE_AVISOS_OPERADORES }, agora);
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
    for (const url of ligacoesDeGreve(lista, base)) {
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
