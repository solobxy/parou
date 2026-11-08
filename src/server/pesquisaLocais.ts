// Pesquisa de locais para "Para onde vais?": centros comerciais, hospitais, universidades, praias, monumentos, localidades
// e ruas de Portugal (OpenStreetMap), feitos à parte pelo parou-dados (locais.py) e guardados na base de horários
// (tabela locais + índice de texto locais_fts, sem acentos). Responde em milissegundos e sem depender de serviços de fora.
//
// A ordem junta três coisas: quanto o nome corresponde ao que se escreveu, a importância do local (o aeroporto antes
// de uma rua com "aeroporto" no nome; o Colombo de Lisboa antes de uma loja chamada Colombo) e a distância a quem procura
// (o Continente mais perto primeiro). A tabela está pela ordem de importância (o rowid é a posição), por isso as primeiras
// correspondências do índice são as dos locais mais conhecidos.
import { getDatabase } from './db/gtfsDatabase';
import { normalizarParaPesquisa } from './pesquisaParagens';

export interface LocalEncontrado {
  id: number;
  nome: string;
  cat: string;
  sitio: string;
  lat: number;
  lon: number;
  imp: number;
  alt: string;
}

/**
 * Palavras que dizem o TIPO de local ("praia", "hospital", "shopping"): os locais desse tipo sobem (quem escreve "praia"
 * quer praias, não o Palácio Praia e Monforte). As que não fazem parte do nome ("shopping" no Colombo, "centro
 * comercial") deixam de ser exigidas quando há outras palavras: "colombo shopping" encontra o Centro Comercial Colombo.
 */
export const CATEGORIA_DA_PALAVRA: Record<string, string> = {
  praia: 'praia', praias: 'praia', hospital: 'hospital', hospitais: 'hospital', museu: 'museu', museus: 'museu',
  parque: 'parque', jardim: 'jardim', escola: 'escola', universidade: 'universidade', faculdade: 'faculdade',
  aeroporto: 'aeroporto', estadio: 'estadio', supermercado: 'supermercado', cinema: 'cinema', teatro: 'teatro',
  biblioteca: 'biblioteca', castelo: 'castelo', miradouro: 'miradouro', hotel: 'hotel', igreja: 'igreja', mercado: 'mercado',
  zoo: 'zoo', policia: 'policia', psp: 'policia', gnr: 'policia', bombeiros: 'bombeiros', correios: 'correios', ctt: 'correios',
  camara: 'camara', tribunal: 'tribunal', marina: 'marina', shopping: 'centro_comercial', shoping: 'centro_comercial',
  mall: 'centro_comercial', beach: 'praia', museum: 'museu', airport: 'aeroporto', castle: 'castelo',
};
const SO_TIPO = new Set(['shopping', 'shoping', 'mall', 'beach', 'museum', 'airport', 'castle']);

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'na', 'no', 'nas', 'nos', 'the', 'of']);

/** Palavra da zona (~10 km) de um ponto: a mesma conta que o parou-dados faz ao guardar (celula_locais) */
export function celulaLocais(lat: number, lon: number): string {
  return `zq${Math.floor(lat * 10)}y${Math.floor(-lon * 10)}`;
}

let temIndice: { db: unknown; sim: boolean } | null = null;
function haLocais(db: any): boolean {
  if (temIndice && temIndice.db === db) return temIndice.sim;
  let sim = false;
  try { sim = Boolean(db.prepare("SELECT 1 AS x FROM sqlite_master WHERE name = 'locais_fts'").get()); } catch { sim = false; }
  temIndice = { db, sim };
  return sim;
}

/** Palavras da pesquisa (normalizadas), sem as vazias ("de", "da"…) quando há outras */
export function palavrasDaPesquisa(consulta: string): string[] {
  const todas = normalizarParaPesquisa(consulta).split(' ').filter(Boolean);
  const uteis = todas.filter((p) => !PALAVRAS_VAZIAS.has(p));
  return uteis.length ? uteis : todas;
}

/**
 * Quanto um nome corresponde ao que se escreveu (0 a 1): igual 1; começa por 0,88; todas as palavras são início de palavras
 * do nome, pela ordem 0,76, noutra ordem 0,68; aparecem dentro de palavras 0,45; não aparecem 0.
 */
export function correspondencia(qNorm: string, palavras: string[], nomeNorm: string): number {
  if (!nomeNorm) return 0;
  if (nomeNorm === qNorm) return 1;
  if (nomeNorm.startsWith(qNorm)) return 0.88;
  const ps = nomeNorm.split(' ');
  let pos = 0, emOrdem = true, todas = true;
  for (const w of palavras) {
    let achou = -1;
    for (let i = pos; i < ps.length; i++) if (ps[i].startsWith(w)) { achou = i; break; }
    if (achou < 0) {
      emOrdem = false;
      if (!ps.some((x) => x.startsWith(w))) { todas = false; break; }
    } else pos = achou + 1;
  }
  if (todas) return emOrdem ? 0.76 : 0.68;
  return palavras.every((w) => nomeNorm.includes(w)) ? 0.45 : 0;
}

/**
 * Proximidade (0 a 0,9): muito perto (até ~2 km) conta muito, e a região de quem procura (~40 km) conta um pouco.
 * Assim, entre iguais (o Continente, a praia, o hospital) ganha o mais perto; entre um local conhecido e outro pequeno
 * com o mesmo nome, ganha o conhecido, a não ser que o pequeno fique mesmo ao lado.
 */
export function proximidade(metros: number | undefined): number {
  if (metros === undefined || !Number.isFinite(metros)) return 0;
  return 0.55 * Math.exp(-metros / 2500) + 0.35 * Math.exp(-metros / 40000);
}

/** Pontuação final de um local ou paragem (texto + importância + distância) */
export function pontuar(texto: number, importancia: number, metros?: number): number {
  return texto + 1.3 * importancia + proximidade(metros);
}

function distM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (bLat - aLat) * 111_195;
  const dx = (bLon - aLon) * 111_195 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

export interface LocalPontuado extends LocalEncontrado { texto: number; pontos: number; distancia?: number }

/** Locais que correspondem à pesquisa, já pontuados e por ordem (melhor primeiro) */
export function procurarLocais(consulta: string, lat?: number, lon?: number, max = 12): LocalPontuado[] {
  let db: any;
  try { db = getDatabase(); } catch { return []; }
  if (!haLocais(db)) return [];
  const qNorm = normalizarParaPesquisa(consulta);
  if (qNorm.length < 2) return [];
  let palavras = palavrasDaPesquisa(consulta);
  const categorias = new Set(palavras.map((p) => CATEGORIA_DA_PALAVRA[p]).filter(Boolean));
  // "centro comercial" / "shopping" dizem só o tipo
  if (/\bcentro comercial\b|\bc ?c\b/.test(qNorm)) categorias.add('centro_comercial');
  const semTipo = palavras.filter((p) => !SO_TIPO.has(p) && !(categorias.has('centro_comercial') && /^(centro|comercial|cc|c)$/.test(p)));
  const soTipo = categorias.size > 0 && palavras.every((p) => CATEGORIA_DA_PALAVRA[p]);
  if (semTipo.length && semTipo.length < palavras.length) palavras = semTipo;
  // Palavras de uma letra ("s joão") ficam fora do índice (apanhavam tudo), mas contam na correspondência
  const noIndice = palavras.filter((p) => p.length >= 2);
  if (!noIndice.length) return [];
  const fts = noIndice.map((p) => `"${p.replace(/"/g, '')}"*`).join(' ');
  const comLocal = Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);

  const sql = 'SELECT id, nome, cat, sitio, lat, lon, imp, alt FROM locais WHERE id IN (SELECT rowid FROM locais_fts WHERE locais_fts MATCH ? LIMIT ?)';
  const vistos = new Map<number, LocalEncontrado>();
  try {
    // Os mais conhecidos de todo o país (o índice devolve-os pela ordem de importância)…
    for (const r of db.prepare(sql).all(fts, 300) as LocalEncontrado[]) vistos.set(r.id, r);
    // …e os que ficam perto de quem procura (zona de ~10 km e as oito à volta)
    if (comLocal) {
      const cy = Math.floor((lat as number) * 10), cx = Math.floor(-(lon as number) * 10);
      const zonas: string[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) zonas.push(`"zq${cy + dy}y${cx + dx}"`);
      for (const r of db.prepare(sql).all(`(${fts}) AND (${zonas.join(' OR ')})`, 300) as LocalEncontrado[]) vistos.set(r.id, r);
    }
  } catch {
    return [];
  }

  const saida: LocalPontuado[] = [];
  for (const r of vistos.values()) {
    const qTexto = palavras.join(' ');
    let texto = correspondencia(qTexto, palavras, normalizarParaPesquisa(r.nome));
    if (r.alt) for (const a of String(r.alt).split('|')) texto = Math.max(texto, 0.85 * correspondencia(qTexto, palavras, normalizarParaPesquisa(a)));
    if (texto <= 0) continue;
    const distancia = comLocal ? distM(lat as number, lon as number, r.lat, r.lon) : undefined;
    // O tipo pedido sobe; se só se escreveu o tipo ("praia", "hospital"), os outros locais descem
    const doTipo = categorias.has(r.cat) ? 0.3 : soTipo ? -0.4 : 0;
    // Longe (mais de 100 km) de quem procura, um local que não é muito conhecido desce: há quase sempre um igual mais perto
    const longe = distancia !== undefined && distancia > 100_000 && (Number(r.imp) || 0) < 0.9 ? -0.25 : 0;
    saida.push({ ...r, texto, distancia, pontos: pontuar(texto, Number(r.imp) || 0, distancia) + doTipo + longe });
  }
  // "aeroporto ponta delgada", "continente maia", "hospital viseu": as últimas (ou primeiras) palavras dizem onde. Se o nome
  // inteiro não deu quase nada, procura-se o resto no nome e essas palavras no sítio (localidade, concelho) de cada local.
  if (palavras.length >= 2 && saida.filter((x) => x.texto >= 0.68).length < 3) {
    const ja = new Set(saida.map((x) => x.id));
    const cortes: Array<[string[], string[]]> = [];
    for (let k = Math.min(3, palavras.length - 1); k >= 1; k--) {
      cortes.push([palavras.slice(0, palavras.length - k), palavras.slice(palavras.length - k)]);
      cortes.push([palavras.slice(k), palavras.slice(0, k)]);
    }
    for (const [nomeP, lugarP] of cortes) {
      const noIx = nomeP.filter((p) => p.length >= 2);
      if (!noIx.length || lugarP.join('').length < 3) continue;
      let rows: LocalEncontrado[] = [];
      try { rows = db.prepare(sql).all(noIx.map((p) => `"${p.replace(/"/g, '')}"*`).join(' '), 4000) as LocalEncontrado[]; } catch { continue; }
      const qNome = nomeP.join(' ');
      for (const r of rows) {
        if (ja.has(r.id)) continue;
        const sitio = ` ${normalizarParaPesquisa(String(r.sitio || ''))} `;
        if (!lugarP.every((p) => sitio.includes(` ${p}`))) continue;
        let texto = correspondencia(qNome, nomeP, normalizarParaPesquisa(r.nome));
        if (r.alt) for (const a of String(r.alt).split('|')) texto = Math.max(texto, 0.85 * correspondencia(qNome, nomeP, normalizarParaPesquisa(a)));
        if (texto <= 0) continue;
        texto *= 0.95; // o sítio não faz parte do nome
        const distancia = comLocal ? distM(lat as number, lon as number, r.lat, r.lon) : undefined;
        const doTipo = categorias.has(r.cat) ? 0.3 : 0;
        ja.add(r.id);
        // Sem a distância a contar: quem escreve a terra quer lá, mesmo longe
        saida.push({ ...r, texto, distancia, pontos: pontuar(texto, Number(r.imp) || 0, undefined) + doTipo + 0.15 });
      }
      if (saida.filter((x) => x.texto >= 0.6).length >= 3) break;
    }
  }
  saida.sort((a, b) => b.pontos - a.pontos || a.nome.length - b.nome.length);
  return saida.slice(0, max);
}

/** Para os testes */
export const _teste = { limpar: () => { temIndice = null; } };
