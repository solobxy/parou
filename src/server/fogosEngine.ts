// =====================================================================================
// PAROU.PT — Incêndios e outras ocorrências da Proteção Civil (via Fogos.pt)
//
// Fonte: Fogos.pt (VOST Portugal), que publica as ocorrências da ANEPC. Uso não comercial,
// com atribuição visível "Fogos.pt" junto aos dados (termos: https://fogos.pt/pt/api-termos).
//
// Limites da API: sem chave, 1 pedido por hora; com chave (variável FOGOS_API_KEY, pedida em
// https://api.fogos.pt/api/request-access), 300 por minuto. Aqui:
//   - com chave: atualiza a cada 2 min
//   - sem chave: 1 vez por hora, e a última resposta fica guardada em disco para não se
//     perder (nem gastar o pedido da hora) quando a app reinicia a cada atualização.
// Nunca é a página que pede: o servidor busca e guarda; os pedidos da app leem da memória.
// =====================================================================================
import fs from 'fs';
import path from 'path';

const CHAVE = (process.env.FOGOS_API_KEY || '').trim();
const INTERVALO_MS = CHAVE ? 2 * 60_000 : 61 * 60_000;
const URL = 'https://api.fogos.pt/v2/incidents/active?all=1';
const UA = 'PAROU.PT/2.0 (+https://parou.pt)';
const FICHEIRO = path.join(process.env.PAROU_DATA_DIR || '/tmp/parou-dados', 'fogos-ultima.json');

export type TipoIncidente = 'incendio' | 'acidente' | 'inundacao' | 'outro';

export interface IncidenteProtecaoCivil {
  id: string;
  tipo: TipoIncidente;
  natureza: string;
  local: string;
  concelho: string;
  distrito: string;
  lat: number;
  lon: number;
  estado: string;
  /** Cor do estado segundo a ANEPC (hex sem #) */
  corEstado: string;
  meios: { humanos: number; terrestres: number; aereos: number };
  inicio: string | null;
  importante: boolean;
  /** Em resolução / vigilância: ainda ativo mas a acalmar */
  aAcalmar: boolean;
}

interface Estado {
  atualizado: number; // quando foi obtido da fonte (ms)
  incidentes: IncidenteProtecaoCivil[];
}

let estado: Estado | null = null;
let proximaTentativa = 0;
let emCurso: Promise<void> | null = null;

function lerDoDisco() {
  try {
    const j = JSON.parse(fs.readFileSync(FICHEIRO, 'utf8')) as Estado;
    if (j && Array.isArray(j.incidentes) && Number.isFinite(j.atualizado)) {
      estado = j;
      // Sem chave: espera a hora toda desde o último pedido bom antes de voltar a pedir
      proximaTentativa = j.atualizado + INTERVALO_MS;
    }
  } catch {}
}

function gravarNoDisco() {
  try {
    fs.mkdirSync(path.dirname(FICHEIRO), { recursive: true });
    fs.writeFileSync(`${FICHEIRO}.tmp`, JSON.stringify(estado));
    fs.renameSync(`${FICHEIRO}.tmp`, FICHEIRO);
  } catch {}
}

function semAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function classificar(i: any): TipoIncidente {
  if (i.isFire === true) return 'incendio';
  const n = semAcentos(`${i.natureza || ''} ${i.familiaName || ''} ${i.especieName || ''}`);
  if (/incendio|queimada|fogo/.test(n)) return 'incendio';
  if (/acidente|rodoviari|colisao|despiste|atropelamento|capotamento/.test(n)) return 'acidente';
  if (/inundac|cheia|alagamento|movimento de massa|deslizamento|queda de arvore|estrutura/.test(n)) return 'inundacao';
  return 'outro';
}

function numero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function converter(i: any): IncidenteProtecaoCivil | null {
  const lat = Number(i.lat);
  const lon = Number(i.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) return null;
  if (i.active === false) return null;
  const estadoTxt = String(i.status || '').trim();
  const est = semAcentos(estadoTxt);
  // "Encerrada", "Conclusão" e afins já não interessam a quem está na rua
  if (/encerrad|conclusao|falso alarme|falso alerta/.test(est)) return null;
  const segundos = Number(i.dateTime?.sec ?? i.created?.sec);
  return {
    id: String(i.id || i._id?.$id || `${lat},${lon}`),
    tipo: classificar(i),
    natureza: String(i.natureza || 'Ocorrência').trim(),
    local: String(i.location || i.localidade || i.concelho || '').trim(),
    concelho: String(i.concelho || '').trim(),
    distrito: String(i.district || '').trim(),
    lat,
    lon,
    estado: estadoTxt || 'Em curso',
    corEstado: String(i.statusColor || '').replace('#', '') || 'FF6B1A',
    meios: { humanos: numero(i.man), terrestres: numero(i.terrain), aereos: numero(i.aerial) },
    inicio: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : null,
    importante: Boolean(i.important),
    aAcalmar: /resolucao|vigilancia/.test(est),
  };
}

async function atualizar(): Promise<void> {
  if (emCurso) return emCurso;
  if (Date.now() < proximaTentativa) return;
  emCurso = (async () => {
    try {
      const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/json' };
      if (CHAVE) headers['X-API-Key'] = CHAVE;
      const r = await fetch(URL, { headers, signal: AbortSignal.timeout(12000) });
      if (r.status === 429) {
        const espera = Number(r.headers.get('retry-after'));
        // Respeita o "Retry-After", mas nunca espera mais de ~1 h (o limite sem chave é por hora)
        const esperaMs = Number.isFinite(espera) && espera > 0 ? espera * 1000 + 5000 : INTERVALO_MS;
        proximaTentativa = Date.now() + Math.min(esperaMs, 65 * 60_000);
        console.warn(`[Fogos] Limite de pedidos; próxima tentativa às ${new Date(proximaTentativa).toISOString()}`);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const lista = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const incidentes = lista.map(converter).filter(Boolean) as IncidenteProtecaoCivil[];
      estado = { atualizado: Date.now(), incidentes };
      proximaTentativa = Date.now() + INTERVALO_MS;
      gravarNoDisco();
      console.log(`[Fogos] ${incidentes.length} ocorrências ativas (${incidentes.filter((x) => x.tipo === 'incendio').length} incêndios)`);
    } catch (err: any) {
      // Falha de rede: tenta outra vez daqui a 5 min (ou no intervalo normal, se menor)
      proximaTentativa = Date.now() + Math.min(5 * 60_000, INTERVALO_MS);
      console.warn('[Fogos] Falhou:', err?.message || err);
    } finally {
      emCurso = null;
    }
  })();
  return emCurso;
}

/** Ocorrências ativas da Proteção Civil (incêndios e outras), e há quanto tempo foram obtidas. */
export function obterIncidentes(): { atualizado: string | null; incidentes: IncidenteProtecaoCivil[]; temChave: boolean } {
  // Pede em segundo plano se já for altura; responde logo com o que tem
  atualizar().catch(() => {});
  return {
    atualizado: estado ? new Date(estado.atualizado).toISOString() : null,
    incidentes: estado?.incidentes || [],
    temChave: Boolean(CHAVE),
  };
}

// Só para os testes automáticos (capturas de ecrã): exemplos fixos quando não há dados
function exemplosDeTeste(): Estado {
  const h = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  return {
    atualizado: Date.now(),
    incidentes: [
      { id: 't1', tipo: 'incendio', natureza: 'Mato', local: 'Covelo', concelho: 'Gondomar', distrito: 'Porto', lat: 41.115, lon: -8.48, estado: 'Em Curso', corEstado: 'FF0000', meios: { humanos: 64, terrestres: 19, aereos: 2 }, inicio: h(95), importante: true, aAcalmar: false },
      { id: 't2', tipo: 'incendio', natureza: 'Povoamento Florestal', local: 'São Pedro do Sul', concelho: 'São Pedro do Sul', distrito: 'Viseu', lat: 40.76, lon: -8.06, estado: 'Em Resolução', corEstado: 'FFA500', meios: { humanos: 31, terrestres: 9, aereos: 0 }, inicio: h(240), importante: false, aAcalmar: true },
      { id: 't3', tipo: 'incendio', natureza: 'Agrícola', local: 'Alcácer do Sal', concelho: 'Alcácer do Sal', distrito: 'Setúbal', lat: 38.37, lon: -8.51, estado: 'Em Curso', corEstado: 'FF0000', meios: { humanos: 12, terrestres: 4, aereos: 1 }, inicio: h(30), importante: false, aAcalmar: false },
      { id: 't4', tipo: 'acidente', natureza: 'Rodoviário - Colisão', local: 'A4 Valongo', concelho: 'Valongo', distrito: 'Porto', lat: 41.19, lon: -8.50, estado: 'Em Curso', corEstado: 'FF0000', meios: { humanos: 7, terrestres: 3, aereos: 0 }, inicio: h(12), importante: false, aAcalmar: false },
    ],
  };
}

let iniciado = false;
/** Arranque: lê a última resposta guardada e mantém os dados atualizados em segundo plano. */
export function iniciarFogos(): void {
  if (iniciado) return;
  iniciado = true;
  lerDoDisco();
  if (process.env.FOGOS_TESTE === '1' && !estado) {
    estado = exemplosDeTeste();
    proximaTentativa = Date.now() + 24 * 3600_000;
    return;
  }
  setTimeout(() => atualizar().catch(() => {}), 20_000);
  setInterval(() => atualizar().catch(() => {}), 60_000);
}
