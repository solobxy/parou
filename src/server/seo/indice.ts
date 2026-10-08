// Índice das páginas públicas (SEO): operadores, linhas e paragens com endereços estáveis e
// legíveis (ex.: /linhas/stcp/801-av-aliados-s-pedro-da-cova, /paragens/stcp/passal).
// É construído a partir da base de horários e refeito quando chega uma base nova.
import { getDatabase } from '../db/gtfsDatabase';
import { getVersaoBaseAtiva } from '../dadosProntos';
import { nomeBonito, semAcentos, slug } from './texto';

export interface Operador {
  feedId: string;
  slug: string;
  nome: string;
  regiao: string;
  modo: string; // Autocarro, Metro, Comboio, Barco
  linhas: Linha[];
  paragens: GrupoParagem[];
}

export interface Linha {
  routeId: string;
  feedId: string;
  slug: string;
  codigo: string; // "801", "Linha Azul", "Intercidades"
  sigla: string; // texto curto para o símbolo da linha ("801", "Az", "IC")
  nome: string; // "Av. Aliados – S. Pedro da Cova"
  tipo: number; // GTFS route_type
  cor: string;
}

export interface GrupoParagem {
  id: string; // stop_id de referência
  feedId: string;
  slug: string;
  nome: string;
  lat: number;
  lon: number;
  stopIds: string[];
}

interface Indice {
  versao: string;
  operadores: Operador[];
  porSlugOperador: Map<string, Operador>;
  linhaPorSlug: Map<string, Linha>; // `${opSlug}/${linhaSlug}`
  linhaPorRoute: Map<string, Linha>;
  paragemPorSlug: Map<string, GrupoParagem>; // `${opSlug}/${paragemSlug}`
  grupoPorStop: Map<string, GrupoParagem>;
  grelha: Map<string, GrupoParagem[]>; // células de ~1 km para "paragens perto"
}

const SLUG_OPERADOR: Record<string, string> = {
  metro_lisboa: 'metro-de-lisboa', carris: 'carris', cp: 'cp', fertagus: 'fertagus', transtejo_soflusa: 'transtejo-soflusa',
  mts: 'metro-sul-do-tejo', tcb_barreiro: 'tcb-barreiro', stcp: 'stcp', metro_porto: 'metro-do-porto', tub_braga: 'tub-braga',
  guimabus: 'guimabus', tuba_barcelos: 'tuba-barcelos', mobiave: 'mobiave', smtuc: 'smtuc', vamus: 'vamus-algarve',
  proximo_faro: 'proximo-faro', giro: 'giro-albufeira', sobe_desce_tavira: 'sobe-e-desce-tavira', horarios_funchal: 'horarios-do-funchal',
  'mdb-1272': 'mobicascais', carris_metropolitana: 'carris-metropolitana', 'tld-4257': 'autna', 'tld-4316': 'a-onda',
  'tld-4317': 'vai-e-vem', 'tld-4318': 'apanha-me', 'tld-4319': 'circuito-olhao', unir: 'unir',
};

const NOME_OPERADOR: Record<string, string> = {
  metro_lisboa: 'Metro de Lisboa', carris: 'Carris', cp: 'CP – Comboios de Portugal', mts: 'Metro Sul do Tejo',
  stcp: 'STCP', metro_porto: 'Metro do Porto', smtuc: 'SMTUC', 'mdb-1272': 'MobiCascais', proximo_faro: 'Próximo',
  giro: 'GIRO', tuba_barcelos: 'TUBA', mobiave: 'Mobiave', guimabus: 'Guimabus', tub_braga: 'TUB', vamus: 'Vamus Algarve',
  sobe_desce_tavira: 'Sobe e Desce', horarios_funchal: 'Horários do Funchal', tcb_barreiro: 'TCB Barreiro',
  transtejo_soflusa: 'Transtejo e Soflusa', carris_metropolitana: 'Carris Metropolitana', fertagus: 'Fertagus',
  'tld-4257': 'AUTNA', 'tld-4316': 'A Onda', 'tld-4317': 'Vai e Vem', 'tld-4318': 'Apanha-me!', 'tld-4319': 'Circuito Olhão',
};

export const REGIAO_OPERADOR: Record<string, string> = {
  metro_lisboa: 'Lisboa', carris: 'Lisboa', carris_metropolitana: 'Lisboa', fertagus: 'Lisboa', transtejo_soflusa: 'Lisboa',
  mts: 'Lisboa', tcb_barreiro: 'Lisboa', 'mdb-1272': 'Lisboa',
  stcp: 'Porto', metro_porto: 'Porto', unir: 'Porto',
  tub_braga: 'Minho', guimabus: 'Minho', tuba_barcelos: 'Minho', mobiave: 'Minho',
  smtuc: 'Coimbra',
  vamus: 'Algarve', proximo_faro: 'Algarve', giro: 'Algarve', sobe_desce_tavira: 'Algarve', 'tld-4319': 'Algarve',
  horarios_funchal: 'Madeira',
  cp: 'Todo o país',
};

export const NOME_REGIAO: Record<string, string> = {
  Lisboa: 'Lisboa e Setúbal (Área Metropolitana de Lisboa)',
  Porto: 'Porto (Área Metropolitana do Porto)',
  Minho: 'Braga, Guimarães, Barcelos e Famalicão',
  Coimbra: 'Coimbra',
  Algarve: 'Algarve',
  Madeira: 'Madeira',
  'Todo o país': 'Comboios em todo o país',
  Outros: 'Outros operadores',
};

const NOME_SERVICO_CP: Record<string, string> = { AP: 'Alfa Pendular', IC: 'Intercidades', IR: 'Inter-regional', R: 'Regional', U: 'Urbano' };

export function modoDoTipo(tipo: number): string {
  if (tipo === 0 || tipo === 5 || tipo === 7) return 'Elétrico';
  if (tipo === 1) return 'Metro';
  if (tipo === 2) return 'Comboio';
  if (tipo === 4) return 'Barco';
  return 'Autocarro';
}

function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return distM(a, b);
}

function celula(lat: number, lon: number) {
  return `${Math.floor(lat * 100)}:${Math.floor(lon * 80)}`;
}

let indice: Indice | null = null;
let aConstruir = false;

function versaoAtual(): string {
  try { return String(getVersaoBaseAtiva() || 'local'); } catch { return 'local'; }
}

function construir(): Indice {
  const t0 = Date.now();
  const db = getDatabase();
  const feeds = db.prepare(`SELECT id, operator_name, mode FROM feeds WHERE id IN (SELECT DISTINCT feed_id FROM routes)`).all() as Array<{ id: string; operator_name: string; mode: string }>;
  const operadores: Operador[] = [];
  const porSlugOperador = new Map<string, Operador>();
  const linhaPorSlug = new Map<string, Linha>();
  const linhaPorRoute = new Map<string, Linha>();
  const paragemPorSlug = new Map<string, GrupoParagem>();
  const grupoPorStop = new Map<string, GrupoParagem>();
  const grelha = new Map<string, GrupoParagem[]>();

  const primeiraUltima = db.prepare(`
    SELECT (SELECT s.stop_name FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id WHERE st.trip_id = t.trip_id ORDER BY st.stop_sequence ASC LIMIT 1) AS inicio,
           (SELECT s.stop_name FROM stop_times st JOIN stops s ON s.stop_id = st.stop_id WHERE st.trip_id = t.trip_id ORDER BY st.stop_sequence DESC LIMIT 1) AS fim
    FROM trips t WHERE t.route_id = ? LIMIT 1`);
  const comHorarios = new Set<string>((db.prepare('SELECT DISTINCT stop_id FROM stop_times').all() as Array<{ stop_id: string }>).map((r) => r.stop_id));

  for (const f of feeds) {
    const opSlug = SLUG_OPERADOR[f.id] || slug(f.operator_name, 40);
    if (porSlugOperador.has(opSlug)) continue;
    const op: Operador = {
      feedId: f.id,
      slug: opSlug,
      nome: NOME_OPERADOR[f.id] || nomeBonito(f.operator_name),
      regiao: REGIAO_OPERADOR[f.id] || 'Outros',
      modo: f.mode || 'Autocarro',
      linhas: [],
      paragens: [],
    };

    // Linhas
    const rotas = db.prepare(`SELECT route_id, route_short_name, route_long_name, route_type, route_color FROM routes WHERE feed_id = ? ORDER BY route_id`).all(f.id) as Array<{ route_id: string; route_short_name: string | null; route_long_name: string | null; route_type: number; route_color: string | null }>;
    const usados = new Set<string>();
    for (const r of rotas) {
      let codigo = String(r.route_short_name || '').trim();
      const original = codigo;
      let nome = nomeBonito(String(r.route_long_name || '').trim());
      if (f.id === 'cp' && NOME_SERVICO_CP[codigo]) codigo = NOME_SERVICO_CP[codigo];
      if (!nome || f.id === 'cp') {
        const pu = primeiraUltima.get(r.route_id) as { inicio?: string; fim?: string } | undefined;
        if (pu?.inicio && pu?.fim) nome = `${nomeBonito(pu.inicio)} – ${nomeBonito(pu.fim)}`;
      }
      if (f.id === 'metro_lisboa' && nome && !/^linha/i.test(nome)) { codigo = `Linha ${nome}`; nome = ''; }
      nome = nome.replace(/\s+-\s+/g, ' – ');
      if (!codigo && !nome) continue;
      let s = slug(`${codigo} ${nome}`, 70);
      if (usados.has(s)) { let n = 2; while (usados.has(`${s}-${n}`)) n++; s = `${s}-${n}`; }
      usados.add(s);
      const sigla = original && original.length <= 5 ? original
        : f.id === 'cp' ? 'CP'
        : (codigo || nome).split(/\s+/).filter((p) => !/^(de|da|do|dos|das|e)$/i.test(p)).map((p) => p[0]).join('').slice(0, 4).toUpperCase();
      const linha: Linha = { routeId: r.route_id, feedId: f.id, slug: s, codigo, sigla, nome, tipo: Number(r.route_type ?? 3), cor: (r.route_color || '').replace(/^#?/, '#') };
      op.linhas.push(linha);
      linhaPorSlug.set(`${opSlug}/${s}`, linha);
      linhaPorRoute.set(r.route_id, linha);
    }
    if (op.linhas.length === 0) continue;

    // Paragens: as do mesmo nome a menos de 300 m (os dois lados da rua, cais da mesma estação) ficam juntas
    const paragens = db.prepare(`SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE feed_id = ? AND COALESCE(location_type, 0) = 0 ORDER BY stop_id`).all(f.id) as Array<{ stop_id: string; stop_name: string; stop_lat: number; stop_lon: number }>;
    const porNome = new Map<string, GrupoParagem[]>();
    // Operadores sem horários na base (ex.: Carris Metropolitana, que vem da API em tempo real):
    // entram todas as paragens
    const temViagens = Boolean(db.prepare('SELECT 1 FROM trips WHERE feed_id = ? LIMIT 1').get(f.id));
    for (const p of paragens) {
      if (temViagens && !comHorarios.has(p.stop_id)) continue;
      if (!Number.isFinite(p.stop_lat) || !Number.isFinite(p.stop_lon) || !p.stop_name || p.stop_name.trim().length < 2) continue;
      const chave = semAcentos(p.stop_name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const lista = porNome.get(chave) || [];
      const perto = lista.find((g) => distM(g, { lat: p.stop_lat, lon: p.stop_lon }) < 300);
      if (perto) {
        perto.stopIds.push(p.stop_id);
        const n = perto.stopIds.length;
        perto.lat += (p.stop_lat - perto.lat) / n;
        perto.lon += (p.stop_lon - perto.lon) / n;
      } else {
        lista.push({ id: p.stop_id, feedId: f.id, slug: '', nome: nomeBonito(p.stop_name), lat: p.stop_lat, lon: p.stop_lon, stopIds: [p.stop_id] });
        porNome.set(chave, lista);
      }
    }
    const usadosP = new Set<string>();
    const grupos = Array.from(porNome.values()).flat().sort((a, b) => a.id.localeCompare(b.id));
    for (const g of grupos) {
      let s = slug(g.nome, 70);
      if (usadosP.has(s)) { let n = 2; while (usadosP.has(`${s}-${n}`)) n++; s = `${s}-${n}`; }
      usadosP.add(s);
      g.slug = s;
      op.paragens.push(g);
      paragemPorSlug.set(`${opSlug}/${s}`, g);
      for (const id of g.stopIds) grupoPorStop.set(id, g);
      const c = celula(g.lat, g.lon);
      grelha.set(c, [...(grelha.get(c) || []), g]);
    }
    op.linhas.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt'));
    op.paragens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    operadores.push(op);
    porSlugOperador.set(opSlug, op);
  }
  const ordemRegiao = ['Lisboa', 'Porto', 'Todo o país', 'Minho', 'Coimbra', 'Algarve', 'Madeira', 'Outros'];
  operadores.sort((a, b) => ordemRegiao.indexOf(a.regiao) - ordemRegiao.indexOf(b.regiao) || b.linhas.length - a.linhas.length);
  console.log(`[SEO] Índice: ${operadores.length} operadores, ${linhaPorRoute.size} linhas, ${paragemPorSlug.size} paragens (${Date.now() - t0} ms)`);
  return { versao: versaoAtual(), operadores, porSlugOperador, linhaPorSlug, linhaPorRoute, paragemPorSlug, grupoPorStop, grelha };
}

/** Índice atual (refeito em segundo plano quando chega uma base de horários nova). */
export function obterIndice(): Indice | null {
  const v = versaoAtual();
  if (!indice || (indice.versao !== v && !aConstruir)) {
    if (!indice) {
      try { indice = construir(); } catch (err: any) { console.warn('[SEO] Índice falhou:', err?.message || err); return null; }
    } else {
      aConstruir = true;
      setTimeout(() => {
        try { indice = construir(); } catch (err: any) { console.warn('[SEO] Índice falhou:', err?.message || err); }
        aConstruir = false;
      }, 50);
    }
  }
  return indice;
}

export function paragensPerto(lat: number, lon: number, raio = 400, max = 12): Array<{ g: GrupoParagem; d: number }> {
  const ix = obterIndice();
  if (!ix) return [];
  const out: Array<{ g: GrupoParagem; d: number }> = [];
  const la = Math.floor(lat * 100);
  const lo = Math.floor(lon * 80);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const g of ix.grelha.get(`${la + i}:${lo + j}`) || []) {
        const d = distM({ lat, lon }, g);
        if (d <= raio) out.push({ g, d });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d).slice(0, max);
}

export function operadorDoFeed(feedId: string): Operador | undefined {
  return obterIndice()?.operadores.find((o) => o.feedId === feedId);
}
