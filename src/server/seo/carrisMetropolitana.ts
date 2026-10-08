// Carris Metropolitana para as páginas públicas: os horários não estão na base GTFS da PAROU
// (vêm da API pública do operador), por isso as páginas das linhas e paragens CM usam a API
// com cache: percursos e horários por padrão, linhas de cada paragem e partidas do dia.
import { DateTime } from 'luxon';

const API = 'https://api.carrismetropolitana.pt/v2';
const UA = { 'User-Agent': 'PAROU.PT/2.0 (+https://parou.pt)' };
const ZONA = 'Europe/Lisbon';

// Concelhos da Área Metropolitana de Lisboa (códigos DICOFRE usados pela API)
export const CONCELHOS: Record<string, string> = {
  '1101': 'Alenquer', '1102': 'Arruda dos Vinhos', '1103': 'Azambuja', '1104': 'Cadaval', '1105': 'Cascais', '1106': 'Lisboa',
  '1107': 'Loures', '1108': 'Lourinhã', '1109': 'Mafra', '1110': 'Oeiras', '1111': 'Sintra', '1112': 'Sobral de Monte Agraço',
  '1113': 'Torres Vedras', '1114': 'Vila Franca de Xira', '1115': 'Amadora', '1116': 'Odivelas',
  '1501': 'Alcácer do Sal', '1502': 'Alcochete', '1503': 'Almada', '1504': 'Barreiro', '1505': 'Grândola', '1506': 'Moita',
  '1507': 'Montijo', '1508': 'Palmela', '1509': 'Santiago do Cacém', '1510': 'Seixal', '1511': 'Sesimbra', '1512': 'Setúbal', '1513': 'Sines',
};

async function buscar(url: string, ms = 20000): Promise<any> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.json();
}

// ---------------------------------------------------------------- linhas e paragens (12 h)
interface LinhaCM { id: string; padroes: string[]; concelhos: string[] }
interface ParagemCM { linhas: string[]; concelho: string }
let linhas: { t: number; v: Map<string, LinhaCM> } | null = null;
let paragens: { t: number; v: Map<string, ParagemCM> } | null = null;
let aCarregarLinhas: Promise<void> | null = null;
let aCarregarParagens: Promise<void> | null = null;

export async function linhasCM(): Promise<Map<string, LinhaCM>> {
  if (linhas && Date.now() - linhas.t < 12 * 3600_000) return linhas.v;
  if (!aCarregarLinhas) {
    aCarregarLinhas = (async () => {
      try {
        const j = await buscar(`${API}/lines`);
        const m = new Map<string, LinhaCM>();
        for (const l of Array.isArray(j) ? j : []) {
          m.set(String(l.id), { id: String(l.id), padroes: (l.pattern_ids || []).map(String), concelhos: (l.municipality_ids || []).map(String) });
        }
        if (m.size) linhas = { t: Date.now(), v: m };
      } catch (err: any) {
        console.warn('[SEO CM] Linhas:', err?.message || err);
        if (linhas) linhas.t = Date.now() - 11 * 3600_000; // tenta outra vez daqui a 1 h
      } finally {
        aCarregarLinhas = null;
      }
    })();
  }
  if (!linhas) await aCarregarLinhas;
  return linhas?.v || new Map();
}

export async function paragensCM(): Promise<Map<string, ParagemCM>> {
  if (paragens && Date.now() - paragens.t < 12 * 3600_000) return paragens.v;
  if (!aCarregarParagens) {
    aCarregarParagens = (async () => {
      try {
        const j = await buscar(`${API}/stops`, 40000);
        const m = new Map<string, ParagemCM>();
        for (const s of Array.isArray(j) ? j : []) {
          m.set(String(s.id), { linhas: (s.line_ids || []).map(String), concelho: CONCELHOS[String(s.municipality_id || '')] || '' });
        }
        if (m.size) paragens = { t: Date.now(), v: m };
      } catch (err: any) {
        console.warn('[SEO CM] Paragens:', err?.message || err);
        if (paragens) paragens.t = Date.now() - 11 * 3600_000;
      } finally {
        aCarregarParagens = null;
      }
    })();
  }
  if (!paragens) await aCarregarParagens;
  return paragens?.v || new Map();
}

// ---------------------------------------------------------------- padrões (percurso + horário)
export interface PadraoCM {
  id: string;
  direcao: number;
  destino: string;
  paragens: Array<{ stopId: string; minutos: number }>;
  /** partidas (segundos desde a meia-noite, na 1.ª paragem) por dia YYYYMMDD, só para as próximas/últimas semanas */
  dias: Map<string, number[]>;
}

const padroes = new Map<string, { t: number; v: PadraoCM | null }>();

function segundos(h: string): number {
  const [a, b, c] = String(h || '').split(':').map(Number);
  return (a || 0) * 3600 + (b || 0) * 60 + (c || 0);
}

export async function padraoCM(id: string): Promise<PadraoCM | null> {
  const c = padroes.get(id);
  if (c && Date.now() - c.t < 6 * 3600_000) return c.v;
  let v: PadraoCM | null = null;
  try {
    const j = await buscar(`${API}/patterns/${encodeURIComponent(id)}`);
    const versoes: any[] = Array.isArray(j) ? j : j ? [j] : [];
    const hoje = DateTime.now().setZone(ZONA);
    const janela = new Set<string>();
    for (let d = -35; d <= 21; d++) janela.add(hoje.plus({ days: d }).toFormat('yyyyMMdd'));
    // Versão em vigor hoje (ou a mais recente)
    const hojeStr = hoje.toFormat('yyyyMMdd');
    const versao = versoes.find((x) => (x.valid_on || []).includes(hojeStr)) || versoes[versoes.length - 1];
    if (versao) {
      const dias = new Map<string, number[]>();
      let offsets: Array<{ stopId: string; minutos: number }> = [];
      for (const ver of versoes) {
        for (const t of ver.trips || []) {
          const sch = t.schedule || [];
          if (!sch.length) continue;
          const s0 = segundos(sch[0].arrival_time);
          if (ver === versao && offsets.length < sch.length) {
            offsets = sch.map((x: any) => ({ stopId: String(x.stop_id), minutos: Math.max(0, Math.round((segundos(x.arrival_time) - s0) / 60)) }));
          }
          for (const d of t.valid_on || []) {
            if (!janela.has(d)) continue;
            const l = dias.get(d) || [];
            l.push(s0);
            dias.set(d, l);
          }
        }
      }
      for (const [d, l] of dias) dias.set(d, Array.from(new Set(l)).sort((a, b) => a - b));
      if (!offsets.length) offsets = (versao.path || []).map((p: any) => ({ stopId: String(p.stop_id || p.stop?.id), minutos: 0 }));
      v = { id, direcao: Number(versao.direction_id ?? 0), destino: String(versao.headsign || ''), paragens: offsets, dias };
    }
  } catch (err: any) {
    console.warn(`[SEO CM] Padrão ${id}:`, err?.message || err);
    if (c) return c.v;
  }
  padroes.set(id, { t: Date.now(), v });
  if (padroes.size > 400) padroes.delete(padroes.keys().next().value as string);
  return v;
}

/** Partidas de um padrão num dia (com recurso a semanas próximas se esse dia ainda não tiver horário) */
export function partidasPadrao(p: PadraoCM, dia: DateTime): { data: string; partidas: number[] } {
  for (const delta of [0, 7, -7, 14, -14, -21, -28]) {
    const d = dia.plus({ days: delta }).toFormat('yyyyMMdd');
    const l = p.dias.get(d);
    if (l && l.length) return { data: dia.plus({ days: delta }).toISODate() || '', partidas: l };
  }
  return { data: dia.toISODate() || '', partidas: [] };
}

// ---------------------------------------------------------------- partidas do dia numa paragem
export interface PassagemCM { linha: string; destino: string; programada: number; prevista: number | null }

const passagens = new Map<string, { t: number; v: PassagemCM[] }>();
export async function passagensHojeCM(stopId: string): Promise<PassagemCM[]> {
  const c = passagens.get(stopId);
  if (c && Date.now() - c.t < 60_000) return c.v;
  try {
    const j = await buscar(`${API}/arrivals/by_stop/${encodeURIComponent(stopId)}`, 3500);
    const v: PassagemCM[] = (Array.isArray(j) ? j : []).map((a: any) => ({
      linha: String(a.line_id || ''),
      destino: String(a.headsign || ''),
      programada: segundos(a.scheduled_arrival),
      prevista: a.estimated_arrival ? segundos(a.estimated_arrival) : null,
    })).filter((x: PassagemCM) => x.linha);
    passagens.set(stopId, { t: Date.now(), v });
    if (passagens.size > 2000) passagens.delete(passagens.keys().next().value as string);
    return v;
  } catch {
    return c?.v || [];
  }
}
