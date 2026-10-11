// Texto real para o HTML inicial das páginas da app (React). O Google e os outros motores leem primeiro o HTML,
// e só mais tarde (às vezes dias depois) correm o JavaScript: sem isto, a página inicial parecia só um esqueleto.
// Este bloco vai dentro do #root, por baixo do esqueleto, e o React substitui-o ao arrancar. Todos veem o mesmo HTML.
import { html } from './texto';
import type { Meta } from '../../seo/rotasApp';

const OPERADORES: Array<[string, string]> = [
  ['/linhas/carris-metropolitana', 'Carris Metropolitana'],
  ['/linhas/carris', 'Carris'],
  ['/linhas/metro-de-lisboa', 'Metro de Lisboa'],
  ['/linhas/metro-do-porto', 'Metro do Porto'],
  ['/linhas/stcp', 'STCP'],
  ['/linhas/cp', 'CP — Comboios de Portugal'],
];

const CIDADES_DESTAQUE: Array<[string, string]> = [
  ['lisboa', 'Lisboa'], ['porto', 'Porto'], ['braga', 'Braga'], ['coimbra', 'Coimbra'], ['faro', 'Faro'],
  ['aveiro', 'Aveiro'], ['setubal', 'Setúbal'], ['leiria', 'Leiria'], ['funchal', 'Funchal'],
];

const ESTILO = 'max-width:860px;margin:0 auto;padding:32px 20px 48px;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#fff';
const lista = (itens: Array<[string, string]>) => `<ul style="padding-left:20px;margin:8px 0 0">${itens.map(([h, n]) => `<li><a href="${html(h)}" style="color:#111">${html(n)}</a></li>`).join('')}</ul>`;
const p = (t: string) => `<p style="margin:10px 0 0">${t}</p>`;

function paginaInicial(): string {
  return `<section id="parou-seo" style="${ESTILO}">
<h1 style="font-size:28px;line-height:1.15;margin:0">PAROU — autocarros, metro e comboios perto de ti, em tempo real</h1>
${p('A PAROU mostra-te o que passa perto de ti, agora: autocarros da Carris Metropolitana, Carris, STCP e de outros operadores, metro de Lisboa e do Porto, comboios da CP e barcos. Tem o tempo real quando o operador o disponibiliza e os horários oficiais dos principais operadores. É gratuita, sem anúncios e sem fins lucrativos.')}
<h2 style="font-size:20px;margin:28px 0 0">Horários e tempo real por operador</h2>
${lista([...OPERADORES, ['/linhas', 'Todos os operadores, linhas e horários']])}
<h2 style="font-size:20px;margin:28px 0 0">Greves, mau tempo e incêndios</h2>
${p('Vê as <a href="/greves" style="color:#111">greves nos transportes</a>, os avisos do IPMA, os incêndios da Proteção Civil e as perturbações nos <a href="/alertas" style="color:#111">Alertas</a> e no <a href="/mapa" style="color:#111">mapa</a>, e recebe avisos no telemóvel antes de saíres de casa.')}
<h2 style="font-size:20px;margin:28px 0 0">Transportes por cidade</h2>
${p(`${CIDADES_DESTAQUE.map(([s, n]) => `<a href="/cidade/${s}" style="color:#111">${html(n)}</a>`).join(' · ')} · <a href="/cidades" style="color:#111">todas as cidades</a>`)}
<h2 style="font-size:20px;margin:28px 0 0">Quem faz a PAROU</h2>
${p('A PAROU é um projeto feito por uma pessoa, o Dinis Sousa, para toda a gente. Lê mais <a href="/sobre" style="color:#111">sobre a PAROU</a> ou <a href="/contactar" style="color:#111">fala comigo</a>.')}
</section>`;
}

function paginaGenerica(m: Meta): string {
  const titulo = m.titulo.replace(/\s*[|—-]\s*PAROU\s*$/i, '').trim() || m.titulo;
  return `<section id="parou-seo" style="${ESTILO}">
<h1 style="font-size:28px;line-height:1.15;margin:0">${html(titulo)}</h1>
${p(html(m.descricao))}
<h2 style="font-size:20px;margin:28px 0 0">Também na PAROU</h2>
${lista([['/', 'Transportes perto de ti, em tempo real'], ['/linhas', 'Linhas e horários de todos os operadores'], ['/greves', 'Greves nos transportes'], ['/alertas', 'Alertas e perturbações'], ['/cidades', 'Transportes por cidade'], ['/sobre', 'Sobre a PAROU']])}
</section>`;
}

/** Bloco HTML para o endereço pedido; vazio se a página não deve ser indexada ou não existe. */
export function conteudoDaRota(caminho: string, meta: Meta, existe: boolean): string {
  if (!existe || !meta.indexar) return '';
  const limpo = (String(caminho || '/').toLowerCase().replace(/\/+$/, '') || '/');
  return limpo === '/' ? paginaInicial() : paginaGenerica(meta);
}
