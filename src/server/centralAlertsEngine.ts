import { 
  CentralAlert, 
  CentralAlertType, 
  CentralAlertStatus, 
  AlertCenterDiagnostic 
} from '../types/alerts';
import { getTmlAlerts, getTmlAgencies, getTmlLines, TmlAlertRaw, alertasTmlEmFalha } from './tmlGoHubService';
import { DateTime } from 'luxon';
import { arquivarAvisos } from './historico';
import { grevesDasNoticias, noticiasDeGreves, avisoGreveOficial } from './grevesNoticias';
import { podarMapa } from './cacheLimitada';
import { lerAvisosDosOperadores, FONTE_AVISOS_OPERADORES } from './avisosOperadores';

// In-memory central alert repository with deduplication and state tracking
interface CentralAlertsState {
  alerts: Map<string, CentralAlert>;
  lastSync: number;
  sourcesErrorList: Array<{ source: string; error: string; last_attempt: string }>;
  notificationsSentCount: number;
  duplicatesAvoidedCount: number;
}

const centralState: CentralAlertsState = {
  alerts: new Map(),
  lastSync: 0,
  sourcesErrorList: [],
  notificationsSentCount: 0,
  duplicatesAvoidedCount: 0,
};

// Compute dynamic status based on current time
export function computeAlertStatus(
  startDatetime: string, 
  endDatetime?: string | null,
  isCancelled: boolean = false
): CentralAlertStatus {
  if (isCancelled) return 'Cancelado';
  const now = Date.now();
  const start = new Date(startDatetime).getTime();
  const end = endDatetime ? new Date(endDatetime).getTime() : null;

  if (start > now) {
    return 'Futuro';
  }
  if (end && end <= now) {
    return 'Terminado';
  }
  return 'Ativo';
}

// Generate simple content hash to detect genuine content changes (anti-spam)
function generateContentHash(title: string, desc: string, start: string, end?: string | null): string {
  const str = `${title}|${desc}|${start}|${end || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Plenário de trabalhadores ou aviso de "possíveis constrangimentos" (não é uma greve) */
export function ePlenarioOuConstrangimento(titulo: string, texto = ''): boolean {
  const t = `${titulo} ${texto}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\bplenario|\bposs[iy]ve(?:l|is) constrangimento|\bconstrangimentos? (?:na|no|nas|nos) (?:circulacao|servico|oferta)/.test(t);
}

// Classify raw alert cause/effect/text into one of the 13 canonical types
export function classifyAlertType(title: string, desc: string, cause?: string, effect?: string): CentralAlertType {
  const fullText = `${title} ${desc} ${cause || ''} ${effect || ''}`.toLowerCase();

  // Plenários de trabalhadores e "possíveis constrangimentos" não são greves (ex.: plenário na Alsa Todi): ficam como
  // perturbação possível, mesmo que a fonte os marque com a causa STRIKE. Só é greve se o título disser greve.
  if (ePlenarioOuConstrangimento(title, desc) && !/\bgreve/i.test(title)) {
    return 'atraso significativo';
  }
  if (cause?.toUpperCase() === 'STRIKE' || fullText.includes('greve') || fullText.includes('paralisação')) {
    return 'greve';
  }
  if (effect?.toUpperCase() === 'NO_SERVICE' || fullText.includes('interrompida') || fullText.includes('interrupção')) {
    return 'interrupção';
  }
  if (fullText.includes('linha suspensa') || fullText.includes('suspensão de linha') || fullText.includes('circulação suspensa')) {
    return 'linha suspensa';
  }
  if (fullText.includes('paragem encerrada') || fullText.includes('paragem suprimida') || fullText.includes('paragem desativada') || fullText.includes('supressão de paragem')) {
    return 'paragem encerrada';
  }
  if (effect?.toUpperCase() === 'SIGNIFICANT_DELAYS' || fullText.includes('atraso significativo') || fullText.includes('demoras acentuadas') || fullText.includes('perturbação')) {
    return 'atraso significativo';
  }
  if (effect?.toUpperCase() === 'DETOUR' || fullText.includes('desvio') || fullText.includes('itinerário alternativo')) {
    return 'desvio';
  }
  if (cause?.toUpperCase() === 'MAINTENANCE' || fullText.includes('obras') || fullText.includes('trabalhos na via') || fullText.includes('pavimentação') || fullText.includes('condicionamento')) {
    return 'obras';
  }
  if (fullText.includes('alteração de percurso') || fullText.includes('mudança de percurso') || fullText.includes('novo percurso')) {
    return 'alteração de percurso';
  }
  if (effect?.toUpperCase() === 'ADDITIONAL_SERVICE' || fullText.includes('reforço de serviço') || fullText.includes('reforço')) {
    return 'reforço de serviço';
  }
  if (fullText.includes('novo horário') || fullText.includes('novos horários')) {
    return 'novo horário';
  }
  if (fullText.includes('alteração de horário') || fullText.includes('horário de verão') || fullText.includes('horário de inverno') || fullText.includes('ajuste de horário')) {
    return 'alteração de horário';
  }
  if (fullText.includes('cancelamento') || fullText.includes('viagem cancelada') || fullText.includes('comboio suprimido')) {
    return 'cancelamento';
  }

  return 'outros alertas oficiais';
}

// Extract geographic region and municipalities from text and operator
export function extractGeoEntities(text: string, operator: string): {
  regiao: string;
  municipios: string[];
} {
  const lower = text.toLowerCase();
  const opLower = operator.toLowerCase();

  const concelhosPorto = [
    'porto', 'vila nova de gaia', 'gaia', 'matosinhos', 'maia', 'gondomar',
    'valongo', 'póvoa de varzim', 'vila do conde', 'santo tirso', 'trofa',
    'paredes', 'penafiel', 'espinho', 'santa maria da feira', 'oliveira de azeméis', 'vale de cambra', 'arouca'
  ];

  const concelhosLisboa = [
    'lisboa', 'sintra', 'cascais', 'amadora', 'odivelas', 'loures', 'oeiras',
    'vila franca de xira', 'mafra', 'almada', 'setúbal', 'seixal', 'barreiro',
    'moita', 'montijo', 'palmela', 'sesimbra', 'alcochete'
  ];

  const concelhosBraga = ['braga', 'guimarães', 'famalicão', 'barcelos', 'esposende'];
  const concelhosCoimbra = ['coimbra', 'figueira da foz', 'cantanhede'];
  const concelhosAlgarve = ['faro', 'portimão', 'olhão', 'lagos', 'loulé', 'albufeira'];

  const foundMunicipios: string[] = [];

  // Palavra inteira: "transporte" não pode contar como "Porto"
  const temPalavra = (c: string) => new RegExp(`(^|[^a-zà-ÿ])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zà-ÿ])`).test(lower);
  for (const c of [...concelhosPorto, ...concelhosLisboa, ...concelhosBraga, ...concelhosCoimbra, ...concelhosAlgarve]) {
    if (temPalavra(c)) {
      const formatted = c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!foundMunicipios.includes(formatted)) {
        foundMunicipios.push(formatted);
      }
    }
  }

  let regiao = 'Nacional';

  const operadorLisboa = opLower.includes('carris') || opLower.includes('metropolitano de lisboa') || opLower.includes('metro lisboa') || opLower.includes('fertagus') || opLower.includes('transtejo') || opLower.includes('mts');
  const operadorPorto = opLower.includes('unir') || opLower.includes('stcp') || opLower.includes('metro do porto');
  // O operador manda: um alerta da Carris Metropolitana que fale do "Porto de Abrigo" de Sesimbra continua a ser de Lisboa
  if (operadorPorto || (!operadorLisboa && foundMunicipios.some(m => concelhosPorto.map(c => c.toLowerCase()).includes(m.toLowerCase())))) {
    regiao = 'Área Metropolitana do Porto';
  } else if (operadorLisboa || foundMunicipios.some(m => concelhosLisboa.map(c => c.toLowerCase()).includes(m.toLowerCase()))) {
    regiao = 'Área Metropolitana de Lisboa';
  } else if (opLower.includes('tub') || foundMunicipios.some(m => concelhosBraga.map(c => c.toLowerCase()).includes(m.toLowerCase()))) {
    regiao = 'Cávado / Minho';
  } else if (opLower.includes('smtuc') || foundMunicipios.some(m => concelhosCoimbra.map(c => c.toLowerCase()).includes(m.toLowerCase()))) {
    regiao = 'Região de Coimbra';
  } else if (foundMunicipios.some(m => concelhosAlgarve.map(c => c.toLowerCase()).includes(m.toLowerCase()))) {
    regiao = 'Algarve';
  }

  return {
    regiao,
    municipios: foundMunicipios.length > 0 ? foundMunicipios : (regiao === 'Área Metropolitana do Porto' ? ['Porto'] : (regiao === 'Área Metropolitana de Lisboa' ? ['Lisboa'] : ['Portugal'])),
  };
}

/** A fonte respondeu sem avisos nenhuns: os que havia dela deixam de contar */
function retirarTodos(fonte: string): void {
  const prefixo = `${fonte}:`;
  for (const [chave, alerta] of centralState.alerts) {
    if (chave.startsWith(prefixo) && alerta.status !== 'Terminado' && alerta.status !== 'Cancelado') { alerta.status = 'Cancelado'; alerta.last_update = new Date().toISOString(); }
  }
}

// Alerta que a fonte deixou de publicar (retirado antes do fim previsto): deixa de contar como ativo.
// Só se aplica quando a fonte respondeu com avisos (uma resposta vazia pode ser uma falha).
function retirarDesaparecidos(fonte: string, vistos: Set<string>): void {
  if (vistos.size === 0) return;
  const prefixo = `${fonte}:`;
  for (const [chave, alerta] of centralState.alerts) {
    if (chave.startsWith(prefixo) && !vistos.has(chave) && alerta.status !== 'Terminado' && alerta.status !== 'Cancelado') {
      alerta.status = 'Cancelado';
      alerta.last_update = new Date().toISOString();
    }
  }
}

/** Agências da Carris Metropolitana na plataforma GO da TML (os avisos delas vêm da API da própria Carris Metropolitana) */
const AGENCIAS_TML_CM = new Set(['LA77N', 'BNA17', 'YA15B', 'A2L1N']);
const LINHAS_METRO_LISBOA_TML: Record<string, string> = { '1': 'Azul', '2': 'Amarela', '3': 'Verde', '4': 'Vermelha' };
/**
 * A plataforma da TML tem o mesmo aviso uma vez por cada dia em que acontece (a MobiCascais publicou o desvio da linha 27 no
 * Natal como 7 avisos, cada um com o título e o texto das datas que faltam). Juntam-se os que têm a mesma agência, o mesmo texto (sem as datas) e as
 * mesmas linhas e paragens: fica o da próxima vez que acontece (o que está a decorrer ou o primeiro que ainda não acabou), com
 * esse período, para o estado (Ativo/Futuro) continuar certo, e com um código fixo do grupo.
 */
export function juntarRepetidosTml(lista: TmlAlertRaw[], agoraMs = Date.now()): TmlAlertRaw[] {
  const grupos = new Map<string, TmlAlertRaw[]>();
  const saida: TmlAlertRaw[] = [];
  for (const a of lista) {
    const refs = (a.references || []).map((r) => `${r.parent_id || ''}:${[...(r.child_ids || [])].sort().join(',')}`).sort().join('|');
    // O texto sem as datas: cada repetição traz a lista dos dias que faltam («nos dias 28 e 29 de novembro, 5, 8…»)
    const texto = String(a.description || '').toLowerCase()
      .replace(/\b(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g, ' ')
      .replace(/\b(dias?|de|e)\b/g, ' ').replace(/\d+/g, ' ').replace(/[,.;:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto) { saida.push(a); continue; }
    const k = `${a.agency_id || ''}|${a.cause || ''}|${a.effect || ''}|${refs}|${texto}`;
    const g = grupos.get(k);
    if (g) g.push(a); else grupos.set(k, [a]);
  }
  for (const [k, g] of grupos) {
    if (g.length === 1) { saida.push(g[0]); continue; }
    const ordem = [...g].sort((x, y) => (x.active_period_start_date || 0) - (y.active_period_start_date || 0));
    const proximo = ordem.find((x) => !x.active_period_end_date || x.active_period_end_date >= agoraMs) || ordem[ordem.length - 1];
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
    saida.push({ ...proximo, _id: `grupo-${(h >>> 0).toString(36)}` });
  }
  return saida;
}

/** Nome do operador de uma agência da TML, como a app o escreve nas outras fontes */
export function operadorDaAgenciaTml(id: string | undefined, nome?: string): string | null {
  const porId: Record<string, string> = {
    IA9T6: 'Carris', IA2N9: 'Metro de Lisboa', HF16N: 'MobiCascais', N18KL: 'CP', LTP61: 'Transtejo Soflusa',
    A3H3M: 'TCB Barreiro', '7NTB1': 'Fertagus', KB1F6: 'Metro Sul do Tejo',
    KJTOU: 'UNIR', '1H6XC': 'UNIR', OP1VZ: 'UNIR', VZAS3: 'UNIR', '8NDX4': 'UNIR',
  };
  if (id && porId[id]) return porId[id];
  if (id && AGENCIAS_TML_CM.has(id)) return 'Carris Metropolitana';
  const n = String(nome || '').trim();
  return n ? (/^unir$/i.test(n) ? 'UNIR' : n) : null;
}

// Ingest TML GO Hub Official Alerts (Real GTFS-RT endpoint)
async function ingestTmlAlerts(): Promise<number> {
  const sourceName = 'TML GO Hub';
  const sourceUrl = 'https://go.tmlmobilidade.pt';

  try {
    const brutos = await getTmlAlerts();
    // a TML devolve [] quando falha: conta como falha da fonte (para os avisos sem fim não ficarem para sempre)
    if (alertasTmlEmFalha()) throw new Error('API de alertas da TML sem resposta');
    const rawAlerts = juntarRepetidosTml(brutos);
    const agencias = new Map((await getTmlAgencies().catch(() => [])).map((ag) => [ag._id, String(ag.name || '')]));
    let imported = 0;
    const vistos = new Set<string>();

    for (const raw of rawAlerts) {
      // Os da Carris Metropolitana chegam pela API dela (ingestCarrisMetropolitanaAlerts): aqui repetiam-se
      if (raw.agency_id && AGENCIAS_TML_CM.has(raw.agency_id)) continue;
      const extId = raw._id || `tml-${raw.title || ''}-${raw.active_period_start_date || 0}`;
      const key = `${sourceName}:${extId}`;
      vistos.add(key);

      const title = raw.title?.trim() || 'Aviso de Circulação';
      const desc = raw.description?.trim() || 'Aviso oficial emitido pela autoridade de transportes.';

      const start = raw.active_period_start_date 
        ? new Date(raw.active_period_start_date).toISOString() 
        : new Date().toISOString();
      const end = raw.active_period_end_date 
        ? new Date(raw.active_period_end_date).toISOString() 
        : null;

      const published = start;
      const status = computeAlertStatus(start, end, false);
      const tipo = classifyAlertType(title, desc, raw.cause, raw.effect);

      const rawLines: string[] = [];
      const rawStops: string[] = [];
      if (raw.references && Array.isArray(raw.references)) {
        raw.references.forEach((ref) => {
          if (ref.parent_id) {
            let clean = String(ref.parent_id).replace(/^\[.*?\]/, '').trim();
            // Metro de Lisboa: a TML numera as linhas (1 Azul, 2 Amarela, 3 Verde, 4 Vermelha); a app chama-as pela cor
            if (raw.agency_id === 'IA2N9' && LINHAS_METRO_LISBOA_TML[clean]) clean = LINHAS_METRO_LISBOA_TML[clean];
            if (clean) rawLines.push(clean);
          }
          if (ref.child_ids && Array.isArray(ref.child_ids)) {
            rawStops.push(...ref.child_ids);
          }
        });
      }

      const lines = Array.from(new Set(rawLines));
      const stops = Array.from(new Set(rawStops));

      // Operador pela agência do aviso (nome como a app o escreve); sem agência conhecida, pelo texto, como antes
      let operador = operadorDaAgenciaTml(raw.agency_id, agencias.get(String(raw.agency_id || ''))) || 'Carris Metropolitana';
      const full = `${title} ${desc} ${lines.join(' ')}`.toLowerCase();
      // Sem agência conhecida, nunca se adivinha a UNIR pelo texto ("transporte" contém "porto" e as linhas 3xxx de
      // Sesimbra/Setúbal passavam por UNIR): só a agência diz que é da UNIR.
      if (operador !== 'Carris Metropolitana') {
        // já se sabe pela agência
      } else if (full.includes('fertagus')) {
        operador = 'Fertagus';
      } else if (full.includes('transtejo') || full.includes('soflusa')) {
        operador = 'Transtejo Soflusa';
      }

      const { regiao, municipios } = extractGeoEntities(`${title} ${desc}`, operador);
      const contentHash = generateContentHash(title, desc, start, end);

      const existing = centralState.alerts.get(key);
      if (existing) {
        // If content changed or dates updated, update existing record
        if (existing.content_hash !== contentHash || existing.status !== status) {
          existing.título = title;
          existing.descrição = desc;
          existing.start_datetime = start;
          existing.end_datetime = end;
          existing.status = status;
          existing.tipo = tipo;
          existing.last_update = new Date().toISOString();
          existing.content_hash = contentHash;
        }
        centralState.duplicatesAvoidedCount++;
      } else {
        const newAlert: CentralAlert = {
          id: `alert-tml-${extId}`,
          external_id: extId,
          tipo,
          título: title,
          descrição: desc,
          operador,
          linhas: lines,
          paragens: stops.slice(0, 10),
          região: regiao,
          municípios: municipios,
          start_datetime: start,
          end_datetime: end,
          published_datetime: published,
          source: sourceName,
          source_url: raw.info_url || sourceUrl,
          last_update: new Date().toISOString(),
          status,
          content_hash: contentHash,
          severity: raw.effect === 'NO_SERVICE' || tipo === 'greve' ? 'Grave' : 'Moderada',
        };
        centralState.alerts.set(key, newAlert);
        imported++;
      }
    }

    retirarDesaparecidos(sourceName, vistos);
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({
      source: sourceName,
      error: err.message || 'Falha ao aceder à API TML Alertas',
      last_attempt: new Date().toISOString(),
    });
    return 0;
  }
}

// Ingest Carris Metropolitana Official GTFS-RT Feed
async function ingestCarrisMetropolitanaAlerts(): Promise<number> {
  const sourceName = 'Carris Metropolitana (GTFS-RT)';
  const sourceUrl = 'https://www.carrismetropolitana.pt';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // (o endereço antigo /alerts só redireciona para /v2/alerts; a plataforma GO da TML também os tem, mas lá saltam-se para não se repetirem)
    const res = await fetch('https://api.carrismetropolitana.pt/v2/alerts', {
      headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) return 0;

    let imported = 0;
    const vistos = new Set<string>();
    for (const a of data) {
      const extId = a.id || `${a.cause || 'alert'}-${a.active_period?.[0]?.start || 0}`;
      const key = `${sourceName}:${extId}`;
      vistos.add(key);

      const title = a.header_text?.translation?.[0]?.text?.trim() ||
                    (typeof a.header_text === 'string' ? a.header_text.trim() : '') ||
                    a.cause || 'Condicionamento Carris Metropolitana';

      const desc = a.description_text?.translation?.[0]?.text?.trim() ||
                   (typeof a.description_text === 'string' ? a.description_text.trim() : '') ||
                   'Alteração oficial de serviço.';

      const start = a.active_period?.[0]?.start 
        ? new Date(a.active_period[0].start * 1000).toISOString() 
        : new Date().toISOString();
      const end = a.active_period?.[0]?.end 
        ? new Date(a.active_period[0].end * 1000).toISOString() 
        : null;

      const rawLines: string[] = [];
      const rawStops: string[] = [];
      if (Array.isArray(a.informed_entity)) {
        a.informed_entity.forEach((e: any) => {
          if (e.route_id) {
            const clean = String(e.route_id).replace(/^\[.*?\]/, '').trim();
            if (clean) rawLines.push(clean);
          }
          if (e.stop_id) rawStops.push(e.stop_id);
        });
      }

      const lines = Array.from(new Set(rawLines));
      const stops = Array.from(new Set(rawStops));

      const status = computeAlertStatus(start, end, false);
      const tipo = classifyAlertType(title, desc, a.cause, a.effect);
      const { regiao, municipios } = extractGeoEntities(`${title} ${desc}`, 'Carris Metropolitana');
      const contentHash = generateContentHash(title, desc, start, end);

      const existing = centralState.alerts.get(key);
      if (existing) {
        if (existing.content_hash !== contentHash || existing.status !== status) {
          existing.título = title;
          existing.descrição = desc;
          existing.start_datetime = start;
          existing.end_datetime = end;
          existing.status = status;
          existing.tipo = tipo;
          existing.last_update = new Date().toISOString();
          existing.content_hash = contentHash;
        }
        centralState.duplicatesAvoidedCount++;
      } else {
        const newAlert: CentralAlert = {
          id: `alert-carris-${extId}`,
          external_id: extId,
          tipo,
          título: title,
          descrição: desc,
          operador: 'Carris Metropolitana',
          linhas: lines,
          paragens: stops.slice(0, 10),
          região: regiao,
          municípios: municipios,
          start_datetime: start,
          end_datetime: end,
          published_datetime: start,
          source: sourceName,
          source_url: a.url?.translation?.[0]?.text || sourceUrl,
          last_update: new Date().toISOString(),
          status,
          content_hash: contentHash,
          severity: a.effect === 'NO_SERVICE' || tipo === 'greve' ? 'Grave' : 'Moderada',
        };
        centralState.alerts.set(key, newAlert);
        imported++;
      }
    }

    retirarDesaparecidos(sourceName, vistos);
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({
      source: sourceName,
      error: err.message || 'Falha ao aceder ao endpoint Carris Metropolitana',
      last_attempt: new Date().toISOString(),
    });
    return 0;
  }
}

// Letras acentuadas e símbolos que a página do Metro escreve como entidades HTML
const ENTIDADES_HTML: Record<string, string> = {
  ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É',
  iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê',
  ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À', nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ordm: 'º', ordf: 'ª',
};
function textoDeHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES_HTML[nome] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

// Metro de Lisboa: estado das 4 linhas, lido do painel oficial que o próprio site usa
// (https://app.metrolisboa.pt/status/estado_Linhas.php). Cada linha traz "Circulação normal"
// ou o texto da perturbação. O aviso mantém o mesmo id enquanto durar e termina quando a linha
// volta ao normal.
async function ingestMetroLisboaAlerts(): Promise<number> {
  const sourceName = 'Metropolitano de Lisboa';
  const sourceUrl = 'https://www.metrolisboa.pt/viajar/estado-das-linhas/';
  const estadoUrl = 'https://app.metrolisboa.pt/status/estado_Linhas.php';

  try {
    const res = await fetch(estadoUrl, {
      headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const filas = html.split(/<tr[\s>]/i).slice(1);
    let linhasLidas = 0;
    let imported = 0;
    const agoraIso = new Date().toISOString();

    for (const fila of filas) {
      const nome = /alt="Linha\s+([^"]+)"/i.exec(fila)?.[1]?.trim();
      if (!nome) continue;
      linhasLidas++;
      const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
      const extId = `ml-${slug}`;
      const key = `${sourceName}:${extId}`;
      const existing = centralState.alerts.get(key);

      const semPerturbacao = /class="[^"]*semperturbacao/i.test(fila);
      const itens = Array.from(fila.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((m) => textoDeHtml(m[1])).filter(Boolean);
      const normal = semPerturbacao || itens.length === 0 || itens.every((x) => /^circula[cç][aã]o normal$/i.test(x));

      if (normal) {
        // A linha voltou ao normal: o aviso termina agora
        if (existing && existing.status === 'Ativo') {
          existing.end_datetime = agoraIso;
          existing.status = 'Terminado';
          existing.last_update = agoraIso;
        }
        continue;
      }

      const texto = itens.join(' · ').slice(0, 500);
      const interrompida = /interrompid|interrup[cç][aã]o|suspens/i.test(texto);
      const tipo: CentralAlertType = interrompida ? 'interrupção' : 'atraso significativo';
      const title = interrompida ? `Circulação interrompida na Linha ${nome} do Metro de Lisboa` : `Perturbação na Linha ${nome} do Metro de Lisboa`;
      const desc = texto;
      const start = existing && existing.status === 'Ativo' ? existing.start_datetime : agoraIso;
      const contentHash = generateContentHash(title, desc, start);

      if (existing) {
        if (existing.content_hash !== contentHash || existing.status !== 'Ativo') {
          existing.título = title;
          existing.descrição = desc;
          existing.tipo = tipo;
          existing.start_datetime = start;
          existing.end_datetime = null;
          existing.status = 'Ativo';
          existing.severity = interrompida ? 'Grave' : 'Moderada';
          existing.last_update = agoraIso;
          existing.content_hash = contentHash;
        }
        centralState.duplicatesAvoidedCount++;
        continue;
      }
      centralState.alerts.set(key, {
        id: `alert-${extId}`,
        external_id: extId,
        tipo,
        título: title,
        descrição: desc,
        operador: 'Metropolitano de Lisboa',
        linhas: [`Linha ${nome}`],
        paragens: [],
        região: 'Área Metropolitana de Lisboa',
        municípios: ['Lisboa', 'Amadora'],
        start_datetime: start,
        end_datetime: null,
        published_datetime: start,
        source: sourceName,
        source_url: sourceUrl,
        last_update: agoraIso,
        status: 'Ativo',
        content_hash: contentHash,
        severity: interrompida ? 'Grave' : 'Moderada',
      });
      imported++;
    }

    // Se o painel mudou e já não se encontra nenhuma linha, regista-se a falha (e nada é dado como terminado)
    if (linhasLidas === 0) throw new Error('Painel do Metro de Lisboa sem linhas reconhecidas');
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({
      source: sourceName,
      error: err.message || 'Falha ao aceder ao portal do Metro de Lisboa',
      last_attempt: new Date().toISOString(),
    });
    return 0;
  }
}

// Ingest IPMA Severe Weather & Transport Impact Warnings
async function ingestIpmaAlerts(): Promise<number> {
  const sourceName = 'IPMA - Instituto Português do Mar e da Atmosfera';
  const sourceUrl = 'https://www.ipma.pt';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', {
      headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return 0;
    const json = await res.json();
    if (!Array.isArray(json)) return 0;

    let imported = 0;
    // Map of districts
    const districtCodes: Record<string, string> = {
      AVR: 'Aveiro', BJA: 'Beja', BRG: 'Braga', BGC: 'Bragança',
      CBO: 'Castelo Branco', CBR: 'Coimbra', EVR: 'Évora', FAR: 'Faro',
      GDA: 'Guarda', LRA: 'Leiria', LSB: 'Lisboa', PTG: 'Portalegre',
      PRT: 'Porto', STR: 'Santarém', STB: 'Setúbal', VCT: 'Viana do Castelo',
      VRL: 'Vila Real', VIS: 'Viseu',
    };

    const severeWarnings = json.filter(w => w.awarenessLevelID === 'orange' || w.awarenessLevelID === 'red');

    for (const w of severeWarnings.slice(0, 10)) {
      const distName = districtCodes[w.idAreaAviso] || w.idAreaAviso;
      const extId = `ipma-${w.idAreaAviso}-${w.startTime || ''}`;
      const key = `${sourceName}:${extId}`;

      const title = `Aviso do IPMA: risco meteorológico severo no distrito de ${distName}`;
      const desc = `${w.text || 'Condições meteorológicas extremas com forte impacto na circulação e transportes públicos.'} Nível de aviso: ${w.awarenessLevelID?.toUpperCase()}.`;

      const start = w.startTime ? new Date(w.startTime).toISOString() : new Date().toISOString();
      const end = w.endTime ? new Date(w.endTime).toISOString() : null;
      const status = computeAlertStatus(start, end, false);

      const contentHash = generateContentHash(title, desc, start, end);
      const existing = centralState.alerts.get(key);

      if (existing) {
        if (existing.status !== status || existing.content_hash !== contentHash) {
          existing.status = status;
          existing.content_hash = contentHash;
          existing.last_update = new Date().toISOString();
        }
        centralState.duplicatesAvoidedCount++;
      } else {
        const newAlert: CentralAlert = {
          id: `alert-ipma-${extId}`,
          external_id: extId,
          tipo: 'outros alertas oficiais',
          título: title,
          descrição: desc,
          operador: 'IPMA / Proteção Civil',
          linhas: [],
          paragens: [],
          região: distName === 'Porto' ? 'Área Metropolitana do Porto' : (distName === 'Lisboa' ? 'Área Metropolitana de Lisboa' : distName),
          municípios: [distName],
          start_datetime: start,
          end_datetime: end,
          published_datetime: start,
          source: sourceName,
          source_url: 'https://www.ipma.pt/pt/otempo/prec-radar/',
          last_update: new Date().toISOString(),
          status,
          content_hash: contentHash,
          severity: w.awarenessLevelID === 'red' ? 'Grave' : 'Moderada',
        };
        centralState.alerts.set(key, newAlert);
        imported++;
      }
    }

    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({
      source: sourceName,
      error: err.message || 'Falha ao aceder à API IPMA',
      last_attempt: new Date().toISOString(),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------------
// CP — avisos oficiais (os mesmos de https://www.cp.pt/avisos). O site da CP lê-os deste endereço público, em JSON
// (conteúdos do Liferay): título, resumo, data de início, data de fim e texto. As datas vêm só com o dia: a greve de
// "23/11 a 27/11" vale do início do dia 23 ao fim do dia 27 (hora de Lisboa).
// ---------------------------------------------------------------------------------
export const CP_AVISOS_URL = 'https://www.cp.pt/bei/getContentsList?path=PWA/Homepage/Avisos&itensPage=50&page=1&order=priority:desc';
const MESES_PT = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function campoCp(campos: any[], nome: string, etiqueta: RegExp): string {
  const c = campos.find((x) => x?.name === nome) || campos.find((x) => etiqueta.test(String(x?.label || '')));
  const v = c?.contentFieldValue?.data;
  return typeof v === 'string' ? v : '';
}

/** Dia (hora de Lisboa) de uma data da CP ("2026-11-23T00:00:00Z") */
function diaCp(valor: string): DateTime | null {
  if (!valor) return null;
  const d = DateTime.fromISO(valor, { zone: 'Europe/Lisbon' });
  return d.isValid ? d.startOf('day') : null;
}

/**
 * Outros dias com perturbações que o aviso refere ("poderão ocorrer perturbações nos dias 22 e 28 de novembro"):
 * datas (AAAA-MM-DD) fora do período principal, para a página das greves as mostrar à parte.
 */
export function diasDePerturbacao(texto: string, inicio: DateTime, fim: DateTime): string[] {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dias = new Set<string>();
  for (const frase of t.split(/(?<=[.;!?\n])\s+/)) {
    if (!/perturba/.test(frase)) continue;
    const re = new RegExp(`((?:\\b\\d{1,2}\\s*(?:,|e)\\s*)*\\b\\d{1,2})\\s+de\\s+(${MESES_PT.join('|')})`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(frase))) {
      const mes = MESES_PT.indexOf(m[2]) + 1;
      for (const n of m[1].split(/\s*(?:,|e)\s*/).map(Number)) {
        if (!(n >= 1 && n <= 31)) continue;
        // o ano é o do período principal (ou o seguinte, se o mês já passou: aviso de dezembro para janeiro)
        let d = DateTime.fromObject({ year: inicio.year, month: mes, day: n }, { zone: 'Europe/Lisbon' });
        if (d.isValid && d < inicio.minus({ months: 6 })) d = d.plus({ years: 1 });
        if (!d.isValid || (d >= inicio.startOf('day') && d <= fim)) continue;
        dias.add(d.toISODate()!);
      }
    }
  }
  return [...dias].sort();
}

/** Greve que só afeta serviços a bordo (cafetaria, bar, restauração de um concessionário) e não a circulação dos comboios */
export function greveSoDeServicosABordo(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const servicos = /\b(cafetaria|bar|restauracao|catering|refeicoes|concessionari[oa])\b/.test(t);
  const circulacao = /\b(supress\w*|suprimid\w*|servicos minimos|nao se realiz\w*|cancelad\w*|perturbacoes na circulacao)\b/.test(t);
  return servicos && !circulacao;
}

/** Um aviso da CP no formato dos alertas centrais (null se não tiver data de início) */
const MESES_TEXTO = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Fim escrito num aviso sem data de fim: «até 31 de dezembro», «até ao dia 15 de janeiro de 2027» (o último que aparecer,
 *  depois do início); null se não houver */
export function fimNoTexto(texto: string, inicio: DateTime): DateTime | null {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let fim: DateTime | null = null;
  for (const m of t.matchAll(new RegExp(`\\b(?:ate|termina\\w*|terminam?|vigora\\w* ate|prolonga\\w* ate)(?: ao| a| o)?(?: dia)? (\\d{1,2}) de (${MESES_TEXTO.join('|')})(?: de (\\d{4}))?`, 'g'))) {
    const mes = MESES_TEXTO.indexOf(m[2]) + 1;
    let d = DateTime.fromObject({ year: m[3] ? Number(m[3]) : inicio.year, month: mes, day: Number(m[1]) }, { zone: 'Europe/Lisbon' });
    if (!d.isValid) continue;
    if (!m[3] && d < inicio.startOf('day')) d = d.plus({ years: 1 });
    if (d >= inicio.startOf('day') && d <= inicio.plus({ years: 2 }) && (!fim || d > fim)) fim = d.endOf('day');
  }
  return fim;
}

export function avisoDaCp(item: any, agoraIso = new Date().toISOString()): CentralAlert | null {
  const campos: any[] = item?.contentFields?.['pt-PT'] || (Array.isArray(item?.contentFields) ? item.contentFields : []);
  const titulo = textoDeHtml(campoCp(campos, 'Text48691729', /^t[ií]tulo/i) || String(item?.title?.['pt-PT'] || '').replace(/\s*\|.*$/, ''));
  const lead = textoDeHtml(campoCp(campos, 'Campo69402820', /^lead/i));
  const corpo = textoDeHtml(campoCp(campos, 'RichText98970637', /^texto$/i));
  const inicio = diaCp(campoCp(campos, 'Date35268359', /in[ií]cio/i));
  const fimDia = diaCp(campoCp(campos, 'Field40441023', /\bfim\b/i));
  if (!titulo || !inicio) return null;
  // sem «Data de fim»: o fim escrito no texto («até 31 de dezembro», «até ao dia 15 de janeiro de 2027»)
  const fim = fimDia ? fimDia.endOf('day') : fimNoTexto(`${titulo}. ${lead}. ${corpo}`, inicio);
  const extId = String(item?.friendlyUrlPath || item?.id || titulo);
  const descricao = [lead, corpo].filter(Boolean).join(' — ').slice(0, 1500);
  let tipo = classifyAlertType(titulo, `${lead} ${corpo}`);
  // Greve só de serviços a bordo (cafetaria e bar do concessionário, 25/11/2026): os comboios circulam, não é uma greve da CP
  if (tipo === 'greve' && greveSoDeServicosABordo(`${titulo} ${lead} ${corpo}`)) tipo = 'outros alertas oficiais';
  const start = inicio.toUTC().toISO()!;
  const end = fim ? fim.toUTC().toISO()! : null;
  const { regiao, municipios } = extractGeoEntities(`${titulo} ${lead} ${corpo}`, 'CP');
  const alerta: CentralAlert = {
    id: `alert-cp-${extId}`,
    external_id: extId,
    tipo,
    título: titulo,
    descrição: descricao || titulo,
    operador: 'CP',
    linhas: [],
    paragens: [],
    região: tipo === 'greve' ? 'Nacional' : regiao,
    municípios: municipios,
    start_datetime: start,
    end_datetime: end,
    published_datetime: String(item?.datePublished || start),
    source: 'CP — avisos oficiais',
    source_url: item?.friendlyUrlPath ? `https://www.cp.pt/pt/detalhe-aviso/${item.friendlyUrlPath}` : 'https://www.cp.pt/avisos',
    last_update: String(item?.dateModified || agoraIso),
    status: computeAlertStatus(start, end, false),
    content_hash: generateContentHash(titulo, descricao, start, end),
    severity: tipo === 'greve' ? 'Grave' : 'Moderada',
  };
  if (tipo === 'greve') {
    const extra = diasDePerturbacao(`${lead}. ${corpo}`, inicio, fim || inicio.endOf('day'));
    if (extra.length) alerta.dias_perturbacao = extra;
  }
  return alerta;
}

async function ingestCpAlerts(): Promise<number> {
  const sourceName = 'CP — avisos oficiais';
  try {
    const res = await fetch(CP_AVISOS_URL, {
      headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0 (https://parou.pt)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    if (!Array.isArray(data?.item)) throw new Error('Resposta da CP sem lista de avisos (o formato mudou?)');
    const itens: any[] = data.item;
    let imported = 0;
    const vistos = new Set<string>();
    let reconhecidos = 0;
    for (const item of itens) {
      const a = avisoDaCp(item);
      if (!a) continue;
      reconhecidos++;
      const key = `${sourceName}:${a.external_id}`;
      vistos.add(key);
      const existing = centralState.alerts.get(key);
      if (existing && existing.content_hash === a.content_hash) { existing.status = a.status; centralState.duplicatesAvoidedCount++; continue; }
      centralState.alerts.set(key, a);
      if (!existing) imported++;
    }
    // avisos na resposta mas nenhum reconhecido: o formato mudou (nada é dado como terminado)
    if (itens.length > 0 && reconhecidos === 0) throw new Error('Avisos da CP sem título ou data reconhecidos (o formato mudou?)');
    // a CP sem avisos nenhuns: os que havia acabaram
    if (itens.length === 0) retirarTodos(sourceName);
    retirarDesaparecidos(sourceName, vistos);
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({ source: sourceName, error: err?.message || 'Falha ao ler os avisos da CP', last_attempt: new Date().toISOString() });
    return 0;
  }
}

// ---------------------------------------------------------------------------------
// Metro do Porto — "Estado das Linhas" da página inicial (https://www.metrodoporto.pt/): uma entrada por linha com "Ok" ou o
// texto da perturbação. Não há API; lê-se a página (no máximo de 2 em 2 min).
// ---------------------------------------------------------------------------------
export interface EstadoLinhaMetroPorto { letra: string; nome: string; estado: string }

/** Linhas e estado lidos do HTML da página inicial da Metro do Porto (lista "Estado das Linhas") */
export function estadoLinhasMetroPorto(html: string): EstadoLinhaMetroPorto[] {
  const i = html.search(/Estado das Linhas/i);
  if (i < 0) return [];
  const fim = html.indexOf('</ul>', i);
  const bloco = html.slice(i, fim > i ? fim : i + 20000);
  const out: EstadoLinhaMetroPorto[] = [];
  for (const m of bloco.matchAll(/<li[\s>]([\s\S]*?)<\/li>/gi)) {
    const li = m[1];
    const img = /<img[^>]*src="[^"]*\/(?:lina|linha)_([a-z])[-_][^"]*"/i.exec(li)?.[1];
    const nome = textoDeHtml(/<h4[^>]*>([\s\S]*?)<\/h4>/i.exec(li)?.[1] || '');
    const estado = textoDeHtml(/class="text widget_field[^"]*"[^>]*>([\s\S]*)$/i.exec(li)?.[1] || '');
    if (!nome) continue;
    out.push({ letra: (img || '').toUpperCase(), nome, estado });
  }
  return out;
}

// Avisos da Metro do Porto (https://www.metrodoporto.pt/pages/630?news_id=N): a página inicial liga às notícias do
// momento (a greve de 27/11/2026 estava lá: «só na Linha Amarela e entre a Senhora da Hora e o Dragão», com as frequências
// e a véspera a acabar às 23h). As que anunciam uma greve viram aviso oficial, com o que continua a funcionar.
const FONTE_AVISOS_METRO_PORTO = 'Metro do Porto — avisos';
const URL_NOTICIA_METRO_PORTO = 'https://www.metrodoporto.pt/pages/630?news_id=';

/** Números das notícias ligadas na página inicial da Metro do Porto (sem repetidos, pela ordem da página) */
export function noticiasNaPaginaMetroPorto(html: string): string[] {
  const ids: string[] = [];
  for (const m of html.matchAll(/pages\/630\?news_id=(\d{1,7})/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids.slice(0, 8);
}

/** Título, data de publicação e texto de uma notícia da Metro do Porto (null se a página não tem a notícia) */
export function noticiaMetroPorto(html: string): { titulo: string; publicada: string; texto: string } | null {
  const titulo = textoDeHtml(/<h1[^>]*class="pageTitle"[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || /<meta property="og:title" content="([^"]*)"/i.exec(html)?.[1] || '');
  const publicada = /<meta name="published_at" content="([^"]+)"/i.exec(html)?.[1] || '';
  const i = html.search(/class="text widget_field/i);
  if (!titulo || !publicada || i < 0) return null;
  const fim0 = html.indexOf('writer_text_clear', i);
  const fim = fim0 > i ? html.lastIndexOf('<', fim0) : -1;
  const corpo = html.slice(i, fim > i ? fim : i + 20000).replace(/<\/(p|h\d|li|div)>/gi, '. ');
  const texto = textoDeHtml(corpo.replace(/^[^>]*>/, '')).replace(/(\.\s*){2,}/g, '. ').replace(/\s+\./g, '.').trim();
  return { titulo, publicada, texto };
}

const cacheNoticiasMetroPorto = new Map<string, { quando: number; html: string | null }>();
async function ingestMetroPortoAvisos(inicio: string): Promise<void> {
  const ids = noticiasNaPaginaMetroPorto(inicio);
  if (!ids.length) return;
  const agora = new Date();
  for (const id of ids) {
    const url = URL_NOTICIA_METRO_PORTO + id;
    let c = cacheNoticiasMetroPorto.get(id);
    if (!c || Date.now() - c.quando > 15 * 60_000) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0 (https://parou.pt)' }, signal: AbortSignal.timeout(8000) });
        c = { quando: Date.now(), html: r.ok ? await r.text() : (c?.html ?? null) };
      } catch {
        c = { quando: Date.now() - 10 * 60_000, html: c?.html ?? null };
      }
      cacheNoticiasMetroPorto.set(id, c);
      podarMapa(cacheNoticiasMetroPorto, 30);
    }
    const n = c.html ? noticiaMetroPorto(c.html) : null;
    if (!n) continue;
    const aviso = avisoGreveOficial({ operador: 'Metro do Porto', regiao: 'Área Metropolitana do Porto',
      municipios: ['Porto', 'Matosinhos', 'Vila Nova de Gaia', 'Maia', 'Gondomar', 'Vila do Conde', 'Póvoa de Varzim'],
      titulo: n.titulo, texto: n.texto, publicada: n.publicada, url, fonte: FONTE_AVISOS_METRO_PORTO }, agora);
    if (!aviso) continue;
    if ('anulada' in aviso) {
      // greve desconvocada num aviso novo: a desse dia deixa de contar
      for (const [k, a] of centralState.alerts) {
        if (k.startsWith(`${FONTE_AVISOS_METRO_PORTO}:`) && aviso.anulada.some((d) => a.start_datetime && DateTime.fromISO(a.start_datetime).setZone('Europe/Lisbon').toISODate() === d)) {
          a.status = 'Cancelado'; a.last_update = agora.toISOString();
        }
      }
      continue;
    }
    const key = `${FONTE_AVISOS_METRO_PORTO}:${aviso.external_id}`;
    const existing = centralState.alerts.get(key);
    if (existing?.status === 'Cancelado') continue;
    aviso.content_hash = generateContentHash(aviso.título, aviso.descrição, aviso.start_datetime, aviso.end_datetime);
    if (existing && existing.content_hash === aviso.content_hash) { existing.status = aviso.status; continue; }
    centralState.alerts.set(key, aviso);
  }
}

const NOMES_LINHA_METRO_PORTO: Record<string, string> = { A: 'Azul', B: 'Vermelha', C: 'Verde', D: 'Amarela', E: 'Violeta', F: 'Laranja', G: 'Rosa', H: 'Rubi' };
let ultimaLeituraMetroPorto = 0;
async function ingestMetroPortoAlerts(): Promise<number> {
  const sourceName = 'Metro do Porto — estado das linhas';
  const sourceUrl = 'https://www.metrodoporto.pt/';
  if (Date.now() - ultimaLeituraMetroPorto < 2 * 60_000) return 0;
  ultimaLeituraMetroPorto = Date.now();
  try {
    const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0 (https://parou.pt)' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // avisos da página (greves com o serviço que funciona e a véspera): à parte, para uma falha não estragar o estado das linhas
    await ingestMetroPortoAvisos(html).catch((e: any) => {
      centralState.sourcesErrorList.push({ source: FONTE_AVISOS_METRO_PORTO, error: e?.message || 'Falha ao ler os avisos', last_attempt: new Date().toISOString() });
    });
    const linhas = estadoLinhasMetroPorto(html);
    // a página mudou de formato: regista-se a falha e nada é dado como terminado
    if (linhas.length < 3) throw new Error('Estado das linhas da Metro do Porto sem linhas reconhecidas');
    const agoraIso = new Date().toISOString();
    let imported = 0;
    for (const l of linhas) {
      const extId = `mp-${(l.letra || l.nome).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const key = `${sourceName}:${extId}`;
      const existing = centralState.alerts.get(key);
      const normal = !l.estado || /^(ok|normal|circula[cç][aã]o normal|servi[cç]o normal)\.?$/i.test(l.estado.trim());
      if (normal) {
        if (existing && existing.status === 'Ativo') { existing.end_datetime = agoraIso; existing.status = 'Terminado'; existing.last_update = agoraIso; }
        continue;
      }
      const cor = NOMES_LINHA_METRO_PORTO[l.letra];
      const linhaTxt = l.letra ? `Linha ${l.letra}${cor ? ` (${cor})` : ''}` : l.nome;
      const tipo = classifyAlertType(`${linhaTxt} ${l.estado}`, l.estado);
      const interrompida = /interromp|suspens|sem circula|n[aã]o circula|encerrad/i.test(l.estado);
      const titulo = `${linhaTxt} do Metro do Porto: ${l.estado.length > 90 ? `${l.estado.slice(0, 87).trimEnd()}…` : l.estado}`;
      const desc = `${l.nome} — ${l.estado}`.slice(0, 800);
      const start = existing && existing.status === 'Ativo' ? existing.start_datetime : agoraIso;
      const contentHash = generateContentHash(titulo, desc, start);
      if (existing && existing.content_hash === contentHash && existing.status === 'Ativo') { centralState.duplicatesAvoidedCount++; continue; }
      centralState.alerts.set(key, {
        id: `alert-${extId}`, external_id: extId, tipo: tipo === 'outros alertas oficiais' ? (interrompida ? 'interrupção' : 'atraso significativo') : tipo,
        título: titulo, descrição: desc, operador: 'Metro do Porto', linhas: l.letra ? [l.letra] : [], paragens: [],
        região: 'Área Metropolitana do Porto', municípios: ['Porto', 'Matosinhos', 'Vila Nova de Gaia', 'Maia', 'Gondomar'],
        start_datetime: start, end_datetime: null, published_datetime: start, source: sourceName, source_url: sourceUrl,
        last_update: agoraIso, status: 'Ativo', content_hash: contentHash, severity: interrompida || tipo === 'greve' ? 'Grave' : 'Moderada',
      });
      if (!existing) imported++;
    }
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({ source: sourceName, error: err?.message || 'Falha ao ler o estado das linhas', last_attempt: new Date().toISOString() });
    return 0;
  }
}

// Avisos de greve nos sites dos operadores do país todo e das ilhas (avisosOperadores.ts), de 10 em 10 minutos
async function ingestAvisosOperadores(): Promise<number> {
  const r = await lerAvisosDosOperadores();
  if (!r) return 0;
  const agora = new Date().toISOString();
  for (const op of r.falhas) centralState.sourcesErrorList.push({ source: `${FONTE_AVISOS_OPERADORES} (${op})`, error: 'Site sem resposta', last_attempt: agora });
  let imported = 0;
  for (const a of r.avisos) {
    const key = `${FONTE_AVISOS_OPERADORES}:${a.external_id}`;
    const existing = centralState.alerts.get(key);
    if (existing?.status === 'Cancelado') continue;
    a.content_hash = generateContentHash(a.título, a.descrição, a.start_datetime, a.end_datetime);
    if (existing && existing.content_hash === a.content_hash) { existing.status = a.status; continue; }
    centralState.alerts.set(key, a);
    if (!existing) imported++;
  }
  // greve desconvocada no site do operador: a desse dia deixa de contar (de qualquer fonte)
  for (const an of r.anuladas) {
    for (const a of centralState.alerts.values()) {
      if (a.tipo === 'greve' && normOperador(a.operador) === normOperador(an.operador) && an.dias.includes(DateTime.fromISO(a.start_datetime).setZone('Europe/Lisbon').toISODate() || '')) {
        a.status = 'Cancelado'; a.last_update = agora;
      }
    }
  }
  return imported;
}
const normOperador = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------------------------
// Fontes em falha: um aviso sem data de fim (ex.: «Linha D interrompida» no estado das linhas) só vale enquanto a fonte o
// mostra. Normalmente termina logo que a fonte volta ao normal; mas se a página deixar de responder (ou mudar de formato), não
// se sabe se ainda é verdade: ao fim de 30 min sem confirmação deixa de aparecer. Volta sozinho se a fonte o mostrar outra vez.
// Avisos com data de fim (greves, obras) ficam até essa data.
// ---------------------------------------------------------------------------------
export const LIMITE_SEM_CONFIRMACAO_MS = 30 * 60_000;
const falhaDesde = new Map<string, number>();
/** Atualiza as fontes em falha a partir dos erros desta leitura */
export function atualizarFalhas(falhas: Map<string, number>, comErro: Set<string>, todas: Iterable<string>, agoraMs: number): void {
  for (const f of todas) {
    if (comErro.has(f)) { if (!falhas.has(f)) falhas.set(f, agoraMs); } else falhas.delete(f);
  }
}
/** Tira os avisos sem data de fim de fontes em falha há mais do que o limite (devolve quantos) */
export function retirarSemConfirmacao(alertas: Iterable<CentralAlert>, falhas: Map<string, number>, agoraMs: number, limiteMs = LIMITE_SEM_CONFIRMACAO_MS): number {
  let n = 0;
  for (const a of alertas) {
    if (a.end_datetime || (a.status !== 'Ativo' && a.status !== 'Futuro')) continue;
    const desde = falhas.get(a.source);
    if (desde === undefined || agoraMs - desde < limiteMs) continue;
    a.status = 'Terminado';
    a.end_datetime = new Date(agoraMs).toISOString();
    a.sem_confirmacao = true;
    // na próxima leitura boa da fonte o aviso é substituído (volta se ainda lá estiver)
    a.content_hash = 'sem-confirmacao';
    a.last_update = new Date(agoraMs).toISOString();
    n++;
  }
  return n;
}
/** Estado das fontes (para a página de estado e a vigia) */
export function saudeDasFontes(): Array<{ fonte: string; emFalhaDesde: string }> {
  return [...falhaDesde.entries()].map(([fonte, t]) => ({ fonte, emFalhaDesde: new Date(t).toISOString() }));
}

// Greves anunciadas nas notícias (comunicados dos operadores que não aparecem em nenhum site que se leia, como a Metro do
// Porto a 25/11/2026). Corre depois das fontes oficiais: se o operador já tem aviso oficial para esse dia, fica o oficial.
const FONTE_NOTICIAS = 'Notícias — greves';
async function ingestGrevesNoticias(): Promise<number> {
  try {
    const noticias = await noticiasDeGreves();
    const oficiais = [...centralState.alerts.entries()].filter(([k]) => !k.startsWith(`${FONTE_NOTICIAS}:`)).map(([, a]) => a);
    const avisos = grevesDasNoticias(noticias, new Date(), oficiais);
    let imported = 0;
    const vistos = new Set<string>();
    for (const a of avisos) {
      const key = `${FONTE_NOTICIAS}:${a.external_id}`;
      vistos.add(key);
      a.content_hash = generateContentHash(a.título, a.descrição, a.start_datetime, a.end_datetime);
      const existing = centralState.alerts.get(key);
      if (existing && existing.content_hash === a.content_hash && existing.status !== 'Cancelado') { existing.status = a.status; continue; }
      centralState.alerts.set(key, a);
      if (!existing) imported++;
    }
    // Lidas as notícias, o que deixou de aparecer (greve desconvocada, ou o aviso oficial já chegou) deixa de contar
    if (noticias.length) {
      for (const chave of [...centralState.alerts.keys()]) {
        if (chave.startsWith(`${FONTE_NOTICIAS}:`) && !vistos.has(chave)) centralState.alerts.delete(chave);
      }
    }
    return imported;
  } catch (err: any) {
    centralState.sourcesErrorList.push({ source: FONTE_NOTICIAS, error: err?.message || 'Falha ao ler as notícias', last_attempt: new Date().toISOString() });
    return 0;
  }
}

// Re-evaluate statuses dynamically on every access
function reevaluateAllAlertStatuses(): void {
  for (const [, alert] of centralState.alerts) {
    alert.status = computeAlertStatus(alert.start_datetime, alert.end_datetime, alert.status === 'Cancelado');
  }
}

// Master Synchronization Function
export async function runCentralAlertsSync(): Promise<{
  total: number;
  newImported: number;
  duplicatesAvoided: number;
}> {
  console.log('[Central Alerts Engine] A sincronizar alertas oficiais de todas as fontes reais...');
  centralState.sourcesErrorList = [];

  const initialCount = centralState.alerts.size;

  await Promise.allSettled([
    ingestTmlAlerts(),
    ingestCarrisMetropolitanaAlerts(),
    ingestMetroLisboaAlerts(),
    ingestIpmaAlerts(),
    ingestCpAlerts(),
    ingestMetroPortoAlerts(),
    ingestAvisosOperadores(),
  ]);
  await ingestGrevesNoticias();

  reevaluateAllAlertStatuses();
  // fontes que falharam nesta leitura (só se conta a fonte de cada aviso: as que têm avisos ou erros)
  const comErro = new Set(centralState.sourcesErrorList.map((e: any) => String(e.source)));
  const fontes = new Set<string>([...comErro, ...[...centralState.alerts.values()].map((a) => a.source)]);
  atualizarFalhas(falhaDesde, comErro, fontes, Date.now());
  retirarSemConfirmacao(centralState.alerts.values(), falhaDesde, Date.now());
  centralState.lastSync = Date.now();
  // Arquivo permanente: cada aviso e cada mudança (para relatórios e notícias); uma falha aqui não estraga a sincronização
  try { arquivarAvisos([...centralState.alerts.values()]); } catch (e: any) { console.warn('[Histórico] avisos:', e?.message || e); }

  const newImported = centralState.alerts.size - initialCount;
  console.log(`[Central Alerts Engine] Sincronização concluída. Total: ${centralState.alerts.size} alertas auditados.`);

  return {
    total: centralState.alerts.size,
    newImported: Math.max(0, newImported),
    duplicatesAvoided: centralState.duplicatesAvoidedCount,
  };
}

// Query Filter interface
export interface CentralAlertQuery {
  status?: CentralAlertStatus | 'Todos';
  tipo?: CentralAlertType | 'Todos';
  operador?: string;
  regiao?: string;
  municipio?: string;
  linha?: string;
  search?: string;
}

// Avisos já em memória, sem esperar pela rede (para o planeador: um pedido de percurso não pode ficar à espera das fontes).
// Se estão velhos, pede-se uma atualização em segundo plano, que serve os pedidos seguintes.
let atualizacaoEmCurso: Promise<unknown> | null = null;
export function avisosEmMemoria(): CentralAlert[] {
  if ((Date.now() - centralState.lastSync > 60 * 1000 || centralState.alerts.size === 0) && !atualizacaoEmCurso) {
    atualizacaoEmCurso = runCentralAlertsSync().catch(() => {}).finally(() => { atualizacaoEmCurso = null; });
  }
  reevaluateAllAlertStatuses();
  return Array.from(centralState.alerts.values());
}

// Retrieve filtered central alerts
export async function getCentralAlerts(query: CentralAlertQuery = {}): Promise<CentralAlert[]> {
  // If never synced or older than 60s, trigger sync
  if (Date.now() - centralState.lastSync > 60 * 1000 || centralState.alerts.size === 0) {
    await runCentralAlertsSync();
  } else {
    reevaluateAllAlertStatuses();
  }

  let list = Array.from(centralState.alerts.values());

  // Filter: status
  if (query.status && query.status !== 'Todos') {
    list = list.filter(a => a.status === query.status);
  }

  // Filter: tipo
  if (query.tipo && query.tipo !== 'Todos') {
    list = list.filter(a => a.tipo === query.tipo);
  }

  // Filter: operador
  if (query.operador && query.operador !== 'Todos') {
    const op = query.operador.toLowerCase();
    list = list.filter(a => a.operador.toLowerCase().includes(op));
  }

  // Filter: regiao
  if (query.regiao && query.regiao !== 'Todas') {
    const reg = query.regiao.toLowerCase();
    list = list.filter(a => a.região.toLowerCase().includes(reg));
  }

  // Filter: municipio
  if (query.municipio && query.municipio !== 'Todos') {
    const mun = query.municipio.toLowerCase();
    list = list.filter(a => a.municípios.some(m => m.toLowerCase().includes(mun)));
  }

  // Filter: linha
  if (query.linha) {
    const ln = query.linha.toLowerCase().trim();
    list = list.filter(a => a.linhas.some(l => l.toLowerCase().includes(ln)) || a.título.toLowerCase().includes(ln));
  }

  // Filter: generic search
  if (query.search) {
    const s = query.search.toLowerCase().trim();
    list = list.filter(a => 
      a.título.toLowerCase().includes(s) ||
      a.descrição.toLowerCase().includes(s) ||
      a.operador.toLowerCase().includes(s) ||
      a.região.toLowerCase().includes(s) ||
      a.municípios.some(m => m.toLowerCase().includes(s)) ||
      a.linhas.some(l => l.toLowerCase().includes(s)) ||
      a.source.toLowerCase().includes(s)
    );
  }

  // Sort: Ativos first, then Futuros (by start_datetime asc), then Terminados/Cancelados (by start_datetime desc)
  list.sort((a, b) => {
    const statusOrder: Record<CentralAlertStatus, number> = {
      'Ativo': 0,
      'Futuro': 1,
      'Terminado': 2,
      'Cancelado': 3,
    };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return new Date(b.published_datetime).getTime() - new Date(a.published_datetime).getTime();
  });

  return list;
}

// Generate the official Diagnostic Dashboard report requested by user
export function getCentralAlertsDiagnostic(): AlertCenterDiagnostic {
  reevaluateAllAlertStatuses();
  const all = Array.from(centralState.alerts.values());

  return {
    future_alerts_count: all.filter(a => a.status === 'Futuro').length,
    active_alerts_count: all.filter(a => a.status === 'Ativo').length,
    ended_alerts_count: all.filter(a => a.status === 'Terminado').length,
    cancelled_alerts_count: all.filter(a => a.status === 'Cancelado').length,
    total_alerts_count: all.length,
    last_sync: centralState.lastSync > 0 ? new Date(centralState.lastSync).toISOString() : new Date().toISOString(),
    sources_error_count: centralState.sourcesErrorList.length,
    sources_error_list: centralState.sourcesErrorList,
    notifications_sent_count: centralState.notificationsSentCount,
    duplicates_avoided_count: centralState.duplicatesAvoidedCount,
  };
}

export function incrementNotificationCounter(): void {
  centralState.notificationsSentCount++;
}
