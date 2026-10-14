// =====================================================================================
// PAROU.PT — Páginas públicas para os motores de pesquisa (SEO)
//
// HTML feito no servidor (rápido, sem JavaScript) para cada operador, linha e paragem, mais
// /greves, /pesquisa e os sitemaps. Cada página tem conteúdo próprio e útil (horários reais,
// próximas partidas, paragens perto), dados estruturados (schema.org) e liga às outras e à app.
// =====================================================================================
import type { Express, Request, Response, NextFunction } from 'express';
import { CIDADES } from '../../data/cidades';
import { DateTime } from 'luxon';
import { AsyncLocalStorage } from 'node:async_hooks';
import { obterIndice, paragensPerto, modoDoTipo, NOME_REGIAO, type Linha, type GrupoParagem, type Operador } from './indice';
import { horarioDaLinha, linhasDaParagem, NOME_TIPO_DIA, proximoDia, type HorarioLinha, type TipoDia } from './horarios';
import { linhasCM, paragensCM, padraoCM, partidasPadrao, passagensHojeCM } from './carrisMetropolitana';
import { getDatabase } from '../db/gtfsDatabase';
import { html, hora, cortar, slug, nomeBonito } from './texto';
import { LinesEngine } from '../linesEngine';
import { isDadosProntosPronto, getManifestData, getVersaoBaseAtiva } from '../dadosProntos';
import { obterGreves, type GreveResumo } from '../alertasEngine';
import { obterIncidentes, type IncidenteProtecaoCivil } from '../fogosEngine';
import { scriptVisita } from './scriptVisita';
import { chipLegivel } from '../../utils/contraste';

const SITE = 'https://parou.pt';
const ZONA = 'Europe/Lisbon';

// ------------------------------------------------------------------------------------
// Idioma. As páginas são escritas em português. Quem tem a app em inglês (cookie parou_idioma=en, posto pela app
// ao arrancar) vê a versão inglesa, que não é indexada: o Google continua a ver o português. O idioma do pedido
// segue o código através de um AsyncLocalStorage (várias páginas são montadas em funções assíncronas).
// ------------------------------------------------------------------------------------
type Lang = 'pt' | 'en' | 'de' | 'fr';
const idiomaPedido = new AsyncLocalStorage<Lang>();
const lang = (): Lang => idiomaPedido.getStore() || 'pt';
/** "Não é português": a base das outras versões é o inglês; o alemão e o francês traduzem por cima, e onde faltar fica o inglês */
const emIngles = (): boolean => lang() !== 'pt';
/** Texto no idioma do pedido: L('português', 'english', 'deutsch', 'français'). Sem alemão/francês, aparece o inglês. */
const L = (pt: string, ingles: string, de?: string, fr?: string): string => {
  const l = lang();
  return l === 'pt' ? pt : l === 'de' ? (de ?? ingles) : l === 'fr' ? (fr ?? ingles) : ingles;
};
/** Um texto nos quatro idiomas (dados como as alternativas de greve) */
interface Textos { pt: string; en: string; de: string; fr: string }
const LT = (t: Textos): string => L(t.pt, t.en, t.de, t.fr);
const LOCALES: Record<Lang, string> = { pt: 'pt-PT', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' };
const OG_LOCALES: Record<Lang, string> = { pt: 'pt_PT', en: 'en_GB', de: 'de_DE', fr: 'fr_FR' };
const LANG_HTML: Record<Lang, string> = { pt: 'pt-PT', en: 'en', de: 'de', fr: 'fr' };
const LOCALE = (): string => LOCALES[lang()];
const num = (n: number): string => n.toLocaleString(LOCALE());
function idiomaDoPedido(req: Request): Lang {
  const q = String(req.query.lang || '');
  if (q === 'en' || q === 'pt' || q === 'de' || q === 'fr') return q;
  const c = /(?:^|;\s*)parou_idioma=(en|de|fr)(?:;|$)/.exec(req.headers.cookie || '');
  return c ? (c[1] as Lang) : 'pt';
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

// Letras da marca servidas pelo próprio site (sem pedidos ao Google; o ficheiro vem em paralelo com a página)
const FONTES_CSS = '@font-face{font-family:"Barlow";font-style:normal;font-weight:400;font-display:swap;src:url(/fontes/barlow-400.woff) format("woff")}@font-face{font-family:"Barlow";font-style:normal;font-weight:500;font-display:swap;src:url(/fontes/barlow-500.woff) format("woff")}@font-face{font-family:"Barlow";font-style:normal;font-weight:600;font-display:swap;src:url(/fontes/barlow-600.woff) format("woff")}@font-face{font-family:"Barlow";font-style:normal;font-weight:700;font-display:swap;src:url(/fontes/barlow-700.woff) format("woff")}@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:500;font-display:swap;src:url(/fontes/barlowcondensed-500.woff) format("woff")}@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:600;font-display:swap;src:url(/fontes/barlowcondensed-600.woff) format("woff")}@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:700;font-display:swap;src:url(/fontes/barlowcondensed-700.woff) format("woff")}@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:800;font-display:swap;src:url(/fontes/barlowcondensed-800.woff) format("woff")}';

const CSS = `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:#fff;color:#111;font:16px/1.5 Barlow,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit}main{max-width:880px;margin:0 auto;padding:16px 16px 48px}
header.topo{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #E6E6E3}
.topo-in{max-width:880px;margin:0 auto;height:56px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.marca{display:flex;align-items:center;gap:9px;text-decoration:none;font:700 24px/1 "Barlow Condensed",Barlow,sans-serif;letter-spacing:.06em}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:12px;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:15px;white-space:nowrap}
.btn.laranja{background:#FF6B1A;color:#111}.btn.claro{background:#F4F4F2;color:#111}
nav.migalhas{font-size:13px;color:#6B6B6B;margin:4px 0 10px;display:flex;flex-wrap:wrap;gap:4px}nav.migalhas a{color:#6B6B6B;text-decoration:none;display:inline-flex;align-items:center;min-height:24px}nav.migalhas a:hover{text-decoration:underline}
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
.grelha.estreita{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.grelha.ops{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.grelha a b{overflow-wrap:break-word}
.resumo.duplo{grid-template-columns:repeat(2,1fr)}@media(min-width:640px){.resumo.duplo{grid-template-columns:repeat(4,1fr)}}
ul.lista li.fogo{padding:12px 14px}.fogo .l1{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}.fogo .l1 b{font-size:17px;line-height:1.25}
.fogo .onde{margin-top:2px}.fogo .meta{margin-top:2px;font-size:13px;color:#6B6B6B;font-variant-numeric:tabular-nums}
.estado{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.02em;white-space:nowrap}
.estado:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
footer.rodape{border-top:1px solid #E6E6E3;background:#F4F4F2;color:#4A4A4A;font-size:14px}footer .in{max-width:880px;margin:0 auto;padding:22px 16px 30px}
footer nav{display:flex;flex-wrap:wrap;gap:4px 16px;margin:10px 0}footer nav a{display:inline-flex;align-items:center;min-height:28px}footer a{text-decoration:none}footer a:hover{text-decoration:underline}
footer .idiomas{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}footer button.idioma{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:999px;padding:5px 14px 5px 10px;min-height:36px;cursor:pointer;opacity:.85;display:inline-flex;align-items:center;gap:8px}footer button.idioma:hover{opacity:1}footer button.idioma.ativo{opacity:1;font-weight:700;border-width:2px;cursor:default}footer button.idioma svg{width:24px;height:16px;border-radius:2px;box-shadow:0 0 0 1px rgba(128,128,128,.45);flex:none}
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
html[data-tema=escuro] nav.migalhas,html[data-tema=escuro] nav.migalhas a,html[data-tema=escuro] .nota,html[data-tema=escuro] .resumo span,html[data-tema=escuro] .lista .t small,html[data-tema=escuro] .lista .dir,html[data-tema=escuro] ol.percurso small,html[data-tema=escuro] .partidas .hora small,html[data-tema=escuro] .grelha small,html[data-tema=escuro] .fogo .meta,html[data-tema=escuro] details>summary:after,html[data-tema=escuro] h1 span[style]:not(.chip){color:#A9A9AF!important}
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
html[data-tema=ambar] nav.migalhas,html[data-tema=ambar] nav.migalhas a,html[data-tema=ambar] .nota,html[data-tema=ambar] .resumo span,html[data-tema=ambar] .lista .t small,html[data-tema=ambar] .lista .dir,html[data-tema=ambar] ol.percurso small,html[data-tema=ambar] .partidas .hora small,html[data-tema=ambar] .grelha small,html[data-tema=ambar] .fogo .meta,html[data-tema=ambar] details>summary:after,html[data-tema=ambar] h1 span[style]:not(.chip){color:#70513C!important}
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

const NOME_IDIOMA: Record<Lang, string> = { pt: 'Português', en: 'English', de: 'Deutsch', fr: 'Français' };
// Bandeiras (as mesmas da app) em SVG simples
const BANDEIRA_SVG: Record<Lang, string> = {
  pt: '<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#F00"/><rect width="12" height="20" fill="#060"/><circle cx="12" cy="10" r="5.2" fill="none" stroke="#FC0" stroke-width="1.1"/><path d="M12 4.8C9.6 4.8 8.4 6.6 8.4 8.6V11.4C8.4 13.2 10 14.8 12 15.6 14 14.8 15.6 13.2 15.6 11.4V8.6C15.6 6.6 14.4 4.8 12 4.8Z" fill="#F00" stroke="#fff" stroke-width=".55"/><path d="M12 7.2C10.9 7.2 10.4 8 10.4 8.9V11C10.4 11.9 11 12.6 12 13 13 12.6 13.6 11.9 13.6 11V8.9C13.6 8 13.1 7.2 12 7.2Z" fill="#fff"/><circle cx="12" cy="10" r=".9" fill="#039"/></svg>',
  en: '<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><clipPath id="gbs"><path d="M0 0v20h30V0z"/></clipPath><clipPath id="gbt"><path d="M30 15h30v15zv15h-30zh-30v-15zv-15h30z" transform="scale(.5 .6667)"/></clipPath><g clip-path="url(#gbs)"><path d="M0 0v20h30V0z" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" clip-path="url(#gbt)" stroke="#C8102E" stroke-width="2.6"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6.6"/><path d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="4"/></g></svg>',
  de: '<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#FFCE00"/><rect width="30" height="13.34" fill="#D00"/><rect width="30" height="6.67"/></svg>',
  fr: '<svg viewBox="0 0 30 20" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#0055A4"/><rect x="20" width="10" height="20" fill="#EF4135"/></svg>',
};

// Troca de idioma nas páginas do servidor: guarda a escolha (cookie para o servidor, localStorage para a app) e recarrega
const SCRIPT_IDIOMA = `function parouIdioma(l){try{localStorage.setItem('parou_idioma',l)}catch(e){}try{document.cookie='parou_idioma='+l+';path=/;max-age=31536000;samesite=lax'}catch(e){}location.reload()}`;

function migalhasHtml(m: Migalha[]): string {
  if (!m.length) return '';
  return `<nav class="migalhas" aria-label="${L('Estás em', 'You are here', 'Du bist hier', 'Vous êtes ici')}">${m
    .map((x, i) => (i === m.length - 1 ? `<span>${html(x.nome)}</span>` : `<a href="${html(x.url)}">${html(x.nome)}</a> <span aria-hidden="true">›</span>`))
    .join(' ')}</nav>`;
}

function rodape(): string {
  const ix = obterIndice();
  const principais = (ix?.operadores || []).slice(0, 14).map((o) => `<a href="/linhas/${o.slug}">${html(o.nome)}</a>`).join('');
  return `<footer class="rodape"><div class="in">
<div class="marca" style="font-size:20px">${LOGO_SVG}PAROU</div>
<nav aria-label="PAROU"><a href="/">${L('Perto de mim', 'Nearby', 'In meiner Nähe', 'À proximité')}</a><a href="/linhas">${L('Linhas e horários', 'Lines and timetables', 'Linien und Fahrpläne', 'Lignes et horaires')}</a><a href="/cidades">${L('Cidades', 'Cities', 'Städte', 'Villes')}</a><a href="/greves">${L('Greves', 'Strikes', 'Streiks', 'Grèves')}</a><a href="/incendios">${L('Incêndios', 'Fires', 'Brände', 'Incendies')}</a><a href="/alertas">${L('Alertas', 'Alerts', 'Warnungen', 'Alertes')}</a><a href="/mapa">${L('Mapa', 'Map', 'Karte', 'Carte')}</a><a href="/sobre">${L('Sobre', 'About', 'Über uns', 'À propos')}</a><a href="/privacidade">${L('Privacidade', 'Privacy', 'Datenschutz', 'Confidentialité')}</a><a href="/termos">${L('Termos', 'Terms', 'Nutzungsbedingungen', 'Conditions')}</a><a href="/apagar-conta">${L('Apagar conta', 'Delete account', 'Konto löschen', 'Supprimer le compte')}</a><a href="/contactar">${L('Contactar', 'Contact', 'Kontakt', 'Contact')}</a></nav>
<nav aria-label="${L('Operadores', 'Operators', 'Verkehrsunternehmen', 'Opérateurs')}">${principais}</nav>
<p class="nota">${L('Gratuita e sem fins lucrativos. Horários oficiais publicados pelos operadores (GTFS) e pelo IMT; podem mudar sem aviso — em caso de dúvida confirma junto do operador.', 'Free and non-profit. Official timetables published by the operators (GTFS) and by IMT; they can change without notice — if in doubt, check with the operator.', 'Kostenlos und gemeinnützig. Offizielle Fahrpläne der Verkehrsunternehmen (GTFS) und des IMT; sie können sich ohne Vorankündigung ändern — im Zweifel frag beim Verkehrsunternehmen nach.', 'Gratuite et à but non lucratif. Horaires officiels publiés par les opérateurs (GTFS) et par l\'IMT ; ils peuvent changer sans préavis — en cas de doute, vérifiez auprès de l\'opérateur.')}</p>
<p class="idiomas" role="group" aria-label="${L('Idioma', 'Language', 'Sprache', 'Langue')}">${(['pt', 'en', 'de', 'fr'] as Lang[]).map((l) => `<button type="button" class="idioma${l === lang() ? ' ativo' : ''}" lang="${LANG_HTML[l]}"${l === lang() ? ' aria-current="true"' : ` onclick="parouIdioma('${l}')"`}>${BANDEIRA_SVG[l]}${NOME_IDIOMA[l]}</button>`).join('')}</p>
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
<html lang="${LANG_HTML[lang()]}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(titulo)}</title>
<meta name="description" content="${html(desc)}">
<meta name="robots" content="${o.indexar === false || ingles ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}">
<link rel="canonical" href="${html(canonico)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="PAROU"><meta property="og:locale" content="${OG_LOCALES[lang()]}">
<meta property="og:url" content="${html(canonico)}"><meta property="og:title" content="${html(titulo)}"><meta property="og:description" content="${html(desc)}">
<meta property="og:image" content="${SITE}${o.imagem || '/og-image.png'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${html(titulo)}"><meta name="twitter:description" content="${html(desc)}"><meta name="twitter:image" content="${SITE}${o.imagem || '/og-image.png'}">
${verifG ? `<meta name="google-site-verification" content="${html(verifG)}">` : ''}${verifB ? `<meta name="msvalidate.01" content="${html(verifB)}">` : ''}
<meta name="theme-color" content="#FFFFFF"><script>${SCRIPT_TEMA}${SCRIPT_IDIOMA}</script><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" as="font" type="font/woff" href="/fontes/barlow-400.woff" crossorigin><link rel="preload" as="font" type="font/woff" href="/fontes/barlow-700.woff" crossorigin><link rel="preload" as="font" type="font/woff" href="/fontes/barlowcondensed-700.woff" crossorigin>
<style>${FONTES_CSS}${CSS}${CSS_TEMAS}</style>
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body>
<header class="topo"><div class="topo-in"><a class="marca" href="/" aria-label="${L('PAROU — início', 'PAROU — home', 'PAROU — Startseite', 'PAROU — accueil')}">${LOGO_SVG}PAROU</a>
<div style="display:flex;gap:8px"><a class="btn claro esconde" href="/linhas">${L('Linhas', 'Lines', 'Linien', 'Lignes')}</a><a class="btn" href="/">${L('Abrir a app', 'Open the app', 'App öffnen', 'Ouvrir l\'application')}</a></div></div></header>
<main>${migalhasHtml(migalhas)}${o.corpo}</main>
${rodape()}
${o.script ? `<script>${o.script}</script>` : ''}
<script>${scriptVisita(lang())}</script>
</body></html>`;
}

function chip(l: Linha): string {
  const cor = /^#[0-9a-f]{6}$/i.test(l.cor) && l.cor.toLowerCase() !== '#ffffff' ? l.cor : '#111111';
  const txt = l.sigla || l.codigo.slice(0, 5);
  const { fundo, texto } = chipLegivel(cor);
  return `<span class="chip" style="background:${fundo};color:${texto}">${html(txt || '•')}</span>`;
}

function nomeLinha(l: Linha): string {
  if (/^linha /i.test(l.codigo) || !l.codigo) return l.codigo || l.nome;
  return /^\d|^[A-Z0-9]{1,4}$/.test(l.codigo) ? L(`Linha ${l.codigo}`, `Line ${l.codigo}`, `Linie ${l.codigo}`, `Ligne ${l.codigo}`) : l.codigo;
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
const NOME_MODO_DE: Record<string, string> = { Autocarro: 'Bus', Metro: 'U-Bahn', Comboio: 'Zug', Barco: 'Fähre', 'Elétrico': 'Straßenbahn' };
const NOME_MODO_FR: Record<string, string> = { Autocarro: 'Bus', Metro: 'Métro', Comboio: 'Train', Barco: 'Bateau', 'Elétrico': 'Tramway' };
const MODO_PLURAL_DE: Record<string, string> = { Autocarro: 'Busse', Metro: 'U-Bahnen', Comboio: 'Züge', Barco: 'Fähren', 'Elétrico': 'Straßenbahnen' };
const MODO_PLURAL_FR: Record<string, string> = { Autocarro: 'bus', Metro: 'métros', Comboio: 'trains', Barco: 'bateaux', 'Elétrico': 'tramways' };
const NOME_REGIAO_DE: Record<string, string> = {
  Lisboa: 'Lisboa und Setúbal (Área Metropolitana de Lisboa)',
  Porto: 'Porto (Área Metropolitana do Porto)',
  Minho: 'Braga, Guimarães, Barcelos und Famalicão',
  Coimbra: 'Coimbra',
  Algarve: 'Algarve',
  Madeira: 'Madeira',
  'Todo o país': 'Züge im ganzen Land',
  Outros: 'Weitere Verkehrsunternehmen',
};
const NOME_REGIAO_FR: Record<string, string> = {
  Lisboa: 'Lisboa et Setúbal (Área Metropolitana de Lisboa)',
  Porto: 'Porto (Área Metropolitana do Porto)',
  Minho: 'Braga, Guimarães, Barcelos et Famalicão',
  Coimbra: 'Coimbra',
  Algarve: 'Algarve',
  Madeira: 'Madeira',
  'Todo o país': 'Trains dans tout le pays',
  Outros: 'Autres opérateurs',
};
const NOME_TIPO_DIA_DE: Record<TipoDia, string> = { uteis: 'Werktage', sabado: 'Samstage', domingo: 'Sonn- und Feiertage' };
const NOME_TIPO_DIA_FR: Record<TipoDia, string> = { uteis: 'Jours ouvrables', sabado: 'Samedis', domingo: 'Dimanches et jours fériés' };
/** A tabela do idioma do pedido entre as versões não portuguesas */
const tab = <T,>(en: T, de: T, fr: T): T => (lang() === 'de' ? de : lang() === 'fr' ? fr : en);

/** Nome do modo no idioma do pedido (Autocarro / Bus) */
function nomeModo(modo: string): string { return emIngles() ? tab(NOME_MODO_EN, NOME_MODO_DE, NOME_MODO_FR)[modo] || modo : modo; }
/** "autocarros" / "buses" */
function pluralModo(modo: string): string { return emIngles() ? tab(MODO_PLURAL_EN, MODO_PLURAL_DE, MODO_PLURAL_FR)[modo] || L('', 'transport', 'Verkehrsmittel', 'transports') : MODO_PLURAL[modo] || 'transportes'; }
function nomeRegiao(r: string): string { return emIngles() ? tab(NOME_REGIAO_EN, NOME_REGIAO_DE, NOME_REGIAO_FR)[r] || r : NOME_REGIAO[r] || r; }
function nomeTipoDia(t: TipoDia): string { return emIngles() ? tab(NOME_TIPO_DIA_EN, NOME_TIPO_DIA_DE, NOME_TIPO_DIA_FR)[t] : NOME_TIPO_DIA[t]; }
function nLinhas(n: number): string { return L(`${n} ${n === 1 ? 'linha' : 'linhas'}`, `${n} ${n === 1 ? 'line' : 'lines'}`, `${n} ${n === 1 ? 'Linie' : 'Linien'}`, `${n} ${n === 1 ? 'ligne' : 'lignes'}`); }
/** Título de um sentido: "Sentido Campanhã" / "Towards Campanhã" */
function tituloSentido(destino: string): string {
  if (destino === 'circular') return L('Sentido circular', 'Circular route', 'Ringlinie', 'Ligne circulaire');
  const m = /^#(\d+)$/.exec(destino);
  if (m) return L(`Sentido ${m[1]}`, `Direction ${m[1]}`, `Richtung ${m[1]}`, `Sens ${m[1]}`);
  return L(`Sentido ${destino}`, `Towards ${destino}`, `Richtung ${destino}`, `Direction ${destino}`);
}
function destinoReal(destino: string | undefined): boolean { return !!destino && destino !== 'circular' && !destino.startsWith('#'); }
/** Lista com "e" no fim: "A, B e C" / "A, B and C" */
function juntarComE(nomes: string[]): string {
  const e = L(' e ', ' and ', ' und ', ' et ');
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')}${e}${nomes[nomes.length - 1]}` : nomes[0] || '';
}

function tipoParagem(modo: string) {
  if (modo === 'Metro') return { palavra: L('Estação', 'Station', 'Station', 'Station'), schema: 'SubwayStation', paragem: false };
  if (modo === 'Comboio') return { palavra: L('Estação', 'Station', 'Bahnhof', 'Gare'), schema: 'TrainStation', paragem: false };
  if (modo === 'Barco') return { palavra: L('Terminal', 'Terminal', 'Anleger', 'Embarcadère'), schema: 'BoatTerminal', paragem: false };
  return { palavra: L('Paragem', 'Stop', 'Haltestelle', 'Arrêt'), schema: 'BusStop', paragem: true };
}

function dataBase(): string {
  const b = getManifestData()?.built_at;
  const dt = b ? DateTime.fromISO(String(b), { zone: ZONA }) : DateTime.now().setZone(ZONA);
  return dt.isValid ? dt.setLocale(LOCALE()).toFormat(L("d 'de' LLLL 'de' yyyy", 'd LLLL yyyy', 'd. LLLL yyyy', 'd LLLL yyyy')) : '';
}

// ------------------------------------------------------------------------------------
// Cache das páginas (uma entrada por idioma)
// ------------------------------------------------------------------------------------
const cache = new Map<string, { t: number; ttl: number; v: string }>();
const chaveIdioma = (k: string): string => (lang() === 'pt' ? k : `${lang()}:${k}`);
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
  let corpo = `<h1>${L('Linhas e horários de transportes públicos em Portugal', 'Public transport lines and timetables in Portugal', 'Linien und Fahrpläne des öffentlichen Verkehrs in Portugal', 'Lignes et horaires des transports publics au Portugal')}</h1>
<p class="sub">${L(
    `Horários de ${num(totalLinhas)} linhas de autocarro, metro, comboio e barco e ${num(totalParagens)} paragens de ${ix.operadores.length} operadores — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e muitos mais. Escolhe o operador, a linha ou pesquisa uma paragem.`,
    `Timetables for ${num(totalLinhas)} bus, metro, train and boat lines and ${num(totalParagens)} stops from ${ix.operadores.length} operators — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto and many more. Pick an operator or a line, or search for a stop.`,
    `Fahrpläne von ${num(totalLinhas)} Bus-, U-Bahn-, Zug- und Fährlinien und ${num(totalParagens)} Haltestellen von ${ix.operadores.length} Verkehrsunternehmen — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto und viele mehr. Wähle ein Verkehrsunternehmen, eine Linie oder suche eine Haltestelle.`,
    `Horaires de ${num(totalLinhas)} lignes de bus, métro, train et bateau et de ${num(totalParagens)} arrêts de ${ix.operadores.length} opérateurs — Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto et bien d'autres. Choisissez un opérateur, une ligne ou recherchez un arrêt.`)}</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="${L('Linha ou paragem (ex.: 801, Marquês de Pombal)', 'Line or stop (e.g. 801, Marquês de Pombal)', 'Linie oder Haltestelle (z. B. 801, Marquês de Pombal)', 'Ligne ou arrêt (ex. : 801, Marquês de Pombal)')}" aria-label="${L('Pesquisar linha ou paragem', 'Search for a line or stop', 'Linie oder Haltestelle suchen', 'Rechercher une ligne ou un arrêt')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search', 'Suchen', 'Rechercher')}</button></form>
<div class="aviso">${L('Queres saber quando passa o próximo? <a href="/"><b>Abre a PAROU</b></a> e vê os transportes à tua volta em tempo real.', 'Want to know when the next one comes? <a href="/"><b>Open PAROU</b></a> and see the transport around you in real time.', 'Du willst wissen, wann der nächste kommt? <a href="/"><b>Öffne PAROU</b></a> und sieh die Verkehrsmittel in deiner Umgebung in Echtzeit.', 'Vous voulez savoir quand passe le prochain ? <a href="/"><b>Ouvrez PAROU</b></a> et voyez les transports autour de vous en temps réel.')}</div>
<h2>${L('Por cidade', 'By city', 'Nach Stadt', 'Par ville')}</h2><p>${CIDADES.slice(0, 24).map((c) => `<a href="/cidade/${c.slug}">${html(c.nome)}</a>`).join(' · ')} · <a href="/cidades">${L('todas', 'all', 'alle', 'toutes')}</a></p>`;
  for (const [regiao, ops] of porRegiao) {
    corpo += `<h2>${html(nomeRegiao(regiao))}</h2><div class="grelha">${ops
      .map((o) => `<a href="/linhas/${o.slug}"><b>${html(o.nome)}</b><small>${html(nomeModo(o.modo))} · ${nLinhas(o.linhas.length)} · ${num(o.paragens.length)} ${L('paragens', 'stops', 'Haltestellen', 'arrêts')}</small></a>`)
      .join('')}</div>`;
  }
  const outros = Math.max(0, ix.operadores.length - 6);
  return pagina({
    titulo: L('Linhas e horários de autocarros, metro e comboios em Portugal | PAROU', 'Bus, metro and train lines and timetables in Portugal | PAROU', 'Linien und Fahrpläne für Bus, U-Bahn und Zug in Portugal | PAROU', 'Lignes et horaires de bus, métro et train au Portugal | PAROU'),
    descricao: L(
      `Horários de autocarro, metro, comboio e barco em Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto e mais ${outros} operadores. Paragens e tempo real.`,
      `Bus, metro, train and boat timetables in Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto and ${outros} more operators. Stops and real time.`,
      `Fahrpläne für Bus, U-Bahn, Zug und Fähre in Portugal: Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto und ${outros} weitere Verkehrsunternehmen. Haltestellen und Echtzeit.`,
      `Horaires de bus, métro, train et bateau au Portugal : Carris Metropolitana, Carris, Metro de Lisboa, CP, STCP, Metro do Porto et ${outros} autres opérateurs. Arrêts et temps réel.`),
    caminho: '/linhas',
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas e horários', 'Lines and timetables', 'Linien und Fahrpläne', 'Lignes et horaires'), url: '/linhas' }],
  });
}

// Operadores com tempo real na PAROU (Carris Metropolitana, STCP e Metro de Lisboa); nos outros só há o horário oficial
const COM_TEMPO_REAL = new Set(['carris-metropolitana', 'stcp', 'metro-de-lisboa']);

function paginaOperador(op: Operador): string {
  const plural = pluralModo(op.modo);
  const tr = COM_TEMPO_REAL.has(op.slug);
  const corpo = `<h1>${L(`Horários ${html(op.nome)}: linhas e paragens`, `${html(op.nome)} timetables: lines and stops`, `Fahrpläne ${html(op.nome)}: Linien und Haltestellen`, `Horaires ${html(op.nome)} : lignes et arrêts`)}</h1>
<p class="sub">${L(
    `${html(op.nome)} tem ${nLinhas(op.linhas.length)} e ${num(op.paragens.length)} paragens na PAROU. Escolhe uma linha para ver o horário de dias úteis, sábados e domingos e todas as paragens do percurso${tr ? ' — ou abre a app para ver os próximos ' + plural + ' em tempo real' : ''}.`,
    `${html(op.nome)} has ${nLinhas(op.linhas.length)} and ${num(op.paragens.length)} stops on PAROU. Pick a line to see the weekday, Saturday and Sunday timetable and every stop on the route${tr ? ' — or open the app to see the next ' + plural + ' in real time' : ''}.`,
    `${html(op.nome)} hat ${nLinhas(op.linhas.length)} und ${num(op.paragens.length)} Haltestellen bei PAROU. Wähle eine Linie, um den Fahrplan für Werktage, Samstage und Sonntage sowie alle Haltestellen der Strecke zu sehen${tr ? ' — oder öffne die App, um die nächsten ' + plural + ' in Echtzeit zu sehen' : ''}.`,
    `${html(op.nome)} compte ${nLinhas(op.linhas.length)} et ${num(op.paragens.length)} arrêts sur PAROU. Choisissez une ligne pour voir l'horaire des jours ouvrables, des samedis et des dimanches et tous les arrêts du trajet${tr ? ' — ou ouvrez l\'application pour voir les prochains ' + plural + ' en temps réel' : ''}.`)}</p>
<p><a class="btn laranja" href="/">${L(`Ver ${plural} perto de mim`, `See ${plural} near me`, `${plural} in meiner Nähe anzeigen`, `Voir les ${plural} près de moi`)}</a> <a class="btn claro" href="/paragens/${op.slug}">${L('Todas as paragens', 'All stops', 'Alle Haltestellen', 'Tous les arrêts')}</a></p>
<h2>${L(`Linhas ${html(op.nome)}`, `${html(op.nome)} lines`, `Linien ${html(op.nome)}`, `Lignes ${html(op.nome)}`)}</h2>
<ul class="lista">${op.linhas.map((l) => `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}${l.nome ? `<small>${html(l.nome)}</small>` : ''}</span></a></li>`).join('')}</ul>
<p class="nota">${L(`Horários oficiais publicados pela ${html(op.nome)}. Atualizado a ${html(dataBase())}.`, `Official timetables published by ${html(op.nome)}. Updated ${html(dataBase())}.`, `Offizielle Fahrpläne von ${html(op.nome)}. Stand: ${html(dataBase())}.`, `Horaires officiels publiés par ${html(op.nome)}. Mis à jour le ${html(dataBase())}.`)}${op.slug === 'stcp' ? ` ${L('Tempo real: dados abertos da STCP (licença CC BY 4.0).', 'Real time: STCP open data (CC BY 4.0 licence).', 'Echtzeit: offene Daten der STCP (Lizenz CC BY 4.0).', 'Temps réel : données ouvertes de la STCP (licence CC BY 4.0).')}` : ''}</p>`;
  return pagina({
    titulo: L(`Horários ${op.nome}${tr ? ' e tempo real' : ''}: linhas e paragens | PAROU`, `${op.nome} timetables${tr ? ' and real time' : ''}: lines and stops | PAROU`, `Fahrpläne ${op.nome}${tr ? ' und Echtzeit' : ''}: Linien und Haltestellen | PAROU`, `Horaires ${op.nome}${tr ? ' et temps réel' : ''} : lignes et arrêts | PAROU`),
    descricao: L(
      `Horários das ${op.linhas.length} linhas ${op.nome} (${op.modo.toLowerCase()}): partidas de dias úteis, sábados e domingos, percurso e paragens${tr ? `, com os próximos ${plural} em tempo real` : ' e próximas partidas em cada paragem'}.`,
      `Timetables for the ${op.linhas.length} ${op.nome} lines (${nomeModo(op.modo).toLowerCase()}): weekday, Saturday and Sunday departures, route and stops${tr ? `, with the next ${plural} in real time` : ' and next departures at every stop'}.`,
      `Fahrpläne der ${op.linhas.length} Linien von ${op.nome} (${nomeModo(op.modo)}): Abfahrten an Werktagen, Samstagen und Sonntagen, Strecke und Haltestellen${tr ? `, mit den nächsten ${plural} in Echtzeit` : ' und nächste Abfahrten an jeder Haltestelle'}.`,
      `Horaires des ${op.linhas.length} lignes ${op.nome} (${nomeModo(op.modo).toLowerCase()}) : départs les jours ouvrables, samedis et dimanches, trajet et arrêts${tr ? `, avec les prochains ${plural} en temps réel` : ' et prochains départs à chaque arrêt'}.`),
    caminho: `/linhas/${op.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas', 'Lines', 'Linien', 'Lignes'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }],
    jsonld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: L(`Linhas ${op.nome}`, `${op.nome} lines`, `Linien ${op.nome}`, `Lignes ${op.nome}`), numberOfItems: op.linhas.length, itemListElement: op.linhas.slice(0, 200).map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: `${nomeLinha(l)} ${l.nome}`.trim(), url: `${SITE}/linhas/${op.slug}/${l.slug}` })) }],
  });
}

function tabelaHoras(partidas: number[]): string {
  if (partidas.length === 0) return `<p class="nota">${L('Sem partidas neste dia.', 'No departures on this day.', 'Keine Abfahrten an diesem Tag.', 'Aucun départ ce jour-là.')}</p>`;
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
    falha: L('Horário de hoje indisponível neste momento: o serviço da AMP só responde a ligações feitas em Portugal. Na <a href="/">app PAROU</a> vês as partidas ao minuto.', 'Today\'s timetable is not available right now: the AMP service only answers connections made from Portugal. In the <a href="/">PAROU app</a> you see departures minute by minute.', 'Der heutige Fahrplan ist im Moment nicht verfügbar: Der AMP-Dienst antwortet nur auf Verbindungen aus Portugal. In der <a href="/">PAROU-App</a> siehst du die Abfahrten minutengenau.', 'L\'horaire du jour n\'est pas disponible pour le moment : le service de l\'AMP ne répond qu\'aux connexions depuis le Portugal. Dans l\'<a href="/">application PAROU</a>, vous voyez les départs à la minute près.'),
    semSentido: L('Sem partidas hoje neste sentido.', 'No departures today in this direction.', 'Heute keine Abfahrten in diese Richtung.', 'Aucun départ aujourd\'hui dans ce sens.'),
    hoje: L('Hoje: {n} partidas, {a}–{b}', 'Today: {n} departures, {a}–{b}', 'Heute: {n} Abfahrten, {a}–{b}', 'Aujourd\'hui : {n} départs, {a}–{b}'),
    prox: L(' · próxima às <b>{h}</b>', ' · next at <b>{h}</b>', ' · nächste um <b>{h}</b>', ' · prochain à <b>{h}</b>'),
    notaLinha: L('Horário da AMP para hoje, na primeira paragem.', 'AMP timetable for today, at the first stop.', 'AMP-Fahrplan für heute, an der ersten Haltestelle.', 'Horaire de l\'AMP pour aujourd\'hui, au premier arrêt.'),
    semMais: L('Sem mais partidas hoje.', 'No more departures today.', 'Heute keine weiteren Abfahrten.', 'Plus de départs aujourd\'hui.'),
    chegar: L('a chegar', 'arriving', 'kommt jetzt', 'arrive'),
    min: L('daqui a {m} min', 'in {m} min', 'in {m} Min.', 'dans {m} min'),
    horas: L('daqui a {h} h {m}', 'in {h} h {m} min', 'in {h} Std. {m} Min.', 'dans {h} h {m} min'),
    notaProx: L('Horário da AMP, às {h}. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.', 'AMP timetable, at {h}. To follow it minute by minute, open the <a href="/">PAROU app</a>.', 'AMP-Fahrplan, um {h} Uhr. Um es minutengenau zu verfolgen, öffne die <a href="/">PAROU-App</a>.', 'Horaire de l\'AMP, à {h}. Pour suivre en temps réel à la minute, ouvrez l\'<a href="/">application PAROU</a>.'),
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
    `Timetable for ${html(nome)} ${html(op.nome)} (${html(nomeModo(modo).toLowerCase())}): weekday, Saturday and Sunday departures and all ${nParagens} stops on the route.`,
    `Fahrplan ${html(nome)} ${html(op.nome)} (${html(nomeModo(modo))}): Abfahrten an Werktagen, Samstagen und Sonntagen und alle ${nParagens} Haltestellen der Strecke.`,
    `Horaire ${html(nome)} ${html(op.nome)} (${html(nomeModo(modo).toLowerCase())}) : départs les jours ouvrables, samedis et dimanches et les ${nParagens} arrêts du trajet.`)}</p>
<div class="resumo">
<div><b>${h.hoje.primeira != null ? hora(h.hoje.primeira) : '—'}</b><span>${L('Primeira partida hoje', 'First departure today', 'Erste Abfahrt heute', 'Premier départ aujourd\'hui')}</span></div>
<div><b>${h.hoje.ultima != null ? hora(h.hoje.ultima) : '—'}</b><span>${L('Última partida hoje', 'Last departure today', 'Letzte Abfahrt heute', 'Dernier départ aujourd\'hui')}</span></div>
<div><b>${h.hoje.total || '—'}</b><span>${L('Partidas hoje', 'Departures today', 'Abfahrten heute', 'Départs aujourd\'hui')}${h.sentidos[0] ? ` (${L('sentido', 'towards', 'Richtung', 'direction')} ${html(h.sentidos[0].destino)})` : ''}</span></div>
${h.hoje.intervaloPonta ? `<div><b>${h.hoje.intervaloPonta} min</b><span>${L('Intervalo às horas de ponta', 'Interval at peak hours', 'Takt zur Hauptverkehrszeit', 'Intervalle aux heures de pointe')}</span></div>` : ''}
</div>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">${L('Ver em tempo real', 'See in real time', 'In Echtzeit ansehen', 'Voir en temps réel')}</a></p>`;
  for (const s of h.sentidos) {
    corpo += `<h2>${html(tituloSentido(s.destino))}</h2>
<p class="nota">${L('Partidas de', 'Departures from', 'Abfahrten ab', 'Départs depuis')} ${html(s.paragens[0]?.nome || '')}.</p>`;
    s.horarios.forEach((hh, i) => {
      const dia = DateTime.fromISO(hh.data, { zone: ZONA }).setLocale(LOCALE());
      const resumoDia = hh.partidas.length
        ? `${hh.partidas.length} ${L('partidas', 'departures', 'Abfahrten', 'départs')} · ${hora(hh.partidas[0])}–${hora(hh.partidas[hh.partidas.length - 1])}`
        : L('sem serviço', 'no service', 'kein Betrieb', 'pas de service');
      corpo += `<details${i === 0 ? ' open' : ''}><summary>${html(nomeTipoDia(hh.tipo))}<span class="nota" style="margin-left:auto">${resumoDia}</span></summary><div class="dentro">${tabelaHoras(hh.partidas)}<p class="nota">${L('Horário de', 'Timetable for', 'Fahrplan für', 'Horaire du')} ${html(dia.toFormat(L("cccc, d 'de' LLLL", 'cccc, d LLLL', 'cccc, d. LLLL', 'cccc d LLLL')))}.</p></div></details>`;
    });
    corpo += `<h3>${L('Paragens', 'Stops', 'Haltestellen', 'Arrêts')} (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      const nomeP = html(p.nome);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${nomeP}</a>` : nomeP}${p.minutos ? `<small>+${p.minutos} min</small>` : ''}</li>`;
    }).join('')}</ol>`;
  }
  // Outras linhas do mesmo operador (ligações internas)
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>${L(`Outras linhas ${html(op.nome)}`, `Other ${html(op.nome)} lines`, `Weitere Linien ${html(op.nome)}`, `Autres lignes ${html(op.nome)}`)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">${L(`Ver todas as linhas ${html(op.nome)} ›`, `See all ${html(op.nome)} lines ›`, `Alle Linien ${html(op.nome)} ansehen ›`, `Voir toutes les lignes ${html(op.nome)} ›`)}</a></p>`;
  }
  corpo += `<p class="nota">${L(
    `Horários oficiais publicados pela ${html(op.nome)} (atualizados a ${html(dataBase())}). Podem mudar em feriados, greves ou obras: para os próximos ${plural} em tempo real usa a <a href="/">app PAROU</a>.`,
    `Official timetables published by ${html(op.nome)} (updated ${html(dataBase())}). They can change on holidays, strikes or roadworks: for the next ${plural} in real time use the <a href="/">PAROU app</a>.`,
    `Offizielle Fahrpläne von ${html(op.nome)} (Stand: ${html(dataBase())}). An Feiertagen, bei Streiks oder Bauarbeiten können sie sich ändern: Für die nächsten ${plural} in Echtzeit nutze die <a href="/">PAROU-App</a>.`,
    `Horaires officiels publiés par ${html(op.nome)} (mis à jour le ${html(dataBase())}). Ils peuvent changer les jours fériés, en cas de grève ou de travaux : pour les prochains ${plural} en temps réel, utilisez l'<a href="/">application PAROU</a>.`)}</p>`;
  const tituloBase = `${nome} ${op.nome}`;
  return pagina({
    titulo: cortar(L(`${tituloBase}: horários e paragens${percurso ? ` (${percurso})` : ''}`, `${tituloBase}: timetable and stops${percurso ? ` (${percurso})` : ''}`, `${tituloBase}: Fahrplan und Haltestellen${percurso ? ` (${percurso})` : ''}`, `${tituloBase} : horaires et arrêts${percurso ? ` (${percurso})` : ''}`), 64) + ' | PAROU',
    descricao: L(
      `Horário ${daDo} ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: primeira e última partida, horários de dias úteis, sábados e domingos e as ${nParagens} paragens. Tempo real na PAROU.`,
      `Timetable for ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: first and last departure, weekday, Saturday and Sunday timetables and all ${nParagens} stops. Real time on PAROU.`,
      `Fahrplan ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: erste und letzte Abfahrt, Fahrpläne für Werktage, Samstage und Sonntage und alle ${nParagens} Haltestellen. Echtzeit bei PAROU.`,
      `Horaire ${nome} ${op.nome}${percurso ? ` (${percurso})` : ''} : premier et dernier départ, horaires des jours ouvrables, samedis et dimanches et les ${nParagens} arrêts. Temps réel sur PAROU.`),
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas', 'Lines', 'Linien', 'Lignes'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
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
    `${html(nome)} of ${html(op.nome)} (${modo === 'Barco' ? 'boat' : 'bus'} network of the Área Metropolitana do Porto): route with all ${nParagens} stops in each direction and today's timetable.`,
    `${html(nome)} von ${html(op.nome)} (${modo === 'Barco' ? 'Fährnetz' : 'Busnetz'} der Área Metropolitana do Porto): Strecke mit allen ${nParagens} Haltestellen je Richtung und Fahrplan von heute.`,
    `${html(nome)} de ${html(op.nome)} (réseau de ${modo === 'Barco' ? 'bateaux' : 'bus'} de l'Área Metropolitana do Porto) : trajet avec les ${nParagens} arrêts de chaque sens et horaire du jour.`)}</p>
<p><a class="btn laranja" href="/transportes?linha=${encodeURIComponent(l.routeId)}">${L('Ver na app', 'See in the app', 'In der App ansehen', 'Voir dans l\'application')}</a></p>`;
  for (const s of sentidos) {
    const primeira = s.paragens[0];
    corpo += `<h2>${html(tituloSentido(s.destino))}</h2>`;
    if (primeira) {
      corpo += `<p class="nota">${L('Partidas de', 'Departures from', 'Abfahrten ab', 'Départs depuis')} ${html(primeira.nome)}.</p><div data-unir="linha" data-cods="${html(primeira.stopId.replace(/^unir:/, ''))}" data-linha="${html(l.codigo)}" data-sentido="${s.direcao}"><p class="nota">${L('A carregar o horário de hoje (AMP)…', "Loading today's timetable (AMP)…", 'Fahrplan von heute wird geladen (AMP) …', 'Chargement de l\'horaire du jour (AMP)…')}</p></div>`;
    }
    corpo += `<h3>${L('Paragens', 'Stops', 'Haltestellen', 'Arrêts')} (${s.paragens.length})</h3><ol class="percurso">${s.paragens.map((p) => {
      const g = ix.grupoPorStop.get(p.stopId);
      return `<li>${g ? `<a href="/paragens/${op.slug}/${g.slug}">${html(p.nome)}</a>` : html(p.nome)}</li>`;
    }).join('')}</ol>`;
  }
  const i = op.linhas.indexOf(l);
  const vizinhas = [...op.linhas.slice(Math.max(0, i - 4), i), ...op.linhas.slice(i + 1, i + 5)];
  if (vizinhas.length) {
    corpo += `<h2>${L(`Outras linhas ${html(op.nome)}`, `Other ${html(op.nome)} lines`, `Weitere Linien ${html(op.nome)}`, `Autres lignes ${html(op.nome)}`)}</h2><ul class="lista">${vizinhas.map((v) => `<li><a href="/linhas/${op.slug}/${v.slug}">${chip(v)}<span class="t">${html(nomeLinha(v))}${v.nome ? `<small>${html(v.nome)}</small>` : ''}</span></a></li>`).join('')}</ul><p><a href="/linhas/${op.slug}">${L(`Ver todas as linhas ${html(op.nome)} ›`, `See all ${html(op.nome)} lines ›`, `Alle Linien ${html(op.nome)} ansehen ›`, `Voir toutes les lignes ${html(op.nome)} ›`)}</a></p>`;
  }
  corpo += `<p class="nota">${L(
    `Percurso e paragens publicados pela AMP – Área Metropolitana do Porto (atualizados a ${html(dataBase())}). Os horários podem mudar em feriados, greves ou obras; confirma na <a href="/">app PAROU</a> ou junto da UNIR.`,
    `Route and stops published by AMP – Área Metropolitana do Porto (updated ${html(dataBase())}). Timetables can change on holidays, strikes or roadworks; check the <a href="/">PAROU app</a> or UNIR.`,
    `Strecke und Haltestellen von der AMP – Área Metropolitana do Porto veröffentlicht (Stand: ${html(dataBase())}). Fahrpläne können sich an Feiertagen, bei Streiks oder Bauarbeiten ändern; prüfe die <a href="/">PAROU-App</a> oder UNIR.`,
    `Trajet et arrêts publiés par l'AMP – Área Metropolitana do Porto (mis à jour le ${html(dataBase())}). Les horaires peuvent changer les jours fériés, en cas de grève ou de travaux ; vérifiez dans l'<a href="/">application PAROU</a> ou auprès d'UNIR.`)}</p>`;
  return pagina({
    titulo: cortar(L(`${nome} ${op.nome}: horários e paragens${percurso ? ` (${percurso})` : ''}`, `${nome} ${op.nome}: timetable and stops${percurso ? ` (${percurso})` : ''}`, `${nome} ${op.nome}: Fahrplan und Haltestellen${percurso ? ` (${percurso})` : ''}`, `${nome} ${op.nome} : horaires et arrêts${percurso ? ` (${percurso})` : ''}`), 64) + ' | PAROU',
    descricao: L(
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: as ${nParagens} paragens do percurso em cada sentido e o horário de hoje. Partidas ao minuto na PAROU.`,
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: all ${nParagens} stops on the route in each direction and today's timetable. Departures minute by minute on PAROU.`,
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''}: alle ${nParagens} Haltestellen der Strecke in jeder Richtung und der Fahrplan von heute. Abfahrten minutengenau bei PAROU.`,
      `${nome} ${op.nome}${percurso ? ` (${percurso})` : ''} : les ${nParagens} arrêts du trajet dans chaque sens et l'horaire du jour. Départs à la minute près sur PAROU.`),
    caminho: `/linhas/${op.slug}/${l.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas', 'Lines', 'Linien', 'Lignes'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome, url: `/linhas/${op.slug}/${l.slug}` }],
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
  if (minutos <= 0) return L('a chegar', 'arriving', 'kommt jetzt', 'arrive');
  if (minutos < 60) return L(`daqui a ${minutos} min`, `in ${minutos} min`, `in ${minutos} Min.`, `dans ${minutos} min`);
  const h = Math.floor(minutos / 60);
  const m = String(minutos % 60).padStart(2, '0');
  return L(`daqui a ${h} h ${m}`, `in ${h} h ${m} min`, `in ${h} Std. ${m} Min.`, `dans ${h} h ${m} min`);
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
  const nomeH1 = lang() === 'en' ? `${html(g.nome)} ${html(tp.palavra)}` : `${tp.palavra} ${html(g.nome)}`;
  let corpo = `<h1>${nomeH1}${dados.concelho ? ` <span style="font-weight:500;color:#6B6B6B">· ${html(dados.concelho)}</span>` : ''}</h1>
<p class="sub">${html(op.nome)} · ${nLinhas(linhas.length)}${destinos.length ? ` ${L('para', 'to', 'nach', 'vers')} ${html(destinos.join(', '))}` : ''}.</p>
<p><a class="btn laranja" href="/?local=${g.lat.toFixed(5)},${g.lon.toFixed(5)}&nome=${encodeURIComponent(g.nome)}&paragem=${encodeURIComponent(g.id)}">${L('Ver em tempo real', 'See in real time', 'In Echtzeit ansehen', 'Voir en temps réel')}</a></p>
<h2>${L('Próximas partidas', 'Next departures', 'Nächste Abfahrten', 'Prochains départs')}</h2>`;
  if (g.feedId === UNIR) {
    corpo += `<div data-unir="proximas" data-cods="${html(g.stopIds.slice(0, 3).map((x) => x.replace(/^unir:/, '')).join(','))}"><p class="nota">${L('A carregar as próximas partidas (horário da AMP)…', 'Loading the next departures (AMP timetable)…', 'Nächste Abfahrten werden geladen (AMP-Fahrplan) …', 'Chargement des prochains départs (horaire de l\'AMP)…')}</p></div>`;
  } else if (proximas.length) {
    const algumTempoReal = proximas.some((d) => d.tempoReal);
    corpo += `<ul class="lista partidas">${proximas.map((d) => {
      const c = d.linha ? chip(d.linha) : `<span class="chip">${html(d.codigo)}</span>`;
      return `<li><div class="linha">${c}<span class="t">${html(d.destino)}${d.tempoReal ? `<small>${L('tempo real', 'real time', 'Echtzeit', 'temps réel')}</small>` : ''}</span><span class="hora">${html(d.hora)}<small>${quandoChega(d.minutos)}</small></span></div></li>`;
    }).join('')}</ul><p class="nota">${L(
      `Calculado às ${agora.toFormat('HH:mm')} com o horário oficial${algumTempoReal ? ' e o tempo real do operador' : ''}. Para acompanhar ao minuto, abre a <a href="/">app PAROU</a>.`,
      `Calculated at ${agora.toFormat('HH:mm')} from the official timetable${algumTempoReal ? " and the operator's real-time data" : ''}. To follow it minute by minute, open the <a href="/">PAROU app</a>.`,
      `Berechnet um ${agora.toFormat('HH:mm')} Uhr aus dem offiziellen Fahrplan${algumTempoReal ? ' und den Echtzeitdaten des Verkehrsunternehmens' : ''}. Um es minutengenau zu verfolgen, öffne die <a href="/">PAROU-App</a>.`,
      `Calculé à ${agora.toFormat('HH:mm')} d'après l'horaire officiel${algumTempoReal ? ' et le temps réel de l\'opérateur' : ''}. Pour suivre en temps réel à la minute, ouvrez l'<a href="/">application PAROU</a>.`)}</p>`;
  } else {
    corpo += `<p class="nota">${L(
      `Sem partidas previstas nas próximas horas (às ${agora.toFormat('HH:mm')}). Vê abaixo a primeira partida de cada linha.`,
      `No departures expected in the next few hours (at ${agora.toFormat('HH:mm')}). See the first departure of each line below.`,
      `Keine Abfahrten in den nächsten Stunden erwartet (um ${agora.toFormat('HH:mm')} Uhr). Unten siehst du die erste Abfahrt jeder Linie.`,
      `Aucun départ prévu dans les prochaines heures (à ${agora.toFormat('HH:mm')}). Voyez ci-dessous le premier départ de chaque ligne.`)}</p>`;
  }
  if (linhas.length) {
    corpo += `<h2>${tp.paragem ? L('Linhas que passam nesta paragem', 'Lines serving this stop', 'Linien an dieser Haltestelle', 'Lignes desservant cet arrêt') : L('Linhas que passam aqui', `Lines serving this ${tp.palavra.toLowerCase()}`, 'Linien, die hier halten', 'Lignes qui passent ici')}</h2><ul class="lista">${linhas.map((x) => {
      const l = x.linha;
      return `<li><a href="/linhas/${op.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${x.destinos.length ? `${L('para', 'to', 'nach', 'vers')} ${html(x.destinos.join(' · '))}` : html(l.nome)}</small></span><span class="dir">${x.primeira != null ? `${hora(x.primeira)}–${hora(x.ultima!)}` : (g.feedId === CM || g.feedId === UNIR ? '' : L('hoje sem serviço', 'no service today', 'heute kein Betrieb', 'pas de service aujourd\'hui'))}</span></a></li>`;
    }).join('')}</ul>${g.feedId === UNIR ? '' : `<p class="nota">${L('Horas: primeira e última passagem de hoje.', 'Times: first and last departure today.', 'Uhrzeiten: erste und letzte Abfahrt von heute.', 'Heures : premier et dernier passage d\'aujourd\'hui.')}</p>`}`;
  }
  const perto = paragensPerto(g.lat, g.lon, 450, 14).filter((p) => p.g !== g);
  if (perto.length) {
    corpo += `<h2>${L('Paragens perto', 'Stops nearby', 'Haltestellen in der Nähe', 'Arrêts à proximité')}</h2><ul class="lista">${perto.map(({ g: p, d }) => {
      const o2 = ix.operadores.find((o) => o.feedId === p.feedId);
      if (!o2) return '';
      return `<li><a href="/paragens/${o2.slug}/${p.slug}"><span class="t">${html(p.nome)}<small>${html(o2.nome)}</small></span><span class="dir">${Math.round(d / 10) * 10} ${L('metros', 'meters', 'Meter', 'mètres')}</span></a></li>`;
    }).join('')}</ul>`;
  }
  corpo += g.feedId === UNIR
    ? `<p class="nota">${L(
        `Paragens e linhas publicadas pela AMP – Área Metropolitana do Porto (atualizadas a ${html(dataBase())}); horários pedidos à AMP no momento.`,
        `Stops and lines published by AMP – Área Metropolitana do Porto (updated ${html(dataBase())}); timetables requested from AMP on the spot.`,
        `Haltestellen und Linien von der AMP – Área Metropolitana do Porto veröffentlicht (Stand: ${html(dataBase())}); Fahrpläne werden live bei der AMP abgefragt.`,
        `Arrêts et lignes publiés par l'AMP – Área Metropolitana do Porto (mis à jour le ${html(dataBase())}) ; horaires demandés à l'AMP en direct.`)}</p>`
    : `<p class="nota">${L(`Horários oficiais da ${html(op.nome)} (atualizados a ${html(dataBase())}).`, `Official timetables from ${html(op.nome)} (updated ${html(dataBase())}).`, `Offizielle Fahrpläne von ${html(op.nome)} (Stand: ${html(dataBase())}).`, `Horaires officiels de ${html(op.nome)} (mis à jour le ${html(dataBase())}).`)}</p>`;
  const tituloLinhas = codigos.length ? ` — ${codigos.slice(0, 4).join(', ')}` : '';
  return pagina({
    titulo: cortar(L(`${g.nome}${local} (${op.nome}): próximos ${plural}${tituloLinhas}`, `${g.nome}${local} (${op.nome}): next ${plural}${tituloLinhas}`, `${g.nome}${local} (${op.nome}): nächste ${plural}${tituloLinhas}`, `${g.nome}${local} (${op.nome}) : prochains ${plural}${tituloLinhas}`), 66) + ' | PAROU',
    descricao: L(
      `Próximas partidas na ${tp.palavra.toLowerCase()} ${g.nome}${local} da ${op.nome}${codigos.length ? `: linhas ${codigos.join(', ')}` : ''}${destinos.length ? ` para ${destinos.join(', ')}` : ''}. Primeira e última partida de hoje e tempo real na PAROU.`,
      `Next departures at ${g.nome}${local} ${tp.palavra.toLowerCase()} (${op.nome})${codigos.length ? `: lines ${codigos.join(', ')}` : ''}${destinos.length ? ` to ${destinos.join(', ')}` : ''}. First and last departure today and real time on PAROU.`,
      `Nächste Abfahrten – ${tp.palavra} ${g.nome}${local} (${op.nome})${codigos.length ? `: Linien ${codigos.join(', ')}` : ''}${destinos.length ? ` nach ${destinos.join(', ')}` : ''}. Erste und letzte Abfahrt von heute und Echtzeit bei PAROU.`,
      `Prochains départs – ${tp.palavra.toLowerCase()} ${g.nome}${local} (${op.nome})${codigos.length ? ` : lignes ${codigos.join(', ')}` : ''}${destinos.length ? ` vers ${destinos.join(', ')}` : ''}. Premier et dernier départ d'aujourd'hui et temps réel sur PAROU.`),
    caminho: `/paragens/${op.slug}/${g.slug}`,
    corpo,
    script: g.feedId === UNIR ? scriptUnir(Object.fromEntries(linhas.map((x) => [x.linha.codigo, `/linhas/${op.slug}/${x.linha.slug}`]))) : undefined,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas', 'Lines', 'Linien', 'Lignes'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: g.nome, url: `/paragens/${op.slug}/${g.slug}` }],
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
  const nav = total > 1 ? `<nav class="paginas" aria-label="${L('Páginas', 'Pages', 'Seiten', 'Pages')}">${Array.from({ length: total }, (_, i) => i + 1).map((i) => (i === p ? `<span>${i}</span>` : `<a href="/paragens/${op.slug}${i === 1 ? '' : `?p=${i}`}">${i}</a>`)).join('')}</nav>` : '';
  const corpo = `<h1>${L(`Paragens ${html(op.nome)}`, `${html(op.nome)} stops`, `Haltestellen ${html(op.nome)}`, `Arrêts ${html(op.nome)}`)}</h1>
<p class="sub">${L(
    `${num(op.paragens.length)} paragens ${html(op.nome)} por ordem alfabética. Em cada uma vês as próximas partidas e as linhas que lá passam.`,
    `${num(op.paragens.length)} ${html(op.nome)} stops in alphabetical order. For each one you see the next departures and the lines that call there.`,
    `${num(op.paragens.length)} Haltestellen von ${html(op.nome)} in alphabetischer Reihenfolge. Bei jeder siehst du die nächsten Abfahrten und die Linien, die dort halten.`,
    `${num(op.paragens.length)} arrêts ${html(op.nome)} par ordre alphabétique. Pour chacun, vous voyez les prochains départs et les lignes qui y passent.`)}</p>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" placeholder="${L('Nome da paragem', 'Stop name', 'Name der Haltestelle', 'Nom de l\'arrêt')}" aria-label="${L('Pesquisar paragem', 'Search for a stop', 'Haltestelle suchen', 'Rechercher un arrêt')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search', 'Suchen', 'Rechercher')}</button></form>
${nav}<ul class="lista">${fatia.map((g) => `<li><a href="/paragens/${op.slug}/${g.slug}"><span class="t">${html(g.nome)}</span></a></li>`).join('')}</ul>${nav}`;
  return pagina({
    titulo: L(`Paragens ${op.nome}${p > 1 ? ` (página ${p})` : ''}: horários e próximas partidas | PAROU`, `${op.nome} stops${p > 1 ? ` (page ${p})` : ''}: timetables and next departures | PAROU`, `Haltestellen ${op.nome}${p > 1 ? ` (Seite ${p})` : ''}: Fahrpläne und nächste Abfahrten | PAROU`, `Arrêts ${op.nome}${p > 1 ? ` (page ${p})` : ''} : horaires et prochains départs | PAROU`),
    descricao: L(
      `Lista de todas as paragens ${op.nome}${p > 1 ? `, página ${p}` : ''}: próximas partidas, linhas e horários de cada paragem na PAROU.`,
      `List of all ${op.nome} stops${p > 1 ? `, page ${p}` : ''}: next departures, lines and timetables for each stop on PAROU.`,
      `Liste aller Haltestellen von ${op.nome}${p > 1 ? `, Seite ${p}` : ''}: nächste Abfahrten, Linien und Fahrpläne jeder Haltestelle bei PAROU.`,
      `Liste de tous les arrêts ${op.nome}${p > 1 ? `, page ${p}` : ''} : prochains départs, lignes et horaires de chaque arrêt sur PAROU.`),
    caminho: `/paragens/${op.slug}${p > 1 ? `?p=${p}` : ''}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Linhas', 'Lines', 'Linien', 'Lignes'), url: '/linhas' }, { nome: op.nome, url: `/linhas/${op.slug}` }, { nome: L('Paragens', 'Stops', 'Haltestellen', 'Arrêts'), url: `/paragens/${op.slug}` }],
  });
}

function quando(iso: string | null): string {
  if (!iso) return '';
  const d = DateTime.fromISO(iso, { zone: ZONA }).setLocale(LOCALE());
  if (!d.isValid) return '';
  const hoje = DateTime.now().setZone(ZONA).startOf('day');
  const dias = Math.round(d.startOf('day').diff(hoje, 'days').days);
  const h = d.toFormat('HH:mm');
  if (dias === 0) return L(`hoje às ${h}`, `today at ${h}`, `heute um ${h} Uhr`, `aujourd'hui à ${h}`);
  if (dias === 1) return L(`amanhã às ${h}`, `tomorrow at ${h}`, `morgen um ${h} Uhr`, `demain à ${h}`);
  if (dias === -1) return L(`ontem às ${h}`, `yesterday at ${h}`, `gestern um ${h} Uhr`, `hier à ${h}`);
  return d.toFormat(L("cccc, d 'de' LLLL 'às' HH:mm", "cccc, d LLLL 'at' HH:mm", "cccc, d. LLLL 'um' HH:mm 'Uhr'", "cccc d LLLL 'à' HH:mm"));
}

async function paginaGreves(): Promise<string> {
  const { greves, completo } = await grevesPartilhadas();
  const agora = DateTime.now().setZone(ZONA).setLocale(LOCALE());
  const oficiais = greves.filter((g) => g.origem === 'operador');
  const noticias = greves.filter((g) => g.origem === 'noticia');
  const grelhaOperadores = `<h2>${L('Greve por operador', 'Strikes by operator', 'Streiks nach Verkehrsunternehmen', 'Grèves par opérateur')}</h2><div class="grelha ops">${OPERADORES_GREVE.map((x) => {
    const e = grevesDoOperador(greves, x.chave, completo).estado;
    return `<a href="/greves/${x.slug}"><b>${html(x.nome).replace('/', '/<wbr>')}</b><small>${LT(PILULA_GREVE[e])}</small></a>`;
  }).join('')}</div>`;
  let corpo = `<h1>${L('Greves nos transportes hoje e próximas greves', 'Transport strikes today and upcoming strikes', 'Streiks im Nahverkehr heute und kommende Streiks', 'Grèves dans les transports aujourd\'hui et prochaines grèves')}</h1>
<p class="sub">${L(
    `Greves anunciadas na CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa e outros transportes em Portugal. Atualizado ${html(agora.toFormat("d 'de' LLLL 'às' HH:mm"))}.`,
    `Strikes announced at CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa and other transport in Portugal. Updated ${html(agora.toFormat("d LLLL 'at' HH:mm"))}.`,
    `Angekündigte Streiks bei CP, Metro de Lisboa, Metro do Porto, Carris, Carris Metropolitana, STCP, Fertagus, Transtejo/Soflusa und anderen Verkehrsmitteln in Portugal. Stand: ${html(agora.toFormat("d. LLLL 'um' HH:mm"))} Uhr.`,
    `Grèves annoncées à la CP, au Metro de Lisboa, au Metro do Porto, à la Carris, à la Carris Metropolitana, à la STCP, chez Fertagus, Transtejo/Soflusa et dans d'autres transports au Portugal. Mis à jour le ${html(agora.toFormat("d LLLL 'à' HH:mm"))}.`)}</p>
<div class="aviso">${L(
    'Recebe as greves no telemóvel, mesmo com a app fechada: abre os <a href="/alertas"><b>Alertas da PAROU</b></a> e liga os avisos.',
    'Get strikes on your phone, even with the app closed: open <a href="/alertas"><b>PAROU Alerts</b></a> and turn notifications on.',
    'Erhalte Streikmeldungen auf dem Handy, auch bei geschlossener App: Öffne die <a href="/alertas"><b>PAROU-Warnungen</b></a> und aktiviere die Benachrichtigungen.',
    'Recevez les grèves sur votre téléphone, même application fermée : ouvrez les <a href="/alertas"><b>alertes PAROU</b></a> et activez les notifications.')}</div>`;
  if (emIngles()) corpo += `<p class="nota">${L('', 'Strike notices are published in Portuguese by the operators and the news outlets, so the details below are in Portuguese.', 'Streikmeldungen werden von den Verkehrsunternehmen und den Nachrichtenseiten auf Portugiesisch veröffentlicht, daher sind die Einzelheiten unten auf Portugiesisch.', 'Les avis de grève sont publiés en portugais par les opérateurs et les médias ; les détails ci-dessous sont donc en portugais.')}</p>`;
  corpo += grelhaOperadores;
  if (oficiais.length === 0 && noticias.length === 0 && !completo) {
    corpo += `<div class="cartao"><b>${L('Não foi possível confirmar as greves agora.', 'Strikes could not be confirmed right now.', 'Streiks konnten gerade nicht bestätigt werden.', 'Impossible de confirmer les grèves pour le moment.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'A fonte dos avisos dos operadores não respondeu. Consulta o site do operador antes de sair; esta página tenta outra vez dentro de instantes.',
      'The source of the operator notices did not respond. Check the operator website before you leave; this page will try again shortly.',
      'Die Quelle der Meldungen der Verkehrsunternehmen hat nicht geantwortet. Prüfe die Website des Verkehrsunternehmens, bevor du losgehst; diese Seite versucht es in Kürze erneut.',
      'La source des avis des opérateurs n\'a pas répondu. Consultez le site de l\'opérateur avant de partir ; cette page réessaiera dans un instant.')}</p></div>`;
  } else if (oficiais.length === 0 && noticias.length === 0) {
    corpo += `<div class="cartao"><b>${L('Sem greves anunciadas neste momento.', 'No strikes announced right now.', 'Derzeit keine Streiks angekündigt.', 'Aucune grève annoncée pour le moment.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'Não há greves nos transportes anunciadas pelos operadores nem nas notícias dos últimos dias. Esta página atualiza-se sozinha.',
      'There are no transport strikes announced by the operators or in the news over the last few days. This page updates itself.',
      'Weder die Verkehrsunternehmen noch die Nachrichten der letzten Tage melden Streiks im Nahverkehr. Diese Seite aktualisiert sich von selbst.',
      'Aucune grève dans les transports n\'est annoncée par les opérateurs ni dans l\'actualité des derniers jours. Cette page se met à jour toute seule.')}</p></div>`;
  }
  if (oficiais.length) {
    corpo += `<h2>${L('Anunciadas pelos operadores', 'Announced by the operators', 'Von den Verkehrsunternehmen angekündigt', 'Annoncées par les opérateurs')}</h2>${oficiais.map(cartaoGreve).join('')}`;
  }
  if (noticias.length) {
    corpo += `<h2>${L('Nas notícias', 'In the news', 'In den Nachrichten', 'Dans l\'actualité')}</h2><ul class="lista">${noticias.map(linhaNoticiaGreve).join('')}</ul>`;
  }
  corpo += `<h2>${L('Serviços mínimos e alternativas', 'Minimum services and alternatives', 'Mindestbetrieb und Alternativen', 'Services minimaux et alternatives')}</h2><p>${L(
    'Em dia de greve, vê na <a href="/">PAROU</a> o que está realmente a circular perto de ti: onde o operador publica tempo real (como a Carris Metropolitana, a STCP e o Metro de Lisboa) vês os veículos que estão de facto a andar. Consulta também os <a href="/linhas">horários das linhas</a> para planear alternativas.',
    'On a strike day, check <a href="/">PAROU</a> to see what is really running near you: where the operator publishes real-time data (such as Carris Metropolitana, STCP and Metro de Lisboa) you see the vehicles that are actually moving. Also check the <a href="/linhas">timetables</a> to plan alternatives.',
    'Sieh am Streiktag in <a href="/">PAROU</a> nach, was in deiner Nähe wirklich fährt: Wo das Verkehrsunternehmen Echtzeitdaten veröffentlicht (wie Carris Metropolitana, STCP und Metro de Lisboa), siehst du die Fahrzeuge, die tatsächlich unterwegs sind. Schau auch in die <a href="/linhas">Fahrpläne der Linien</a>, um Alternativen zu planen.',
    'Un jour de grève, consultez <a href="/">PAROU</a> pour voir ce qui circule vraiment près de vous : là où l\'opérateur publie le temps réel (comme la Carris Metropolitana, la STCP et le Metro de Lisboa), vous voyez les véhicules réellement en circulation. Consultez aussi les <a href="/linhas">horaires des lignes</a> pour planifier des alternatives.')}</p>`;
  return pagina({
    titulo: L('Greves de transportes hoje: metro, CP, Carris e STCP | PAROU', 'Transport strikes today: metro, CP, Carris and STCP | PAROU', 'Streiks im Nahverkehr heute: U-Bahn, CP, Carris und STCP | PAROU', 'Grèves dans les transports aujourd\'hui : métro, CP, Carris et STCP | PAROU'),
    descricao: L(
      'Há greve hoje? Greves anunciadas no metro de Lisboa e do Porto, na CP e nos comboios, na Carris, na STCP, na Fertagus e noutros transportes, com datas, serviços mínimos e notícias. Atualizado sempre.',
      'Is there a strike today? Strikes announced at CP, Metro de Lisboa, Metro do Porto, Carris, STCP, Fertagus and other transport, with dates, minimum services and news. Always up to date.',
      'Gibt es heute einen Streik? Angekündigte Streiks bei U-Bahn Lissabon und Porto, CP und Zügen, Carris, STCP, Fertagus und anderen Verkehrsmitteln, mit Terminen, Mindestbetrieb und Nachrichten. Immer aktuell.',
      'Y a-t-il une grève aujourd\'hui ? Grèves annoncées dans les métros de Lisbonne et de Porto, à la CP et dans les trains, à la Carris, à la STCP, chez Fertagus et dans d\'autres transports, avec dates, services minimaux et actualités. Toujours à jour.'),
    caminho: '/greves',
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Greves', 'Strikes', 'Streiks', 'Grèves'), url: '/greves' }],
  });
}

// ------------------------------------------------------------------------------------
// Greves por operador: /greves/metro-de-lisboa, /greves/carris, /greves/cp…
// Quem procura "greve metro lisboa" quer uma resposta de uma linha (há ou não há) e o que fazer a seguir.
// A resposta vem das greves anunciadas pelos operadores e das notícias (as mesmas de /greves), nunca é inventada.
// ------------------------------------------------------------------------------------
type AlternativaGreve = Textos & { slug: string }
interface OperadorGreve {
  slug: string; // o mesmo de /linhas/<slug>
  chave: string; // chave do operador nas greves (OPERADORES_PUSH no alertasEngine)
  nome: string;
  de: string; // "do Metro de Lisboa"
  quem: Textos;
  alternativas: AlternativaGreve[];
}
export const OPERADORES_GREVE: OperadorGreve[] = [
  {
    slug: 'metro-de-lisboa', chave: 'metro-lisboa', nome: 'Metro de Lisboa', de: 'do Metro de Lisboa',
    quem: { pt: 'O Metro de Lisboa tem 4 linhas (Azul, Amarela, Verde e Vermelha) e serve Lisboa, Amadora, Odivelas e Loures.', en: 'Lisbon\'s metro has 4 lines (Blue, Yellow, Green and Red) and serves Lisbon, Amadora, Odivelas and Loures.', de: 'Die U-Bahn Lissabon hat 4 Linien (Blau, Gelb, Grün und Rot) und bedient Lisboa, Amadora, Odivelas und Loures.', fr: 'Le métro de Lisbonne compte 4 lignes (bleue, jaune, verte et rouge) et dessert Lisboa, Amadora, Odivelas et Loures.' },
    alternativas: [
      { slug: 'carris', pt: 'Autocarros e elétricos dentro de Lisboa', en: 'Buses and trams inside Lisbon', de: 'Busse und Straßenbahnen innerhalb von Lissabon', fr: 'Bus et tramways dans Lisbonne' },
      { slug: 'carris-metropolitana', pt: 'Autocarros para os concelhos à volta de Lisboa, com tempo real', en: 'Buses to the municipalities around Lisbon, with real time', de: 'Busse in die Gemeinden rund um Lissabon, mit Echtzeit', fr: 'Bus vers les communes autour de Lisbonne, avec temps réel' },
      { slug: 'cp', pt: 'Comboios urbanos para Sintra, Cascais e Azambuja', en: 'Suburban trains to Sintra, Cascais and Azambuja', de: 'S-Bahn-Züge nach Sintra, Cascais und Azambuja', fr: 'Trains urbains vers Sintra, Cascais et Azambuja' },
      { slug: 'fertagus', pt: 'Comboio entre Lisboa e a margem sul', en: 'Train between Lisbon and the south bank', de: 'Zug zwischen Lissabon und dem Südufer', fr: 'Train entre Lisbonne et la rive sud' },
    ],
  },
  {
    slug: 'metro-do-porto', chave: 'metro-porto', nome: 'Metro do Porto', de: 'do Metro do Porto',
    quem: { pt: 'O Metro do Porto tem 6 linhas (A, B, C, D, E e F) e liga o Porto a Matosinhos, Maia, Gondomar, Vila Nova de Gaia, Valongo, Vila do Conde e Póvoa de Varzim.', en: 'Porto\'s metro has 6 lines (A, B, C, D, E and F) and links Porto to Matosinhos, Maia, Gondomar, Vila Nova de Gaia, Valongo, Vila do Conde and Póvoa de Varzim.', de: 'Die U-Bahn Porto hat 6 Linien (A, B, C, D, E und F) und verbindet Porto mit Matosinhos, Maia, Gondomar, Vila Nova de Gaia, Valongo, Vila do Conde und Póvoa de Varzim.', fr: 'Le métro de Porto compte 6 lignes (A, B, C, D, E et F) et relie Porto à Matosinhos, Maia, Gondomar, Vila Nova de Gaia, Valongo, Vila do Conde et Póvoa de Varzim.' },
    alternativas: [
      { slug: 'stcp', pt: 'Autocarros no Porto e arredores, com tempo real', en: 'Buses in Porto and around, with real time', de: 'Busse in Porto und Umgebung, mit Echtzeit', fr: 'Bus à Porto et dans les environs, avec temps réel' },
      { slug: 'unir', pt: 'Autocarros da Área Metropolitana do Porto', en: 'Buses across the Porto metropolitan area', de: 'Busse der Metropolregion Porto', fr: 'Bus de la zone métropolitaine de Porto' },
      { slug: 'cp', pt: 'Comboios urbanos do Porto (Braga, Guimarães, Aveiro)', en: 'Porto suburban trains (Braga, Guimarães, Aveiro)', de: 'S-Bahn-Züge in Porto (Braga, Guimarães, Aveiro)', fr: 'Trains urbains de Porto (Braga, Guimarães, Aveiro)' },
    ],
  },
  {
    slug: 'carris', chave: 'carris', nome: 'Carris', de: 'da Carris',
    quem: { pt: 'A Carris faz os autocarros, os elétricos e os ascensores da cidade de Lisboa.', en: 'Carris runs Lisbon\'s buses, trams and funiculars.', de: 'Carris betreibt die Busse, Straßenbahnen und Standseilbahnen der Stadt Lissabon.', fr: 'La Carris exploite les bus, les tramways et les funiculaires de la ville de Lisbonne.' },
    alternativas: [
      { slug: 'metro-de-lisboa', pt: 'Metro, com tempo real', en: 'Metro, with real time', de: 'U-Bahn, mit Echtzeit', fr: 'Métro, avec temps réel' },
      { slug: 'carris-metropolitana', pt: 'Autocarros metropolitanos que entram em Lisboa, com tempo real', en: 'Metropolitan buses into Lisbon, with real time', de: 'Regionalbusse nach Lissabon, mit Echtzeit', fr: 'Bus métropolitains vers Lisbonne, avec temps réel' },
      { slug: 'cp', pt: 'Comboios urbanos para Sintra, Cascais e Azambuja', en: 'Suburban trains to Sintra, Cascais and Azambuja', de: 'S-Bahn-Züge nach Sintra, Cascais und Azambuja', fr: 'Trains urbains vers Sintra, Cascais et Azambuja' },
    ],
  },
  {
    slug: 'carris-metropolitana', chave: 'carris-metropolitana', nome: 'Carris Metropolitana', de: 'da Carris Metropolitana',
    quem: { pt: 'A Carris Metropolitana faz os autocarros da Área Metropolitana de Lisboa, fora da cidade de Lisboa.', en: 'Carris Metropolitana runs the buses of the Lisbon metropolitan area, outside the city of Lisbon.', de: 'Carris Metropolitana betreibt die Busse der Metropolregion Lissabon außerhalb der Stadt Lissabon.', fr: 'La Carris Metropolitana exploite les bus de la zone métropolitaine de Lisbonne, en dehors de la ville de Lisbonne.' },
    alternativas: [
      { slug: 'metro-de-lisboa', pt: 'Metro, com tempo real', en: 'Metro, with real time', de: 'U-Bahn, mit Echtzeit', fr: 'Métro, avec temps réel' },
      { slug: 'cp', pt: 'Comboios urbanos para Sintra, Cascais e Azambuja', en: 'Suburban trains to Sintra, Cascais and Azambuja', de: 'S-Bahn-Züge nach Sintra, Cascais und Azambuja', fr: 'Trains urbains vers Sintra, Cascais et Azambuja' },
      { slug: 'fertagus', pt: 'Comboio entre Lisboa e a margem sul', en: 'Train between Lisbon and the south bank', de: 'Zug zwischen Lissabon und dem Südufer', fr: 'Train entre Lisbonne et la rive sud' },
      { slug: 'transtejo-soflusa', pt: 'Barcos entre Lisboa e a margem sul', en: 'Boats between Lisbon and the south bank', de: 'Fähren zwischen Lissabon und dem Südufer', fr: 'Bateaux entre Lisbonne et la rive sud' },
    ],
  },
  {
    slug: 'cp', chave: 'cp', nome: 'CP', de: 'da CP (comboios)',
    quem: { pt: 'A CP – Comboios de Portugal faz os comboios urbanos, regionais, intercidades e alfa pendular.', en: 'CP – Comboios de Portugal runs suburban, regional, intercity and Alfa Pendular trains.', de: 'CP – Comboios de Portugal betreibt S-Bahn-, Regional-, Intercity- und Alfa-Pendular-Züge.', fr: 'CP – Comboios de Portugal exploite les trains urbains, régionaux, intercités et Alfa Pendular.' },
    alternativas: [
      { slug: 'metro-de-lisboa', pt: 'Em Lisboa: metro, com tempo real', en: 'In Lisbon: metro, with real time', de: 'In Lissabon: U-Bahn, mit Echtzeit', fr: 'À Lisbonne : métro, avec temps réel' },
      { slug: 'carris-metropolitana', pt: 'Na área de Lisboa: autocarros, com tempo real', en: 'Around Lisbon: buses, with real time', de: 'Im Raum Lissabon: Busse, mit Echtzeit', fr: 'Dans la région de Lisbonne : bus, avec temps réel' },
      { slug: 'fertagus', pt: 'Entre Lisboa e a margem sul: comboio Fertagus', en: 'Between Lisbon and the south bank: Fertagus train', de: 'Zwischen Lissabon und dem Südufer: Fertagus-Zug', fr: 'Entre Lisbonne et la rive sud : train Fertagus' },
      { slug: 'stcp', pt: 'No Porto: autocarros, com tempo real', en: 'In Porto: buses, with real time', de: 'In Porto: Busse, mit Echtzeit', fr: 'À Porto : bus, avec temps réel' },
    ],
  },
  {
    slug: 'stcp', chave: 'stcp', nome: 'STCP', de: 'da STCP',
    quem: { pt: 'A STCP faz os autocarros do Porto e de concelhos vizinhos.', en: 'STCP runs the buses of Porto and neighbouring municipalities.', de: 'STCP betreibt die Busse in Porto und den Nachbargemeinden.', fr: 'La STCP exploite les bus de Porto et des communes voisines.' },
    alternativas: [
      { slug: 'metro-do-porto', pt: 'Metro do Porto', en: 'Porto metro', de: 'U-Bahn Porto', fr: 'Métro de Porto' },
      { slug: 'unir', pt: 'Autocarros da Área Metropolitana do Porto', en: 'Buses across the Porto metropolitan area', de: 'Busse der Metropolregion Porto', fr: 'Bus de la zone métropolitaine de Porto' },
      { slug: 'cp', pt: 'Comboios urbanos do Porto', en: 'Porto suburban trains', de: 'S-Bahn-Züge in Porto', fr: 'Trains urbains de Porto' },
    ],
  },
  {
    slug: 'fertagus', chave: 'fertagus', nome: 'Fertagus', de: 'da Fertagus',
    quem: { pt: 'A Fertagus liga Setúbal e Coina a Lisboa (Roma-Areeiro) pela Ponte 25 de Abril.', en: 'Fertagus links Setúbal and Coina to Lisbon (Roma-Areeiro) over the 25 de Abril Bridge.', de: 'Fertagus verbindet Setúbal und Coina über die Brücke 25 de Abril mit Lissabon (Roma-Areeiro).', fr: 'Fertagus relie Setúbal et Coina à Lisbonne (Roma-Areeiro) par le pont du 25 Avril.' },
    alternativas: [
      { slug: 'carris-metropolitana', pt: 'Autocarros entre a margem sul e Lisboa, com tempo real', en: 'Buses between the south bank and Lisbon, with real time', de: 'Busse zwischen dem Südufer und Lissabon, mit Echtzeit', fr: 'Bus entre la rive sud et Lisbonne, avec temps réel' },
      { slug: 'transtejo-soflusa', pt: 'Barcos entre a margem sul e Lisboa', en: 'Boats between the south bank and Lisbon', de: 'Fähren zwischen dem Südufer und Lissabon', fr: 'Bateaux entre la rive sud et Lisbonne' },
      { slug: 'metro-sul-do-tejo', pt: 'Metro Sul do Tejo (Almada e Seixal)', en: 'Metro Sul do Tejo (Almada and Seixal)', de: 'Metro Sul do Tejo (Almada und Seixal)', fr: 'Metro Sul do Tejo (Almada et Seixal)' },
      { slug: 'metro-de-lisboa', pt: 'Metro de Lisboa, com tempo real', en: 'Lisbon metro, with real time', de: 'U-Bahn Lissabon, mit Echtzeit', fr: 'Métro de Lisbonne, avec temps réel' },
    ],
  },
  {
    slug: 'transtejo-soflusa', chave: 'transtejo', nome: 'Transtejo/Soflusa', de: 'da Transtejo/Soflusa',
    quem: { pt: 'A Transtejo/Soflusa faz os barcos entre Lisboa e a margem sul do Tejo (Cacilhas, Seixal, Montijo e Barreiro).', en: 'Transtejo/Soflusa runs the boats between Lisbon and the south bank of the Tagus (Cacilhas, Seixal, Montijo and Barreiro).', de: 'Transtejo/Soflusa betreibt die Fähren zwischen Lissabon und dem Südufer des Tejo (Cacilhas, Seixal, Montijo und Barreiro).', fr: 'Transtejo/Soflusa exploite les bateaux entre Lisbonne et la rive sud du Tage (Cacilhas, Seixal, Montijo et Barreiro).' },
    alternativas: [
      { slug: 'fertagus', pt: 'Comboio entre Lisboa e a margem sul', en: 'Train between Lisbon and the south bank', de: 'Zug zwischen Lissabon und dem Südufer', fr: 'Train entre Lisbonne et la rive sud' },
      { slug: 'carris-metropolitana', pt: 'Autocarros entre a margem sul e Lisboa, com tempo real', en: 'Buses between the south bank and Lisbon, with real time', de: 'Busse zwischen dem Südufer und Lissabon, mit Echtzeit', fr: 'Bus entre la rive sud et Lisbonne, avec temps réel' },
      { slug: 'metro-sul-do-tejo', pt: 'Metro Sul do Tejo (Almada e Seixal)', en: 'Metro Sul do Tejo (Almada and Seixal)', de: 'Metro Sul do Tejo (Almada und Seixal)', fr: 'Metro Sul do Tejo (Almada et Seixal)' },
    ],
  },
  {
    slug: 'metro-sul-do-tejo', chave: 'mts', nome: 'Metro Sul do Tejo', de: 'do Metro Sul do Tejo',
    quem: { pt: 'O Metro Sul do Tejo é o metro de superfície de Almada e do Seixal.', en: 'Metro Sul do Tejo is the light rail of Almada and Seixal.', de: 'Metro Sul do Tejo ist die Stadtbahn von Almada und Seixal.', fr: 'Le Metro Sul do Tejo est le tramway de Almada et du Seixal.' },
    alternativas: [
      { slug: 'carris-metropolitana', pt: 'Autocarros em Almada e no Seixal, com tempo real', en: 'Buses in Almada and Seixal, with real time', de: 'Busse in Almada und Seixal, mit Echtzeit', fr: 'Bus à Almada et au Seixal, avec temps réel' },
      { slug: 'transtejo-soflusa', pt: 'Barcos para Lisboa', en: 'Boats to Lisbon', de: 'Fähren nach Lissabon', fr: 'Bateaux vers Lisbonne' },
      { slug: 'fertagus', pt: 'Comboio entre a margem sul e Lisboa', en: 'Train between the south bank and Lisbon', de: 'Zug zwischen dem Südufer und Lissabon', fr: 'Train entre la rive sud et Lisbonne' },
    ],
  },
  {
    slug: 'unir', chave: 'unir', nome: 'UNIR', de: 'da UNIR',
    quem: { pt: 'A UNIR faz os autocarros da Área Metropolitana do Porto.', en: 'UNIR runs the buses of the Porto metropolitan area.', de: 'UNIR betreibt die Busse der Metropolregion Porto.', fr: 'UNIR exploite les bus de la zone métropolitaine de Porto.' },
    alternativas: [
      { slug: 'metro-do-porto', pt: 'Metro do Porto', en: 'Porto metro', de: 'U-Bahn Porto', fr: 'Métro de Porto' },
      { slug: 'stcp', pt: 'Autocarros do Porto, com tempo real', en: 'Porto buses, with real time', de: 'Busse in Porto, mit Echtzeit', fr: 'Bus de Porto, avec temps réel' },
      { slug: 'cp', pt: 'Comboios urbanos do Porto', en: 'Porto suburban trains', de: 'S-Bahn-Züge in Porto', fr: 'Trains urbains de Porto' },
    ],
  },
];
export const ENDERECOS_GREVES = OPERADORES_GREVE.map((o) => `/greves/${o.slug}`);
/** Outras formas de escrever o endereço (redirecionam para a página certa) */
const ALIAS_GREVES: Record<string, string> = {
  comboios: 'cp', 'greve-cp': 'cp', 'comboios-de-portugal': 'cp',
  'metro-lisboa': 'metro-de-lisboa', 'metropolitano-de-lisboa': 'metro-de-lisboa',
  'metro-porto': 'metro-do-porto',
  transtejo: 'transtejo-soflusa', soflusa: 'transtejo-soflusa', ttsl: 'transtejo-soflusa',
  mts: 'metro-sul-do-tejo',
};

// As greves vêm de feeds e de avisos de operadores: um pedido de cada vez serve todas as páginas durante 2 minutos
let grevesMemo: { t: number; v: ReturnType<typeof obterGreves> } | null = null;
function grevesPartilhadas() {
  if (!grevesMemo || Date.now() - grevesMemo.t > 120_000) {
    const m = { t: Date.now(), v: obterGreves() };
    m.v.then((r) => { if (!r.completo) m.t = Date.now() - 100_000; }).catch(() => { if (grevesMemo === m) grevesMemo = null; });
    grevesMemo = m;
  }
  return grevesMemo.v;
}

type EstadoGreve = 'ativa' | 'anunciada' | 'noticias' | 'nenhuma' | 'incerta';
function grevesDoOperador(greves: GreveResumo[], chave: string, completo = true) {
  const minhas = greves.filter((g) => g.geral || g.chaves.includes(chave));
  const oficiais = minhas.filter((g) => g.origem === 'operador');
  const ativas = oficiais.filter((g) => g.aDecorrer);
  const futuras = oficiais.filter((g) => !g.aDecorrer).sort((a, b) => String(a.inicio || '').localeCompare(String(b.inicio || '')));
  const noticias = minhas.filter((g) => g.origem === 'noticia');
  const estado: EstadoGreve = ativas.length ? 'ativa' : futuras.length ? 'anunciada' : noticias.length ? 'noticias' : completo ? 'nenhuma' : 'incerta';
  return { ativas, futuras, noticias, estado };
}

const PILULA_GREVE: Record<EstadoGreve, { bg: string; fg: string } & Textos> = {
  ativa: { bg: '#C62828', fg: '#FFFFFF', pt: 'Greve a decorrer', en: 'Strike under way', de: 'Streik läuft', fr: 'Grève en cours' },
  anunciada: { bg: '#FF6B1A', fg: '#111111', pt: 'Greve anunciada', en: 'Strike announced', de: 'Streik angekündigt', fr: 'Grève annoncée' },
  noticias: { bg: '#FFD27A', fg: '#111111', pt: 'Notícias de greve', en: 'Strike in the news', de: 'Streik in den Nachrichten', fr: 'Grève dans l\'actualité' },
  nenhuma: { bg: '#1E7A3C', fg: '#FFFFFF', pt: 'Sem greve anunciada', en: 'No strike announced', de: 'Kein Streik angekündigt', fr: 'Aucune grève annoncée' },
  incerta: { bg: '#6B6B6B', fg: '#FFFFFF', pt: 'Sem confirmação', en: 'Not confirmed', de: 'Nicht bestätigt', fr: 'Non confirmé' },
};
const pilulaGreve = (e: EstadoGreve) => `<span class="estado" style="background:${PILULA_GREVE[e].bg};color:${PILULA_GREVE[e].fg}">${LT(PILULA_GREVE[e])}</span>`;

function cartaoGreve(g: GreveResumo): string {
  return `<div class="cartao"><b>${html(g.titulo)}</b><p class="nota" style="margin:4px 0">${[g.operador ? html(g.operador) : '', g.inicio ? `${g.aDecorrer ? L('a decorrer desde', 'ongoing since', 'läuft seit', 'en cours depuis') : L('começa', 'starts', 'beginnt', 'commence')} ${html(quando(g.inicio))}` : '', g.fim ? `${L('até', 'until', 'bis', 'jusqu\'à')} ${html(quando(g.fim))}` : ''].filter(Boolean).join(' · ')}</p>${g.resumo ? `<p style="margin:6px 0 0">${html(g.resumo)}</p>` : ''}${g.url ? `<p class="nota" style="margin:6px 0 0"><a href="${html(g.url)}" rel="nofollow noopener" target="_blank">${L('Ver no site do operador', "See on the operator's website", 'Auf der Website des Verkehrsunternehmens ansehen', 'Voir sur le site de l\'opérateur')}</a></p>` : ''}</div>`;
}
const linhaNoticiaGreve = (g: GreveResumo) => `<li><a href="${html(g.url)}" rel="nofollow noopener" target="_blank"><span class="t">${html(g.titulo)}<small>${html(g.fonte)}${g.publicada ? ` · ${html(quando(g.publicada))}` : ''}</small></span></a></li>`;

async function paginaGrevesOperador(o: OperadorGreve): Promise<string> {
  const { greves, completo } = await grevesPartilhadas();
  const agora = DateTime.now().setZone(ZONA).setLocale(LOCALE());
  const { ativas, futuras, noticias, estado } = grevesDoOperador(greves, o.chave, completo);
  const ix = obterIndice();
  // Se o índice ainda não está pronto, mostra na mesma as alternativas (as páginas de linhas respondem sozinhas)
  const existe = (slug: string) => (ix && ix.operadores.length ? ix.porSlugOperador.has(slug) : true);
  const primeira = ativas[0] || futuras[0];

  // Resposta curta e direta (texto simples: serve a página, a descrição e o FAQ)
  const resposta = (() => {
    if (estado === 'ativa') {
      return L(
        `Sim: há uma greve ${o.de} a decorrer («${primeira.titulo}»)${primeira.fim ? `, prevista até ${quando(primeira.fim)}` : ''}.`,
        `Yes: a strike is under way at ${o.nome} ("${primeira.titulo}")${primeira.fim ? `, expected until ${quando(primeira.fim)}` : ''}.`,
        `Ja: Bei ${o.nome} läuft ein Streik („${primeira.titulo}“)${primeira.fim ? `, voraussichtlich bis ${quando(primeira.fim)}` : ''}.`,
        `Oui : une grève est en cours chez ${o.nome} (« ${primeira.titulo} »)${primeira.fim ? `, prévue jusqu'à ${quando(primeira.fim)}` : ''}.`);
    }
    if (estado === 'anunciada') {
      const mais = futuras.length > 1 ? L(` Há mais ${futuras.length - 1} anunciada${futuras.length > 2 ? 's' : ''} a seguir.`, ` ${futuras.length - 1} more ${futuras.length > 2 ? 'are' : 'is'} announced after that.`, ` Danach ${futuras.length > 2 ? 'sind' : 'ist'} noch ${futuras.length - 1} ${futuras.length > 2 ? 'weitere Streiks' : 'weiterer Streik'} angekündigt.`, ` ${futuras.length - 1} autre${futuras.length > 2 ? 's sont annoncées' : ' est annoncée'} ensuite.`) : '';
      return L(
        `Há uma greve ${o.de} anunciada para ${quando(primeira.inicio)} («${primeira.titulo}»).${mais}`,
        `A strike at ${o.nome} is announced for ${quando(primeira.inicio)} ("${primeira.titulo}").${mais}`,
        `Für ${quando(primeira.inicio)} ist ein Streik bei ${o.nome} angekündigt („${primeira.titulo}“).${mais}`,
        `Une grève chez ${o.nome} est annoncée pour ${quando(primeira.inicio)} (« ${primeira.titulo} »).${mais}`);
    }
    if (estado === 'noticias') {
      return L(
        `Ainda não encontrámos um aviso do operador, mas as notícias das últimas 72 horas falam de greve ${o.de}. Confirma no site do operador antes de sair.`,
        `We have not found a notice from the operator yet, but news from the last 72 hours mentions a strike at ${o.nome}. Check the operator's website before you leave.`,
        `Wir haben noch keine Meldung des Verkehrsunternehmens gefunden, aber die Nachrichten der letzten 72 Stunden sprechen von einem Streik bei ${o.nome}. Prüfe die Website des Verkehrsunternehmens, bevor du losgehst.`,
        `Nous n'avons pas encore trouvé d'avis de l'opérateur, mais l'actualité des dernières 72 heures évoque une grève chez ${o.nome}. Vérifiez sur le site de l'opérateur avant de partir.`);
    }
    if (estado === 'incerta') {
      return L(
        `Não foi possível confirmar agora se há greve ${o.de}: a fonte dos avisos dos operadores não respondeu. Consulta o site do operador antes de sair.`,
        `We could not confirm right now whether there is a strike at ${o.nome}: the source of the operator notices did not respond. Check the operator's website before you leave.`,
        `Wir konnten gerade nicht bestätigen, ob es bei ${o.nome} einen Streik gibt: Die Quelle der Meldungen der Verkehrsunternehmen hat nicht geantwortet. Prüfe die Website des Verkehrsunternehmens, bevor du losgehst.`,
        `Impossible de confirmer pour le moment s'il y a une grève chez ${o.nome} : la source des avis des opérateurs n'a pas répondu. Consultez le site de l'opérateur avant de partir.`);
    }
    return L(
      `Neste momento não há greve ${o.de} anunciada pelo operador nem nas notícias dos últimos dias.`,
      `Right now there is no strike at ${o.nome} announced by the operator or in the news over the last few days.`,
      `Derzeit ist bei ${o.nome} weder vom Verkehrsunternehmen noch in den Nachrichten der letzten Tage ein Streik angekündigt.`,
      `Pour le moment, aucune grève chez ${o.nome} n'est annoncée par l'opérateur ni dans l'actualité des derniers jours.`);
  })();

  const alt = o.alternativas.filter((a) => existe(a.slug));
  const nomeAlt = (slug: string) => OPERADORES_GREVE.find((x) => x.slug === slug)?.nome || ix?.porSlugOperador.get(slug)?.nome || slug;
  const estadoDe = (slug: string): EstadoGreve => {
    const x = OPERADORES_GREVE.find((y) => y.slug === slug);
    return x ? grevesDoOperador(greves, x.chave, completo).estado : 'nenhuma';
  };

  const perguntas = [
    { p: L(`Há greve ${o.de} hoje?`, `Is there a strike at ${o.nome} today?`, `Gibt es heute einen Streik bei ${o.nome}?`, `Y a-t-il une grève chez ${o.nome} aujourd'hui ?`), r: resposta },
    {
      p: L(`Quando é a próxima greve ${o.de}?`, `When is the next strike at ${o.nome}?`, `Wann ist der nächste Streik bei ${o.nome}?`, `Quand a lieu la prochaine grève chez ${o.nome} ?`),
      r: futuras.length
        ? L(`A próxima greve anunciada ${o.de} é ${quando(futuras[0].inicio)}. Esta página atualiza-se sozinha quando há novas datas.`, `The next announced strike at ${o.nome} is ${quando(futuras[0].inicio)}. This page updates itself when new dates are announced.`, `Der nächste angekündigte Streik bei ${o.nome} ist ${quando(futuras[0].inicio)}. Diese Seite aktualisiert sich von selbst, wenn neue Termine angekündigt werden.`, `La prochaine grève annoncée chez ${o.nome} aura lieu ${quando(futuras[0].inicio)}. Cette page se met à jour toute seule quand de nouvelles dates sont annoncées.`)
        : ativas.length
          ? L('Há uma greve a decorrer e ainda não foi anunciada outra. Esta página atualiza-se sozinha quando houver novas datas.', 'A strike is under way and no other has been announced yet. This page updates itself when new dates appear.', 'Ein Streik läuft gerade, und es wurde noch kein weiterer angekündigt. Diese Seite aktualisiert sich von selbst, sobald neue Termine auftauchen.', 'Une grève est en cours et aucune autre n\'a encore été annoncée. Cette page se met à jour toute seule dès que de nouvelles dates apparaissent.')
          : estado === 'incerta'
            ? L('Não foi possível confirmar agora as datas das greves. Consulta o site do operador; esta página tenta outra vez dentro de instantes.', 'The strike dates could not be confirmed right now. Check the operator\'s website; this page will try again shortly.', 'Die Streiktermine konnten gerade nicht bestätigt werden. Prüfe die Website des Verkehrsunternehmens; diese Seite versucht es in Kürze erneut.', 'Impossible de confirmer les dates des grèves pour le moment. Consultez le site de l\'opérateur ; cette page réessaiera dans un instant.')
            : L('Neste momento não há nenhuma data anunciada. A lei exige pré-aviso (nos transportes públicos são, por regra, 10 dias úteis), por isso uma greve costuma ser conhecida com antecedência. Esta página atualiza-se sozinha.', 'No date has been announced right now. The law requires advance notice (for public transport it is, as a rule, 10 working days), so a strike is usually known well ahead. This page updates itself.', 'Derzeit ist kein Termin angekündigt. Das Gesetz verlangt eine Vorankündigung (im öffentlichen Nahverkehr in der Regel 10 Werktage), deshalb ist ein Streik meist lange im Voraus bekannt. Diese Seite aktualisiert sich von selbst.', 'Aucune date n\'est annoncée pour le moment. La loi exige un préavis (dans les transports publics, en règle générale 10 jours ouvrables) : une grève est donc généralement connue à l\'avance. Cette page se met à jour toute seule.'),
    },
    {
      p: L(`Há serviços mínimos na greve ${o.de}?`, `Are there minimum services in a strike at ${o.nome}?`, `Gibt es bei einem Streik bei ${o.nome} einen Mindestbetrieb?`, `Y a-t-il des services minimaux lors d'une grève chez ${o.nome} ?`),
      r: L(
        'Nos transportes públicos de passageiros a lei prevê serviços mínimos, definidos por acordo ou, na falta dele, por um tribunal arbitral. O operador costuma publicar o horário dos serviços mínimos no seu site nos dias antes da greve. Quando o aviso do operador inclui esse resumo, aparece nesta página.',
        'For public passenger transport the law provides for minimum services, set by agreement or, failing that, by an arbitration court. The operator usually publishes the minimum-service timetable on its website in the days before the strike. When the operator notice includes that summary, it appears on this page.',
        'Im öffentlichen Personenverkehr sieht das Gesetz einen Mindestbetrieb vor, der per Vereinbarung oder, falls es keine gibt, durch ein Schiedsgericht festgelegt wird. Das Verkehrsunternehmen veröffentlicht den Fahrplan des Mindestbetriebs meist in den Tagen vor dem Streik auf seiner Website. Enthält die Meldung des Verkehrsunternehmens diese Zusammenfassung, erscheint sie auf dieser Seite.',
        'Dans les transports publics de voyageurs, la loi prévoit des services minimaux, fixés par accord ou, à défaut, par un tribunal arbitral. L\'opérateur publie généralement l\'horaire des services minimaux sur son site dans les jours précédant la grève. Quand l\'avis de l\'opérateur comprend ce résumé, il apparaît sur cette page.'),
    },
    {
      p: L(`O que fazer em dia de greve ${o.de}?`, `What to do on a strike day at ${o.nome}?`, `Was tun am Streiktag bei ${o.nome}?`, `Que faire un jour de grève chez ${o.nome} ?`),
      r: L(
        `Sai com mais tempo e confirma na PAROU o que está mesmo a circular: nos operadores com tempo real (Carris Metropolitana, STCP e Metro de Lisboa) vês os veículos que estão a andar, nos outros vês o horário oficial.${alt.length ? ` Alternativas: ${alt.map((a) => nomeAlt(a.slug)).join(', ')}. Confirma se também não têm greve.` : ''}`,
        `Leave with extra time and check on PAROU what is really running: for operators with real time (Carris Metropolitana, STCP and Metro de Lisboa) you see the vehicles that are moving, for the others you see the official timetable.${alt.length ? ` Alternatives: ${alt.map((a) => nomeAlt(a.slug)).join(', ')}. Check they are not on strike too.` : ''}`,
        `Plane mehr Zeit ein und prüfe bei PAROU, was wirklich fährt: Bei Verkehrsunternehmen mit Echtzeitdaten (Carris Metropolitana, STCP und Metro de Lisboa) siehst du die Fahrzeuge, die unterwegs sind, bei den anderen den offiziellen Fahrplan.${alt.length ? ` Alternativen: ${alt.map((a) => nomeAlt(a.slug)).join(', ')}. Prüfe, ob dort nicht ebenfalls gestreikt wird.` : ''}`,
        `Partez avec de la marge et vérifiez sur PAROU ce qui circule vraiment : chez les opérateurs avec temps réel (Carris Metropolitana, STCP et Metro de Lisboa), vous voyez les véhicules en circulation, chez les autres l'horaire officiel.${alt.length ? ` Alternatives : ${alt.map((a) => nomeAlt(a.slug)).join(', ')}. Vérifiez qu'ils ne sont pas eux aussi en grève.` : ''}`),
    },
    {
      p: L(`Como recebo os avisos de greve ${o.de}?`, `How do I get strike alerts for ${o.nome}?`, `Wie erhalte ich Streikmeldungen für ${o.nome}?`, `Comment recevoir les alertes de grève de ${o.nome} ?`),
      r: L(
        'Abre os Alertas da PAROU e liga os avisos: recebes as greves no telemóvel, mesmo com a app fechada. É grátis e sem anúncios.',
        'Open PAROU Alerts and turn notifications on: you get strikes on your phone, even with the app closed. It is free and ad-free.',
        'Öffne die PAROU-Warnungen und aktiviere die Benachrichtigungen: Du erhältst Streiks auf dem Handy, auch bei geschlossener App. Kostenlos und werbefrei.',
        'Ouvrez les alertes PAROU et activez les notifications : vous recevez les grèves sur votre téléphone, même application fermée. C\'est gratuit et sans publicité.'),
    },
  ];

  let corpo = `<h1>${L(`Greve ${html(o.de)} hoje`, `${html(o.nome)} strike today`, `Streik bei ${html(o.nome)} heute`, `Grève chez ${html(o.nome)} aujourd'hui`)}</h1>
<p>${pilulaGreve(estado)}</p>
<p class="sub">${html(resposta)} ${L('Atualizado', 'Updated', 'Aktualisiert', 'Mis à jour')} ${html(agora.toFormat(L("d 'de' LLLL 'às' HH:mm", "d LLLL 'at' HH:mm", "d. LLLL 'um' HH:mm 'Uhr'", "d LLLL 'à' HH:mm")))}.</p>
<p><a class="btn laranja" href="/">${L('Ver o que circula perto de mim', "See what's running near me", 'Sieh, was in meiner Nähe fährt', 'Voir ce qui circule près de moi')}</a> <a class="btn claro" href="/linhas/${o.slug}">${L(`Linhas e horários`, 'Lines and timetables', 'Linien und Fahrpläne', 'Lignes et horaires')}</a></p>`;
  if (emIngles()) corpo += `<p class="nota">${L('', 'Strike notices are published in Portuguese by the operators and the news outlets, so the details below are in Portuguese.', 'Streikmeldungen werden von den Verkehrsunternehmen und den Nachrichtenseiten auf Portugiesisch veröffentlicht, daher sind die Einzelheiten unten auf Portugiesisch.', 'Les avis de grève sont publiés en portugais par les opérateurs et les médias ; les détails ci-dessous sont donc en portugais.')}</p>`;

  if (ativas.length || futuras.length) {
    corpo += `<h2>${L('Greves anunciadas pelo operador', 'Strikes announced by the operator', 'Vom Verkehrsunternehmen angekündigte Streiks', 'Grèves annoncées par l\'opérateur')}</h2>${[...ativas, ...futuras].map(cartaoGreve).join('')}`;
  }
  if (noticias.length) {
    corpo += `<h2>${L('Nas notícias', 'In the news', 'In den Nachrichten', 'Dans l\'actualité')}</h2><ul class="lista">${noticias.map(linhaNoticiaGreve).join('')}</ul>`;
  }
  if (estado === 'nenhuma') {
    corpo += `<div class="cartao"><b>${L('Sem greve anunciada.', 'No strike announced.', 'Kein Streik angekündigt.', 'Aucune grève annoncée.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'Esta página atualiza-se sozinha: se for anunciada uma greve, aparece aqui com as datas.',
      'This page updates itself: if a strike is announced, it appears here with the dates.',
      'Diese Seite aktualisiert sich von selbst: Wird ein Streik angekündigt, erscheint er hier mit den Terminen.',
      'Cette page se met à jour toute seule : si une grève est annoncée, elle apparaît ici avec les dates.')}</p></div>`;
  }
  corpo += `<div class="aviso">${L(
    'Recebe as greves no telemóvel, mesmo com a app fechada: abre os <a href="/alertas"><b>Alertas da PAROU</b></a> e liga os avisos.',
    'Get strikes on your phone, even with the app closed: open <a href="/alertas"><b>PAROU Alerts</b></a> and turn notifications on.',
    'Erhalte Streikmeldungen auf dem Handy, auch bei geschlossener App: Öffne die <a href="/alertas"><b>PAROU-Warnungen</b></a> und aktiviere die Benachrichtigungen.',
    'Recevez les grèves sur votre téléphone, même application fermée : ouvrez les <a href="/alertas"><b>alertes PAROU</b></a> et activez les notifications.')}</div>`;

  if (alt.length) {
    corpo += `<h2>${L(`Alternativas em dia de greve ${html(o.de)}`, `Alternatives on a strike day at ${html(o.nome)}`, `Alternativen am Streiktag bei ${html(o.nome)}`, `Alternatives un jour de grève chez ${html(o.nome)}`)}</h2>
<p>${html(LT(o.quem))} ${L('Em dia de greve, estas são as opções:', 'On a strike day, these are your options:', 'Am Streiktag hast du diese Möglichkeiten:', 'Un jour de grève, voici vos options :')}</p>
<ul class="lista">${alt.map((a) => {
      const e = estadoDe(a.slug);
      const aviso = e === 'ativa' || e === 'anunciada' ? L('também com greve', 'also on strike', 'ebenfalls Streik', 'également en grève') : COM_TEMPO_REAL.has(a.slug) ? L('tempo real', 'real time', 'Echtzeit', 'temps réel') : L('horários', 'timetables', 'Fahrpläne', 'horaires');
      return `<li><a href="/linhas/${a.slug}"><span class="t">${html(nomeAlt(a.slug))}<small>${html(LT(a))}</small></span><span class="dir">${aviso}</span></a></li>`;
    }).join('')}</ul>
<p class="nota">${L('Antes de sair, confirma se a alternativa não tem também greve.', 'Before you leave, check the alternative is not on strike too.', 'Prüfe vor dem Losgehen, ob bei der Alternative nicht ebenfalls gestreikt wird.', 'Avant de partir, vérifiez que l\'alternative n\'est pas elle aussi en grève.')}</p>`;
  }

  if (!alt.length) corpo += `<p>${html(LT(o.quem))}</p>`;
  corpo += `<h2>${L('Perguntas frequentes', 'Frequently asked questions', 'Häufige Fragen', 'Questions fréquentes')}</h2>${perguntas.map((q) => `<h3>${html(q.p)}</h3><p>${html(q.r)}</p>`).join('')}`;

  corpo += `<h2>${L('Greves noutros operadores', 'Strikes at other operators', 'Streiks bei anderen Verkehrsunternehmen', 'Grèves chez d\'autres opérateurs')}</h2><div class="grelha ops">${OPERADORES_GREVE.filter((x) => x.slug !== o.slug).map((x) => {
    const e = grevesDoOperador(greves, x.chave, completo).estado;
    return `<a href="/greves/${x.slug}"><b>${html(x.nome).replace('/', '/<wbr>')}</b><small>${LT(PILULA_GREVE[e])}</small></a>`;
  }).join('')}</div><p><a href="/greves">${L('Ver todas as greves', 'See all strikes', 'Alle Streiks ansehen', 'Voir toutes les grèves')}</a></p>
<p class="nota">${L(
    'Fonte: avisos publicados pelos operadores e notícias dos últimos dias. A PAROU é gratuita, sem anúncios e sem fins lucrativos; confirma sempre no site do operador.',
    'Source: notices published by the operators and news from the last few days. PAROU is free, ad-free and non-profit; always check with the operator.',
    'Quelle: Meldungen der Verkehrsunternehmen und Nachrichten der letzten Tage. PAROU ist kostenlos, werbefrei und gemeinnützig; prüfe immer beim Verkehrsunternehmen nach.',
    'Source : avis publiés par les opérateurs et actualité des derniers jours. PAROU est gratuite, sans publicité et à but non lucratif ; vérifiez toujours auprès de l\'opérateur.')}</p>`;

  const titulo = estado === 'ativa'
    ? L(`Greve ${o.de} hoje: a decorrer | PAROU`, `${o.nome} strike today: under way | PAROU`, `Streik bei ${o.nome} heute: läuft | PAROU`, `Grève chez ${o.nome} aujourd'hui : en cours | PAROU`)
    : estado === 'anunciada'
      ? L(`Greve ${o.de} anunciada: datas e alternativas | PAROU`, `${o.nome} strike announced: dates and alternatives | PAROU`, `Streik bei ${o.nome} angekündigt: Termine und Alternativen | PAROU`, `Grève chez ${o.nome} annoncée : dates et alternatives | PAROU`)
      : L(`Greve ${o.de}: há greve hoje? | PAROU`, `${o.nome} strike: is there a strike today? | PAROU`, `Streik bei ${o.nome}: Gibt es heute einen Streik? | PAROU`, `Grève chez ${o.nome} : y a-t-il une grève aujourd'hui ? | PAROU`);
  const curta = estado === 'ativa'
    ? L(`Sim: há greve ${o.de} a decorrer.`, `Yes: a strike is under way at ${o.nome}.`, `Ja: Bei ${o.nome} läuft ein Streik.`, `Oui : une grève est en cours chez ${o.nome}.`)
    : estado === 'anunciada'
      ? L(`Há greve ${o.de} anunciada para ${quando(primeira.inicio)}.`, `A strike at ${o.nome} is announced for ${quando(primeira.inicio)}.`, `Für ${quando(primeira.inicio)} ist bei ${o.nome} ein Streik angekündigt.`, `Une grève chez ${o.nome} est annoncée pour ${quando(primeira.inicio)}.`)
      : estado === 'noticias'
        ? L(`Há notícias de greve ${o.de}, ainda sem aviso do operador.`, `There is news of a strike at ${o.nome}, with no operator notice yet.`, `Es gibt Nachrichten über einen Streik bei ${o.nome}, aber noch keine Meldung des Verkehrsunternehmens.`, `Des articles évoquent une grève chez ${o.nome}, sans avis de l'opérateur pour l'instant.`)
        : estado === 'incerta'
          ? L(`Não foi possível confirmar agora se há greve ${o.de}.`, `We could not confirm right now whether there is a strike at ${o.nome}.`, `Wir konnten gerade nicht bestätigen, ob es bei ${o.nome} einen Streik gibt.`, `Impossible de confirmer pour le moment s'il y a une grève chez ${o.nome}.`)
          : L(`Neste momento não há greve ${o.de} anunciada.`, `Right now there is no strike announced at ${o.nome}.`, `Derzeit ist bei ${o.nome} kein Streik angekündigt.`, `Aucune grève n'est annoncée chez ${o.nome} pour le moment.`);
  const descricao = L(
    `${curta} Datas, serviços mínimos, notícias e alternativas em dia de greve, sempre atualizado.`,
    `${curta} Dates, minimum services, news and alternatives for a strike day, always up to date.`,
    `${curta} Termine, Mindestbetrieb, Nachrichten und Alternativen für den Streiktag, immer aktuell.`,
    `${curta} Dates, services minimaux, actualité et alternatives un jour de grève, toujours à jour.`);
  return pagina({
    titulo,
    descricao: cortar(descricao, 220),
    caminho: `/greves/${o.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Greves', 'Strikes', 'Streiks', 'Grèves'), url: '/greves' }, { nome: o.nome, url: `/greves/${o.slug}` }],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: perguntas.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
    }],
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
/** "em Lisboa" no idioma do pedido (nas versões não portuguesas o texto não pode trazer a preposição portuguesa) */
function ondeDistrito(d: Distrito): string {
  const nome = rotuloDistrito(d);
  if (lang() === 'fr') return d.slug === 'madeira' ? `à ${nome}` : d.slug === 'acores' ? `aux ${nome}` : `dans le district de ${nome}`;
  if (lang() === 'de') return d.slug === 'madeira' ? `auf ${nome}` : d.slug === 'acores' ? `auf den ${nome}` : `im Distrikt ${nome}`;
  return `in ${nome}`;
}

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
  if (min < 2) return L('agora mesmo', 'just now', 'gerade eben', 'à l\'instant');
  if (min < 60) return L(`há ${min} min`, `${min} min ago`, `vor ${min} Min.`, `il y a ${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return L(`há ${h} h${m ? ` ${m} min` : ''}`, `${h} h${m ? ` ${m} min` : ''} ago`, `vor ${h} Std.${m ? ` ${m} Min.` : ''}`, `il y a ${h} h${m ? ` ${m} min` : ''}`);
  const d = Math.floor(h / 24);
  return L(`há ${d} ${d === 1 ? 'dia' : 'dias'}`, `${d} ${d === 1 ? 'day' : 'days'} ago`, `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`, `il y a ${d} ${d === 1 ? 'jour' : 'jours'}`);
}

function meiosTexto(m: IncidenteProtecaoCivil['meios']): string {
  const p: string[] = [];
  if (m.humanos > 0) p.push(L(`${num(m.humanos)} ${m.humanos === 1 ? 'operacional' : 'operacionais'}`, `${num(m.humanos)} personnel`, `${num(m.humanos)} Einsatzkräfte`, `${num(m.humanos)} ${m.humanos === 1 ? 'intervenant' : 'intervenants'}`));
  if (m.terrestres > 0) p.push(L(`${num(m.terrestres)} ${m.terrestres === 1 ? 'meio terrestre' : 'meios terrestres'}`, `${num(m.terrestres)} ground ${m.terrestres === 1 ? 'vehicle' : 'vehicles'}`, `${num(m.terrestres)} ${m.terrestres === 1 ? 'Einsatzfahrzeug' : 'Einsatzfahrzeuge'}`, `${num(m.terrestres)} ${m.terrestres === 1 ? 'moyen terrestre' : 'moyens terrestres'}`));
  if (m.aereos > 0) p.push(L(`${num(m.aereos)} ${m.aereos === 1 ? 'meio aéreo' : 'meios aéreos'}`, `${num(m.aereos)} aerial ${m.aereos === 1 ? 'unit' : 'units'}`, `${num(m.aereos)} ${m.aereos === 1 ? 'Luftfahrzeug' : 'Luftfahrzeuge'}`, `${num(m.aereos)} ${m.aereos === 1 ? 'moyen aérien' : 'moyens aériens'}`));
  return p.join(' · ');
}

function estadoTexto(i: IncidenteProtecaoCivil): string {
  const e = i.estado.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (i.aAcalmar || /resolucao/.test(e)) return L('Em resolução', 'Being resolved', 'In Abschluss', 'En cours de résolution');
  if (/curso/.test(e)) return L('Em curso', 'Ongoing', 'Laufend', 'En cours');
  return i.estado;
}

function linhaIncendio(i: IncidenteProtecaoCivil, comDistrito: boolean): string {
  const cor = /^[0-9a-f]{6}$/i.test(i.corEstado) ? i.corEstado : 'FF6B1A';
  const onde = [i.local, i.concelho && i.concelho !== i.local ? i.concelho : ''].filter(Boolean).join(', ');
  const sitio = [onde, comDistrito ? i.distrito : ''].filter(Boolean).join(' · ');
  const meta = [haQuanto(i.inicio), meiosTexto(i.meios)].filter(Boolean).join(' · ');
  return `<li class="fogo"><div class="l1"><b>${html(i.natureza)}</b><span class="estado" style="background:${chipLegivel('#' + cor).fundo};color:${chipLegivel('#' + cor).texto}">${html(estadoTexto(i))}</span></div>${sitio ? `<div class="onde">${html(sitio)}</div>` : ''}${meta ? `<div class="meta">${html(meta)}</div>` : ''}</li>`;
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
  const onde = d ? (emIngles() ? ondeDistrito(d) : `${d.em}${d.alias ? ` (${d.alias})` : ''}`) : L('em Portugal', 'in Portugal', 'in Portugal', 'au Portugal');
  const frequencia = temChave ? L('de 2 em 2 minutos', 'every 2 minutes', 'alle 2 Minuten', 'toutes les 2 minutes') : L('cerca de uma vez por hora', 'about once an hour', 'etwa einmal pro Stunde', 'environ une fois par heure');
  const atual = atualizado ? quando(atualizado) : '';
  const rotuloAtivos = (k: number) => (k === 1 ? L('incêndio ativo', 'active fire', 'aktiver Brand', 'incendie actif') : L('incêndios ativos', 'active fires', 'aktive Brände', 'incendies actifs'));

  const perguntas: Array<{ p: string; r: string }> = [
    {
      p: L('De onde vêm os dados dos incêndios?', 'Where does the fire data come from?', 'Woher stammen die Branddaten?', 'D\'où viennent les données sur les incendies ?'),
      r: L(
        `Da Proteção Civil (ANEPC), através do Fogos.pt, o projeto do VOST Portugal que reúne as ocorrências em curso. A PAROU consulta o Fogos.pt ${frequencia} e mostra apenas os incêndios que ainda estão ativos.`,
        `From Portugal's civil protection authority (ANEPC), through Fogos.pt, the VOST Portugal project that gathers ongoing incidents. PAROU checks Fogos.pt ${frequencia} and only shows fires that are still active.`,
        `Vom Zivilschutz (ANEPC) über Fogos.pt, das Projekt von VOST Portugal, das die laufenden Einsätze sammelt. PAROU fragt Fogos.pt ${frequencia} ab und zeigt nur Brände, die noch aktiv sind.`,
        `De la Protection civile (ANEPC), via Fogos.pt, le projet du VOST Portugal qui rassemble les événements en cours. PAROU interroge Fogos.pt ${frequencia} et n'affiche que les incendies encore actifs.`),
    },
    {
      p: L('O que quer dizer «em curso» e «em resolução»?', 'What do "ongoing" and "being resolved" mean?', 'Was bedeuten „laufend“ und „in Abschluss“?', 'Que signifient « en cours » et « en cours de résolution » ?'),
      r: L(
        '«Em curso» é um incêndio que ainda está a ser combatido. «Em resolução» quer dizer que a situação está a acalmar, mas as equipas continuam no terreno a rematar o trabalho. Os incêndios concluídos ou só em vigilância saem da lista.',
        '"Ongoing" is a fire that is still being fought. "Being resolved" means the situation is calming down but crews are still on site finishing the work. Fires that are concluded or only under watch leave the list.',
        '„Laufend“ ist ein Brand, der noch bekämpft wird. „In Abschluss“ bedeutet, dass sich die Lage beruhigt, die Einsatzkräfte aber noch vor Ort die Arbeiten abschließen. Beendete oder nur noch überwachte Brände verschwinden aus der Liste.',
        '« En cours » désigne un incendie encore en train d\'être combattu. « En cours de résolution » signifie que la situation s\'apaise, mais que les équipes restent sur le terrain pour terminer le travail. Les incendies terminés ou seulement sous surveillance disparaissent de la liste.'),
    },
    {
      p: L('Que número devo ligar se vir um incêndio?', 'Which number should I call if I see a fire?', 'Welche Nummer soll ich anrufen, wenn ich einen Brand sehe?', 'Quel numéro appeler si je vois un incendie ?'),
      r: L(
        'Liga 112 e indica o local o mais exato possível. Afasta-te do fogo e do fumo e não tentes apagar incêndios florestais por tua conta.',
        'Call 112 and give the location as precisely as you can. Move away from the fire and the smoke and do not try to put out wildfires yourself.',
        'Ruf die 112 an und nenne den Ort so genau wie möglich. Entferne dich von Feuer und Rauch und versuche nicht, Waldbrände selbst zu löschen.',
        'Appelez le 112 et indiquez le lieu le plus précisément possible. Éloignez-vous du feu et de la fumée et n\'essayez pas d\'éteindre seul un feu de forêt.'),
    },
    {
      p: L('Como vejo os incêndios perto de mim?', 'How do I see fires near me?', 'Wie sehe ich Brände in meiner Nähe?', 'Comment voir les incendies près de moi ?'),
      r: L(
        'Abre o mapa da PAROU: mostra os incêndios ativos em Portugal e as perturbações nos transportes à tua volta.',
        'Open the PAROU map: it shows the active fires in Portugal and the transport disruptions around you.',
        'Öffne die PAROU-Karte: Sie zeigt die aktiven Brände in Portugal und die Störungen im Verkehr in deiner Umgebung.',
        'Ouvrez la carte PAROU : elle affiche les incendies actifs au Portugal et les perturbations des transports autour de vous.'),
    },
  ];

  let corpo = `<h1>${d ? L(`Incêndios ativos ${html(d.em)}${d.alias ? ` (${html(d.alias)})` : ''} hoje`, `Active fires in ${html(rotuloDistrito(d))} today`, `Aktive Brände in ${html(rotuloDistrito(d))} heute`, `Incendies actifs aujourd'hui : ${html(rotuloDistrito(d))}`) : L('Incêndios ativos hoje em Portugal', 'Active fires in Portugal today', 'Aktive Brände heute in Portugal', 'Incendies actifs aujourd\'hui au Portugal')}</h1>`;
  if (!fresco) {
    corpo += `<p class="sub">${L('Não foi possível obter os dados da Proteção Civil neste momento.', 'The civil protection data could not be retrieved right now.', 'Die Daten des Zivilschutzes konnten gerade nicht abgerufen werden.', 'Les données de la Protection civile n\'ont pas pu être récupérées pour le moment.')}</p>`;
  } else if (n === 0) {
    corpo += `<p class="sub">${L(`Neste momento não há incêndios ativos registados ${html(onde)}.`, `Right now there are no active fires recorded ${html(onde)}.`, `Derzeit sind ${html(onde)} keine aktiven Brände registriert.`, `Aucun incendie actif n'est enregistré ${html(onde)} pour le moment.`)} ${L('Atualizado', 'Updated', 'Aktualisiert', 'Mis à jour')} ${html(atual)}.</p>`;
  } else {
    corpo += `<p class="sub">${L(
      `Há ${n} ${rotuloAtivos(n)} ${html(onde)} neste momento: ${emCurso} em curso e ${emResolucao} em resolução${operacionais ? `, com ${num(operacionais)} operacionais no terreno` : ''}. Atualizado ${html(atual)}.`,
      `There ${n === 1 ? 'is' : 'are'} ${n} ${rotuloAtivos(n)} ${html(onde)} right now: ${emCurso} ongoing and ${emResolucao} being resolved${operacionais ? `, with ${num(operacionais)} personnel on site` : ''}. Updated ${html(atual)}.`,
      `Derzeit ${n === 1 ? 'ist' : 'sind'} ${html(onde)} ${n} ${rotuloAtivos(n)} registriert: ${emCurso} laufend und ${emResolucao} in Abschluss${operacionais ? `, mit ${num(operacionais)} Einsatzkräften vor Ort` : ''}. Stand: ${html(atual)}.`,
      `Il y a ${n} ${rotuloAtivos(n)} ${html(onde)} en ce moment : ${emCurso} en cours et ${emResolucao} en cours de résolution${operacionais ? `, avec ${num(operacionais)} intervenants sur le terrain` : ''}. Mis à jour ${html(atual)}.`)}</p>`;
  }
  corpo += `<div class="aviso"><b>${L('Emergência? Liga 112.', 'Emergency? Call 112.', 'Notfall? Ruf die 112 an.', 'Urgence ? Appelez le 112.')}</b> ${L(
    'Esta página é informativa e não substitui os avisos da Proteção Civil nem as indicações das autoridades locais.',
    'This page is informational and does not replace civil protection warnings or the instructions of local authorities.',
    'Diese Seite dient der Information und ersetzt weder die Warnungen des Zivilschutzes noch die Anweisungen der örtlichen Behörden.',
    'Cette page est informative et ne remplace ni les avis de la Protection civile ni les consignes des autorités locales.')}</div>
<p><a class="btn laranja" href="/mapa">${L('Ver no mapa', 'See on the map', 'Auf der Karte ansehen', 'Voir sur la carte')}</a> <a class="btn claro" href="/alertas">${L('Alertas', 'Alerts', 'Warnungen', 'Alertes')}</a>${d && CIDADES.some((c) => c.slug === d.slug) ? ` <a class="btn claro" href="/cidade/${d.slug}">${L(`Transportes ${html(d.em)}`, `Transport in ${html(d.nome)}`, `Verkehr in ${html(d.nome)}`, `Transports : ${html(d.nome)}`)}</a>` : ''}</p>`;
  if (emIngles()) corpo += `<p class="nota">${L('', 'Place names, fire types and statuses come from the Portuguese civil protection data and are shown in Portuguese.', 'Ortsnamen, Brandarten und Status stammen aus den Daten des portugiesischen Zivilschutzes und werden auf Portugiesisch angezeigt.', 'Les noms de lieux, les types d\'incendie et les états proviennent des données de la Protection civile portugaise et sont affichés en portugais.')}</p>`;

  if (!fresco) {
    corpo += `<div class="cartao"><b>${L('Sem dados atuais', 'No current data', 'Keine aktuellen Daten', 'Pas de données à jour')}</b><p class="nota" style="margin:6px 0 0">${L(
      'A PAROU não conseguiu atualizar a lista de incêndios, por isso não é possível dizer se há ou não incêndios ativos. Consulta o <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> e, em caso de emergência, liga 112.',
      'PAROU could not refresh the fire list, so it cannot say whether there are active fires. Check <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> and, in an emergency, call 112.',
      'PAROU konnte die Brandliste nicht aktualisieren und kann daher nicht sagen, ob es aktive Brände gibt. Schau auf <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> nach und ruf im Notfall die 112 an.',
      'PAROU n\'a pas pu actualiser la liste des incendies et ne peut donc pas dire s\'il y a des incendies actifs. Consultez <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> et, en cas d\'urgence, appelez le 112.')}</p></div>`;
  } else if (n > 0) {
    corpo += `<div class="resumo duplo"><div><b>${n}</b><span>${rotuloAtivos(n)}</span></div><div><b>${emCurso}</b><span>${L('em curso', 'ongoing', 'laufend', 'en cours')}</span></div><div><b>${emResolucao}</b><span>${L('em resolução', 'being resolved', 'in Abschluss', 'en cours de résolution')}</span></div><div><b>${num(operacionais)}</b><span>${L('operacionais no terreno', 'personnel on site', 'Einsatzkräfte vor Ort', 'intervenants sur le terrain')}</span></div></div>
<h2>${L('Incêndios ativos agora', 'Active fires now', 'Jetzt aktive Brände', 'Incendies actifs en ce moment')}</h2><ul class="lista">${fogos.slice(0, 150).map((i) => linhaIncendio(i, !d)).join('')}</ul>${n > 150 ? `<p class="nota">${L(`A mostrar 150 de ${n}. Os restantes estão nas páginas de cada distrito.`, `Showing 150 of ${n}. The rest are on each district's page.`, `150 von ${n} werden angezeigt. Die übrigen stehen auf den Seiten der einzelnen Distrikte.`, `150 sur ${n} affichés. Les autres figurent sur la page de chaque district.`)}</p>` : ''}`;
  } else {
    corpo += `<div class="cartao"><b>${L('Sem incêndios ativos registados.', 'No active fires recorded.', 'Keine aktiven Brände registriert.', 'Aucun incendie actif enregistré.')}</b><p class="nota" style="margin:6px 0 0">${L(
      'Esta página atualiza-se sozinha. Se vires fogo ou fumo, liga 112.',
      'This page updates itself. If you see fire or smoke, call 112.',
      'Diese Seite aktualisiert sich von selbst. Wenn du Feuer oder Rauch siehst, ruf die 112 an.',
      'Cette page se met à jour toute seule. Si vous voyez du feu ou de la fumée, appelez le 112.')}</p></div>`;
  }

  corpo += `<h2>${L('Incêndios por distrito', 'Fires by district', 'Brände nach Distrikt', 'Incendies par district')}</h2><div class="grelha estreita">${DISTRITOS.filter((x) => x.slug !== d?.slug).map((x) => {
    const k = porDistrito.get(x.slug) || 0;
    return `<a href="/incendios/${x.slug}"><b>${html(x.nome)}</b><small>${fresco ? (k ? `${k} ${rotuloAtivos(k)}` : L('Nenhum ativo', 'None active', 'Keiner aktiv', 'Aucun actif')) : L('Ver incêndios', 'See fires', 'Brände ansehen', 'Voir les incendies')}</small></a>`;
  }).join('')}</div>${d ? `<p><a href="/incendios">${L('Ver os incêndios de todo o país', 'See fires across the country', 'Brände im ganzen Land ansehen', 'Voir les incendies dans tout le pays')}</a></p>` : ''}
<h2>${L('Perguntas frequentes', 'Frequently asked questions', 'Häufige Fragen', 'Questions fréquentes')}</h2>${perguntas.map((q) => `<h3>${html(q.p)}</h3><p>${html(q.r)}</p>`).join('')}
<p class="nota">${L(
    'Fonte: <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), com dados da Autoridade Nacional de Emergência e Proteção Civil (ANEPC). Utilização não comercial: a PAROU é gratuita e sem fins lucrativos.',
    'Source: <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), with data from the National Emergency and Civil Protection Authority (ANEPC). Non-commercial use: PAROU is free and non-profit.',
    'Quelle: <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), mit Daten der Nationalen Behörde für Notfälle und Zivilschutz (ANEPC). Nicht kommerzielle Nutzung: PAROU ist kostenlos und gemeinnützig.',
    'Source : <a href="https://fogos.pt" rel="noopener" target="_blank">Fogos.pt</a> (VOST Portugal), avec des données de l\'Autorité nationale d\'urgence et de protection civile (ANEPC). Usage non commercial : PAROU est gratuite et à but non lucratif.')}</p>`;

  const tituloBase = d
    ? L(`Incêndios ${d.em}${d.alias ? ` (${d.alias})` : ''} hoje: ativos agora | PAROU`, `Fires in ${rotuloDistrito(d)} today: active now | PAROU`, `Brände in ${rotuloDistrito(d)} heute: jetzt aktiv | PAROU`, `Incendies actifs aujourd'hui : ${rotuloDistrito(d)} | PAROU`)
    : L('Incêndios ativos hoje em Portugal: lista por distrito | PAROU', 'Active fires in Portugal today: list by district | PAROU', 'Aktive Brände heute in Portugal: Liste nach Distrikt | PAROU', 'Incendies actifs aujourd\'hui au Portugal : liste par district | PAROU');
  let descricao: string;
  if (!fresco) {
    descricao = L(
      `Incêndios ativos ${onde}, com local, estado e meios no terreno. Dados da Proteção Civil através do Fogos.pt. Em emergência, liga 112.`,
      `Active fires ${onde}, with location, status and resources on site. Civil protection data through Fogos.pt. In an emergency, call 112.`,
      `Aktive Brände ${onde}, mit Ort, Status und Einsatzkräften vor Ort. Daten des Zivilschutzes über Fogos.pt. Im Notfall die 112 anrufen.`,
      `Incendies actifs ${onde}, avec lieu, état et moyens sur le terrain. Données de la Protection civile via Fogos.pt. En cas d'urgence, appelez le 112.`);
  } else if (n === 0) {
    descricao = L(
      `Neste momento não há incêndios ativos registados ${onde}. Consulta a lista por distrito, com local, estado e meios no terreno. Dados do Fogos.pt.`,
      `Right now there are no active fires recorded ${onde}. Check the list by district, with location, status and resources on site. Data from Fogos.pt.`,
      `Derzeit sind ${onde} keine aktiven Brände registriert. Sieh dir die Liste nach Distrikt an, mit Ort, Status und Einsatzkräften vor Ort. Daten von Fogos.pt.`,
      `Aucun incendie actif n'est enregistré ${onde} pour le moment. Consultez la liste par district, avec lieu, état et moyens sur le terrain. Données de Fogos.pt.`);
  } else {
    descricao = L(
      `${n} ${rotuloAtivos(n)} ${onde} agora: ${emCurso} em curso e ${emResolucao} em resolução. Local, estado e meios no terreno. Dados do Fogos.pt, com a Proteção Civil.`,
      `${n} ${rotuloAtivos(n)} ${onde} now: ${emCurso} ongoing and ${emResolucao} being resolved. Location, status and resources on site. Data from Fogos.pt, with civil protection.`,
      `Jetzt ${n} ${rotuloAtivos(n)} ${onde}: ${emCurso} laufend und ${emResolucao} in Abschluss. Ort, Status und Einsatzkräfte vor Ort. Daten von Fogos.pt, mit dem Zivilschutz.`,
      `${n} ${rotuloAtivos(n)} ${onde} en ce moment : ${emCurso} en cours et ${emResolucao} en cours de résolution. Lieu, état et moyens sur le terrain. Données de Fogos.pt, avec la Protection civile.`);
  }
  return pagina({
    titulo: tituloBase,
    descricao,
    caminho: d ? `/incendios/${d.slug}` : '/incendios',
    corpo,
    migalhas: [
      { nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' },
      { nome: L('Incêndios', 'Fires', 'Brände', 'Incendies'), url: '/incendios' },
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
  let corpo = `<h1>${L('Pesquisar linhas e paragens', 'Search lines and stops', 'Linien und Haltestellen suchen', 'Rechercher des lignes et des arrêts')}</h1>
<form class="pesquisa" action="/pesquisa" method="get" role="search"><input name="q" type="search" value="${html(q)}" placeholder="${L('Linha ou paragem', 'Line or stop', 'Linie oder Haltestelle', 'Ligne ou arrêt')}" aria-label="${L('Pesquisar', 'Search', 'Suchen', 'Rechercher')}" required minlength="2"><button class="btn" type="submit">${L('Pesquisar', 'Search', 'Suchen', 'Rechercher')}</button></form>`;
  if (termo.length >= 2) {
    corpo += `<h2>${L('Linhas', 'Lines', 'Linien', 'Lignes')} (${linhas.length})</h2>${linhas.length ? `<ul class="lista">${linhas.slice(0, 50).map(({ o, l }) => `<li><a href="/linhas/${o.slug}/${l.slug}">${chip(l)}<span class="t">${html(nomeLinha(l))}<small>${html(o.nome)}${l.nome ? ` · ${html(l.nome)}` : ''}</small></span></a></li>`).join('')}</ul>` : `<p class="nota">${L('Nenhuma linha encontrada.', 'No lines found.', 'Keine Linie gefunden.', 'Aucune ligne trouvée.')}</p>`}
<h2>${L('Paragens', 'Stops', 'Haltestellen', 'Arrêts')} (${paragens.length > 100 ? '100+' : paragens.length})</h2>${paragens.length ? `<ul class="lista">${paragens.slice(0, 100).map(({ o, g }) => `<li><a href="/paragens/${o.slug}/${g.slug}"><span class="t">${html(g.nome)}<small>${html(o.nome)}</small></span></a></li>`).join('')}</ul>` : `<p class="nota">${L('Nenhuma paragem encontrada.', 'No stops found.', 'Keine Haltestelle gefunden.', 'Aucun arrêt trouvé.')}</p>`}`;
  }
  return pagina({
    titulo: L(`Pesquisa${q ? `: ${q}` : ''} | PAROU`, `Search${q ? `: ${q}` : ''} | PAROU`, `Suche${q ? `: ${q}` : ''} | PAROU`, `Recherche${q ? ` : ${q}` : ''} | PAROU`),
    descricao: L('Pesquisa linhas e paragens de transportes públicos em Portugal.', 'Search public transport lines and stops in Portugal.', 'Suche Linien und Haltestellen des öffentlichen Verkehrs in Portugal.', 'Recherchez les lignes et les arrêts des transports publics au Portugal.'),
    caminho: '/pesquisa',
    corpo,
    indexar: false,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Pesquisa', 'Search', 'Suche', 'Recherche'), url: '/pesquisa' }],
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
export { CIDADES };

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
  if (emIngles()) return L('', `in ${nome}`, `in ${nome}`, `à ${nome}`);
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
      p: L(`Como sei quando passa o próximo autocarro ${emC}?`, `How can I tell when the next bus is coming ${emC}?`, `Wie erfahre ich, wann der nächste Bus ${emC} kommt?`, `Comment savoir quand passe le prochain bus ${emC} ?`),
      r: L(
        `Abre a PAROU (parou.pt) e ativa a localização: vês as paragens à tua volta ${emC} e as próximas partidas de cada linha${porOperador.length ? ` (${listaOps})` : ''}, com tempo real quando o operador o disponibiliza.`,
        `Open PAROU (parou.pt) and turn on location: you see the stops around you ${emC} and the next departures for every line${porOperador.length ? ` (${listaOps})` : ''}, with real time when the operator provides it.`,
        `Öffne PAROU (parou.pt) und aktiviere den Standort: Du siehst die Haltestellen in deiner Nähe ${emC} und die nächsten Abfahrten jeder Linie${porOperador.length ? ` (${listaOps})` : ''}, mit Echtzeit, wenn das Verkehrsunternehmen sie bereitstellt.`,
        `Ouvrez PAROU (parou.pt) et activez la localisation : vous voyez les arrêts autour de vous ${emC} et les prochains départs de chaque ligne${porOperador.length ? ` (${listaOps})` : ''}, avec le temps réel quand l'opérateur le fournit.`),
    },
    {
      p: L(`Que transportes públicos há ${emC}?`, `What public transport is there ${emC}?`, `Welche öffentlichen Verkehrsmittel gibt es ${emC}?`, `Quels transports publics y a-t-il ${emC} ?`),
      r: porOperador.length
        ? L(
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)} a PAROU tem ${num(totalParagens)} paragens de ${porOperador.length} ${porOperador.length === 1 ? 'operador' : 'operadores'}: ${listaOps}.`,
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)} PAROU covers ${num(totalParagens)} stops from ${porOperador.length} ${porOperador.length === 1 ? 'operator' : 'operators'}: ${listaOps}.`,
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)} deckt PAROU ${num(totalParagens)} Haltestellen von ${porOperador.length} Verkehrsunternehmen ab: ${listaOps}.`,
            `${emC.charAt(0).toUpperCase()}${emC.slice(1)}, PAROU couvre ${num(totalParagens)} arrêts de ${porOperador.length} ${porOperador.length === 1 ? 'opérateur' : 'opérateurs'} : ${listaOps}.`)
        : L(`A PAROU ainda não tem horários publicados para ${c.nome}.`, `PAROU does not have published timetables for ${c.nome} yet.`, `PAROU hat für ${c.nome} noch keine veröffentlichten Fahrpläne.`, `PAROU n'a pas encore d'horaires publiés pour ${c.nome}.`),
    },
    {
      p: L(`Os horários dos transportes de ${c.nome} são oficiais?`, `Are the ${c.nome} transport timetables official?`, `Sind die Fahrpläne des Nahverkehrs in ${c.nome} offiziell?`, `Les horaires des transports de ${c.nome} sont-ils officiels ?`),
      r: L(
        'Sim. Os horários vêm dos dados publicados pelos operadores (GTFS) e pelo IMT, e são atualizados todos os dias. Podem mudar sem aviso; em caso de dúvida confirma junto do operador.',
        'Yes. The timetables come from data published by the operators (GTFS) and by IMT, and are updated every day. They can change without notice; if in doubt, check with the operator.',
        'Ja. Die Fahrpläne stammen aus den von den Verkehrsunternehmen (GTFS) und vom IMT veröffentlichten Daten und werden täglich aktualisiert. Sie können sich ohne Vorankündigung ändern; im Zweifel frag beim Verkehrsunternehmen nach.',
        'Oui. Les horaires proviennent des données publiées par les opérateurs (GTFS) et par l\'IMT, et sont mis à jour chaque jour. Ils peuvent changer sans préavis ; en cas de doute, vérifiez auprès de l\'opérateur.'),
    },
    {
      p: L(`Há greves ou perturbações nos transportes ${emC} hoje?`, `Are there strikes or disruptions to public transport ${emC} today?`, `Gibt es heute Streiks oder Störungen im Nahverkehr ${emC}?`, `Y a-t-il des grèves ou des perturbations dans les transports ${emC} aujourd'hui ?`),
      r: L(
        'Na página de greves e nos Alertas da PAROU vês as greves anunciadas e as perturbações dos operadores, além dos avisos de mau tempo do IPMA.',
        'On the strikes page and in PAROU Alerts you see the announced strikes and the operators\' disruptions, plus IPMA bad-weather warnings.',
        'Auf der Streikseite und in den PAROU-Warnungen siehst du die angekündigten Streiks und Störungen der Verkehrsunternehmen sowie die Unwetterwarnungen des IPMA.',
        'Sur la page des grèves et dans les alertes PAROU, vous voyez les grèves annoncées et les perturbations des opérateurs, ainsi que les avis de mauvais temps de l\'IPMA.'),
    },
  ];
  let corpo = `<h1>${L(`Transportes públicos ${html(emC)}: horários e próximos autocarros`, `Public transport ${html(emC)}: timetables and next buses`, `Öffentlicher Verkehr ${html(emC)}: Fahrpläne und nächste Busse`, `Transports publics ${html(emC)} : horaires et prochains bus`)}</h1>
<p class="sub">${porOperador.length
    ? L(
        `Horários de ${listaOps} ${html(emC)} — ${num(totalParagens)} paragens, com as próximas partidas e tempo real quando disponível.`,
        `Timetables for ${listaOps} ${html(emC)} — ${num(totalParagens)} stops, with the next departures and real time when available.`,
        `Fahrpläne von ${listaOps} ${html(emC)} — ${num(totalParagens)} Haltestellen, mit den nächsten Abfahrten und Echtzeit, wenn verfügbar.`,
        `Horaires de ${listaOps} ${html(emC)} — ${num(totalParagens)} arrêts, avec les prochains départs et le temps réel quand il est disponible.`)
    : L(`Transportes perto de ti ${html(emC)}.`, `Transport near you ${html(emC)}.`, `Verkehrsmittel in deiner Nähe ${html(emC)}.`, `Transports près de vous ${html(emC)}.`)} ${L('Gratuito e sem anúncios.', 'Free and ad-free.', 'Kostenlos und werbefrei.', 'Gratuit et sans publicité.')}</p>
<p><a class="btn laranja" href="/">${L('Ver o que passa perto de mim', "See what's running near me", 'Sieh, was in meiner Nähe fährt', 'Voir ce qui passe près de moi')}</a> <a class="btn claro" href="/greves">${L('Greves hoje', 'Strikes today', 'Streiks heute', 'Grèves aujourd\'hui')}</a></p>`;
  for (const x of porOperador.slice(0, 8)) {
    corpo += `<h2>${html(x.op.nome)} ${html(emC)}</h2>
<p>${L(
      `${num(x.n)} paragens de ${html(x.op.modo.toLowerCase())} ${html(emC)}. <a href="/linhas/${x.op.slug}">Todas as linhas e horários ${html(x.op.nome)}</a>.`,
      `${num(x.n)} ${html(nomeModo(x.op.modo).toLowerCase())} stops ${html(emC)}. <a href="/linhas/${x.op.slug}">All ${html(x.op.nome)} lines and timetables</a>.`,
      `${num(x.n)} Haltestellen (${html(nomeModo(x.op.modo))}) ${html(emC)}. <a href="/linhas/${x.op.slug}">Alle Linien und Fahrpläne ${html(x.op.nome)}</a>.`,
      `${num(x.n)} arrêts de ${html(nomeModo(x.op.modo).toLowerCase())} ${html(emC)}. <a href="/linhas/${x.op.slug}">Toutes les lignes et horaires ${html(x.op.nome)}</a>.`)}</p>
<ul class="lista">${x.perto.slice(0, 12).map(({ g }) => `<li><a href="/paragens/${x.op.slug}/${g.slug}"><span class="t">${html(nomeBonito(g.nome))}</span></a></li>`).join('')}</ul>`;
  }
  corpo += `<h2>${L('Perguntas frequentes', 'Frequently asked questions', 'Häufige Fragen', 'Questions fréquentes')}</h2>${perguntas.map((q) => `<h3>${html(q.p)}</h3><p>${html(q.r)}</p>`).join('')}
<h2>${L('Outras cidades', 'Other cities', 'Weitere Städte', 'Autres villes')}</h2><p>${CIDADES.filter((o) => o.slug !== c.slug).map((o) => `<a href="/cidade/${o.slug}">${html(o.nome)}</a>`).join(' · ')}</p>`;
  return pagina({
    titulo: L(`Autocarros e transportes ${emC}: horários e paragens | PAROU`, `Buses and public transport ${emC}: timetables and stops | PAROU`, `Busse und öffentlicher Verkehr ${emC}: Fahrpläne und Haltestellen | PAROU`, `Bus et transports publics ${emC} : horaires et arrêts | PAROU`),
    descricao: L(
      `Horários dos transportes públicos ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''}: próximos autocarros, paragens perto de ti, greves e alertas. Grátis e sem anúncios.`,
      `Public transport timetables ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''}: next buses, stops near you, strikes and alerts. Free and ad-free.`,
      `Fahrpläne des öffentlichen Verkehrs ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''}: nächste Busse, Haltestellen in deiner Nähe, Streiks und Warnungen. Kostenlos und werbefrei.`,
      `Horaires des transports publics ${emC}${porOperador.length ? ` (${nomesOps.slice(0, 3).join(', ')})` : ''} : prochains bus, arrêts près de vous, grèves et alertes. Gratuit et sans publicité.`),
    caminho: `/cidade/${c.slug}`,
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Cidades', 'Cities', 'Städte', 'Villes'), url: '/cidades' }, { nome: c.nome, url: `/cidade/${c.slug}` }],
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: perguntas.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
    }],
  });
}

function paginaCidades(): string {
  const corpo = `<h1>${L('Transportes públicos por cidade', 'Public transport by city', 'Öffentlicher Verkehr nach Stadt', 'Transports publics par ville')}</h1>
<p class="sub">${L(
    'Horários de autocarros, metro, comboios e barcos nas cidades de Portugal, com as paragens de cada operador e os próximos transportes em tempo real.',
    'Timetables for buses, metro, trains and boats in Portuguese cities, with each operator\'s stops and the next departures in real time.',
    'Fahrpläne für Busse, U-Bahnen, Züge und Fähren in portugiesischen Städten, mit den Haltestellen jedes Verkehrsunternehmens und den nächsten Abfahrten in Echtzeit.',
    'Horaires des bus, métros, trains et bateaux dans les villes du Portugal, avec les arrêts de chaque opérateur et les prochains départs en temps réel.')}</p>
<div class="grelha">${CIDADES.map((c) => `<a href="/cidade/${c.slug}"><b>${html(c.nome)}</b><small>${L('Horários e paragens', 'Timetables and stops', 'Fahrpläne und Haltestellen', 'Horaires et arrêts')}</small></a>`).join('')}</div>`;
  return pagina({
    titulo: L('Transportes públicos por cidade em Portugal: horários | PAROU', 'Public transport by city in Portugal: timetables | PAROU', 'Öffentlicher Verkehr nach Stadt in Portugal: Fahrpläne | PAROU', 'Transports publics par ville au Portugal : horaires | PAROU'),
    descricao: L(
      'Horários de autocarros, metro e comboios em Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra e mais cidades de Portugal. Próximos transportes em tempo real.',
      'Bus, metro and train timetables in Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra and more cities in Portugal. Next departures in real time.',
      'Fahrpläne für Bus, U-Bahn und Zug in Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra und weiteren Städten in Portugal. Nächste Abfahrten in Echtzeit.',
      'Horaires de bus, métro et train à Lisboa, Porto, Braga, Coimbra, Faro, Maia, Gaia, Sintra et dans d\'autres villes du Portugal. Prochains départs en temps réel.'),
    caminho: '/cidades',
    corpo,
    migalhas: [{ nome: L('Início', 'Home', 'Start', 'Accueil'), url: '/' }, { nome: L('Cidades', 'Cities', 'Städte', 'Villes'), url: '/cidades' }],
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
  const out = [...PAGINAS_APP.map((p) => p.loc), ...ENDERECOS_GREVES, ...DISTRITOS.map((d) => `/incendios/${d.slug}`), ...CIDADES.map((c) => `/cidade/${c.slug}`)];
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
    titulo: L('A atualizar os horários | PAROU', 'Updating the timetables | PAROU', 'Fahrpläne werden aktualisiert | PAROU', 'Mise à jour des horaires | PAROU'),
    descricao: L('A PAROU está a atualizar os horários. Tenta daqui a um minuto.', 'PAROU is updating the timetables. Try again in a minute.', 'PAROU aktualisiert gerade die Fahrpläne. Versuch es in einer Minute erneut.', 'PAROU met à jour les horaires. Réessayez dans une minute.'),
    caminho: '/linhas',
    corpo: `<h1>${L('A atualizar os horários…', 'Updating the timetables…', 'Fahrpläne werden aktualisiert …', 'Mise à jour des horaires…')}</h1><p>${L('Tenta outra vez daqui a um minuto.', 'Try again in a minute.', 'Versuch es in einer Minute erneut.', 'Réessayez dans une minute.')}</p>`,
    indexar: false,
  }));
}

function naoEncontrado(res: Response, o?: Operador) {
  res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'Cookie');
  res.send(pagina({
    titulo: L('Página não encontrada | PAROU', 'Page not found | PAROU', 'Seite nicht gefunden | PAROU', 'Page introuvable | PAROU'),
    descricao: L('Esta página não existe ou mudou de sítio.', 'This page does not exist or has moved.', 'Diese Seite existiert nicht oder ist umgezogen.', 'Cette page n\'existe pas ou a changé d\'adresse.'),
    caminho: o ? `/linhas/${o.slug}` : '/linhas',
    indexar: false,
    corpo: `<h1>${L('Página não encontrada', 'Page not found', 'Seite nicht gefunden', 'Page introuvable')}</h1><p>${L('Esta linha ou paragem não existe ou mudou de nome.', 'This line or stop does not exist or has been renamed.', 'Diese Linie oder Haltestelle existiert nicht oder wurde umbenannt.', 'Cette ligne ou cet arrêt n\'existe pas ou a été renommé.')}</p><p><a class="btn" href="${o ? `/linhas/${o.slug}` : '/linhas'}">${o ? L(`Ver as linhas ${html(o.nome)}`, `See the ${html(o.nome)} lines`, `Linien ${html(o.nome)} ansehen`, `Voir les lignes ${html(o.nome)}`) : L('Ver todas as linhas', 'See all lines', 'Alle Linien ansehen', 'Voir toutes les lignes')}</a></p>`,
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
    '- Greve de um operador (há greve hoje, próximas datas, alternativas): https://parou.pt/greves/{operador} (por exemplo /greves/metro-de-lisboa, /greves/carris, /greves/cp)',
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
      const completo = (await grevesPartilhadas()).completo;
      cache.set(chaveG, { t: Date.now(), ttl: completo ? 5 * 60_000 : 30_000, v });
      enviar(res, v, completo ? 300 : 30);
    } catch (err: any) {
      console.warn('[SEO] Greves falhou:', err?.message || err);
      res.status(500).send('Erro');
    }
  });

  // Greves por operador (metro de Lisboa, Carris, CP…)
  app.get('/greves/:operador', comIdioma, async (req, res) => {
    const pedido = String(req.params.operador || '').toLowerCase();
    const destino = ALIAS_GREVES[pedido];
    if (destino) return void res.redirect(301, `/greves/${destino}`);
    const o = OPERADORES_GREVE.find((x) => x.slug === pedido);
    if (!o) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Vary', 'Cookie');
      return void res.send(pagina({
        titulo: L('Página não encontrada | PAROU', 'Page not found | PAROU', 'Seite nicht gefunden | PAROU', 'Page introuvable | PAROU'),
        descricao: L('Este operador não existe ou mudou de sítio.', 'This operator does not exist or has moved.', 'Dieses Verkehrsunternehmen existiert nicht oder ist umgezogen.', 'Cet opérateur n\'existe pas ou a changé d\'adresse.'),
        caminho: '/greves',
        indexar: false,
        corpo: `<h1>${L('Página não encontrada', 'Page not found', 'Seite nicht gefunden', 'Page introuvable')}</h1><p>${L('Não há uma página de greves para este operador.', 'There is no strikes page for this operator.', 'Für dieses Verkehrsunternehmen gibt es keine Streikseite.', 'Il n\'existe pas de page de grèves pour cet opérateur.')}</p><p><a class="btn" href="/greves">${L('Ver todas as greves', 'See all strikes', 'Alle Streiks ansehen', 'Voir toutes les grèves')}</a></p>`,
      }));
    }
    const chaveG = chaveIdioma(`greves:${o.slug}`);
    const c = cache.get(chaveG);
    if (c && Date.now() - c.t < c.ttl) return enviar(res, c.v, 300);
    try {
      const v = await paginaGrevesOperador(o);
      const completo = (await grevesPartilhadas()).completo;
      cache.set(chaveG, { t: Date.now(), ttl: completo ? 5 * 60_000 : 30_000, v });
      enviar(res, v, completo ? 300 : 30);
    } catch (err: any) {
      console.warn('[SEO] Greves por operador falhou:', err?.message || err);
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
        titulo: L('Página não encontrada | PAROU', 'Page not found | PAROU', 'Seite nicht gefunden | PAROU', 'Page introuvable | PAROU'),
        descricao: L('Este distrito não existe ou mudou de sítio.', 'This district does not exist or has moved.', 'Dieser Distrikt existiert nicht oder ist umgezogen.', 'Ce district n\'existe pas ou a changé d\'adresse.'),
        caminho: '/incendios',
        indexar: false,
        corpo: `<h1>${L('Página não encontrada', 'Page not found', 'Seite nicht gefunden', 'Page introuvable')}</h1><p>${L('Não há uma página de incêndios para este distrito.', 'There is no fires page for this district.', 'Für diesen Distrikt gibt es keine Brandseite.', 'Il n\'existe pas de page d\'incendies pour ce district.')}</p><p><a class="btn" href="/incendios">${L('Ver os incêndios ativos', 'See active fires', 'Aktive Brände ansehen', 'Voir les incendies actifs')}</a></p>`,
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
      ...OPERADORES_GREVE.map((o) => ({ loc: `/greves/${o.slug}`, lastmod: hoje, freq: 'hourly', pri: '0.8' })),
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
/** Só para testes: fixa as greves que as páginas usam (sem ir buscar à rede) */
function semearGreves(greves: GreveResumo[], completo = true) {
  grevesMemo = { t: Date.now() + 365 * 24 * 3600_000, v: Promise.resolve({ atualizado: new Date().toISOString(), greves, completo }) };
}
export const _paginas = { paginaHub, paginaOperador, paginaLinha, paginaParagem, paginaGreves, paginaGrevesOperador, paginaPesquisa, paginaListaParagens, paginaIncendios, semearGreves };
