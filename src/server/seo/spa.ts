// Metadados por página da app (React): o servidor escreve no index.html o título, a descrição,
// o endereço canónico e as pré-visualizações (WhatsApp, Facebook, X) certos para cada endereço,
// porque essas plataformas não correm JavaScript. Endereços que não existem respondem 404.
import fs from 'fs';
import path from 'path';
import { html } from './texto';

const SITE = 'https://parou.pt';

import { metaDaRota } from '../../seo/rotasApp';

let modelo: { ficheiro: string; mtime: number; html: string } | null = null;
function lerModelo(distPath: string): string {
  const ficheiro = path.join(distPath, 'index.html');
  const mtime = fs.statSync(ficheiro).mtimeMs;
  if (!modelo || modelo.ficheiro !== ficheiro || modelo.mtime !== mtime) {
    modelo = { ficheiro, mtime, html: fs.readFileSync(ficheiro, 'utf8') };
  }
  return modelo.html;
}

function trocarMeta(doc: string, atributo: 'name' | 'property', nome: string, valor: string): string {
  const re = new RegExp(`(<meta\\s+${atributo}="${nome.replace(/[.:]/g, '\\$&')}"\\s+content=")[^"]*(")`, 'i');
  if (re.test(doc)) return doc.replace(re, `$1${html(valor)}$2`);
  return doc.replace('</head>', `<meta ${atributo}="${nome}" content="${html(valor)}" />\n</head>`);
}

/** index.html com os metadados certos para o endereço pedido, e o código HTTP a usar */
export function paginaDaApp(distPath: string, caminho: string): { status: number; html: string } {
  const { meta: m, existe } = metaDaRota(caminho);
  let doc = lerModelo(distPath);
  const canonico = `${SITE}${m.canonico}`;
  doc = doc.replace(/<title>[\s\S]*?<\/title>/i, `<title>${html(m.titulo)}</title>`);
  doc = doc.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${html(canonico)}$2`);
  doc = trocarMeta(doc, 'name', 'description', m.descricao);
  doc = trocarMeta(doc, 'name', 'robots', m.indexar ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow');
  doc = trocarMeta(doc, 'property', 'og:url', canonico);
  doc = trocarMeta(doc, 'property', 'og:title', m.titulo);
  doc = trocarMeta(doc, 'property', 'og:description', m.descricao);
  doc = trocarMeta(doc, 'name', 'twitter:title', m.titulo);
  doc = trocarMeta(doc, 'name', 'twitter:description', m.descricao);
  const verifG = (process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  const verifB = (process.env.BING_SITE_VERIFICATION || '').trim();
  if (verifG) doc = trocarMeta(doc, 'name', 'google-site-verification', verifG);
  if (verifB) doc = trocarMeta(doc, 'name', 'msvalidate.01', verifB);
  return { status: existe ? 200 : 404, html: doc };
}
