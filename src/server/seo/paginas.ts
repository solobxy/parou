// =====================================================================================
// PAROU.PT — Páginas públicas para os motores de pesquisa (SEO)
//
// HTML feito no servidor (rápido, sem JavaScript) para cada operador, linha e paragem, mais
// /greves, /pesquisa e os sitemaps. Cada página tem conteúdo próprio e útil (horários reais,
// próximas partidas, paragens perto), dados estruturados (schema.org) e liga às outras e à app.
// =====================================================================================
import type { Express, Request, Response, NextFunction } from 'express';
import { DateTime } from 'luxon';
import { obterIndice, paragensPerto, modoDoTipo, NOME_REGIAO, type Linha, type GrupoParagem, type Operador } from './indice';
import { horarioDaLinha, linhasDaParagem, NOME_TIPO_DIA, proximoDia, type HorarioLinha, type TipoDia } from './horarios';
import { linhasCM, paragensCM, padraoCM, partidasPadrao, passagensHojeCM } from './carrisMetropolitana';
import { getDatabase } from '../db/gtfsDatabase';
import { html, hora, cortar, slug, nomeBonito } from './texto';
import { LinesEngine } from '../linesEngine';
import { isDadosProntosPronto, getManifestData, getVersaoBaseAtiva } from '../dadosProntos';
import { obterGreves } from '../alertasEngine';

const SITE = 'https://parou.pt';
const ZONA = 'Europe/Lisbon';

// ------------------------------------------------------------------------------------
// Moldura comum
// ------------------------------------------------------------------------------------
interface Migalha { nome: string; url: string }
interface OpcoesPagina {
  titulo: string;
  descricao: string;
  caminho: string; // canónico, ex.: /linhas/stcp
  corpo: string;
  migalhas?: Migalha[];
  jsonld?: object[];
  indexar?: boolean;
  imagem?: string;
  /** JavaScript extra no fim da página (ex.: horários da UNIR pedidos à AMP pelo browser) */
  script?: string;
}

const LOGO_SVG = `<svg viewBox="26 17 48 66" width="20" height="28" aria-hidden="true"><mask id="m"><rect x="26" y="17" width="48" height="66" fill="#fff"/><circle cx="49" cy="57" r="8" fill="#000"/></mask><path d="M34 80V25H56L66 35V57H52" fill="none" stroke="#111" stroke-width="10" mask="url(#m)"/><circle cx="49" cy="57" r="6.5" fill="#FF6B1A"/></svg>`;

const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:#fff;color:#111;font:16px/1.5 Barlow,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}main{max-width:880px;margin:0 auto;padding:16px 16px 48px}
header.topo{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #E6E6E3}
.topo-in{max-width:880px;margin:0 auto;height:56px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.marca{display:flex;align-items:center;gap:9px;text-decoration:none;font:700 24px/1 "Barlow Condensed",Barlow,sans-serif;letter-spacing:.06em}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:12px;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:15px;white-space:nowrap}
.btn.laranja{background:#FF6B1A;color:#111}.btn.claro{background:#F4F4F2;color:#111}
nav.migalhas{font-size:13px;color:#6B6B6B;margin:4px 0 10px;display:flex;flex-wrap:wrap;gap:4px}nav.migalhas a{color:#6B6B6B;text-decoration:none}nav.migalhas a:hover{text-decoration:underline}
h1{font-size:30px;line-height:1.12;margin:6px 0 10px;letter-spacing:-.01em}h2{font-size:20px;margin:28px 0 10px;line-height:1.2}h3{font-size:16px;margin:16px 0 8px}
.sub{color:#4A4A4A;margin:0 0 14px}.nota{font-size:13px;color:#6B6B6B}
.chip{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:28px;padding:0 8px;border-radius:7px;font:700 15px/1 "Barlow Condensed",Barlow,sans-serif;letter-spacing:.02em;color:#fff;background:#111;flex-shrink:0}
.cartao{border:1px solid #E6E6E3;border-radius:16px;padding:14px 16px;margin:12px 0;background:#fff}
.resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.resumo div{background:#F4F4F2;border-radius:12px;padding:10px 12px}.resumo b{display:block;font:700 22px/1.1 "Barlow Condensed",Barlow,sans-serif}.resumo span{font-size:13px;color:#6B6B6B}
ul.lista{list-style:none;margin:0;padding:0;border:1px solid #E6E6E3;border-radius:16px;overflow:hidden}
ul.lista li{border-top:1px solid #E6E6E3}ul.lista li:first-child{border-top:0}
ul.lista a,ul.lista .linha{display:flex;align-items:center;gap:12px;padding:11px 14px;text-decoration:none;min-height:52px}
ul.lista a:hover{background:#FAFAF8}.lista .t{flex:1;min-width:0}.lista .t small{display:block;color:#6B6B6B;font-size:13px}
.lista .dir{color:#6B6B6B;font-size:14px;white-space:nowrap;font-variant-numeric:tabular-nums}
ol.percurso{list-style:none;margin:0;padding:0 0 0 6px}ol.percurso li{position:relative;padding:6px 0 6px 22px;border-left:3px solid #E6E6E3}
ol.percurso li:before{content:"";position:absolute;left:-7px;top:13px;width:11px;height:11px;border-radius:50%;background:#fff;border:3px solid #111}
ol.percurso a{text-decoration:none}ol.percurso a:hover{text-decoration:underline}ol.percurso small{color:#6B6B6B;margin-left:6px;font-variant-numeric:tabular-nums}
table.horas{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}table.horas td{padding:5px 8px;border-top:1px solid #EEE;vertical-align:top}
table.horas td:first-child{font:700 17px/1.4 "Barlow Condensed",Barlow,sans-serif;width:44px;color:#111}table.horas td:last-child{color:#2B2B2B;word-spacing:6px}
details{border:1px solid #E6E6E3;border-radius:14px;margin:10px 0;overflow:hidden}details>summary{cursor:pointer;padding:12px 14px;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:8px}
details>summary::-webkit-details-marker{display:none}details>summary:after{content:"+";color:#6B6B6B;font-weight:700}details[open]>summary:after{content:"–"}details .dentro{padding:0 14px 12px}
.partidas .hora{font:700 20px/1 "Barlow Condensed",Barlow,sans-serif;font-variant-numeric:tabular-nums;text-align:right}.partidas .hora small{display:block;font:500 12px/1.4 Barlow,sans-serif;color:#6B6B6B}
.grelha{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.grelha a{display:block;border:1px solid #E6E6E3;border-radius:14px;padding:12px 14px;text-decoration:none}.grelha a:hover{border-color:#111}.grelha small{color:#6B6B6B;display:block}
form.pesquisa{display:flex;gap:8px;margin:14px 0}form.pesquisa input{flex:1;min-width:0;height:48px;border:1px solid #E6E6E3;border-radius:12px;padding:0 14px;font:inherit;background:#F4F4F2}
.paginas{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.paginas a,.paginas span{padding:6px 11px;border-radius:9px;background:#F4F4F2;text-decoration:none;font-size:14px}.paginas span{background:#111;color:#fff}
.aviso{background:#FFF4EC;border:1px solid #FFD9C2;border-radius:14px;padding:12px 14px;margin:12px 0}
footer.rodape{border-top:1px solid #E6E6E3;background:#F4F4F2;color:#4A4A4A;font-size:14px}footer .in{max-width:880px;margin:0 auto;padding:22px 16px 30px}
footer nav{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0}footer a{text-decoration:none}footer a:hover{text-decoration:underline}
@media(max-width:520px){h1{font-size:26px}.btn.esconde{display:none}}
`;

function migalhasHtml(m: Migalha[]): string {
  if (!m.length) return '';
  return `<nav class="migalhas" aria-label="Estás em">${m
    .map((x, i) => (i === m.length - 1 ? `<span>${html(x.nome)}</span>` : `<a href="${html(x.url)}">${html(x.nome)}</a> <span aria-hidden="true">›</span>`))
    .join(' ')}</nav>`;
}

function rodape(): string {
  const ix = obterIndice();
  const principais = (ix?.operadores || []).slice(0, 14).map((o) => `<a href="/linhas/${o.slug}">${html(o.nome)}</a>`).join('');
  return `<footer class="rodape"><div class="in">
<div class="marca" style="font-size:20px">${LOGO_SVG}PAROU</div>
<nav aria-label="PAROU"><a href="/">Perto de mim</a><a href="/linhas">Linhas e horários</a><a href="/greves">Greves</a><a href="/alertas">Alertas</a><a href="/mapa">Mapa</a><a href="/sobre">Sobre</a><a href="/privacidade">Privacidade</a><a href="/termos">Termos</a></nav>
<nav aria-label="Operadores">${principais}</nav>
<p class="nota">Gratuita e sem fins lucrativos. Horários oficiais publicados pelos operadores (GTFS) e pelo IMT; podem mudar sem aviso — em caso de dúvida confirma junto do operador.</p>
</div></footer>`;
}

function pagina(o: OpcoesPagina): string {
  const canonico = `${SITE}${o.caminho}`;
  const titulo = o.titulo;
  const desc = cortar(o.descricao, 158);
  const migalhas = o.migalhas || [];
  const ld: object[] = [...(o.jsonld || [])];
  if (migalhas.length) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: migalhas.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: m.nome, item: `${SITE}${m.url}` })),
    });
  }
  const verifG = (process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  const verifB = (process.env.BING_SITE_VERIFICATION || '').trim();
  return `<!doctype html>
<html lang="pt-PT"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(titulo)}</title>
<meta name="description" content="${html(desc)}">
<meta name="robots" content="${o.indexar === false ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<link rel="canonical" href="${html(canonico)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PAROU"><meta property="og:locale" content="pt_PT">
<meta property="og:url" content="${html(canonico)}"><meta property="og:title" content="${html(titulo)}"><meta property="og:description" content="${html(desc)}">
<meta property="og:image" content="${SITE}${o.imagem || '/og-image.png'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${html(titulo)}"><meta name="twitter:description" content="${html(desc)}"><meta name="twitter:image" content="${SITE}${o.imagem || '/og-image.png'}">
${verifG ? `<meta name="google-site-verification" content="${html(verifG)}">` : ''}${verifB ? `<meta name="msvalidate.01" content="${html(verifB)}">` : ''}
<meta name="theme-color" content="#FFFFFF"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body>
<header class="topo"><div class="topo-in"><a class="marca" href="/" aria-label="PAROU — início">${LOGO_SVG}PAROU</a>
<div style="display:flex;gap:8px"><a class="btn claro esconde" href="/linhas">Linhas</a><a class="btn" href="/">Abrir a app</a></div></div></header>
<main>${migalhasHtml(migalhas)}${o.corpo}</main>
${rodape()}
${o.script ? `<script>${o.script}</script>` : ''}
</body></html>`;
}

function corTexto(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
}

function chip(l: Linha): string {
  const cor = /^#[0-9a-f]{6}$/i.test(l.cor) && l.cor.toLowerCase() !== '#ffffff' ? l.cor : '#111111';
  const txt = l.sigla || l.codigo.slice(0, 5);
  return `<span class="chip" style="background:${cor};color:${corTexto(cor)}">${html(txt || '•')}</span>`;
}

function nomeLinha(l: Linha): string {
  if (/^linha /i.test(l.codigo) || !l.codigo) return l.codigo || l.nome;
  return /^\d|^[A-Z0-9]{1,4}$/.test(l.codigo) ? `Linha ${l.codigo}` : l.codigo;
}

const MODO_PLURAL: Record<string, string> = { Autocarro: 'autocarros', Metro: 'metros', Comboio: 'comboios', Barco: 'barcos', 'Elétrico': 'elétricos' };

function tipoParagem(modo: string) {
  if (modo === 'Metro') return { palavra: 'Estação', schema: 'SubwayStation' };
  if (modo === 'Comboio') return { palavra: 'Estação', schema: 'TrainStation' };
  if (modo === 'Barco') return { palavra: 'Terminal', schema: 'BoatTerminal' };
  return { palavra: 'Paragem', schema: 'BusStop' };
}

function dataBase(): string {
  const b = getManifestData()?.built_at;
  const dt = b ? DateTime.fromISO(String(b), { zone: ZONA }) : DateTime.now().setZone(ZONA);
  return dt.isValid ? dt.setLocale('pt-PT').toFormat("d 'de' LLLL 'de' yyyy") : '';
}

// ------------------------------------------------------------------------------------
// Cache das páginas
// ------------------------------------------------------------------------------------
const cache = new Map<string, { t: number; ttl: number; v: string }>();
function emCache(chave: string, ttlMs: number, fazer: () => string): string {
  const c = cache.get(chave);
  if (c && Date.now() - c.t < c.ttl) return c.v;
  const v = fazer();
  cache.set(chave, { t: Date.now(), ttl: ttlMs, v });
  if (cache.size > 3000) cache.delete(cache.keys().next().value as string);
  return v;
}

// ------------------------------------------------------------------------------------
// Páginas
// ------------------------------------------------------------------------------------
function paginaHub(): string {
  const ix = obterIndice()!;
  const porRegiao = new Map<string, Operador[]>();
  for (const o of ix.operadores) porRegiao.set(o.regiao, [...(porRegiao.get(o.regiao) || []), o]);
  const totalLinhas = ix.operadores.reduce((n, o) => n + o.linhas.length, 0);
  const totalParagens = ix.operadores.reduce((n, o) => n + o.paragens.length, 0);
  let corpo = `<h1>Linhas e horários de transportes públicos em Portugal</h1>
<p class="sub">Horários de ${totalLinhas.toLocaleString('pt-PT')} linhas de autocarro, metro, comboio e barco e ${totalParagens.toLocaleString('pt-PT')} paragens de ${ix.operadores.length} operadores — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e muitos mais. Escolhe o operador, a linha ou pesquisa uma paragem.</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="Linha ou paragem (ex.: 801, Marquês de Pombal)" aria-label="Pesquisar linha ou paragem" required minlength="2"><button class="btn" type="submit">Pesquisar</button></form>
<div class="aviso">Queres saber quando passa o próximo? <a href="/"><b>Abre a PAROU</b></a> e vê os transportes à tua volta em tempo real.</div>`;
  for (const [regiao, ops] of porRegiao) {
    corpo += `<h2>${html(NOME_REGIAO[regiao] || regiao)}</h2><div class="grelha">${ops
      .map((o) => `<a href="/linhas/${o.slug}"><b>${html(o.nome)}</b><small>${html(o.modo)} · ${o.linhas.length} ${o.linhas.length === 1 ? 'linha' : 'linhas'} · ${o.paragens.length.toLocaleString('pt-PT')} paragens</small></a>`)
      .join('')}</div>`;
  }
  return pagina({
    titulo: 'Linhas e horários de autocarros, metro e comboios em Portugal | PAROU',
    descricao: `Horários de todas as linhas de autocarro, metro, comboio e barco em Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e mais ${Math.max(0, ix.operadores.length - 6)} operadores. Paragens e tempo real.`,
    caminho: '/linhas',
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas e horários', url: '/linhas' }],
  });
}

function paginaOperador(op: Operador): string {
  const plural = MODO_PLURAL[op.modo] || 'transportes';
  const corpo = `<h1>Horários ${html(op.nome)} — todas as linhas</h1>
<p class="sub">${html(op.nome)} tem ${op.linhas.length} ${op.linhas.length === 1 ? 'linha' : 'linhas'} e ${op.paragens.length.toLocaleString('pt-PT')} paragens na PAROU. Escolhe uma linha para ver o horário de dias úteis, sábados e domingos e todas as paragens do percurso — ou abre a app para ver os próximos ${plural} em tempo real.</p>
<p><a class="btn laranja" href="/">Ver ${plural} perto de mim</a> <a class="btn claro" href="/paragens/${op.slug}">Todas as paragens</a></p>
<h2>Linhas ${html(op.nome)}</h2>
<ul class="lista">${op.linhas.map((l) => `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}${l.nome ? `<small>${html(l.nome)}</small>` : ''}</span></a></li>`).join('')}</ul>
<p class="nota">Horários oficiais publicados pela ${html(op.nome)}. Atualizado a ${html(dataBase())}.</p>`;
  return pagina({
    titulo: `Horários ${op.nome}: todas as linhas e paragens | PAROU`,
    descricao: `Horários de todas as ${op.linhas.length} linhas ${op.nome} (${op.modo.toLowerCase()}): partidas de dias úteis, sábados e domingos, percurso e paragens. Próximos ${plural} em tempo real na PAROU.`,
    caminho: `/linhas/${op.slug}`,
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas', url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: `Linhas ${op.nome}`, numberOfItems: op.linhas.length, itemListElement: op.linhas.slice(0, 200).map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: `${nomeLinha(l)} ${l.nome}`.trim(), url: `${SITE}/linhas/${op.slug}/${l.slug}` })) }],
  });
}

function tabelaHoras(partidas: number[]): string {
  if (partidas.length === 0) return '<p class="nota">Sem partidas neste dia.</p>';
  const porHora = new Map<number, string[]>();
  for (const s of partidas) {
    const h = Math.floor((((s % 86400) + 86400) % 86400) / 3600);
    const chaveHora = s >= 86400 ? h + 24 : h; // depois da meia-noite fica no fim
    porHora.set(chaveHora, [...(porHora.get(chaveHora) || []), hora(s).slice(3)]);
  }
  return `<table class="horas"><tbody>${Array.from(porHora.entries()).sort((a, b) => a[0] - b[0]).map(([h, ms]) => `<tr><td>${String(h % 24).padStart(2, '0')}</td><td>${ms.join(' ')}</td></tr>`).join('')}</tbody></table>`;
}

const CM = 'carris_metropolitana';

function nomesParagens(ids: string[]): Map<string, string> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const db = getDatabase();
  for (let i = 0; i < ids.length; i += 400) {
    const parte = ids.slice(i, i + 400);
    const rows = db.prepare(`SELECT stop_id, stop_name FROM stops WHERE stop_id IN (${parte.map(() => '?').join(',')})`).all(...parte) as Array<{ stop_id: string; stop_name: string }>;
    for (const r of rows) m.set(r.stop_id, r.stop_name);
  }
  return m;
}

// UNIR (Área Metropolitana do Porto): a base tem as paragens e o percurso de cada linha; os
// horários vêm da AMP, que só responde a ligações de Portugal. Por isso as páginas mostram o
// percurso e as linhas (para todos, incluindo os motores de pesquisa) e o browser de quem as
// abre pede à AMP o horário de hoje.
const UNIR = 'unir';
function semAcentosSimples(t: string): string { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function sentidosUnir(l: Linha): HorarioLinha['sentidos'] {
  const db = getDatabase();
  let rows: Array<{ stop_id: string; stop_name: string; direction_id: number; stop_sequence: number | null }> = [];
  try {
    rows = db.prepare(`SELECT sr.stop_id, s.stop_name, sr.direction_id, sr.stop_sequence FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
      WHERE sr.route_id = ? ORDER BY sr.direction_id, COALESCE(sr.stop_sequence, 9999), s.stop_name`).all(l.routeId) as any[];
  } catch { return []; }
  const porSentido = new Map<number, typeof rows>();
  for (const r of rows) porSentido.set(r.direction_id, [...(porSentido.get(r.direction_id) || []), r]);
  return Array.from(porSentido.entries()).map(([direcao, lista]) => {
    const comOrdem = lista.some((x) => x.stop_sequence != null);
    return {
      direcao,
      destino: comOrdem ? nomeBonito(lista[lista.length - 1].stop_name) : (direcao === 3 ? 'circular' : `sentido ${direcao}`),
      paragens: lista.map((x) => ({ stopId: x.stop_id, nome: nomeBonito(x.stop_name), minutos: 0 })),
      horarios: [],
    };
  });
}

let destinosUnirCache: { versao: string; m: Map<string, string> } | null = null;
/** Destino (última paragem) de cada linha UNIR em cada sentido: "unir:8009|1" -> "Campanhã Estação" */
function destinosUnir(): Map<string, string> {
  const v = String(getVersaoBaseAtiva() || '');
  if (destinosUnirCache && destinosUnirCache.versao === v) return destinosUnirCache.m;
  const m = new Map<string, string>();
  try {
    const rows = getDatabase().prepare(`SELECT sr.route_id, sr.direction_id, s.stop_name FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id
      WHERE sr.feed_id = 'unir' AND sr.stop_sequence = (SELECT MAX(x.stop_sequence) FROM stop_routes x WHERE x.route_id = sr.route_id AND x.direction_id = sr.direction_id)`).all() as Array<{ route_id: string; direction_id: number; stop_name: string }>;
    for (const r of rows) m.set(`${r.route_id}|${r.direction_id}`, nomeBonito(r.stop_name));
  } catch {}
  destinosUnirCache = { versao: v, m };
  return m;
}

/** Script do browser: pede à AMP o horário de hoje e preenche os blocos [data-unir] */
function scriptUnir(linhas: Record<string, string>): string {
  return `window.__UNIR_LINHAS=${JSON.stringify(linhas).replace(/</g, '\\u003c')};(function(){
var Z='Europe/Lisbon',L=window.__UNIR_LINHAS||{};
function dia(){return new Intl.DateTimeFormat('en-CA',{timeZone:Z,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function agora(){var p=new Intl.DateTimeFormat('en-GB',{timeZone:Z,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).split(':').map(Number);return (p[0]%24)*3600+p[1]*60+p[2]}
function pedir(c){return fetch('https://paragens.amp.pt/acarto2/get_horarios_prg?dia='+dia()+'&id='+encodeURIComponent(c)).then(function(r){return r.json()}).then(function(d){if(typeof d==='string')d=JSON.parse(d);if(!d||!d.horarios)throw 0;return d.horarios})}
function seg(x){var a=String(x.chegada||'').split(':').map(Number);return a[0]*3600+(a[1]||0)*60+(a[2]||0)}
function hm(s){s=((s%86400)+86400)%86400;return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function limpo(t){return String(t||'').replace(/\\s+/g,' ').trim()}
function chip(c){var u=L[c];return u?'<a class="chip" style="background:#002B49;color:#fff;text-decoration:none" href="'+esc(u)+'">'+esc(c)+'</a>':'<span class="chip" style="background:#002B49">'+esc(c)+'</span>'}
var falha='<p class="nota">Horário de hoje indisponível neste momento: o serviço da AMP só responde a ligações feitas em Portugal. Na <a href="/">app PAROU</a> vês as partidas ao minuto.</p>';
document.querySelectorAll('[data-unir]').forEach(function(el){
  var cods=(el.getAttribute('data-cods')||'').split(',').filter(Boolean);
  Promise.all(cods.map(pedir)).then(function(ls){
    var t=[].concat.apply([],ls),a=agora();
    if(el.getAttribute('data-unir')==='linha'){
      var li=el.getAttribute('data-linha'),se=el.getAttribute('data-sentido'),vistos={},hs=[];
      t.forEach(function(x){if(limpo(x.linha)===li&&limpo(x.sentido)===se){var s=seg(x);if(!vistos[s]){vistos[s]=1;hs.push(s)}}});
      hs.sort(function(x,y){return x-y});
      if(!hs.length){el.innerHTML='<p class="nota">Sem partidas hoje neste sentido.</p>';return}
      var ph={};hs.forEach(function(s){var h=Math.floor(s/3600);(ph[h]=ph[h]||[]).push(hm(s).slice(3))});
      var prox=hs.filter(function(s){return s>=a-60})[0];
      el.innerHTML='<p class="sub">Hoje: '+hs.length+' partidas, '+hm(hs[0])+'–'+hm(hs[hs.length-1])+(prox!=null?' · próxima às <b>'+hm(prox)+'</b>':'')+'.</p><table class="horas"><tbody>'+Object.keys(ph).map(Number).sort(function(x,y){return x-y}).map(function(h){return '<tr><td>'+String(h%24).padStart(2,'0')+'</td><td>'+ph[h].join(' ')+'</td></tr>'}).join('')+'</tbody></table><p class="nota">Horário da AMP para hoje, na primeira paragem.</p>';
    }else{
      var px=t.map(function(x){return {l:limpo(x.linha),d:limpo(x.destino),s:seg(x)}}).filter(function(x){return x.s>=a-60}).sort(function(x,y){return x.s-y.s}).slice(0,12);
      if(!px.length){el.innerHTML='<p class="nota">Sem mais partidas hoje.</p>';return}
      el.innerHTML='<ul class="lista partidas">'+px.map(function(x){var m=Math.max(0,Math.round((x.s-a)/60));var q=m<=0?'a chegar':m<60?'daqui a '+m+' min':'daqui a '+Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');return '<li><div class="linha">'+chip(x.l)+'<span class="t">'+esc(x.d)+'</span><span class="hora">'+hm(x.s)+'<small>'+q+'</small></span></div></li>'}).join('')+'</ul><p class="nota">Horário da AMP, às '+hm(a)+'. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.</p>';
    }
  }).catch(function(){el.innerHTML=falha});
});
})();`;
}

/** Horário de uma linha da Carris Metropolitana (API do operador) no mesmo formato das outras */
async function horarioLinhaCM(l: Linha): Promise<HorarioLinha> {
  const idLinha = l.routeId.replace(/^cm:/, '');
  const info = (await linhasCM()).get(idLinha);
  const hoje = DateTime.now().setZone(ZONA);
  const sentidos: HorarioLinha['sentidos'] = [];
  const pads = (await Promise.all((info?.padroes || []).slice(0, 4).map((id) => padraoCM(id)))).filter(Boolean) as any[];
  pads.sort((a, b) => a.direcao - b.direcao || b.paragens.length - a.paragens.length);
  const nomes = nomesParagens(Array.from(new Set(pads.flatMap((p) => p.paragens.map((x: any) => `cm:${x.stopId}`)))));
  for (const p of pads) {
    sentidos.push({
      direcao: p.direcao,
      destino: nomeBonito(p.destino),
      paragens: p.paragens.map((x: any) => ({ stopId: `cm:${x.stopId}`, nome: nomeBonito(nomes.get(`cm:${x.stopId}`) || x.stopId), minutos: x.minutos })),
      horarios: (['uteis', 'sabado', 'domingo'] as TipoDia[]).map((tipo) => {
        const r = partidasPadrao(p, proximoDia(tipo, hoje));
        return { tipo, data: r.data, partidas: r.partidas };
      }),
    });
  }
  let resumo: HorarioLinha['hoje'] = { primeira: null, ultima: null, total: 0, intervaloPonta: null };
  if (pads[0]) {
    const lista = pads[0].dias.get(hoje.toFormat('yyyyMMdd')) || [];
    if (lista.length) {
      const ponta = lista.filter((x: number) => x >= 7 * 3600 && x < 10 * 3600);
      let intervalo: number | null = null;
      if (ponta.length >= 3) {
        const gaps = ponta.slice(1).map((x: number, i: number) => x - ponta[i]).sort((a: number, b: number) => a - b);
        intervalo = Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)] / 60));
      }
      resumo = { primeira: lista[0], ultima: lista[lista.length - 1], total: lista.length, intervaloPonta: intervalo };
    }
  }
  return { sentidos, hoje: resumo };
}

async function paginaLinha(op: Operador, l: Linha): Promise<string> {
  if (l.feedId === UNIR) return paginaLinhaUnir(op, l);
  const ix = obterIndice()!;
  const h = l.feedId === CM ? await horarioLinhaCM(l) : horarioDaLinha(l);
  const nome = nomeLinha(l);
  const modo = op.modo !== 'Autocarro' ? op.modo : modoDoTipo(l.tipo);
  const plural = MODO_PLURAL[modo] || 'transportes';
  const nParagens = Math.max(0, ...h.sentidos.map((s) => s.paragens.length));
  const percurso = l.nome || (h.sentidos[0] ? `${h.sentidos[0].paragens[0]?.nome} – ${h.sentidos[0].destino}` : '');
  let corpo = `<h1>${chip(l)} ${html(nome)}${percurso ? ` <span style="font-weight:500">· ${html(percurso)}</span>` : ''}</h1>
<p class="sub">Horário ${/^linha/i.test(nome) ? 'da' : 'do'} ${html(nome)} ${html(op.nome)} (${html(modo.toLowerCase())}): partidas de dias úteis, sábados e domingos e as ${nParagens} paragens do percurso.</p>
<div class="resumo">
<div><b>${h.hoje.primeira != null ? hora(h.hoje.primeira) : '—'}</b><span>Primeira partida hoje</span></div>
<div><b>${h.hoje.ultima != null ? hora(h.hoje.ultima) : '—'}</b><span>Última partida hoje</span></div>
<div><b>${h.hoje.total || '—'}</b><span>Partidas hoje${h.sentidos[0] ? ` (sentido ${html(h.sentidos[0].destino)})` : ''}</span></div>
${h.hoje.intervaloPonta ? `<div><b>${h.hoje.intervaloPonta} min</b><span>Intervalo às horas de ponta</span></div>` : ''}
</div>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">Ver em tempo real</a></p>`;
  for (const s of h.sentidos) {
    corpo += `<h2>Sentido ${html(s.destino)}</h2>
<p class="nota">Partidas de ${html(s.paragens[0]?.nome || '')}.</p>`;
    s.horarios.forEach((hh, i) => {
      const dia = DateTime.fromISO(hh.data, { zone: ZONA }).setLocale('pt-PT');
      corpo += `<details${i === 0 ? ' open' : ''}><summary>${html(NOME_TIPO_DIA[hh.tipo])}<span class="nota" style="margin-left:auto">${hh.partidas.length ? `${hh.partidas.length} partidas · ${hora(hh.partidas[0])}–${hora(hh.partidas[hh.partidas.length - 1])}` : 'sem serviço'}</span></summary><div class="dentro">${tabelaHoras(hh.partidas)}<p class="nota">Horário de ${html(dia.toFormat("cccc, d 'de' LLLL"))}.</p></div></details>`;
    });
    corpo += `<h3>Paragens (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      const nomeP = html(p.nome);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${nomeP}</a>` : nomeP}${p.minutos ? `<small>+${p.minutos} min</small>` : ''}</li>`;
    }).join('')}</ol>`;
  }
  // Outras linhas do mesmo operador (ligações internas)
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>Outras linhas ${html(op.nome)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">Ver todas as linhas ${html(op.nome)} ›</a></p>`;
  }
  corpo += `<p class="nota">Horários oficiais publicados pela ${html(op.nome)} (atualizados a ${html(dataBase())}). Podem mudar em feriados, greves ou obras: para os próximos ${plural} em tempo real usa a <a href="/">app PAROU</a>.</p>`;
  const tituloBase = /^linha/i.test(nome) ? `${nome} ${op.nome}` : `${nome} ${op.nome}`;
  return pagina({
    titulo: cortar(`${tituloBase}: horários e paragens${percurso ? ` (${percurso})` : ''}`, 64) + ' | PAROU',
    descricao: `Horário ${/^linha/i.test(nome) ? 'da' : 'do'} ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: primeira e última partida, horários de dias úteis, sábados e domingos e as ${nParagens} paragens. Tempo real na PAROU.`,
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas', url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
  });
}

function paginaLinhaUnir(op: Operador, l: Linha): string {
  const ix = obterIndice()!;
  const sentidos = sentidosUnir(l);
  const nome = nomeLinha(l);
  const modo = modoDoTipo(l.tipo);
  const nParagens = Math.max(0, ...sentidos.map((s) => s.paragens.length));
  const percurso = l.nome || (sentidos[0] ? `${sentidos[0].paragens[0]?.nome} – ${sentidos[0].destino}` : '');
  let corpo = `<h1>${chip(l)} ${html(nome)}${percurso ? ` <span style="font-weight:500">· ${html(percurso)}</span>` : ''}</h1>
<p class="sub">${html(nome)} da ${html(op.nome)} (rede de ${html(modo === 'Barco' ? 'barcos' : 'autocarros')} da Área Metropolitana do Porto): percurso com as ${nParagens} paragens de cada sentido e horário de hoje.</p>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">Ver na app</a></p>`;
  for (const s of sentidos) {
    const primeira = s.paragens[0];
    corpo += `<h2>Sentido ${html(s.destino)}</h2>`;
    if (primeira) {
      corpo += `<p class="nota">Partidas de ${html(primeira.nome)}.</p><div data-unir="linha" data-cods="${html(primeira.stopId.replace(/^unir:/, ''))}" data-linha="${html(l.codigo)}" data-sentido="${s.direcao}"><p class="nota">A carregar o horário de hoje (AMP)…</p></div>`;
    }
    corpo += `<h3>Paragens (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${html(p.nome)}</a>` : html(p.nome)}</li>`;
    }).join('')}</ol>`;
  }
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>Outras linhas ${html(op.nome)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">Ver todas as linhas ${html(op.nome)} ›</a></p>`;
  }
  corpo += `<p class="nota">Percurso e paragens publicados pela AMP – Área Metropolitana do Porto (atualizados a ${html(dataBase())}). Os horários podem mudar em feriados, greves ou obras; confirma na <a href="/">app PAROU</a> ou junto da UNIR.</p>`;
  return pagina({
    titulo: cortar(`${nome} ${op.nome}: horários e paragens${percurso ? ` (${percurso})` : ''}`, 64) + ' | PAROU',
    descricao: `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: as ${nParagens} paragens do percurso em cada sentido e o horário de hoje. Partidas ao minuto na PAROU.`,
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas', url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
    script: scriptUnir({}),
  });
}

interface LinhaParagem { linha: Linha; destinos: string[]; primeira: number | null; ultima: number | null }
interface Proxima { linha?: Linha; codigo: string; destino: string; hora: string; minutos: number; tempoReal: boolean }

async function dadosParagem(g: GrupoParagem): Promise<{ linhas: LinhaParagem[]; proximas: Proxima[]; concelho: string }> {
  const ix = obterIndice()!;
  const agoraSecs = (() => { const n = DateTime.now().setZone(ZONA); return n.hour * 3600 + n.minute * 60 + n.second; })();
  if (g.feedId === CM) {
    const info = await paragensCM();
    const ids = g.stopIds.slice(0, 4).map((x) => x.replace(/^cm:/, ''));
    const codLinhas = new Set<string>();
    let concelho = '';
    for (const id of ids) { const p = info.get(id); p?.linhas.forEach((x) => codLinhas.add(x)); if (!concelho && p?.concelho) concelho = p.concelho; }
    const pass = (await Promise.all(ids.map((id) => passagensHojeCM(id)))).flat();
    const porLinha = new Map<string, { destinos: Map<string, number>; horas: number[] }>();
    for (const x of pass) {
      codLinhas.add(x.linha);
      const e = porLinha.get(x.linha) || { destinos: new Map<string, number>(), horas: [] as number[] };
      if (x.destino) e.destinos.set(nomeBonito(x.destino), (e.destinos.get(nomeBonito(x.destino)) || 0) + 1);
      e.horas.push(x.programada);
      porLinha.set(x.linha, e);
    }
    const linhas: LinhaParagem[] = [];
    for (const cod of codLinhas) {
      const l = ix.linhaPorRoute.get(`cm:${cod}`);
      if (!l) continue;
      const e = porLinha.get(cod);
      const horas = (e?.horas || []).sort((a, b) => a - b);
      linhas.push({ linha: l, destinos: e ? Array.from(e.destinos.entries()).sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 3) : [], primeira: horas[0] ?? null, ultima: horas.length ? horas[horas.length - 1] : null });
    }
    const proximas: Proxima[] = pass
      .map((x) => ({ x, t: x.prevista ?? x.programada }))
      .filter(({ t }) => t >= agoraSecs - 30)
      .sort((a, b) => a.t - b.t)
      .slice(0, 10)
      .map(({ x, t }) => ({ linha: ix.linhaPorRoute.get(`cm:${x.linha}`), codigo: x.linha, destino: nomeBonito(x.destino), hora: hora(t), minutos: Math.max(0, Math.round((t - agoraSecs) / 60)), tempoReal: x.prevista != null }));
    return { linhas, proximas, concelho };
  }
  if (g.feedId === UNIR) {
    const db = getDatabase();
    const ids = g.stopIds.slice(0, 8);
    let rows: Array<{ route_id: string; direction_id: number }> = [];
    let concelho = '';
    try {
      rows = db.prepare(`SELECT DISTINCT route_id, direction_id FROM stop_routes WHERE stop_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
      concelho = String((db.prepare(`SELECT zone_id FROM stops WHERE stop_id = ?`).get(ids[0]) as any)?.zone_id || '');
    } catch {}
    const dest = destinosUnir();
    const porLinha = new Map<string, Set<string>>();
    for (const r of rows) {
      const d = dest.get(`${r.route_id}|${r.direction_id}`);
      const set = porLinha.get(r.route_id) || new Set<string>();
      if (d && semAcentosSimples(d) !== semAcentosSimples(g.nome)) set.add(d);
      porLinha.set(r.route_id, set);
    }
    const linhas: LinhaParagem[] = Array.from(porLinha.entries())
      .map(([rid, ds]) => ({ linha: ix.linhaPorRoute.get(rid)!, destinos: Array.from(ds).slice(0, 3), primeira: null, ultima: null }))
      .filter((x) => x.linha);
    return { linhas, proximas: [], concelho };
  }
  const linhas: LinhaParagem[] = linhasDaParagem(g.stopIds)
    .map((x) => ({ linha: ix.linhaPorRoute.get(x.routeId)!, destinos: x.destinos, primeira: x.primeira, ultima: x.ultima }))
    .filter((x) => x.linha);
  const listas = await Promise.all(g.stopIds.slice(0, 6).map((id) => LinesEngine.getStopDepartures(id, 8).catch(() => ({ departures: [] as any[] }))));
  const proximas: Proxima[] = listas.flatMap((x: any) => x.departures || [])
    .filter((d: any) => Number.isFinite(d.countdown_minutes) && d.countdown_minutes >= 0)
    .sort((a: any, b: any) => a.countdown_minutes - b.countdown_minutes)
    .slice(0, 10)
    .map((d: any) => ({ linha: ix.linhaPorRoute.get(d.line_id), codigo: String(d.line_code || ''), destino: String(d.destination || ''), hora: String(d.actual_time || d.scheduled_time || ''), minutos: d.countdown_minutes, tempoReal: d.state === 'Tempo Real' }));
  return { linhas, proximas, concelho: '' };
}

async function paginaParagem(op: Operador, g: GrupoParagem): Promise<string> {
  const ix = obterIndice()!;
  const dados = await dadosParagem(g);
  const linhas = dados.linhas.sort((a, b) => a.linha.codigo.localeCompare(b.linha.codigo, 'pt', { numeric: true }));
  const modo = op.modo !== 'Autocarro' ? op.modo : linhas[0]?.linha ? modoDoTipo(linhas[0].linha.tipo) : op.modo;
  const plural = MODO_PLURAL[modo] || 'transportes';
  const tp = tipoParagem(modo);
  const proximas = dados.proximas;
  const agora = DateTime.now().setZone(ZONA);
  const codigos = Array.from(new Set(linhas.map((x) => x.linha.codigo))).slice(0, 8);
  const local = dados.concelho ? `, ${dados.concelho}` : '';
  const destinos = Array.from(new Set(linhas.flatMap((x) => x.destinos))).slice(0, 4);
  let corpo = `<h1>${tp.palavra} ${html(g.nome)}${dados.concelho ? ` <span style="font-weight:500;color:#6B6B6B">· ${html(dados.concelho)}</span>` : ''}</h1>
<p class="sub">${html(op.nome)} · ${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'}${destinos.length ? ` para ${html(destinos.join(', '))}` : ''}.</p>
<p><a class="btn laranja" href="/?local=${g.lat.toFixed(5)},${g.lon.toFixed(5)}&nome=${encodeURIComponent(g.nome)}&paragem=${encodeURIComponent(g.id)}">Ver em tempo real</a></p>
<h2>Próximas partidas</h2>`;
  if (g.feedId === UNIR) {
    corpo += `<div data-unir="proximas" data-cods="${html(g.stopIds.slice(0, 3).map((x) => x.replace(/^unir:/, '')).join(','))}"><p class="nota">A carregar as próximas partidas (horário da AMP)…</p></div>`;
  } else if (proximas.length) {
    corpo += `<ul class="lista partidas">${proximas.map((d) => {
      const c = d.linha ? chip(d.linha) : `<span class="chip">${html(d.codigo)}</span>`;
      const quando = d.minutos <= 0 ? 'a chegar' : d.minutos < 60 ? `daqui a ${d.minutos} min` : `daqui a ${Math.floor(d.minutos / 60)} h ${String(d.minutos % 60).padStart(2, '0')}`;
      return `<li><div class="linha">${c}<span class="t">${html(d.destino)}${d.tempoReal ? '<small>tempo real</small>' : ''}</span><span class="hora">${html(d.hora)}<small>${quando}</small></span></div></li>`;
    }).join('')}</ul><p class="nota">Calculado às ${agora.toFormat('HH:mm')} com o horário oficial${proximas.some((d) => d.tempoReal) ? ' e o tempo real do operador' : ''}. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.</p>`;
  } else {
    corpo += `<p class="nota">Sem partidas previstas nas próximas horas (às ${agora.toFormat('HH:mm')}). Vê abaixo a primeira partida de cada linha.</p>`;
  }
  if (linhas.length) {
    corpo += `<h2>Linhas que passam ${tp.palavra === 'Paragem' ? 'nesta paragem' : 'aqui'}</h2><ul class="lista">${linhas.map((x) => {
      const l = x.linha;
      return `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${x.destinos.length ? `para ${html(x.destinos.join(' · '))}` : html(l.nome)}</small></span><span class="dir">${x.primeira != null ? `${hora(x.primeira)}–${hora(x.ultima!)}` : (g.feedId === CM || g.feedId === UNIR ? '' : 'hoje sem serviço')}</span></a></li>`;
    }).join('')}</ul>${g.feedId === UNIR ? '' : '<p class="nota">Horas: primeira e última passagem de hoje.</p>'}`;
  }
  const perto = paragensPerto(g.lat, g.lon, 450, 14).filter((p) => p.g !== g);
  if (perto.length) {
    corpo += `<h2>Paragens perto</h2><ul class="lista">${perto.map(({ g: p, d }) => {
      const o2 = ix.operadores.find((o) => o.feedId === p.feedId);
      if (!o2) return '';
      return `<li><a href="/paragens/${o2.slug}/${p.slug}"><span class="t">${html(p.nome)}<small>${html(o2.nome)}</small></span><span class="dir">${Math.round(d / 10) * 10} m</span></a></li>`;
    }).join('')}</ul>`;
  }
  corpo += g.feedId === UNIR
    ? `<p class="nota">Paragens e linhas publicadas pela AMP – Área Metropolitana do Porto (atualizadas a ${html(dataBase())}); horários pedidos à AMP no momento.</p>`
    : `<p class="nota">Horários oficiais da ${html(op.nome)} (atualizados a ${html(dataBase())}).</p>`;
  const tituloLinhas = codigos.length ? ` — ${codigos.slice(0, 4).join(', ')}` : '';
  return pagina({
    titulo: cortar(`${g.nome}${local} (${op.nome}): próximos ${plural}${tituloLinhas}`, 66) + ' | PAROU',
    descricao: `Próximas partidas na ${tp.palavra.toLowerCase()} ${g.nome}${local} da ${op.nome}${codigos.length ? `: linhas ${codigos.join(', ')}` : ''}${destinos.length ? ` para ${destinos.join(', ')}` : ''}. Primeira e última partida de hoje e tempo real na PAROU.`,
    caminho: `/paragens/${op.slug}/${g.slug}`,
    corpo,
    script: g.feedId === UNIR ? scriptUnir(Object.fromEntries(linhas.map((x) => [x.linha.codigo, `/linhas/${op.slug}/${x.linha.slug}`]))) : undefined,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas', url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: g.nome, url: `/paragens/${op.slug}/${g.slug}` }],
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': tp.schema,
      name: g.nome,
      url: `${SITE}/paragens/${op.slug}/${g.slug}`,
      geo: { '@type': 'GeoCoordinates', latitude: Number(g.lat.toFixed(6)), longitude: Number(g.lon.toFixed(6)) },
      address: { '@type': 'PostalAddress', ...(dados.concelho ? { addressLocality: dados.concelho } : {}), addressCountry: 'PT' },
      publicAccess: true,
    }],
  });
}

const POR_PAGINA = 300;
function paginaListaParagens(op: Operador, n: number): string {
  const total = Math.max(1, Math.ceil(op.paragens.length / POR_PAGINA));
  const p = Math.min(Math.max(1, n), total);
  const fatia = op.paragens.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);
  const nav = total > 1 ? `<nav class="paginas" aria-label="Páginas">${Array.from({ length: total }, (_, i) => i + 1).map((i) => (i === p ? `<span>${i}</span>` : `<a href="/paragens/${op.slug}${i === 1 ? '' : `?p=${i}`}">${i}</a>`)).join('')}</nav>` : '';
  const corpo = `<h1>Paragens ${html(op.nome)}</h1>
<p class="sub">${op.paragens.length.toLocaleString('pt-PT')} paragens ${html(op.nome)} por ordem alfabética. Em cada uma vês as próximas partidas e as linhas que lá passam.</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="Nome da paragem" aria-label="Pesquisar paragem" required minlength="2"><button class="btn" type="submit">Pesquisar</button></form>
${nav}<ul class="lista">${fatia.map((g) => `<li><a href="/paragens/${op.slug}/${g.slug}"><span class="t">${html(g.nome)}</span></a></li>`).join('')}</ul>${nav}`;
  return pagina({
    titulo: `Paragens ${op.nome}${p > 1 ? ` (página ${p})` : ''}: horários e próximas partidas | PAROU`,
    descricao: `Lista de todas as paragens ${op.nome}${p > 1 ? `, página ${p}` : ''}: próximas partidas, linhas e horários de cada paragem na PAROU.`,
    caminho: `/paragens/${op.slug}${p > 1 ? `?p=${p}` : ''}`,
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Linhas', url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: 'Paragens', url: `/paragens/${op.slug}` }],
  });
}

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = DateTime.fromISO(iso, { zone: ZONA }).setLocale('pt-PT');
  if (!d.isValid) return '';
  const hoje = DateTime.now().setZone(ZONA).startOf('day');
  const dias = Math.round(d.startOf('day').diff(hoje, 'days').days);
  const h = d.toFormat('HH:mm');
  if (dias === 0) return `hoje às ${h}`;
  if (dias === 1) return `amanhã às ${h}`;
  if (dias === -1) return `ontem às ${h}`;
  return d.toFormat(`cccc, d 'de' LLLL 'às' HH:mm`);
}

async function paginaGreves(): Promise<string> {
  const { greves } = await obterGreves();
  const agora = DateTime.now().setZone(ZONA).setLocale('pt-PT');
  const oficiais = greves.filter((g) => g.origem === 'operador');
  const noticias = greves.filter((g) => g.origem === 'noticia');
  let corpo = `<h1>Greves nos transportes hoje e próximas greves</h1>
<p class="sub">Greves anunciadas na CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa e outros transportes em Portugal. Atualizado ${html(agora.toFormat("d 'de' LLLL 'às' HH:mm"))}.</p>
<div class="aviso">Recebe as greves no telemóvel, mesmo com a app fechada: abre os <a href="/alertas"><b>Alertas da PAROU</b></a> e liga os avisos.</div>`;
  if (oficiais.length === 0 && noticias.length === 0) {
    corpo += `<div class="cartao"><b>Sem greves anunciadas neste momento.</b><p class="nota" style="margin:6px 0 0">Não há greves nos transportes anunciadas pelos operadores nem nas notícias dos últimos dias. Esta página atualiza-se sozinha.</p></div>`;
  }
  if (oficiais.length) {
    corpo += `<h2>Anunciadas pelos operadores</h2>${oficiais.map((g) => `<div class="cartao"><b>${html(g.titulo)}</b><p class="nota" style="margin:4px 0">${html(g.operador)}${g.inicio ? ` · ${g.aDecorrer ? 'a decorrer desde' : 'começa'} ${html(quando(g.inicio))}` : ''}${g.fim ? ` · até ${html(quando(g.fim))}` : ''}</p>${g.resumo ? `<p style="margin:6px 0 0">${html(g.resumo)}</p>` : ''}${g.url ? `<p class="nota" style="margin:6px 0 0"><a href="${html(g.url)}" rel="nofollow noopener" target="_blank">Ver no site do operador</a></p>` : ''}</div>`).join('')}`;
  }
  if (noticias.length) {
    corpo += `<h2>Nas notícias</h2><ul class="lista">${noticias.map((g) => `<li><a href="${html(g.url)}" rel="nofollow noopener" target="_blank"><span class="t">${html(g.titulo)}<small>${html(g.fonte)}${g.publicada ? ` · ${html(quando(g.publicada))}` : ''}</small></span></a></li>`).join('')}</ul>`;
  }
  corpo += `<h2>Serviços mínimos e alternativas</h2><p>Em dia de greve, vê na <a href="/">PAROU</a> o que está realmente a circular perto de ti: onde o operador publica tempo real (Carris Metropolitana, STCP, Metro do Porto e outros) vês os veículos que estão de facto a andar. Consulta também os <a href="/linhas">horários de todas as linhas</a> para planear alternativas.</p>`;
  return pagina({
    titulo: 'Greves de transportes hoje: CP, Metro, Carris e mais | PAROU',
    descricao: 'Há greve hoje? Greves anunciadas na CP, Metro de Lisboa, Metro do Porto, Carris, STCP, Fertagus e outros transportes, com datas, serviços mínimos e notícias. Atualizado sempre.',
    caminho: '/greves',
    corpo,
    migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Greves', url: '/greves' }],
  });
}

function normal(s: string) {
  return slug(s, 200).replace(/-/g, ' ');
}

function paginaPesquisa(q: string): string {
  const ix = obterIndice()!;
  const termo = normal(q).trim();
  const linhas: Array<{ o: Operador; l: Linha }> = [];
  const paragens: Array<{ o: Operador; g: GrupoParagem }> = [];
  if (termo.length >= 2) {
    for (const o of ix.operadores) {
      for (const l of o.linhas) {
        const cod = normal(l.codigo);
        if (cod === termo || normal(`${l.codigo} ${l.nome}`).includes(termo)) linhas.push({ o, l });
        if (linhas.length > 60) break;
      }
      for (const g of o.paragens) {
        if (normal(g.nome).includes(termo)) paragens.push({ o, g });
        if (paragens.length > 120) break;
      }
    }
    linhas.sort((a, b) => Number(normal(b.l.codigo) === termo) - Number(normal(a.l.codigo) === termo));
  }
  let corpo = `<h1>Pesquisar linhas e paragens</h1>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" value="${html(q)}" placeholder="Linha ou paragem" aria-label="Pesquisar" required minlength="2"><button class="btn" type="submit">Pesquisar</button></form>`;
  if (termo.length >= 2) {
    corpo += `<h2>Linhas (${linhas.length})</h2>${linhas.length ? `<ul class="lista">${linhas.slice(0, 50).map(({ o, l }) => `<li><a href="/linhas/${o.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${html(o.nome)}${l.nome ? ` · ${html(l.nome)}` : ''}</small></span></a></li>`).join('')}</ul>` : '<p class="nota">Nenhuma linha encontrada.</p>'}
<h2>Paragens (${paragens.length > 100 ? '100+' : paragens.length})</h2>${paragens.length ? `<ul class="lista">${paragens.slice(0, 100).map(({ o, g }) => `<li><a href="/paragens/${o.slug}/${g.slug}"><span class="t">${html(g.nome)}<small>${html(o.nome)}</small></span></a></li>`).join('')}</ul>` : '<p class="nota">Nenhuma paragem encontrada.</p>'}`;
  }
  return pagina({ titulo: `Pesquisa${q ? `: ${q}` : ''} | PAROU`, descricao: 'Pesquisa linhas e paragens de transportes públicos em Portugal.', caminho: '/pesquisa', corpo, indexar: false, migalhas: [{ nome: 'Início', url: '/' }, { nome: 'Pesquisa', url: '/pesquisa' }] });
}

// ------------------------------------------------------------------------------------
// Sitemaps
// ------------------------------------------------------------------------------------
const POR_SITEMAP = 40000;
function xml(urls: Array<{ loc: string; lastmod?: string; freq?: string; pri?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${html(SITE + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.freq ? `<changefreq>${u.freq}</changefreq>` : ''}${u.pri ? `<priority>${u.pri}</priority>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

function dataDados(): string {
  const b = getManifestData()?.built_at;
  const d = b ? DateTime.fromISO(String(b)) : DateTime.now();
  return (d.isValid ? d : DateTime.now()).toISODate() || '';
}

export const PAGINAS_APP: Array<{ loc: string; freq: string; pri: string }> = [
  { loc: '/', freq: 'daily', pri: '1.0' },
  { loc: '/linhas', freq: 'weekly', pri: '0.9' },
  { loc: '/greves', freq: 'hourly', pri: '0.9' },
  { loc: '/alertas', freq: 'hourly', pri: '0.8' },
  { loc: '/transportes', freq: 'weekly', pri: '0.8' },
  { loc: '/mapa', freq: 'hourly', pri: '0.6' },
  { loc: '/ocorrencias', freq: 'hourly', pri: '0.5' },
  { loc: '/catalogo', freq: 'monthly', pri: '0.4' },
  { loc: '/cobertura', freq: 'monthly', pri: '0.3' },
  { loc: '/sobre', freq: 'monthly', pri: '0.4' },
  { loc: '/privacidade', freq: 'yearly', pri: '0.2' },
  { loc: '/termos', freq: 'yearly', pri: '0.2' },
];

export function todosOsEnderecos(): string[] {
  const ix = obterIndice();
  const out = PAGINAS_APP.map((p) => p.loc);
  if (!ix) return out;
  for (const o of ix.operadores) {
    out.push(`/linhas/${o.slug}`, `/paragens/${o.slug}`);
    for (const l of o.linhas) out.push(`/linhas/${o.slug}/${l.slug}`);
  }
  for (const o of ix.operadores) for (const g of o.paragens) out.push(`/paragens/${o.slug}/${g.slug}`);
  return out;
}

// ------------------------------------------------------------------------------------
// Rotas
// ------------------------------------------------------------------------------------
function enviar(res: Response, corpo: string, maxAge: number) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  res.setHeader('X-Robots-Tag', 'index, follow');
  res.send(corpo);
}

function aCarregar(res: Response) {
  res.status(503).setHeader('Retry-After', '120');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(pagina({ titulo: 'A atualizar os horários | PAROU', descricao: 'A PAROU está a atualizar os horários. Tenta daqui a um minuto.', caminho: '/linhas', corpo: '<h1>A atualizar os horários…</h1><p>Tenta outra vez daqui a um minuto.</p>', indexar: false }));
}

function naoEncontrado(res: Response, o?: Operador) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(pagina({
    titulo: 'Página não encontrada | PAROU',
    descricao: 'Esta página não existe ou mudou de sítio.',
    caminho: o ? `/linhas/${o.slug}` : '/linhas',
    indexar: false,
    corpo: `<h1>Página não encontrada</h1><p>Esta linha ou paragem não existe ou mudou de nome.</p><p><a class="btn" href="${o ? `/linhas/${o.slug}` : '/linhas'}">Ver ${o ? `as linhas ${html(o.nome)}` : 'todas as linhas'}</a></p>`,
  }));
}

export function registarPaginasSeo(app: Express) {
  // Prepara o índice em segundo plano, assim que os horários estiverem prontos
  const preparar = () => {
    if (!isDadosProntosPronto()) { setTimeout(preparar, 30_000); return; }
    obterIndice();
    // Carris Metropolitana (API): linhas e paragens ficam em memória para as páginas abrirem depressa
    void linhasCM().catch(() => {});
    void paragensCM().catch(() => {});
  };
  setTimeout(preparar, 45_000);

  const pronto = (req: Request, res: Response, next: NextFunction) => {
    if (!isDadosProntosPronto() || !obterIndice()) return aCarregar(res);
    next();
  };

  // Atalhos a partir da app: /linha/<route_id> e /paragem/<stop_id> levam à página pública certa
  app.get('/linha/:id', pronto, (req, res) => {
    const ix = obterIndice()!;
    const l = ix.linhaPorRoute.get(req.params.id);
    const op = l ? ix.operadores.find((o) => o.feedId === l.feedId) : undefined;
    if (!l || !op) return naoEncontrado(res);
    res.redirect(301, `/linhas/${op.slug}/${l.slug}`);
  });
  app.get('/paragem/:id', pronto, (req, res) => {
    const ix = obterIndice()!;
    const g = ix.grupoPorStop.get(req.params.id);
    const op = g ? ix.operadores.find((o) => o.feedId === g.feedId) : undefined;
    if (!g || !op) return naoEncontrado(res);
    res.redirect(301, `/paragens/${op.slug}/${g.slug}`);
  });

  app.get('/linhas', pronto, (_req, res) => enviar(res, emCache('hub', 30 * 60_000, paginaHub), 900));

  app.get('/linhas/:op', pronto, (req, res) => {
    const op = obterIndice()!.porSlugOperador.get(req.params.op);
    if (!op) return naoEncontrado(res);
    enviar(res, emCache(`op:${op.slug}`, 30 * 60_000, () => paginaOperador(op)), 900);
  });

  app.get('/linhas/:op/:linha', pronto, (req, res) => {
    const ix = obterIndice()!;
    const op = ix.porSlugOperador.get(req.params.op);
    const l = ix.linhaPorSlug.get(`${req.params.op}/${req.params.linha}`);
    if (!op || !l) return naoEncontrado(res, op);
    const dia = DateTime.now().setZone(ZONA).toISODate();
    const chave = `l:${op.slug}/${l.slug}:${dia}`;
    const c = cache.get(chave);
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 600);
    paginaLinha(op, l)
      .then((v) => { cache.set(chave, { t: Date.now(), ttl: 20 * 60_000, v }); enviar(res, v, 600); })
      .catch((err) => { console.warn('[SEO] Linha falhou:', err?.message || err); res.status(500).send('Erro'); });
  });

  app.get('/paragens/:op', pronto, (req, res) => {
    const op = obterIndice()!.porSlugOperador.get(req.params.op);
    if (!op) return naoEncontrado(res);
    const p = Number(req.query.p) || 1;
    enviar(res, emCache(`lp:${op.slug}:${p}`, 30 * 60_000, () => paginaListaParagens(op, p)), 900);
  });

  app.get('/paragens/:op/:paragem', pronto, async (req, res) => {
    const ix = obterIndice()!;
    const op = ix.porSlugOperador.get(req.params.op);
    const g = ix.paragemPorSlug.get(`${req.params.op}/${req.params.paragem}`);
    if (!op || !g) return naoEncontrado(res, op);
    const chave = `p:${op.slug}/${g.slug}`;
    const c = cache.get(chave);
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 60);
    try {
      const v = await paginaParagem(op, g);
      cache.set(chave, { t: Date.now(), ttl: 60_000, v });
      enviar(res, v, 60);
    } catch (err: any) {
      console.warn('[SEO] Paragem falhou:', err?.message || err);
      res.status(500).send('Erro');
    }
  });

  app.get('/greves', async (_req, res) => {
    const c = cache.get('greves');
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 300);
    try {
      const v = await paginaGreves();
      cache.set('greves', { t: Date.now(), ttl: 5 * 60_000, v });
      enviar(res, v, 300);
    } catch (err: any) {
      console.warn('[SEO] Greves falhou:', err?.message || err);
      res.status(500).send('Erro');
    }
  });

  app.get('/pesquisa', pronto, (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(paginaPesquisa(q));
  });

  // Sitemaps: um índice e vários ficheiros (máx. 40 000 endereços cada)
  app.get('/sitemap.xml', (_req, res) => {
    const ix = isDadosProntosPronto() ? obterIndice() : null;
    const n = ix ? Math.max(1, Math.ceil(ix.paragemPorSlug.size / POR_SITEMAP)) : 0;
    const hoje = DateTime.now().toISODate();
    const dd = dataDados();
    const mapas = [`<sitemap><loc>${SITE}/sitemap-paginas.xml</loc><lastmod>${hoje}</lastmod></sitemap>`];
    if (ix) {
      mapas.push(`<sitemap><loc>${SITE}/sitemap-linhas.xml</loc><lastmod>${dd}</lastmod></sitemap>`);
      for (let i = 1; i <= n; i++) mapas.push(`<sitemap><loc>${SITE}/sitemap-paragens-${i}.xml</loc><lastmod>${dd}</lastmod></sitemap>`);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${mapas.join('\n')}\n</sitemapindex>\n`);
  });

  app.get('/sitemap-paginas.xml', (_req, res) => {
    const hoje = DateTime.now().toISODate() || '';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml(PAGINAS_APP.map((p) => ({ loc: p.loc, lastmod: ['/greves', '/alertas', '/mapa', '/ocorrencias'].includes(p.loc) ? hoje : undefined, freq: p.freq, pri: p.pri }))));
  });

  app.get('/sitemap-linhas.xml', pronto, (_req, res) => {
    const ix = obterIndice()!;
    const dd = dataDados();
    const urls: Array<{ loc: string; lastmod?: string; freq?: string; pri?: string }> = [];
    for (const o of ix.operadores) {
      urls.push({ loc: `/linhas/${o.slug}`, lastmod: dd, freq: 'weekly', pri: '0.8' });
      urls.push({ loc: `/paragens/${o.slug}`, lastmod: dd, freq: 'weekly', pri: '0.5' });
      const pags = Math.ceil(o.paragens.length / POR_PAGINA);
      for (let i = 2; i <= pags; i++) urls.push({ loc: `/paragens/${o.slug}?p=${i}`, lastmod: dd, freq: 'weekly', pri: '0.3' });
      for (const l of o.linhas) urls.push({ loc: `/linhas/${o.slug}/${l.slug}`, lastmod: dd, freq: 'weekly', pri: '0.7' });
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml(urls));
  });

  app.get('/sitemap-paragens-:n.xml', pronto, (req, res) => {
    const ix = obterIndice()!;
    const n = Number(req.params.n) || 1;
    const dd = dataDados();
    const todas: Array<{ loc: string; lastmod?: string; freq?: string; pri?: string }> = [];
    for (const o of ix.operadores) for (const g of o.paragens) todas.push({ loc: `/paragens/${o.slug}/${g.slug}`, lastmod: dd, freq: 'daily', pri: '0.6' });
    const fatia = todas.slice((n - 1) * POR_SITEMAP, n * POR_SITEMAP);
    if (fatia.length === 0) return res.status(404).send('');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml(fatia));
  });
}

// Para os testes locais
export const _paginas = { paginaHub, paginaOperador, paginaLinha, paginaParagem, paginaGreves, paginaPesquisa, paginaListaParagens };
