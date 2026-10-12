// =====================================================================================
// PAROU.PT — Páginas públicas para os motores de pesquisa (SEO)
//
// HTML feito no servidor (rápido, sem JavaScript) para cada operador, linha e paragem, mais
// /greves, /pesquisa e os sitemaps. Cada página tem conteúdo próprio e útil (horários reais,
// próximas partidas, paragens perto), dados estruturados (schema.org) e liga às outras e à app.
// =====================================================================================
import type { Express, Request, Response, NextFunction } from 'express';
import { DateTime } from 'luxon';
import { AsyncLocalStorage } from 'node:async_hooks';
import { obterIndice, paragensPerto, modoDoTipo, NOME_REGIAO, type Linha, type GrupoParagem, type Operador } from './indice';
import { horarioDaLinha, linhasDaParagem, NOME_TIPO_DIA, proximoDia, type HorarioLinha, type TipoDia } from './horarios';
import { linhasCM, paragensCM, padraoCM, partidasPadrao, passagensHojeCM } from './carrisMetropolitana';
import { getDatabase } from '../db/gtfsDatabase';
import { html, hora, cortar, slug, nomeBonito } from './texto';
import { LinesEngine } from '../linesEngine';
import { isDadosProntosPronto, getManifestData, getVersaoBaseAtiva } from '../dadosProntos';
import { obterGreves } from '../alertasEngine';
import { obterIncidentes, type IncidenteProtecaoCivil } from '../fogosEngine';

const SITE = 'https://parou.pt';
const ZONA = 'Europe/Lisbon';

// ------------------------------------------------------------------------------------
// Idioma. As páginas são escritas em português. Quem tem a app em inglês (cookie parou_idioma=en, posto pela app
// ao arrancar) vê a versão inglesa, que não é indexada: o Google continua a ver o português. O idioma do pedido
// segue o código através de um AsyncLocalStorage (várias páginas são montadas em funções assíncronas).
// ------------------------------------------------------------------------------------
type Lang = 'pt' | 'en';
const idiomaPedido = new AsyncLocalStorage<Lang>();
const emIngles = (): boolean => idiomaPedido.getStore() === 'en';
/** Texto no idioma do pedido: L('português', 'english') */
const L = (pt: string, ingles: string): string => (emIngles() ? ingles : pt);
const LOCALE = (): string => (emIngles() ? 'en-GB' : 'pt-PT');
const num = (n: number): string => n.toLocaleString(LOCALE());
function idiomaDoPedido(req: Request): Lang {
  const q = String(req.query.lang || '');
  if (q === 'en' || q === 'pt') return q;
  return /(?:^|;\s*)parou_idioma=en(?:;|$)/.test(req.headers.cookie || '') ? 'en' : 'pt';
}
/** Primeiro passo de cada rota: fixa o idioma do pedido para tudo o que vem a seguir */
const comIdioma = (req: Request, _res: Response, next: NextFunction) => idiomaPedido.run(idiomaDoPedido(req), () => next());

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
.grelha.estreita{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
.resumo.duplo{grid-template-columns:repeat(2,1fr)}@media(min-width:640px){.resumo.duplo{grid-template-columns:repeat(4,1fr)}}
ul.lista li.fogo{padding:12px 14px}.fogo .l1{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}.fogo .l1 b{font-size:17px;line-height:1.25}
.fogo .onde{margin-top:2px}.fogo .meta{margin-top:2px;font-size:13px;color:#6B6B6B;font-variant-numeric:tabular-nums}
.estado{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.estado:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
footer.rodape{border-top:1px solid #E6E6E3;background:#F4F4F2;color:#4A4A4A;font-size:14px}footer .in{max-width:880px;margin:0 auto;padding:22px 16px 30px}
footer nav{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0}footer a{text-decoration:none}footer a:hover{text-decoration:underline}
footer button.idioma{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:999px;padding:5px 14px;min-height:32px;cursor:pointer;opacity:.85}footer button.idioma:hover{opacity:1}
@media(max-width:520px){h1{font-size:26px}.btn.esconde{display:none}}
`;

// Temas (Escuro e Âmbar) para as páginas feitas no servidor. O tema vem do localStorage (mesma chave da app) e é aplicado
// antes de desenhar a página, para não piscar. O Claro é o de sempre e não leva nada.
const CSS_TEMAS = `
html[data-tema=escuro]{color-scheme:dark;background:#0F0F10}
html[data-tema=escuro] body{background:#0F0F10;color:#F2F2F0}
html[data-tema=escuro] header.topo{background:#161618;border-color:#2A2A2E}
html[data-tema=escuro] .btn{background:#F2F2F0;color:#111}
html[data-tema=escuro] .btn.laranja{background:#FF6B1A;color:#111}
html[data-tema=escuro] .btn.claro{background:#26262B;color:#F2F2F0}
html[data-tema=escuro] nav.migalhas,html[data-tema=escuro] nav.migalhas a,html[data-tema=escuro] .nota,html[data-tema=escuro] .resumo span,html[data-tema=escuro] .lista .t small,html[data-tema=escuro] .lista .dir,html[data-tema=escuro] ol.percurso small,html[data-tema=escuro] .partidas .hora small,html[data-tema=escuro] .grelha small,html[data-tema=escuro] .fogo .meta,html[data-tema=escuro] details>summary:after,html[data-tema=escuro] h1 span[style]{color:#A9A9AF!important}
html[data-tema=escuro] .sub{color:#C9C9CD}
html[data-tema=escuro] .chip{box-shadow:0 0 0 1px rgba(255,255,255,.22)}
html[data-tema=escuro] .cartao,html[data-tema=escuro] details{background:#1E1E21;border-color:#34343A}
html[data-tema=escuro] .resumo div{background:#26262B}
html[data-tema=escuro] ul.lista,html[data-tema=escuro] .grelha a{border-color:#34343A}
html[data-tema=escuro] ul.lista li{border-color:#2A2A2E}
html[data-tema=escuro] ul.lista a:hover{background:#26262B}
html[data-tema=escuro] .grelha a:hover{border-color:#F2F2F0}
html[data-tema=escuro] ol.percurso li{border-color:#44444A}
html[data-tema=escuro] ol.percurso li:before{background:#0F0F10;border-color:#F2F2F0}
html[data-tema=escuro] table.horas td{border-color:#2A2A2E}
html[data-tema=escuro] table.horas td:first-child{color:#F2F2F0}
html[data-tema=escuro] table.horas td:last-child{color:#D2D2D6}
html[data-tema=escuro] form.pesquisa input{background:#26262B;border-color:#34343A;color:#F2F2F0}
html[data-tema=escuro] form.pesquisa input::placeholder{color:#A9A9AF}
html[data-tema=escuro] .paginas a{background:#26262B}
html[data-tema=escuro] .paginas span{background:#F2F2F0;color:#111}
html[data-tema=escuro] .aviso{background:#2B1C12;border-color:#5A3A22}
html[data-tema=escuro] footer.rodape{background:#161618;border-color:#2A2A2E;color:#B5B5BB}
html[data-tema=escuro] svg path[stroke="#111"]{stroke:#F2F2F0}

html[data-tema=ambar]{color-scheme:light;background:#FFE3C8}
html[data-tema=ambar] body{color:#2A170B;background-color:#FFE3C8;background-image:radial-gradient(900px 620px at 100% -8%,rgba(255,150,70,.55),transparent 62%),radial-gradient(760px 560px at -12% 18%,rgba(255,196,140,.75),transparent 60%),linear-gradient(180deg,#FFF3E6 0%,#FFE6CF 55%,#FFD9B8 100%);background-attachment:fixed}
html[data-tema=ambar] header.topo{background:rgba(255,248,240,.72);border-color:rgba(255,255,255,.7);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4)}
html[data-tema=ambar] .btn{background:linear-gradient(180deg,#FF8A3D,#FF6B1A);color:#1F0F05;box-shadow:0 6px 16px rgba(255,107,26,.32)}
html[data-tema=ambar] .btn.claro{background:rgba(255,250,245,.7);color:#2A170B;box-shadow:none;border:1px solid rgba(255,255,255,.8)}
html[data-tema=ambar] nav.migalhas,html[data-tema=ambar] nav.migalhas a,html[data-tema=ambar] .nota,html[data-tema=ambar] .resumo span,html[data-tema=ambar] .lista .t small,html[data-tema=ambar] .lista .dir,html[data-tema=ambar] ol.percurso small,html[data-tema=ambar] .partidas .hora small,html[data-tema=ambar] .grelha small,html[data-tema=ambar] .fogo .meta,html[data-tema=ambar] details>summary:after,html[data-tema=ambar] h1 span[style]{color:#70513C!important}
html[data-tema=ambar] .sub{color:#5A3B27}
html[data-tema=ambar] .cartao,html[data-tema=ambar] details,html[data-tema=ambar] ul.lista,html[data-tema=ambar] .grelha a{background:rgba(255,250,245,.62);border-color:rgba(255,255,255,.85);box-shadow:0 8px 24px rgba(160,80,20,.1);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
html[data-tema=ambar] .resumo div{background:rgba(255,250,245,.66);border:1px solid rgba(255,255,255,.8)}
html[data-tema=ambar] ul.lista li{border-color:rgba(190,110,50,.18)}
html[data-tema=ambar] ul.lista a:hover{background:rgba(255,255,255,.55)}
html[data-tema=ambar] .grelha a:hover{border-color:#FF6B1A}
html[data-tema=ambar] ol.percurso li{border-color:rgba(190,110,50,.35)}
html[data-tema=ambar] ol.percurso li:before{background:#FFF4E8;border-color:#FF6B1A}
html[data-tema=ambar] table.horas td{border-color:rgba(190,110,50,.2)}
html[data-tema=ambar] table.horas td:first-child{color:#2A170B}
html[data-tema=ambar] table.horas td:last-child{color:#3A2415}
html[data-tema=ambar] form.pesquisa input{background:rgba(255,250,245,.8);border-color:rgba(255,255,255,.9);color:#2A170B}
html[data-tema=ambar] .paginas a{background:rgba(255,250,245,.7)}
html[data-tema=ambar] .paginas span{background:#FF6B1A;color:#1F0F05}
html[data-tema=ambar] .aviso{background:rgba(255,236,218,.85);border-color:#FFC49A}
html[data-tema=ambar] footer.rodape{background:rgba(255,244,232,.7);border-color:rgba(255,255,255,.8);color:#4A2F1C}
`;

const SCRIPT_TEMA = `try{var t=localStorage.getItem('parou_tema');if(t==='escuro'||t==='ambar'){document.documentElement.setAttribute('data-tema',t);var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',t==='escuro'?'#161618':'#FFE9D2')}}catch(e){}`;

// Troca de idioma nas páginas do servidor: guarda a escolha (cookie para o servidor, localStorage para a app) e recarrega
const SCRIPT_IDIOMA = `function parouIdioma(l){try{localStorage.setItem('parou_idioma',l)}catch(e){}try{document.cookie='parou_idioma='+l+';path=/;max-age=31536000;samesite=lax'}catch(e){}location.reload()}`;

function migalhasHtml(m: Migalha[]): string {
  if (!m.length) return '';
  return `<nav class="migalhas" aria-label="${L('Estás em', 'You are here')}">${m
    .map((x, i) => (i === m.length - 1 ? `<span>${html(x.nome)}</span>` : `<a href="${html(x.url)}">${html(x.nome)}</a> <span aria-hidden="true">›</span>`))
    .join(' ')}</nav>`;
}

function rodape(): string {
  const ix = obterIndice();
  const principais = (ix?.operadores || []).slice(0, 14).map((o) => `<a href="/linhas/${o.slug}">${html(o.nome)}</a>`).join('');
  return `<footer class="rodape"><div class="in">
<div class="marca" style="font-size:20px">${LOGO_SVG}PAROU</div>
<nav aria-label="PAROU"><a href="/">${L('Perto de mim', 'Nearby')}</a><a href="/linhas">${L('Linhas e horários', 'Lines and timetables')}</a><a href="/cidades">${L('Cidades', 'Cities')}</a><a href="/greves">${L('Greves', 'Strikes')}</a><a href="/incendios">${L('Incêndios', 'Fires')}</a><a href="/alertas">${L('Alertas', 'Alerts')}</a><a href="/mapa">${L('Mapa', 'Map')}</a><a href="/sobre">${L('Sobre', 'About')}</a><a href="/privacidade">${L('Privacidade', 'Privacy')}</a><a href="/termos">${L('Termos', 'Terms')}</a><a href="/apagar-conta">${L('Apagar conta', 'Delete account')}</a><a href="/contactar">${L('Contactar', 'Contact')}</a></nav>
<nav aria-label="${L('Operadores', 'Operators')}">${principais}</nav>
<p class="nota">${L('Gratuita e sem fins lucrativos. Horários oficiais publicados pelos operadores (GTFS) e pelo IMT; podem mudar sem aviso — em caso de dúvida confirma junto do operador.', 'Free and non-profit. Official timetables published by the operators (GTFS) and by IMT; they can change without notice — if in doubt, check with the operator.')}</p>
<p style="margin:12px 0 0"><button type="button" class="idioma" lang="${emIngles() ? 'pt' : 'en'}" onclick="parouIdioma('${emIngles() ? 'pt' : 'en'}')">${emIngles() ? 'Português' : 'English'}</button></p>
</div></footer>`;
}

function pagina(o: OpcoesPagina): string {
  const ingles = emIngles();
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
<html lang="${ingles ? 'en' : 'pt-PT'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(titulo)}</title>
<meta name="description" content="${html(desc)}">
<meta name="robots" content="${o.indexar === false || ingles ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<link rel="canonical" href="${html(canonico)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PAROU"><meta property="og:locale" content="${ingles ? 'en_GB' : 'pt_PT'}">
<meta property="og:url" content="${html(canonico)}"><meta property="og:title" content="${html(titulo)}"><meta property="og:description" content="${html(desc)}">
<meta property="og:image" content="${SITE}${o.imagem || '/og-image.png'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${html(titulo)}"><meta name="twitter:description" content="${html(desc)}"><meta name="twitter:image" content="${SITE}${o.imagem || '/og-image.png'}">
${verifG ? `<meta name="google-site-verification" content="${html(verifG)}">` : ''}${verifB ? `<meta name="msvalidate.01" content="${html(verifB)}">` : ''}
<meta name="theme-color" content="#FFFFFF"><script>${SCRIPT_TEMA}${SCRIPT_IDIOMA}</script><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>${CSS}${CSS_TEMAS}</style>
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body>
<header class="topo"><div class="topo-in"><a class="marca" href="/" aria-label="${L('PAROU — início', 'PAROU — home')}">${LOGO_SVG}PAROU</a>
<div style="display:flex;gap:8px"><a class="btn claro esconde" href="/linhas">${L('Linhas', 'Lines')}</a><a class="btn" href="/">${L('Abrir a app', 'Open the app')}</a></div></div></header>
<main>${migalhasHtml(migalhas)}${o.corpo}</main>
${rodape()}
${o.script ? `<script>${o.script}</script>` : ''}
</body></html>`;
}

function corTexto(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  // Preto ou branco, o que tiver mais contraste com o fundo (luminância relativa, WCAG)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const comBranco = 1.05 / (L + 0.05);
  const comPreto = (L + 0.05) / (0.0137 + 0.05); // #111
  return comPreto >= comBranco ? '#111' : '#fff';
}

function chip(l: Linha): string {
  const cor = /^#[0-9a-f]{6}$/i.test(l.cor) && l.cor.toLowerCase() !== '#ffffff' ? l.cor : '#111111';
  const txt = l.sigla || l.codigo.slice(0, 5);
  return `<span class="chip" style="background:${cor};color:${corTexto(cor)}">${html(txt || '•')}</span>`;
}

function nomeLinha(l: Linha): string {
  if (/^linha /i.test(l.codigo) || !l.codigo) return l.codigo || l.nome;
  return /^\d|^[A-Z0-9]{1,4}$/.test(l.codigo) ? L(`Linha ${l.codigo}`, `Line ${l.codigo}`) : l.codigo;
}

const MODO_PLURAL: Record<string, string> = { Autocarro: 'autocarros', Metro: 'metros', Comboio: 'comboios', Barco: 'barcos', 'Elétrico': 'elétricos' };
const NOME_MODO_EN: Record<string, string> = { Autocarro: 'Bus', Metro: 'Metro', Comboio: 'Train', Barco: 'Boat', 'Elétrico': 'Tram' };
const MODO_PLURAL_EN: Record<string, string> = { Autocarro: 'buses', Metro: 'metro trains', Comboio: 'trains', Barco: 'boats', 'Elétrico': 'trams' };
const NOME_REGIAO_EN: Record<string, string> = {
  Lisboa: 'Lisboa e Setúbal (Área Metropolitana de Lisboa)',
  Porto: 'Porto (Área Metropolitana do Porto)',
  Minho: 'Braga, Guimarães, Barcelos and Famalicão',
  Coimbra: 'Coimbra',
  Algarve: 'Algarve',
  Madeira: 'Madeira',
  'Todo o país': 'Trains nationwide',
  Outros: 'Other operators',
};
const NOME_TIPO_DIA_EN: Record<TipoDia, string> = { uteis: 'Weekdays', sabado: 'Saturdays', domingo: 'Sundays and holidays' };

/** Nome do modo no idioma do pedido (Autocarro / Bus) */
function nomeModo(modo: string): string { return emIngles() ? NOME_MODO_EN[modo] || modo : modo; }
/** "autocarros" / "buses" */
function pluralModo(modo: string): string { return emIngles() ? MODO_PLURAL_EN[modo] || 'transport' : MODO_PLURAL[modo] || 'transportes'; }
function nomeRegiao(r: string): string { return emIngles() ? NOME_REGIAO_EN[r] || r : NOME_REGIAO[r] || r; }
function nomeTipoDia(t: TipoDia): string { return emIngles() ? NOME_TIPO_DIA_EN[t] : NOME_TIPO_DIA[t]; }
function nLinhas(n: number): string { return L(`${n} ${n === 1 ? 'linha' : 'linhas'}`, `${n} ${n === 1 ? 'line' : 'lines'}`); }
/** Título de um sentido: "Sentido Campanhã" / "Towards Campanhã" */
function tituloSentido(destino: string): string {
  if (destino === 'circular') return L('Sentido circular', 'Circular route');
  const m = /^#(\d+)$/.exec(destino);
  if (m) return L(`Sentido ${m[1]}`, `Direction ${m[1]}`);
  return L(`Sentido ${destino}`, `Towards ${destino}`);
}
function destinoReal(destino: string | undefined): boolean { return !!destino && destino !== 'circular' && !destino.startsWith('#'); }
/** Lista com "e" no fim: "A, B e C" / "A, B and C" */
function juntarComE(nomes: string[]): string {
  const e = L(' e ', ' and ');
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')}${e}${nomes[nomes.length - 1]}` : nomes[0] || '';
}

function tipoParagem(modo: string) {
  if (modo === 'Metro') return { palavra: L('Estação', 'Station'), schema: 'SubwayStation', paragem: false };
  if (modo === 'Comboio') return { palavra: L('Estação', 'Station'), schema: 'TrainStation', paragem: false };
  if (modo === 'Barco') return { palavra: L('Terminal', 'Terminal'), schema: 'BoatTerminal', paragem: false };
  return { palavra: L('Paragem', 'Stop'), schema: 'BusStop', paragem: true };
}

function dataBase(): string {
  const b = getManifestData()?.built_at;
  const dt = b ? DateTime.fromISO(String(b), { zone: ZONA }) : DateTime.now().setZone(ZONA);
  return dt.isValid ? dt.setLocale(LOCALE()).toFormat(emIngles() ? 'd LLLL yyyy' : "d 'de' LLLL 'de' yyyy") : '';
}

// ------------------------------------------------------------------------------------
// Cache das páginas (uma entrada por idioma)
// ------------------------------------------------------------------------------------
const cache = new Map<string, { t: number; ttl: number; v: string }>();
const chaveIdioma = (k: string): string => (emIngles() ? `en:${k}` : k);
function emCache(chave: string, ttlMs: number, fazer: () => string): string {
  const k = chaveIdioma(chave);
  const c = cache.get(k);
  if (c && Date.now() - c.t < c.ttl) return c.v;
  const v = fazer();
  cache.set(k, { t: Date.now(), ttl: ttlMs, v });
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
  let corpo = `<h1>${L('Linhas e horários de transportes públicos em Portugal', 'Public transport lines and timetables in Portugal')}</h1>
<p class="sub">${L(
    `Horários de ${num(totalLinhas)} linhas de autocarro, metro, comboio e barco e ${num(totalParagens)} paragens de ${ix.operadores.length} operadores — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e muitos mais. Escolhe o operador, a linha ou pesquisa uma paragem.`,
    `Timetables for ${num(totalLinhas)} bus, metro, train and boat lines and ${num(totalParagens)} stops from ${ix.operadores.length} operators — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto and many more. Pick an operator or a line, or search for a stop.`)}</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="${L('Linha ou paragem (ex.: 801, Marquês de Pombal)', 'Line or stop (e.g. 801, Marquês de Pombal)')}" aria-label="${L('Pesquisar linha ou paragem', 'Search for a line or stop')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search')}</button></form>
<div class="aviso">${L('Queres saber quando passa o próximo? <a href="/"><b>Abre a PAROU</b></a> e vê os transportes à tua volta em tempo real.', 'Want to know when the next one comes? <a href="/"><b>Open PAROU</b></a> and see the transport around you in real time.')}</div>
<h2>${L('Por cidade', 'By city')}</h2><p>${CIDADES.slice(0, 24).map((c) => `<a href="/cidade/${c.slug}">${html(c.nome)}</a>`).join(' · ')} · <a href="/cidades">${L('todas', 'all')}</a></p>`;
  for (const [regiao, ops] of porRegiao) {
    corpo += `<h2>${html(nomeRegiao(regiao))}</h2><div class="grelha">${ops
      .map((o) => `<a href="/linhas/${o.slug}"><b>${html(o.nome)}</b><small>${html(nomeModo(o.modo))} · ${nLinhas(o.linhas.length)} · ${num(o.paragens.length)} ${L('paragens', 'stops')}</small></a>`)
      .join('')}</div>`;
  }
  const outros = Math.max(0, ix.operadores.length - 6);
  return pagina({
    titulo: L('Linhas e horários de autocarros, metro e comboios em Portugal | PAROU', 'Bus, metro and train lines and timetables in Portugal | PAROU'),
    descricao: L(
      `Horários de autocarro, metro, comboio e barco em Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e mais ${outros} operadores. Paragens e tempo real.`,
      `Bus, metro, train and boat timetables in Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto and ${outros} more operators. Stops and real time.`),
    caminho: '/linhas',
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas e horários', 'Lines and timetables'), url: '/linhas' }],
  });
}

// Operadores com tempo real na PAROU (Carris Metropolitana, STCP e Metro de Lisboa); nos outros só há o horário oficial
const COM_TEMPO_REAL = new Set(['carris-metropolitana', 'stcp', 'metro-de-lisboa']);

function paginaOperador(op: Operador): string {
  const plural = pluralModo(op.modo);
  const tr = COM_TEMPO_REAL.has(op.slug);
  const corpo = `<h1>${L(`Horários ${html(op.nome)}: linhas e paragens`, `${html(op.nome)} timetables: lines and stops`)}</h1>
<p class="sub">${L(
    `${html(op.nome)} tem ${nLinhas(op.linhas.length)} e ${num(op.paragens.length)} paragens na PAROU. Escolhe uma linha para ver o horário de dias úteis, sábados e domingos e todas as paragens do percurso${tr ? ' — ou abre a app para ver os próximos ' + plural + ' em tempo real' : ''}.`,
    `${html(op.nome)} has ${nLinhas(op.linhas.length)} and ${num(op.paragens.length)} stops on PAROU. Pick a line to see the weekday, Saturday and Sunday timetable and every stop on the route${tr ? ' — or open the app to see the next ' + plural + ' in real time' : ''}.`)}</p>
<p><a class="btn laranja" href="/">${L(`Ver ${plural} perto de mim`, `See ${plural} near me`)}</a> <a class="btn claro" href="/paragens/${op.slug}">${L('Todas as paragens', 'All stops')}</a></p>
<h2>${L(`Linhas ${html(op.nome)}`, `${html(op.nome)} lines`)}</h2>
<ul class="lista">${op.linhas.map((l) => `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}${l.nome ? `<small>${html(l.nome)}</small>` : ''}</span></a></li>`).join('')}</ul>
<p class="nota">${L(`Horários oficiais publicados pela ${html(op.nome)}. Atualizado a ${html(dataBase())}.`, `Official timetables published by ${html(op.nome)}. Updated ${html(dataBase())}.`)}</p>`;
  return pagina({
    titulo: L(`Horários ${op.nome}${tr ? ' e tempo real' : ''}: linhas e paragens | PAROU`, `${op.nome} timetables${tr ? ' and real time' : ''}: lines and stops | PAROU`),
    descricao: L(
      `Horários das ${op.linhas.length} linhas ${op.nome} (${op.modo.toLowerCase()}): partidas de dias úteis, sábados e domingos, percurso e paragens${tr ? `, com os próximos ${plural} em tempo real` : ' e próximas partidas em cada paragem'}.`,
      `Timetables for the ${op.linhas.length} ${op.nome} lines (${nomeModo(op.modo).toLowerCase()}): weekday, Saturday and Sunday departures, route and stops${tr ? `, with the next ${plural} in real time` : ' and next departures at every stop'}.`),
    caminho: `/linhas/${op.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas', 'Lines'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: L(`Linhas ${op.nome}`, `${op.nome} lines`), numberOfItems: op.linhas.length, itemListElement: op.linhas.slice(0, 200).map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: `${nomeLinha(l)} ${l.nome}`.trim(), url: `${SITE}/linhas/${op.slug}/${l.slug}` })) }],
  });
}

function tabelaHoras(partidas: number[]): string {
  if (partidas.length === 0) return `<p class="nota">${L('Sem partidas neste dia.', 'No departures on this day.')}</p>`;
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
      destino: comOrdem ? nomeBonito(lista[lista.length - 1].stop_name) : (direcao === 3 ? 'circular' : `#${direcao}`),
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
  const T = {
    falha: L('Horário de hoje indisponível neste momento: o serviço da AMP só responde a ligações feitas em Portugal. Na <a href="/">app PAROU</a> vês as partidas ao minuto.', 'Today\'s timetable is not available right now: the AMP service only answers connections made from Portugal. In the <a href="/">PAROU app</a> you see departures minute by minute.'),
    semSentido: L('Sem partidas hoje neste sentido.', 'No departures today in this direction.'),
    hoje: L('Hoje: {n} partidas, {a}–{b}', 'Today: {n} departures, {a}–{b}'),
    prox: L(' · próxima às <b>{h}</b>', ' · next at <b>{h}</b>'),
    notaLinha: L('Horário da AMP para hoje, na primeira paragem.', 'AMP timetable for today, at the first stop.'),
    semMais: L('Sem mais partidas hoje.', 'No more departures today.'),
    chegar: L('a chegar', 'arriving'),
    min: L('daqui a {m} min', 'in {m} min'),
    horas: L('daqui a {h} h {m}', 'in {h} h {m} min'),
    notaProx: L('Horário da AMP, às {h}. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.', 'AMP timetable, at {h}. To follow it minute by minute, open the <a href="/">PAROU app</a>.'),
  };
  return `window.__UNIR_LINHAS=${JSON.stringify(linhas).replace(/</g, '\\u003c')};window.__UNIR_T=${JSON.stringify(T).replace(/</g, '\\u003c')};(function(){
var Z='Europe/Lisbon',L=window.__UNIR_LINHAS||{},T=window.__UNIR_T;
function f(s,o){for(var k in o)s=s.split('{'+k+'}').join(o[k]);return s}
function dia(){return new Intl.DateTimeFormat('en-CA',{timeZone:Z,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function agora(){var p=new Intl.DateTimeFormat('en-GB',{timeZone:Z,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).split(':').map(Number);return (p[0]%24)*3600+p[1]*60+p[2]}
function pedir(c){return fetch('https://paragens.amp.pt/acarto2/get_horarios_prg?dia='+dia()+'&id='+encodeURIComponent(c)).then(function(r){return r.json()}).then(function(d){if(typeof d==='string')d=JSON.parse(d);if(!d||!d.horarios)throw 0;return d.horarios})}
function seg(x){var a=String(x.chegada||'').split(':').map(Number);return a[0]*3600+(a[1]||0)*60+(a[2]||0)}
function hm(s){s=((s%86400)+86400)%86400;return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function limpo(t){return String(t||'').replace(/\\s+/g,' ').trim()}
function chip(c){var u=L[c];return u?'<a class="chip" style="background:#CE9926;color:#111;text-decoration:none" href="'+esc(u)+'">'+esc(c)+'</a>':'<span class="chip" style="background:#CE9926;color:#111">'+esc(c)+'</span>'}
var falha='<p class="nota">'+T.falha+'</p>';
document.querySelectorAll('[data-unir]').forEach(function(el){
  var cods=(el.getAttribute('data-cods')||'').split(',').filter(Boolean);
  Promise.all(cods.map(pedir)).then(function(ls){
    var t=[].concat.apply([],ls),a=agora();
    if(el.getAttribute('data-unir')==='linha'){
      var li=el.getAttribute('data-linha'),se=el.getAttribute('data-sentido'),vistos={},hs=[];
      t.forEach(function(x){if(limpo(x.linha)===li&&limpo(x.sentido)===se){var s=seg(x);if(!vistos[s]){vistos[s]=1;hs.push(s)}}});
      hs.sort(function(x,y){return x-y});
      if(!hs.length){el.innerHTML='<p class="nota">'+T.semSentido+'</p>';return}
      var ph={};hs.forEach(function(s){var h=Math.floor(s/3600);(ph[h]=ph[h]||[]).push(hm(s).slice(3))});
      var prox=hs.filter(function(s){return s>=a-60})[0];
      el.innerHTML='<p class="sub">'+f(T.hoje,{n:hs.length,a:hm(hs[0]),b:hm(hs[hs.length-1])})+(prox!=null?f(T.prox,{h:hm(prox)}):'')+'.</p><table class="horas"><tbody>'+Object.keys(ph).map(Number).sort(function(x,y){return x-y}).map(function(h){return '<tr><td>'+String(h%24).padStart(2,'0')+'</td><td>'+ph[h].join(' ')+'</td></tr>'}).join('')+'</tbody></table><p class="nota">'+T.notaLinha+'</p>';
    }else{
      var px=t.map(function(x){return {l:limpo(x.linha),d:limpo(x.destino),s:seg(x)}}).filter(function(x){return x.s>=a-60}).sort(function(x,y){return x.s-y.s}).slice(0,12);
      if(!px.length){el.innerHTML='<p class="nota">'+T.semMais+'</p>';return}
      el.innerHTML='<ul class="lista partidas">'+px.map(function(x){var m=Math.max(0,Math.round((x.s-a)/60));var q=m<=0?T.chegar:m<60?f(T.min,{m:m}):f(T.horas,{h:Math.floor(m/60),m:String(m%60).padStart(2,'0')});return '<li><div class="linha">'+chip(x.l)+'<span class="t">'+esc(x.d)+'</span><span class="hora">'+hm(x.s)+'<small>'+q+'</small></span></div></li>'}).join('')+'</ul><p class="nota">'+f(T.notaProx,{h:hm(a)})+'</p>';
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
  const plural = pluralModo(modo);
  const nParagens = Math.max(0, ...h.sentidos.map((s) => s.paragens.length));
  const percurso = l.nome || (h.sentidos[0] ? `${h.sentidos[0].paragens[0]?.nome} – ${h.sentidos[0].destino}` : '');
  const daDo = /^linha/i.test(nome) ? 'da' : 'do';
  let corpo = `<h1>${chip(l)} ${html(nome)}${percurso ? ` <span style="font-weight:500">· ${html(percurso)}</span>` : ''}</h1>
<p class="sub">${L(
    `Horário ${daDo} ${html(nome)} ${html(op.nome)} (${html(modo.toLowerCase())}): partidas de dias úteis, sábados e domingos e as ${nParagens} paragens do percurso.`,
    `Timetable for ${html(nome)} ${html(op.nome)} (${html(nomeModo(modo).toLowerCase())}): weekday, Saturday and Sunday departures and all ${nParagens} stops on the route.`)}</p>
<div class="resumo">
<div><b>${h.hoje.primeira != null ? hora(h.hoje.primeira) : '—'}</b><span>${L('Primeira partida hoje', 'First departure today')}</span></div>
<div><b>${h.hoje.ultima != null ? hora(h.hoje.ultima) : '—'}</b><span>${L('Última partida hoje', 'Last departure today')}</span></div>
<div><b>${h.hoje.total || '—'}</b><span>${L('Partidas hoje', 'Departures today')}${h.sentidos[0] ? ` (${L('sentido', 'towards')} ${html(h.sentidos[0].destino)})` : ''}</span></div>
${h.hoje.intervaloPonta ? `<div><b>${h.hoje.intervaloPonta} min</b><span>${L('Intervalo às horas de ponta', 'Interval at peak hours')}</span></div>` : ''}
</div>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">${L('Ver em tempo real', 'See in real time')}</a></p>`;
  for (const s of h.sentidos) {
    corpo += `<h2>${html(tituloSentido(s.destino))}</h2>
<p class="nota">${L('Partidas de', 'Departures from')} ${html(s.paragens[0]?.nome || '')}.</p>`;
    s.horarios.forEach((hh, i) => {
      const dia = DateTime.fromISO(hh.data, { zone: ZONA }).setLocale(LOCALE());
      const resumoDia = hh.partidas.length
        ? `${hh.partidas.length} ${L('partidas', 'departures')} · ${hora(hh.partidas[0])}–${hora(hh.partidas[hh.partidas.length - 1])}`
        : L('sem serviço', 'no service');
      corpo += `<details${i === 0 ? ' open' : ''}><summary>${html(nomeTipoDia(hh.tipo))}<span class="nota" style="margin-left:auto">${resumoDia}</span></summary><div class="dentro">${tabelaHoras(hh.partidas)}<p class="nota">${L('Horário de', 'Timetable for')} ${html(dia.toFormat(emIngles() ? 'cccc, d LLLL' : "cccc, d 'de' LLLL"))}.</p></div></details>`;
    });
    corpo += `<h3>${L('Paragens', 'Stops')} (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      const nomeP = html(p.nome);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${nomeP}</a>` : nomeP}${p.minutos ? `<small>+${p.minutos} min</small>` : ''}</li>`;
    }).join('')}</ol>`;
  }
  // Outras linhas do mesmo operador (ligações internas)
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>${L(`Outras linhas ${html(op.nome)}`, `Other ${html(op.nome)} lines`)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">${L(`Ver todas as linhas ${html(op.nome)} ›`, `See all ${html(op.nome)} lines ›`)}</a></p>`;
  }
  corpo += `<p class="nota">${L(
    `Horários oficiais publicados pela ${html(op.nome)} (atualizados a ${html(dataBase())}). Podem mudar em feriados, greves ou obras: para os próximos ${plural} em tempo real usa a <a href="/">app PAROU</a>.`,
    `Official timetables published by ${html(op.nome)} (updated ${html(dataBase())}). They can change on holidays, strikes or roadworks: for the next ${plural} in real time use the <a href="/">PAROU app</a>.`)}</p>`;
  const tituloBase = `${nome} ${op.nome}`;
  return pagina({
    titulo: cortar(L(`${tituloBase}: horários e paragens${percurso ? ` (${percurso})` : ''}`, `${tituloBase}: timetable and stops${percurso ? ` (${percurso})` : ''}`), 64) + ' | PAROU',
    descricao: L(
      `Horário ${daDo} ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: primeira e última partida, horários de dias úteis, sábados e domingos e as ${nParagens} paragens. Tempo real na PAROU.`,
      `Timetable for ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: first and last departure, weekday, Saturday and Sunday timetables and all ${nParagens} stops. Real time on PAROU.`),
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas', 'Lines'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
  });
}

function paginaLinhaUnir(op: Operador, l: Linha): string {
  const ix = obterIndice()!;
  const sentidos = sentidosUnir(l);
  const nome = nomeLinha(l);
  const modo = modoDoTipo(l.tipo);
  const nParagens = Math.max(0, ...sentidos.map((s) => s.paragens.length));
  const percurso = l.nome || (sentidos[0] && destinoReal(sentidos[0].destino) ? `${sentidos[0].paragens[0]?.nome} – ${sentidos[0].destino}` : '');
  let corpo = `<h1>${chip(l)} ${html(nome)}${percurso ? ` <span style="font-weight:500">· ${html(percurso)}</span>` : ''}</h1>
<p class="sub">${L(
    `${html(nome)} da ${html(op.nome)} (rede de ${modo === 'Barco' ? 'barcos' : 'autocarros'} da Área Metropolitana do Porto): percurso com as ${nParagens} paragens de cada sentido e horário de hoje.`,
    `${html(nome)} of ${html(op.nome)} (${modo === 'Barco' ? 'boat' : 'bus'} network of the Área Metropolitana do Porto): route with all ${nParagens} stops in each direction and today's timetable.`)}</p>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">${L('Ver na app', 'See in the app')}</a></p>`;
  for (const s of sentidos) {
    const primeira = s.paragens[0];
    corpo += `<h2>${html(tituloSentido(s.destino))}</h2>`;
    if (primeira) {
      corpo += `<p class="nota">${L('Partidas de', 'Departures from')} ${html(primeira.nome)}.</p><div data-unir="linha" data-cods="${html(primeira.stopId.replace(/^unir:/, ''))}" data-linha="${html(l.codigo)}" data-sentido="${s.direcao}"><p class="nota">${L('A carregar o horário de hoje (AMP)…', "Loading today's timetable (AMP)…")}</p></div>`;
    }
    corpo += `<h3>${L('Paragens', 'Stops')} (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${html(p.nome)}</a>` : html(p.nome)}</li>`;
    }).join('')}</ol>`;
  }
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>${L(`Outras linhas ${html(op.nome)}`, `Other ${html(op.nome)} lines`)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">${L(`Ver todas as linhas ${html(op.nome)} ›`, `See all ${html(op.nome)} lines ›`)}</a></p>`;
  }
  corpo += `<p class="nota">${L(
    `Percurso e paragens publicados pela AMP – Área Metropolitana do Porto (atualizados a ${html(dataBase())}). Os horários podem mudar em feriados, greves ou obras; confirma na <a href="/">app PAROU</a> ou junto da UNIR.`,
    `Route and stops published by AMP – Área Metropolitana do Porto (updated ${html(dataBase())}). Timetables can change on holidays, strikes or roadworks; check the <a href="/">PAROU app</a> or UNIR.`)}</p>`;
  return pagina({
    titulo: cortar(L(`${nome} ${op.nome}: horários e paragens${percurso ? ` (${percurso})` : ''}`, `${nome} ${op.nome}: timetable and stops${percurso ? ` (${percurso})` : ''}`), 64) + ' | PAROU',
    descricao: L(
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: as ${nParagens} paragens do percurso em cada sentido e o horário de hoje. Partidas ao minuto na PAROU.`,
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: all ${nParagens} stops on the route in each direction and today's timetable. Departures minute by minute on PAROU.`),
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas', 'Lines'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
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

function quandoChega(minutos: number): string {
  if (minutos <= 0) return L('a chegar', 'arriving');
  if (minutos < 60) return L(`daqui a ${minutos} min`, `in ${minutos} min`);
  const h = Math.floor(minutos / 60);
  const m = String(minutos % 60).padStart(2, '0');
  return L(`daqui a ${h} h ${m}`, `in ${h} h ${m} min`);
}

async function paginaParagem(op: Operador, g: GrupoParagem): Promise<string> {
  const ix = obterIndice()!;
  const dados = await dadosParagem(g);
  const linhas = dados.linhas.sort((a, b) => a.linha.codigo.localeCompare(b.linha.codigo, 'pt', { numeric: true }));
  const modo = op.modo !== 'Autocarro' ? op.modo : linhas[0]?.linha ? modoDoTipo(linhas[0].linha.tipo) : op.modo;
  const plural = pluralModo(modo);
  const tp = tipoParagem(modo);
  const proximas = dados.proximas;
  const agora = DateTime.now().setZone(ZONA);
  const codigos = Array.from(new Set(linhas.map((x) => x.linha.codigo))).slice(0, 8);
  const local = dados.concelho ? `, ${dados.concelho}` : '';
  const destinos = Array.from(new Set(linhas.flatMap((x) => x.destinos))).slice(0, 4);
  const nomeH1 = emIngles() ? `${html(g.nome)} ${html(tp.palavra)}` : `${tp.palavra} ${html(g.nome)}`;
  let corpo = `<h1>${nomeH1}${dados.concelho ? ` <span style="font-weight:500;color:#6B6B6B">· ${html(dados.concelho)}</span>` : ''}</h1>
<p class="sub">${html(op.nome)} · ${nLinhas(linhas.length)}${destinos.length ? ` ${L('para', 'to')} ${html(destinos.join(', '))}` : ''}.</p>
<p><a class="btn laranja" href="/?local=${g.lat.toFixed(5)},${g.lon.toFixed(5)}&nome=${encodeURIComponent(g.nome)}&paragem=${encodeURIComponent(g.id)}">${L('Ver em tempo real', 'See in real time')}</a></p>
<h2>${L('Próximas partidas', 'Next departures')}</h2>`;
  if (g.feedId === UNIR) {
    corpo += `<div data-unir="proximas" data-cods="${html(g.stopIds.slice(0, 3).map((x) => x.replace(/^unir:/, '')).join(','))}"><p class="nota">${L('A carregar as próximas partidas (horário da AMP)…', 'Loading the next departures (AMP timetable)…')}</p></div>`;
  } else if (proximas.length) {
    const algumTempoReal = proximas.some((d) => d.tempoReal);
    corpo += `<ul class="lista partidas">${proximas.map((d) => {
      const c = d.linha ? chip(d.linha) : `<span class="chip">${html(d.codigo)}</span>`;
      return `<li><div class="linha">${c}<span class="t">${html(d.destino)}${d.tempoReal ? `<small>${L('tempo real', 'real time')}</small>` : ''}</span><span class="hora">${html(d.hora)}<small>${quandoChega(d.minutos)}</small></span></div></li>`;
    }).join('')}</ul><p class="nota">${L(
      `Calculado às ${agora.toFormat('HH:mm')} com o horário oficial${algumTempoReal ? ' e o tempo real do operador' : ''}. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.`,
      `Calculated at ${agora.toFormat('HH:mm')} from the official timetable${algumTempoReal ? " and the operator's real-time data" : ''}. To follow it minute by minute, open the <a href="/">PAROU app</a>.`)}</p>`;
  } else {
    corpo += `<p class="nota">${L(
      `Sem partidas previstas nas próximas horas (às ${agora.toFormat('HH:mm')}). Vê abaixo a primeira partida de cada linha.`,
      `No departures expected in the next few hours (at ${agora.toFormat('HH:mm')}). See the first departure of each line below.`)}</p>`;
  }
  if (linhas.length) {
    corpo += `<h2>${tp.paragem ? L('Linhas que passam nesta paragem', 'Lines serving this stop') : L('Linhas que passam aqui', `Lines serving this ${tp.palavra.toLowerCase()}`)}</h2><ul class="lista">${linhas.map((x) => {
      const l = x.linha;
      return `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${x.destinos.length ? `${L('para', 'to')} ${html(x.destinos.join(' · '))}` : html(l.nome)}</small></span><span class="dir">${x.primeira != null ? `${hora(x.primeira)}–${hora(x.ultima!)}` : (g.feedId === CM || g.feedId === UNIR ? '' : L('hoje sem serviço', 'no service today'))}</span></a></li>`;
    }).join('')}</ul>${g.feedId === UNIR ? '' : `<p class="nota">${L('Horas: primeira e última passagem de hoje.', 'Times: first and last departure today.')}</p>`}`;
  }
  const perto = paragensPerto(g.lat, g.lon, 450, 14).filter((p) => p.g !== g);
  if (perto.length) {
    corpo += `<h2>${L('Paragens perto', 'Stops nearby')}</h2><ul class="lista">${perto.map(({ g: p, d }) => {
      const o2 = ix.operadores.find((o) => o.feedId === p.feedId);
      if (!o2) return '';
      return `<li><a href="/paragens/${o2.slug}/${p.slug}"><span class="t">${html(p.nome)}<small>${html(o2.nome)}</small></span><span class="dir">${Math.round(d / 10) * 10} m</span></a></li>`;
    }).join('')}</ul>`;
  }
  corpo += g.feedId === UNIR
    ? `<p class="nota">${L(
        `Paragens e linhas publicadas pela AMP – Área Metropolitana do Porto (atualizadas a ${html(dataBase())}); horários pedidos à AMP no momento.`,
        `Stops and lines published by AMP – Área Metropolitana do Porto (updated ${html(dataBase())}); timetables requested from AMP on the spot.`)}</p>`
    : `<p class="nota">${L(`Horários oficiais da ${html(op.nome)} (atualizados a ${html(dataBase())}).`, `Official timetables from ${html(op.nome)} (updated ${html(dataBase())}).`)}</p>`;
  const tituloLinhas = codigos.length ? ` — ${codigos.slice(0, 4).join(', ')}` : '';
  return pagina({
    titulo: cortar(L(`${g.nome}${local} (${op.nome}): próximos ${plural}${tituloLinhas}`, `${g.nome}${local} (${op.nome}): next ${plural}${tituloLinhas}`), 66) + ' | PAROU',
    descricao: L(
      `Próximas partidas na ${tp.palavra.toLowerCase()} ${g.nome}${local} da ${op.nome}${codigos.length ? `: linhas ${codigos.join(', ')}` : ''}${destinos.length ? ` para ${destinos.join(', ')}` : ''}. Primeira e última partida de hoje e tempo real na PAROU.`,
      `Next departures at ${g.nome}${local} ${tp.palavra.toLowerCase()} (${op.nome})${codigos.length ? `: lines ${codigos.join(', ')}` : ''}${destinos.length ? ` to ${destinos.join(', ')}` : ''}. First and last departure today and real time on PAROU.`),
    caminho: `/paragens/${op.slug}/${g.slug}`,
    corpo,
    script: g.feedId === UNIR ? scriptUnir(Object.fromEntries(linhas.map((x) => [x.linha.codigo, `/linhas/${op.slug}/${x.linha.slug}`]))) : undefined,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas', 'Lines'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: g.nome, url: `/paragens/${op.slug}/${g.slug}` }],
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
  const nav = total > 1 ? `<nav class="paginas" aria-label="${L('Páginas', 'Pages')}">${Array.from({ length: total }, (_, i) => i + 1).map((i) => (i === p ? `<span>${i}</span>` : `<a href="/paragens/${op.slug}${i === 1 ? '' : `?p=${i}`}">${i}</a>`)).join('')}</nav>` : '';
  const corpo = `<h1>${L(`Paragens ${html(op.nome)}`, `${html(op.nome)} stops`)}</h1>
<p class="sub">${L(
    `${num(op.paragens.length)} paragens ${html(op.nome)} por ordem alfabética. Em cada uma vês as próximas partidas e as linhas que lá passam.`,
    `${num(op.paragens.length)} ${html(op.nome)} stops in alphabetical order. For each one you see the next departures and the lines that call there.`)}</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="${L('Nome da paragem', 'Stop name')}" aria-label="${L('Pesquisar paragem', 'Search for a stop')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search')}</button></form>
${nav}<ul class="lista">${fatia.map((g) => `<li><a href="/paragens/${op.slug}/${g.slug}"><span class="t">${html(g.nome)}</span></a></li>`).join('')}</ul>${nav}`;
  return pagina({
    titulo: L(`Paragens ${op.nome}${p > 1 ? ` (página ${p})` : ''}: horários e próximas partidas | PAROU`, `${op.nome} stops${p > 1 ? ` (page ${p})` : ''}: timetables and next departures | PAROU`),
    descricao: L(
      `Lista de todas as paragens ${op.nome}${p > 1 ? `, página ${p}` : ''}: próximas partidas, linhas e horários de cada paragem na PAROU.`,
      `List of all ${op.nome} stops${p > 1 ? `, page ${p}` : ''}: next departures, lines and timetables for each stop on PAROU.`),
    caminho: `/paragens/${op.slug}${p > 1 ? `?p=${p}` : ''}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Linhas', 'Lines'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: L('Paragens', 'Stops'), url: `/paragens/${op.slug}` }],
  });
}

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = DateTime.fromISO(iso, { zone: ZONA }).setLocale(LOCALE());
  if (!d.isValid) return '';
  const hoje = DateTime.now().setZone(ZONA).startOf('day');
  const dias = Math.round(d.startOf('day').diff(hoje, 'days').days);
  const h = d.toFormat('HH:mm');
  if (dias === 0) return L(`hoje às ${h}`, `today at ${h}`);
  if (dias === 1) return L(`amanhã às ${h}`, `tomorrow at ${h}`);
  if (dias === -1) return L(`ontem às ${h}`, `yesterday at ${h}`);
  return d.toFormat(emIngles() ? `cccc, d LLLL 'at' HH:mm` : `cccc, d 'de' LLLL 'às' HH:mm`);
}

async function paginaGreves(): Promise<string> {
  const { greves } = await obterGreves();
  const agora = DateTime.now().setZone(ZONA).setLocale(LOCALE());
  const oficiais = greves.filter((g) => g.origem === 'operador');
  const noticias = greves.filter((g) => g.origem === 'noticia');
  let corpo = `<h1>${L('Greves nos transportes hoje e próximas greves', 'Transport strikes today and upcoming strikes')}</h1>
<p class="sub">${L(
    `Greves anunciadas na CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa e outros transportes em Portugal. Atualizado ${html(agora.toFormat("d 'de' LLLL 'às' HH:mm"))}.`,
    `Strikes announced at CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa and other transport in Portugal. Updated ${html(agora.toFormat("d LLLL 'at' HH:mm"))}.`)}</p>
<div class="aviso">${L(
    'Recebe as greves no telemóvel, mesmo com a app fechada: abre os <a href="/alertas"><b>Alertas da PAROU</b></a> e liga os avisos.',
    'Get strikes on your phone, even with the app closed: open <a href="/alertas"><b>PAROU Alerts</b></a> and turn notifications on.')}</div>`;
  if (emIngles()) corpo += `<p class="nota">Strike notices are published in Portuguese by the operators and the news outlets, so the details below are in Portuguese.</p>`;
  if (oficiais.length === 0 && noticias.length === 0) {
    corpo += `<div class="cartao"><b>${L('Sem greves anunciadas neste momento.', 'No strikes announced right now.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'Não há greves nos transportes anunciadas pelos operadores nem nas notícias dos últimos dias. Esta página atualiza-se sozinha.',
      'There are no transport strikes announced by the operators or in the news over the last few days. This page updates itself.')}</p></div>`;
  }
  if (oficiais.length) {
    corpo += `<h2>${L('Anunciadas pelos operadores', 'Announced by the operators')}</h2>${oficiais.map((g) => `<div class="cartao"><b>${html(g.titulo)}</b><p class="nota" style="margin:4px 0">${html(g.operador)}${g.inicio ? ` · ${g.aDecorrer ? L('a decorrer desde', 'ongoing since') : L('começa', 'starts')} ${html(quando(g.inicio))}` : ''}${g.fim ? ` · ${L('até', 'until')} ${html(quando(g.fim))}` : ''}</p>${g.resumo ? `<p style="margin:6px 0 0">${html(g.resumo)}</p>` : ''}${g.url ? `<p class="nota" style="margin:6px 0 0"><a href="${html(g.url)}" rel="nofollow noopener" target="_blank">${L('Ver no site do operador', "See on the operator's website")}</a></p>` : ''}</div>`).join('')}`;
  }
  if (noticias.length) {
    corpo += `<h2>${L('Nas notícias', 'In the news')}</h2><ul class="lista">${noticias.map((g) => `<li><a href="${html(g.url)}" rel="nofollow noopener" target="_blank"><span class="t">${html(g.titulo)}<small>${html(g.fonte)}${g.publicada ? ` · ${html(quando(g.publicada))}` : ''}</small></span></a></li>`).join('')}</ul>`;
  }
  corpo += `<h2>${L('Serviços mínimos e alternativas', 'Minimum services and alternatives')}</h2><p>${L(
    'Em dia de greve, vê na <a href="/">PAROU</a> o que está realmente a circular perto de ti: onde o operador publica tempo real (como a Carris Metropolitana, a STCP e o Metro de Lisboa) vês os veículos que estão de facto a andar. Consulta também os <a href="/linhas">horários das linhas</a> para planear alternativas.',
    'On a strike day, check <a href="/">PAROU</a> to see what is really running near you: where the operator publishes real-time data (such as Carris Metropolitana, STCP and Metro de Lisboa) you see the vehicles that are actually moving. Also check the <a href="/linhas">timetables</a> to plan alternatives.')}</p>`;
  return pagina({
    titulo: L('Greves de transportes hoje: metro, CP, Carris e STCP | PAROU', 'Transport strikes today: metro, CP, Carris and STCP | PAROU'),
    descricao: L(
      'Há greve hoje? Greves anunciadas no metro de Lisboa e do Porto, na CP e nos comboios, na Carris, na STCP, na Fertagus e noutros transportes, com datas, serviços mínimos e notícias. Atualizado sempre.',
      'Is there a strike today? Strikes announced at CP, Metro de Lisboa, Metro do Porto, Carris, STCP, Fertagus and other transport, with dates, minimum services and news. Always up to date.'),
    caminho: '/greves',
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Greves', 'Strikes'), url: '/greves' }],
  });
}

// ------------------------------------------------------------------------------------
// Incêndios ativos hoje: lista nacional e por distrito. Dados da Proteção Civil (ANEPC) através do
// Fogos.pt (VOST Portugal), que exige a fonte visível e uso não comercial. Nunca se diz "sem
// incêndios" quando a fonte não respondeu: nesse caso a página diz que não conseguiu os dados.
// ------------------------------------------------------------------------------------
interface Distrito { slug: string; nome: string; em: string; alias?: string }
const distrito = (nome: string, em?: string, alias?: string): Distrito => ({ slug: slug(nome), nome, em: em || `em ${nome}`, alias });
export const DISTRITOS: Distrito[] = [
  distrito('Aveiro'), distrito('Beja'), distrito('Braga'), distrito('Bragança'), distrito('Castelo Branco'), distrito('Coimbra'),
  distrito('Évora'), distrito('Faro', undefined, 'Algarve'), distrito('Guarda'), distrito('Leiria'), distrito('Lisboa'),
  distrito('Portalegre'), distrito('Porto', 'no Porto'), distrito('Santarém'), distrito('Setúbal'), distrito('Viana do Castelo'),
  distrito('Vila Real'), distrito('Viseu'), distrito('Madeira', 'na Madeira'), distrito('Açores', 'nos Açores'),
];
const rotuloDistrito = (d: Distrito): string => (d.alias ? `${d.nome} (${d.alias})` : d.nome);

/** Normaliza o distrito que vem da fonte ("Ilha da Madeira", "Viana Do Castelo") para o endereço da página */
function chaveDistrito(d: string): string {
  const s = slug(d || '', 60).replace(/^(ilha-d[aeo]s?-|regiao-autonoma-d[aeo]s?-)/, '');
  if (/^(sao-miguel|terceira|pico|faial|sao-jorge|graciosa|flores|corvo|santa-maria)$/.test(s)) return 'acores';
  if (s === 'porto-santo') return 'madeira';
  return s;
}

function haQuanto(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return '';
  if (min < 2) return L('agora mesmo', 'just now');
  if (min < 60) return L(`há ${min} min`, `${min} min ago`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return L(`há ${h} h${m ? ` ${m} min` : ''}`, `${h} h${m ? ` ${m} min` : ''} ago`);
  const d = Math.floor(h / 24);
  return L(`há ${d} ${d === 1 ? 'dia' : 'dias'}`, `${d} ${d === 1 ? 'day' : 'days'} ago`);
}

function meiosTexto(m: IncidenteProtecaoCivil['meios']): string {
  const p: string[] = [];
  if (m.humanos > 0) p.push(L(`${num(m.humanos)} ${m.humanos === 1 ? 'operacional' : 'operacionais'}`, `${num(m.humanos)} personnel`));
  if (m.terrestres > 0) p.push(L(`${num(m.terrestres)} ${m.terrestres === 1 ? 'meio terrestre' : 'meios terrestres'}`, `${num(m.terrestres)} ground ${m.terrestres === 1 ? 'vehicle' : 'vehicles'}`));
  if (m.aereos > 0) p.push(L(`${num(m.aereos)} ${m.aereos === 1 ? 'meio aéreo' : 'meios aéreos'}`, `${num(m.aereos)} aerial ${m.aereos === 1 ? 'unit' : 'units'}`));
  return p.join(' · ');
}

function estadoTexto(i: IncidenteProtecaoCivil): string {
  const e = i.estado.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (i.aAcalmar || /resolucao/.test(e)) return L('Em resolução', 'Being resolved');
  if (/curso/.test(e)) return L('Em curso', 'Ongoing');
  return i.estado;
}

function linhaIncendio(i: IncidenteProtecaoCivil, comDistrito: boolean): string {
  const cor = /^[0-9a-f]{6}$/i.test(i.corEstado) ? i.corEstado : 'FF6B1A';
  const onde = [i.local, i.concelho && i.concelho !== i.local ? i.concelho : ''].filter(Boolean).join(', ');
  const sitio = [onde, comDistrito ? i.distrito : ''].filter(Boolean).join(' · ');
  const meta = [haQuanto(i.inicio), meiosTexto(i.meios)].filter(Boolean).join(' · ');
  return `<li class="fogo"><div class="l1"><b>${html(i.natureza)}</b><span class="estado" style="background:#${cor};color:${corTexto('#' + cor)}">${html(estadoTexto(i))}</span></div>${sitio ? `<div class="onde">${html(sitio)}</div>` : ''}${meta ? `<div class="meta">${html(meta)}</div>` : ''}</li>`;
}

function paginaIncendios(d?: Distrito): string {
  const { atualizado, incidentes, temChave } = obterIncidentes();
  const fresco = !!atualizado && Date.now() - Date.parse(atualizado) < 3 * 3600_000;
  const todos = incidentes
    .filter((i) => i.tipo === 'incendio')
    .sort((a, b) => Number(b.importante) - Number(a.importante) || Number(a.aAcalmar) - Number(b.aAcalmar) || Date.parse(b.inicio || '') - Date.parse(a.inicio || '') || 0);
  const porDistrito = new Map<string, number>();
  for (const i of todos) porDistrito.set(chaveDistrito(i.distrito), (porDistrito.get(chaveDistrito(i.distrito)) || 0) + 1);
  const fogos = d ? todos.filter((i) => chaveDistrito(i.distrito) === d.slug) : todos;
  const n = fogos.length;
  const emResolucao = fogos.filter((i) => i.aAcalmar).length;
  const emCurso = n - emResolucao;
  const operacionais = fogos.reduce((s, i) => s + i.meios.humanos, 0);
  const onde = d ? `${d.em}${d.alias ? ` (${d.alias})` : ''}` : L('em Portugal', 'in Portugal');
  const frequencia = temChave ? L('de 2 em 2 minutos', 'every 2 minutes') : L('cerca de uma vez por hora', 'about once an hour');
  const atual = atualizado ? quando(atualizado) : '';
  const rotuloAtivos = (k: number) => (k === 1 ? L('incêndio ativo', 'active fire') : L('incêndios ativos', 'active fires'));

  const perguntas: Array<{ p: string; r: string }> = [
    {
      p: L('De onde vêm os dados dos incêndios?', 'Where does the fire data come from?'),
      r: L(
        `Da Proteção Civil (ANEPC), através do Fogos.pt, o projeto do VOST Portugal que reúne as ocorrências em curso. A PAROU consulta o Fogos.pt ${frequencia} e mostra apenas os incêndios que ainda estão ativos.`,
        `From Portugal's civil protection authority (ANEPC), through Fogos.pt, the VOST Portugal project that gathers ongoing incidents. PAROU checks Fogos.pt ${frequencia} and only shows fires that are still active.`),
    },
    {
      p: L('O que quer dizer «em curso» e «em resolução»?', 'What do "ongoing" and "being resolved" mean?'),
      r: L(
        '«Em curso» é um incêndio que ainda está a ser combatido. «Em resolução» quer dizer que a situação está a acalmar, mas as equipas continuam no terreno a rematar o trabalho. Os incêndios concluídos ou só em vigilância saem da lista.',
        '"Ongoing" is a fire that is still being fought. "Being resolved" means the situation is calming down but crews are still on site finishing the work. Fires that are concluded or only under watch leave the list.'),
    },
    {
      p: L('Que número devo ligar se vir um incêndio?', 'Which number should I call if I see a fire?'),
      r: L(
        'Liga 112 e indica o local o mais exato possível. Afasta-te do fogo e do fumo e não tentes apagar incêndios florestais por tua conta.',
        'Call 112 and give the location as precisely as you can. Move away from the fire and the smoke and do not try to put out wildfires yourself.'),
    },
    {
      p: L('Como vejo os incêndios perto de mim?', 'How do I see fires near me?'),
      r: L(
        'Abre o mapa da PAROU: mostra os incêndios ativos em Portugal e as perturbações nos transportes à tua volta.',
        'Open the PAROU map: it shows the active fires in Portugal and the transport disruptions around you.'),
    },
  ];

  let corpo = `<h1>${d ? L(`Incêndios ativos ${html(d.em)}${d.alias ? ` (${html(d.alias)})` : ''} hoje`, `Active fires in ${html(rotuloDistrito(d))} today`) : L('Incêndios ativos hoje em Portugal', 'Active fires in Portugal today')}</h1>`;
  if (!fresco) {
    corpo += `<p class="sub">${L('Não foi possível obter os dados da Proteção Civil neste momento.', 'The civil protection data could not be retrieved right now.')}</p>`;
  } else if (n === 0) {
    corpo += `<p class="sub">${L(`Neste momento não há incêndios ativos registados ${html(onde)}.`, `Right now there are no active fires recorded ${html(onde)}.`)} ${L('Atualizado', 'Updated')} ${html(atual)}.</p>`;
  } else {
    corpo += `<p class="sub">${L(
      `Há ${n} ${rotuloAtivos(n)} ${html(onde)} neste momento: ${emCurso} em curso e ${emResolucao} em resolução${operacionais ? `, com ${num(operacionais)} operacionais no terreno` : ''}. Atualizado ${html(atual)}.`,
      `There ${n === 1 ? 'is' : 'are'} ${n} ${rotuloAtivos(n)} ${html(onde)} right now: ${emCurso} ongoing and ${emResolucao} being resolved${operacionais ? `, with ${num(operacionais)} personnel on site` : ''}. Updated ${html(atual)}.`)}</p>`;
  }
  corpo += `<div class="aviso"><b>${L('Emergência? Liga 112.', 'Emergency? Call 112.')}</b> ${L(
    'Esta página é informativa e não substitui os avisos da Proteção Civil nem as indicações das autoridades locais.',
    'This page is informational and does not replace civil protection warnings or the instructions of local authorities.')}</div>
<p><a class="btn laranja" href="/mapa">${L('Ver no mapa', 'See on the map')}</a> <a class="btn claro" href="/alertas">${L('Alertas', 'Alerts')}</a>${d && CIDADES.some((c) => c.slug === d.slug) ? ` <a class="btn claro" href="/cidade/${d.slug}">${L(`Transportes ${html(d.em)}`, `Transport in ${html(d.nome)}`)}</a>` : ''}</p>`;
  if (emIngles()) corpo += `<p class="nota">Place names, fire types and statuses come from the Portuguese civil protection data and are shown in Portuguese.</p>`;

  if (!fresco) {
    corpo += `<div class="cartao"><b>${L('Sem dados atuais', 'No current data')}</b><p class="nota" style="margin:6px 0 0">${L(
      'A PAROU não conseguiu atualizar a lista de incêndios, por isso não é possível dizer se há ou não incêndios ativos. Consulta o <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> e, em caso de emergência, liga 112.',
      'PAROU could not refresh the fire list, so it cannot say whether there are active fires. Check <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> and, in an emergency, call 112.')}</p></div>`;
  } else if (n > 0) {
    corpo += `<div class="resumo duplo"><div><b>${n}</b><span>${rotuloAtivos(n)}</span></div><div><b>${emCurso}</b><span>${L('em curso', 'ongoing')}</span></div><div><b>${emResolucao}</b><span>${L('em resolução', 'being resolved')}</span></div><div><b>${num(operacionais)}</b><span>${L('operacionais no terreno', 'personnel on site')}</span></div></div>
<h2>${L('Incêndios ativos agora', 'Active fires now')}</h2><ul class="lista">${fogos.slice(0, 150).map((i) => linhaIncendio(i, !d)).join('')}</ul>${n > 150 ? `<p class="nota">${L(`A mostrar 150 de ${n}. Os restantes estão nas páginas de cada distrito.`, `Showing 150 of ${n}. The rest are on each district's page.`)}</p>` : ''}`;
  } else {
    corpo += `<div class="cartao"><b>${L('Sem incêndios ativos registados.', 'No active fires recorded.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'Esta página atualiza-se sozinha. Se vires fogo ou fumo, liga 112.',
      'This page updates itself. If you see fire or smoke, call 112.')}</p></div>`;
  }

  corpo += `<h2>${L('Incêndios por distrito', 'Fires by district')}</h2><div class="grelha estreita">${DISTRITOS.filter((x) => x.slug !== d?.slug).map((x) => {
    const k = porDistrito.get(x.slug) || 0;
    return `<a href="/incendios/${x.slug}"><b>${html(x.nome)}</b><small>${fresco ? (k ? `${k} ${rotuloAtivos(k)}` : L('Nenhum ativo', 'None active')) : L('Ver incêndios', 'See fires')}</small></a>`;
  }).join('')}</div>${d ? `<p><a href="/incendios">${L('Ver os incêndios de todo o país', 'See fires across the country')}</a></p>` : ''}
<h2>${L('Perguntas frequentes', 'Frequently asked questions')}</h2>${perguntas.map((q) => `<h3>${html(q.p)}</h3><p>${html(q.r)}</p>`).join('')}
<p class="nota">${L(
    'Fonte: <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), com dados da Autoridade Nacional de Emergência e Proteção Civil (ANEPC). Utilização não comercial: a PAROU é gratuita e sem fins lucrativos.',
    'Source: <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), with data from the National Emergency and Civil Protection Authority (ANEPC). Non-commercial use: PAROU is free and non-profit.')}</p>`;

  const tituloBase = d
    ? L(`Incêndios ${d.em}${d.alias ? ` (${d.alias})` : ''} hoje: ativos agora | PAROU`, `Fires in ${rotuloDistrito(d)} today: active now | PAROU`)
    : L('Incêndios ativos hoje em Portugal: lista por distrito | PAROU', 'Active fires in Portugal today: list by district | PAROU');
  let descricao: string;
  if (!fresco) {
    descricao = L(
      `Incêndios ativos ${onde}, com local, estado e meios no terreno. Dados da Proteção Civil através do Fogos.pt. Em emergência, liga 112.`,
      `Active fires ${onde}, with location, status and resources on site. Civil protection data through Fogos.pt. In an emergency, call 112.`);
  } else if (n === 0) {
    descricao = L(
      `Neste momento não há incêndios ativos registados ${onde}. Consulta a lista por distrito, com local, estado e meios no terreno. Dados do Fogos.pt.`,
      `Right now there are no active fires recorded ${onde}. Check the list by district, with location, status and resources on site. Data from Fogos.pt.`);
  } else {
    descricao = L(
      `${n} ${rotuloAtivos(n)} ${onde} agora: ${emCurso} em curso e ${emResolucao} em resolução. Local, estado e meios no terreno. Dados do Fogos.pt, com a Proteção Civil.`,
      `${n} ${rotuloAtivos(n)} ${onde} now: ${emCurso} ongoing and ${emResolucao} being resolved. Location, status and resources on site. Data from Fogos.pt, with civil protection.`);
  }
  return pagina({
    titulo: tituloBase,
    descricao,
    caminho: d ? `/incendios/${d.slug}` : '/incendios',
    corpo,
    migalhas: [
      { nome: L('Início', 'Home'), url: '/' },
      { nome: L('Incêndios', 'Fires'), url: '/incendios' },
      ...(d ? [{ nome: d.nome, url: `/incendios/${d.slug}` }] : []),
    ],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: perguntas.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
    }],
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
  let corpo = `<h1>${L('Pesquisar linhas e paragens', 'Search lines and stops')}</h1>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" value="${html(q)}" placeholder="${L('Linha ou paragem', 'Line or stop')}" aria-label="${L('Pesquisar', 'Search')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search')}</button></form>`;
  if (termo.length >= 2) {
    corpo += `<h2>${L('Linhas', 'Lines')} (${linhas.length})</h2>${linhas.length ? `<ul class="lista">${linhas.slice(0, 50).map(({ o, l }) => `<li><a href="/linhas/${o.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${html(o.nome)}${l.nome ? ` · ${html(l.nome)}` : ''}</small></span></a></li>`).join('')}</ul>` : `<p class="nota">${L('Nenhuma linha encontrada.', 'No lines found.')}</p>`}
<h2>${L('Paragens', 'Stops')} (${paragens.length > 100 ? '100+' : paragens.length})</h2>${paragens.length ? `<ul class="lista">${paragens.slice(0, 100).map(({ o, g }) => `<li><a href="/paragens/${o.slug}/${g.slug}"><span class="t">${html(g.nome)}<small>${html(o.nome)}</small></span></a></li>`).join('')}</ul>` : `<p class="nota">${L('Nenhuma paragem encontrada.', 'No stops found.')}</p>`}`;
  }
  return pagina({
    titulo: L(`Pesquisa${q ? `: ${q}` : ''} | PAROU`, `Search${q ? `: ${q}` : ''} | PAROU`),
    descricao: L('Pesquisa linhas e paragens de transportes públicos em Portugal.', 'Search public transport lines and stops in Portugal.'),
    caminho: '/pesquisa',
    corpo,
    indexar: false,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Pesquisa', 'Search'), url: '/pesquisa' }],
  });
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

// ------------------------------------------------------------------------------------
// Páginas por cidade: "autocarros em Braga", "transportes Maia horários"… — operadores que
// servem a cidade, paragens principais (com ligação a cada uma) e perguntas frequentes.
// ------------------------------------------------------------------------------------
export const CIDADES: Array<{ slug: string; nome: string; lat: number; lon: number; raioKm: number }> = [
  ['lisboa', 'Lisboa', 38.7223, -9.1393, 6], ['porto', 'Porto', 41.1579, -8.6291, 5], ['braga', 'Braga', 41.5454, -8.4265, 5],
  ['coimbra', 'Coimbra', 40.2033, -8.4103, 5], ['aveiro', 'Aveiro', 40.6405, -8.6538, 4], ['faro', 'Faro', 37.0194, -7.9322, 4],
  ['setubal', 'Setúbal', 38.5244, -8.8882, 4], ['leiria', 'Leiria', 39.7438, -8.8078, 4], ['viseu', 'Viseu', 40.6575, -7.9143, 4],
  ['evora', 'Évora', 38.5714, -7.907, 3], ['santarem', 'Santarém', 39.2369, -8.6855, 3], ['viana-do-castelo', 'Viana do Castelo', 41.6932, -8.8329, 4],
  ['vila-real', 'Vila Real', 41.3006, -7.7441, 3], ['braganca', 'Bragança', 41.8058, -6.7572, 3], ['guarda', 'Guarda', 40.5373, -7.2658, 3],
  ['castelo-branco', 'Castelo Branco', 39.8222, -7.4932, 3], ['portalegre', 'Portalegre', 39.2938, -7.4312, 3], ['beja', 'Beja', 38.0151, -7.8632, 3],
  ['funchal', 'Funchal', 32.6500, -16.9089, 5], ['ponta-delgada', 'Ponta Delgada', 37.7412, -25.6756, 4],
  ['maia', 'Maia', 41.2357, -8.6199, 5], ['matosinhos', 'Matosinhos', 41.1844, -8.6963, 4], ['vila-nova-de-gaia', 'Vila Nova de Gaia', 41.1239, -8.6118, 5],
  ['gondomar', 'Gondomar', 41.1446, -8.5323, 4], ['valongo', 'Valongo', 41.1886, -8.4983, 4], ['povoa-de-varzim', 'Póvoa de Varzim', 41.3804, -8.7609, 4],
  ['vila-do-conde', 'Vila do Conde', 41.3533, -8.7472, 4], ['espinho', 'Espinho', 41.0076, -8.6410, 3], ['guimaraes', 'Guimarães', 41.4425, -8.2918, 4],
  ['vila-nova-de-famalicao', 'Vila Nova de Famalicão', 41.4076, -8.5198, 4], ['santa-maria-da-feira', 'Santa Maria da Feira', 40.9268, -8.5436, 4],
  ['amadora', 'Amadora', 38.7538, -9.2308, 3], ['sintra', 'Sintra', 38.8029, -9.3817, 6], ['cascais', 'Cascais', 38.6979, -9.4215, 5],
  ['oeiras', 'Oeiras', 38.6913, -9.3110, 4], ['loures', 'Loures', 38.8309, -9.1685, 5], ['odivelas', 'Odivelas', 38.7929, -9.1838, 3],
  ['almada', 'Almada', 38.6790, -9.1569, 4], ['seixal', 'Seixal', 38.6401, -9.1013, 5], ['barreiro', 'Barreiro', 38.6631, -9.0724, 4],
  ['montijo', 'Montijo', 38.7067, -8.9739, 4], ['vila-franca-de-xira', 'Vila Franca de Xira', 38.9553, -8.9897, 5],
  ['figueira-da-foz', 'Figueira da Foz', 40.1508, -8.8618, 4], ['torres-vedras', 'Torres Vedras', 39.0911, -9.2586, 4],
  ['caldas-da-rainha', 'Caldas da Rainha', 39.4036, -9.1386, 3], ['portimao', 'Portimão', 37.1386, -8.5372, 4], ['albufeira', 'Albufeira', 37.0889, -8.2503, 4],
  ['loule', 'Loulé', 37.1377, -8.0197, 4], ['lagos', 'Lagos', 37.1028, -8.6730, 3], ['olhao', 'Olhão', 37.0260, -7.8411, 3], ['covilha', 'Covilhã', 40.2806, -7.5043, 3],
].map(([slug, nome, lat, lon, raioKm]) => ({ slug: slug as string, nome: nome as string, lat: lat as number, lon: lon as number, raioKm: raioKm as number }));

function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

// "na Maia", "no Porto", "em Lisboa" / "in Lisbon"
const COM_NA = new Set(['Maia', 'Guarda', 'Covilhã', 'Póvoa de Varzim', 'Figueira da Foz', 'Amadora']);
const COM_NO = new Set(['Porto', 'Funchal', 'Seixal', 'Barreiro', 'Montijo']);
function emCidade(nome: string): string {
  if (emIngles()) return `in ${nome}`;
  return COM_NA.has(nome) ? `na ${nome}` : COM_NO.has(nome) ? `no ${nome}` : `em ${nome}`;
}

function paginaCidade(c: (typeof CIDADES)[number]): string {
  const ix = obterIndice()!;
  const emC = emCidade(c.nome);
  const porOperador: Array<{ op: Operador; n: number; perto: Array<{ g: GrupoParagem; d: number }> }> = [];
  for (const op of ix.operadores) {
    const perto: Array<{ g: GrupoParagem; d: number }> = [];
    for (const g of op.paragens) {
      if (Math.abs(g.lat - c.lat) > 0.1 || Math.abs(g.lon - c.lon) > 0.13) continue;
      const d = distKm(c, g);
      if (d <= c.raioKm) perto.push({ g, d });
    }
    if (perto.length) porOperador.push({ op, n: perto.length, perto: perto.sort((a, b) => a.d - b.d) });
  }
  porOperador.sort((a, b) => b.n - a.n);
  const totalParagens = porOperador.reduce((n, x) => n + x.n, 0);
  const nomesOps = porOperador.map((x) => x.op.nome);
  const listaOps = juntarComE(nomesOps);
  const perguntas = [
    {
      p: L(`Como sei quando passa o próximo autocarro ${emC}?`, `How can I tell when the next bus is coming ${emC}?`),
      r: L(
        `Abre a PAROU (parou.pt) e ativa a localização: vês as paragens à tua volta ${emC} e as próximas partidas de cada linha${porOperador.length ? ` (${listaOps})` : ''}, com tempo real quando o operador o disponibiliza.`,
        `Open PAROU (parou.pt) and turn on location: you see the stops around you ${emC} and the next departures for every line${porOperador.length ? ` (${listaOps})` : ''}, with real time when the operator provides it.`),
    },
    {
      p: L(`Que transportes públicos há ${emC}?`, `What public transport is there ${emC}?`),
      r: porOperador.length
        ? L(
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)} a PAROU tem ${num(totalParagens)} paragens de ${porOperador.length} ${porOperador.length === 1 ? 'operador' : 'operadores'}: ${listaOps}.`,
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)} PAROU covers ${num(totalParagens)} stops from ${porOperador.length} ${porOperador.length === 1 ? 'operator' : 'operators'}: ${listaOps}.`)
        : L(`A PAROU ainda não tem horários publicados para ${c.nome}.`, `PAROU does not have published timetables for ${c.nome} yet.`),
    },
    {
      p: L(`Os horários dos transportes de ${c.nome} são oficiais?`, `Are the ${c.nome} transport timetables official?`),
      r: L(
        'Sim. Os horários vêm dos dados publicados pelos operadores (GTFS) e pelo IMT, e são atualizados todos os dias. Podem mudar sem aviso; em caso de dúvida confirma junto do operador.',
        'Yes. The timetables come from data published by the operators (GTFS) and by IMT, and are updated every day. They can change without notice; if in doubt, check with the operator.'),
    },
    {
      p: L(`Há greves ou perturbações nos transportes ${emC} hoje?`, `Are there strikes or disruptions to public transport ${emC} today?`),
      r: L(
        'Na página de greves e nos Alertas da PAROU vês as greves anunciadas e as perturbações dos operadores, além dos avisos de mau tempo do IPMA.',
        'On the strikes page and in PAROU Alerts you see the announced strikes and the operators\' disruptions, plus IPMA bad-weather warnings.'),
    },
  ];
  let corpo = `<h1>${L(`Transportes públicos ${html(emC)}: horários e próximos autocarros`, `Public transport ${html(emC)}: timetables and next buses`)}</h1>
<p class="sub">${porOperador.length
    ? L(
        `Horários de ${listaOps} ${html(emC)} — ${num(totalParagens)} paragens, com as próximas partidas e tempo real quando disponível.`,
        `Timetables for ${listaOps} ${html(emC)} — ${num(totalParagens)} stops, with the next departures and real time when available.`)
    : L(`Transportes perto de ti ${html(emC)}.`, `Transport near you ${html(emC)}.`)} ${L('Gratuito e sem anúncios.', 'Free and ad-free.')}</p>
<p><a class="btn laranja" href="/">${L('Ver o que passa perto de mim', "See what's running near me")}</a> <a class="btn claro" href="/greves">${L('Greves hoje', 'Strikes today')}</a></p>`;
  for (const x of porOperador.slice(0, 8)) {
    corpo += `<h2>${html(x.op.nome)} ${html(emC)}</h2>
<p>${L(
      `${num(x.n)} paragens de ${html(x.op.modo.toLowerCase())} ${html(emC)}. <a href="/linhas/${x.op.slug}">Todas as linhas e horários ${html(x.op.nome)}</a>.`,
      `${num(x.n)} ${html(nomeModo(x.op.modo).toLowerCase())} stops ${html(emC)}. <a href="/linhas/${x.op.slug}">All ${html(x.op.nome)} lines and timetables</a>.`)}</p>
<ul class="lista">${x.perto.slice(0, 12).map(({ g }) => `<li><a href="/paragens/${x.op.slug}/${g.slug}"><span class="t">${html(nomeBonito(g.nome))}</span></a></li>`).join('')}</ul>`;
  }
  corpo += `<h2>${L('Perguntas frequentes', 'Frequently asked questions')}</h2>${perguntas.map((q) => `<h3>${html(q.p)}</h3><p>${html(q.r)}</p>`).join('')}
<h2>${L('Outras cidades', 'Other cities')}</h2><p>${CIDADES.filter((o) => o.slug !== c.slug).map((o) => `<a href="/cidade/${o.slug}">${html(o.nome)}</a>`).join(' · ')}</p>`;
  return pagina({
    titulo: L(`Autocarros e transportes ${emC}: horários e paragens | PAROU`, `Buses and public transport ${emC}: timetables and stops | PAROU`),
    descricao: L(
      `Horários dos transportes públicos ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''}: próximos autocarros, paragens perto de ti, greves e alertas. Grátis e sem anúncios.`,
      `Public transport timetables ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''}: next buses, stops near you, strikes and alerts. Free and ad-free.`),
    caminho: `/cidade/${c.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Cidades', 'Cities'), url: '/cidades' }, { nome: c.nome, url: `/cidade/${c.slug}` }],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: perguntas.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
    }],
  });
}

function paginaCidades(): string {
  const corpo = `<h1>${L('Transportes públicos por cidade', 'Public transport by city')}</h1>
<p class="sub">${L(
    'Horários de autocarros, metro, comboios e barcos nas cidades de Portugal, com as paragens de cada operador e os próximos transportes em tempo real.',
    'Timetables for buses, metro, trains and boats in Portuguese cities, with each operator\'s stops and the next departures in real time.')}</p>
<div class="grelha">${CIDADES.map((c) => `<a href="/cidade/${c.slug}"><b>${html(c.nome)}</b><small>${L('Horários e paragens', 'Timetables and stops')}</small></a>`).join('')}</div>`;
  return pagina({
    titulo: L('Transportes públicos por cidade em Portugal: horários | PAROU', 'Public transport by city in Portugal: timetables | PAROU'),
    descricao: L(
      'Horários de autocarros, metro e comboios em Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra e mais cidades de Portugal. Próximos transportes em tempo real.',
      'Bus, metro and train timetables in Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra and more cities in Portugal. Next departures in real time.'),
    caminho: '/cidades',
    corpo,
    migalhas: [{ nome: L('Início', 'Home'), url: '/' }, { nome: L('Cidades', 'Cities'), url: '/cidades' }],
  });
}

export const PAGINAS_APP: Array<{ loc: string; freq: string; pri: string }> = [
  { loc: '/', freq: 'daily', pri: '1.0' },
  { loc: '/linhas', freq: 'weekly', pri: '0.9' },
  { loc: '/cidades', freq: 'weekly', pri: '0.8' },
  { loc: '/greves', freq: 'hourly', pri: '0.9' },
  { loc: '/incendios', freq: 'hourly', pri: '0.9' },
  { loc: '/alertas', freq: 'hourly', pri: '0.8' },
  { loc: '/transportes', freq: 'weekly', pri: '0.8' },
  { loc: '/mapa', freq: 'hourly', pri: '0.6' },
  { loc: '/ocorrencias', freq: 'hourly', pri: '0.5' },
  { loc: '/comunidade', freq: 'daily', pri: '0.5' },
  { loc: '/catalogo', freq: 'monthly', pri: '0.4' },
  { loc: '/sobre', freq: 'monthly', pri: '0.4' },
  { loc: '/privacidade', freq: 'yearly', pri: '0.2' },
  { loc: '/termos', freq: 'yearly', pri: '0.2' },
  { loc: '/apagar-conta', freq: 'yearly', pri: '0.1' },
  { loc: '/contactar', freq: 'yearly', pri: '0.3' },
];

export function todosOsEnderecos(): string[] {
  const ix = obterIndice();
  const out = [...PAGINAS_APP.map((p) => p.loc), ...DISTRITOS.map((d) => `/incendios/${d.slug}`), ...CIDADES.map((c) => `/cidade/${c.slug}`)];
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
  res.setHeader('Vary', 'Cookie');
  // A versão inglesa é para quem já usa a app em inglês; o Google indexa a portuguesa
  res.setHeader('X-Robots-Tag', emIngles() ? 'noindex, follow' : 'index, follow');
  res.send(corpo);
}

function aCarregar(res: Response) {
  res.status(503).setHeader('Retry-After', '120');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'Cookie');
  res.send(pagina({
    titulo: L('A atualizar os horários | PAROU', 'Updating the timetables | PAROU'),
    descricao: L('A PAROU está a atualizar os horários. Tenta daqui a um minuto.', 'PAROU is updating the timetables. Try again in a minute.'),
    caminho: '/linhas',
    corpo: `<h1>${L('A atualizar os horários…', 'Updating the timetables…')}</h1><p>${L('Tenta outra vez daqui a um minuto.', 'Try again in a minute.')}</p>`,
    indexar: false,
  }));
}

function naoEncontrado(res: Response, o?: Operador) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'Cookie');
  res.send(pagina({
    titulo: L('Página não encontrada | PAROU', 'Page not found | PAROU'),
    descricao: L('Esta página não existe ou mudou de sítio.', 'This page does not exist or has moved.'),
    caminho: o ? `/linhas/${o.slug}` : '/linhas',
    indexar: false,
    corpo: `<h1>${L('Página não encontrada', 'Page not found')}</h1><p>${L('Esta linha ou paragem não existe ou mudou de nome.', 'This line or stop does not exist or has been renamed.')}</p><p><a class="btn" href="${o ? `/linhas/${o.slug}` : '/linhas'}">${o ? L(`Ver as linhas ${html(o.nome)}`, `See the ${html(o.nome)} lines`) : L('Ver todas as linhas', 'See all lines')}</a></p>`,
  }));
}


// ------------------------------------------------------------------------------------
// /llms.txt: guia curto para assistentes de IA (formato de llmstxt.org). Os números e as ligações vêm do índice real.
// ------------------------------------------------------------------------------------
function textoLlms(): string {
  const ix = isDadosProntosPronto() ? obterIndice() : null;
  const L1: string[] = [
    '# PAROU',
    '',
    '> A PAROU (parou.pt) é uma app e um site gratuitos, sem anúncios e sem fins lucrativos, com os transportes públicos de Portugal: autocarros, metro, comboios e barcos perto de ti, em tempo real onde o operador o publica e com os horários oficiais dos operadores incluídos. / PAROU is a free, ad-free, non-profit Portuguese public transport app and website: buses, metro, trains and boats near you, in real time where the operator publishes it, plus official timetables.',
    '',
    'Notas para quem responde a perguntas sobre transportes em Portugal:',
    '',
    '- O tempo real só existe onde o operador o disponibiliza; nos outros casos a PAROU mostra a hora do horário oficial e diz que é horário previsto.',
    '- Os horários vêm dos dados abertos dos operadores (GTFS) e são atualizados todos os dias. Podem diferir do que o operador afixa na paragem: em caso de dúvida, o operador é a fonte oficial.',
    '- A PAROU não é um operador de transportes nem tem ligação oficial a nenhum. Não vende bilhetes.',
    '- Nomes de operadores, cidades, linhas e paragens estão sempre em português (não se traduzem).',
    '- Autor e contacto: Dinis Sousa, ver https://parou.pt/contactar',
    '',
    '## Páginas principais',
    '',
    '- [App: transportes perto de ti](https://parou.pt/): próximos autocarros, metro, comboios e barcos à tua volta, em tempo real onde existir',
    '- [Linhas e horários](https://parou.pt/linhas): todos os operadores, linhas e paragens que a PAROU tem',
    '- [Greves](https://parou.pt/greves): greves de transportes em curso e anunciadas',
    '- [Incêndios ativos hoje](https://parou.pt/incendios): lista dos incêndios ativos em Portugal por distrito, com local, estado e meios no terreno (dados do Fogos.pt e da Proteção Civil)',
    '- [Alertas](https://parou.pt/alertas): greves, avisos do IPMA, incêndios, perturbações e feriados',
    '- [Mapa de avisos e incêndios](https://parou.pt/mapa): incêndios, avisos meteorológicos e perturbações em Portugal',
    '- [Ocorrências](https://parou.pt/ocorrencias): atrasos, avarias e cortes de via reportados pela comunidade nas últimas 24 horas',
    '- [Cobertura e fontes de dados](https://parou.pt/cobertura): que operadores e linhas estão cobertos e de onde vêm os dados',
    '- [Sobre a PAROU](https://parou.pt/sobre)',
    '- [Comunidade](https://parou.pt/comunidade): perguntas, queixas e elogios sobre transportes',
    '',
    '## Como encontrar uma resposta concreta',
    '',
    '- Horário de uma linha: https://parou.pt/linhas/{operador}/{linha} (dias úteis, sábados, domingos e paragens do percurso)',
    '- Próximas partidas numa paragem: https://parou.pt/paragens/{operador}/{paragem}',
    '- Transportes numa cidade: https://parou.pt/cidade/{cidade}',
    '- Incêndios ativos num distrito: https://parou.pt/incendios/{distrito} (por exemplo /incendios/porto)',
    '- Pesquisa por linha ou paragem: https://parou.pt/pesquisa?q=…',
  ];
  if (ix) {
    const totalLinhas = ix.operadores.reduce((n, o) => n + o.linhas.length, 0);
    const totalParagens = ix.operadores.reduce((n, o) => n + o.paragens.length, 0);
    L1.push('', `## Operadores (${ix.operadores.length} operadores, ${totalLinhas} linhas, ${totalParagens} paragens)`, '');
    for (const o of ix.operadores) {
      L1.push(`- [${o.nome}](${SITE}/linhas/${o.slug}): ${o.modo.toLowerCase()}, ${o.linhas.length} ${o.linhas.length === 1 ? 'linha' : 'linhas'}, ${o.paragens.length} paragens (${NOME_REGIAO[o.regiao] || o.regiao})`);
    }
  }
  L1.push('', '## Optional', '', '### Cidades', '');
  L1.push(CIDADES.map((c) => `[${c.nome}](${SITE}/cidade/${c.slug})`).join(' · '));
  L1.push('', '- [Política de privacidade](https://parou.pt/privacidade)', '- [Termos de utilização](https://parou.pt/termos)', '');
  return L1.join('\n');
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
  app.get('/linha/:id', comIdioma, pronto, (req, res) => {
    const ix = obterIndice()!;
    const l = ix.linhaPorRoute.get(req.params.id);
    const op = l ? ix.operadores.find((o) => o.feedId === l.feedId) : undefined;
    if (!l || !op) return naoEncontrado(res);
    res.redirect(301, `/linhas/${op.slug}/${l.slug}`);
  });
  app.get('/paragem/:id', comIdioma, pronto, (req, res) => {
    const ix = obterIndice()!;
    const g = ix.grupoPorStop.get(req.params.id);
    const op = g ? ix.operadores.find((o) => o.feedId === g.feedId) : undefined;
    if (!g || !op) return naoEncontrado(res);
    res.redirect(301, `/paragens/${op.slug}/${g.slug}`);
  });

  app.get('/linhas', comIdioma, pronto, (_req, res) => enviar(res, emCache('hub', 30 * 60_000, paginaHub), 900));
  app.get('/cidades', comIdioma, pronto, (_req, res) => enviar(res, emCache('cidades', 6 * 3600_000, paginaCidades), 3600));
  app.get('/cidade/:c', comIdioma, pronto, (req, res) => {
    const c = CIDADES.find((x) => x.slug === req.params.c);
    if (!c) return naoEncontrado(res);
    enviar(res, emCache(`cidade:${c.slug}`, 6 * 3600_000, () => paginaCidade(c)), 3600);
  });

  app.get('/linhas/:op', comIdioma, pronto, (req, res) => {
    const op = obterIndice()!.porSlugOperador.get(req.params.op);
    if (!op) return naoEncontrado(res);
    enviar(res, emCache(`op:${op.slug}`, 30 * 60_000, () => paginaOperador(op)), 900);
  });

  app.get('/linhas/:op/:linha', comIdioma, pronto, (req, res) => {
    const ix = obterIndice()!;
    const op = ix.porSlugOperador.get(req.params.op);
    const l = ix.linhaPorSlug.get(`${req.params.op}/${req.params.linha}`);
    if (!op || !l) return naoEncontrado(res, op);
    const dia = DateTime.now().setZone(ZONA).toISODate();
    const chave = chaveIdioma(`l:${op.slug}/${l.slug}:${dia}`);
    const c = cache.get(chave);
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 600);
    paginaLinha(op, l)
      .then((v) => { cache.set(chave, { t: Date.now(), ttl: 20 * 60_000, v }); enviar(res, v, 600); })
      .catch((err) => { console.warn('[SEO] Linha falhou:', err?.message || err); res.status(500).send('Erro'); });
  });

  app.get('/paragens/:op', comIdioma, pronto, (req, res) => {
    const op = obterIndice()!.porSlugOperador.get(req.params.op);
    if (!op) return naoEncontrado(res);
    const p = Number(req.query.p) || 1;
    enviar(res, emCache(`lp:${op.slug}:${p}`, 30 * 60_000, () => paginaListaParagens(op, p)), 900);
  });

  app.get('/paragens/:op/:paragem', comIdioma, pronto, async (req, res) => {
    const ix = obterIndice()!;
    const op = ix.porSlugOperador.get(req.params.op);
    const g = ix.paragemPorSlug.get(`${req.params.op}/${req.params.paragem}`);
    if (!op || !g) return naoEncontrado(res, op);
    const chave = chaveIdioma(`p:${op.slug}/${g.slug}`);
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

  app.get('/greves', comIdioma, async (_req, res) => {
    const chaveG = chaveIdioma('greves');
    const c = cache.get(chaveG);
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 300);
    try {
      const v = await paginaGreves();
      cache.set(chaveG, { t: Date.now(), ttl: 5 * 60_000, v });
      enviar(res, v, 300);
    } catch (err: any) {
      console.warn('[SEO] Greves falhou:', err?.message || err);
      res.status(500).send('Erro');
    }
  });

  // Incêndios ativos: lista nacional e por distrito (dados do Fogos.pt, renovados a cada minuto)
  app.get('/incendios', comIdioma, (_req, res) => enviar(res, emCache('incendios', 60_000, () => paginaIncendios()), 60));
  app.get('/incendios/:distrito', comIdioma, (req, res) => {
    const d = DISTRITOS.find((x) => x.slug === req.params.distrito);
    if (!d) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Vary', 'Cookie');
      return void res.send(pagina({
        titulo: L('Página não encontrada | PAROU', 'Page not found | PAROU'),
        descricao: L('Este distrito não existe ou mudou de sítio.', 'This district does not exist or has moved.'),
        caminho: '/incendios',
        indexar: false,
        corpo: `<h1>${L('Página não encontrada', 'Page not found')}</h1><p>${L('Não há uma página de incêndios para este distrito.', 'There is no fires page for this district.')}</p><p><a class="btn" href="/incendios">${L('Ver os incêndios ativos', 'See active fires')}</a></p>`,
      }));
    }
    enviar(res, emCache(`incendios:${d.slug}`, 60_000, () => paginaIncendios(d)), 60);
  });
  // Nomes que as pessoas também procuram
  app.get(['/fogos', '/fogos-ativos', '/incendios-ativos'], (_req, res) => res.redirect(301, '/incendios'));

  app.get('/pesquisa', comIdioma, pronto, (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Vary', 'Cookie');
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
    res.send(xml([
      ...PAGINAS_APP.map((p) => ({ loc: p.loc, lastmod: ['/greves', '/incendios', '/alertas', '/mapa', '/ocorrencias'].includes(p.loc) ? hoje : undefined, freq: p.freq, pri: p.pri })),
      ...DISTRITOS.map((d) => ({ loc: `/incendios/${d.slug}`, lastmod: hoje, freq: 'hourly', pri: '0.6' })),
      ...CIDADES.map((c) => ({ loc: `/cidade/${c.slug}`, freq: 'weekly', pri: '0.8' })),
    ]));
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
  // Guia para assistentes de IA (llmstxt.org)
  app.get('/llms.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(textoLlms());
  });
}

// Para os testes locais
export const _paginas = { paginaHub, paginaOperador, paginaLinha, paginaParagem, paginaGreves, paginaPesquisa, paginaListaParagens, paginaIncendios };
