// Títulos dos avisos nas outras línguas da app (inglês, francês, alemão). Os operadores escrevem em português; sem isto,
// quem usa a app em inglês via «Greve dos maquinistas terá impacto ligeiro…» (pedido do Dinis, 27/11/2026).
// Cada título é traduzido uma vez (serviço público MyMemory) e fica guardado em disco; os pedidos vão devagar, em segundo
// plano, e nunca atrasam uma resposta. Com um email de contacto em TRADUCOES_CONTACTO (no servidor) a quota diária é maior.
// Sem tradução ainda, a app mostra um título feito a partir do tipo do aviso (ex.: «Strike»), pelo dicionário da app.
import fs from 'node:fs';
import path from 'node:path';

export type LinguaAviso = 'en' | 'fr' | 'de';
export const LINGUAS_AVISOS: LinguaAviso[] = ['en', 'fr', 'de'];

const FICHEIRO = path.join(process.env.PAROU_DATA_DIR || '/tmp/parou-dados', 'traducoes-avisos.json');
const MAX_POR_HORA = 400;
const MAX_TAMANHO = 450;

type Tabela = Record<string, Partial<Record<LinguaAviso, string>>>;
let tabela: Tabela = {};
let carregada = false;
let sujo = false;
const fila: Array<{ texto: string; lingua: LinguaAviso }> = [];
const naFila = new Set<string>();
let aTrabalhar = false;
let pedidosNaHora: number[] = [];

const chave = (texto: string) => texto.replace(/\s+/g, ' ').trim();

function carregar(): void {
  if (carregada) return;
  carregada = true;
  try {
    const j = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8'));
    if (j && typeof j === 'object') tabela = j;
  } catch { /* ainda não há traduções */ }
}

function guardar(): void {
  if (!sujo) return;
  sujo = false;
  try {
    const chaves = Object.keys(tabela);
    if (chaves.length > 5000) for (const k of chaves.slice(0, chaves.length - 4000)) delete tabela[k];
    fs.mkdirSync(path.dirname(FICHEIRO), { recursive: true });
    const tmp = `${FICHEIRO}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(tabela));
    fs.renameSync(tmp, FICHEIRO);
  } catch (e: any) {
    console.warn('[Traduções dos avisos] não deu para guardar:', e?.message || e);
  }
}

async function traduzirMyMemory(texto: string, lingua: LinguaAviso): Promise<string | null> {
  // caixa de contacto do projeto (aumenta a quota diária do serviço); pode trocar-se em TRADUCOES_CONTACTO
  const caixa = process.env.TRADUCOES_CONTACTO || 'dinis@parou.pt';
  const contacto = `&de=${encodeURIComponent(caixa)}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=pt-PT|${lingua}${contacto}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'PAROU.PT/1.0 (+https://parou.pt)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j: any = await r.json();
  const t = String(j?.responseData?.translatedText || '').trim();
  // o serviço devolve avisos de quota no lugar da tradução
  if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(t) || Number(j?.responseStatus) >= 400) return null;
  return t;
}

let tradutor: (texto: string, lingua: LinguaAviso) => Promise<string | null> = traduzirMyMemory;

/** Para os testes: trocar o serviço de tradução */
export function usarTradutor(f: typeof tradutor): void {
  tradutor = f;
}

/** Os títulos traduzidos que já existem (para juntar ao aviso na resposta) */
export function titulosTraduzidos(texto: string | undefined): Partial<Record<LinguaAviso, string>> | undefined {
  if (!texto) return undefined;
  carregar();
  const t = tabela[chave(texto).slice(0, MAX_TAMANHO)];
  return t && Object.keys(t).length ? t : undefined;
}

/** Põe na fila os textos ainda sem tradução (em segundo plano; não espera) */
export function pedirTraducoes(textos: Array<string | undefined>, esperaMs = 1200): Promise<void> {
  carregar();
  for (const bruto of textos) {
    if (!bruto) continue;
    const texto = chave(bruto).slice(0, MAX_TAMANHO);
    if (!texto) continue;
    for (const lingua of LINGUAS_AVISOS) {
      if (tabela[texto]?.[lingua]) continue;
      const k = `${lingua}|${texto}`;
      if (naFila.has(k)) continue;
      naFila.add(k);
      fila.push({ texto, lingua });
    }
  }
  return trabalhar(esperaMs);
}

async function trabalhar(esperaMs: number): Promise<void> {
  if (aTrabalhar) return;
  aTrabalhar = true;
  try {
    while (fila.length) {
      const agora = Date.now();
      pedidosNaHora = pedidosNaHora.filter((t) => agora - t < 3600_000);
      if (pedidosNaHora.length >= MAX_POR_HORA) break;
      const { texto, lingua } = fila.shift()!;
      naFila.delete(`${lingua}|${texto}`);
      pedidosNaHora.push(agora);
      try {
        const t = await tradutor(texto, lingua);
        if (t) {
          (tabela[texto] ||= {})[lingua] = t;
          sujo = true;
        }
      } catch {
        // serviço em baixo: tenta outra vez na próxima leitura dos avisos
      }
      if (esperaMs) await new Promise((r) => setTimeout(r, esperaMs));
    }
  } finally {
    aTrabalhar = false;
    guardar();
  }
}
