import { 
  CentralAlert, 
  CentralAlertType, 
  CentralAlertStatus, 
  AlertCenterDiagnostic 
} from '../types/alerts';
import { getTmlAlerts, getTmlLines, TmlAlertRaw } from './tmlGoHubService';

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

// Classify raw alert cause/effect/text into one of the 13 canonical types
export function classifyAlertType(title: string, desc: string, cause?: string, effect?: string): CentralAlertType {
  const fullText = `${title} ${desc} ${cause || ''} ${effect || ''}`.toLowerCase();

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

// Ingest TML GO Hub Official Alerts (Real GTFS-RT endpoint)
async function ingestTmlAlerts(): Promise<number> {
  const sourceName = 'TML GO Hub';
  const sourceUrl = 'https://go.tmlmobilidade.pt';

  try {
    const rawAlerts = await getTmlAlerts();
    let imported = 0;
    const vistos = new Set<string>();

    for (const raw of rawAlerts) {
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
            const clean = String(ref.parent_id).replace(/^\[.*?\]/, '').trim();
            if (clean) rawLines.push(clean);
          }
          if (ref.child_ids && Array.isArray(ref.child_ids)) {
            rawStops.push(...ref.child_ids);
          }
        });
      }

      const lines = Array.from(new Set(rawLines));
      const stops = Array.from(new Set(rawStops));

      // Check if alert belongs to UNIR or Carris Metropolitana based on lines or title
      let operador = 'Carris Metropolitana';
      const full = `${title} ${desc} ${lines.join(' ')}`.toLowerCase();
      // O TML GO Hub é da Área Metropolitana de Lisboa: nunca são alertas da UNIR (Porto).
      // (Antes, "transporte" contém "porto" e linhas 3xxx de Sesimbra/Setúbal passavam por UNIR.)
      if (full.includes('fertagus')) {
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
    const res = await fetch('https://api.carrismetropolitana.pt/alerts', {
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

      const title = `[Aviso IPMA] Risco Meteorológico Severo no Distrito de ${distName}`;
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
  ]);

  reevaluateAllAlertStatuses();
  centralState.lastSync = Date.now();

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
