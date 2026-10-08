// UNIR (Área Metropolitana do Porto): os horários vêm da AMP. Os servidores da AMP só aceitam
// ligações a partir de Portugal, por isso o pedido é feito pelo telemóvel de quem usa a app
// (o servidor da PAROU está fora do país). A AMP devolve o horário do dia inteiro de cada
// paragem; guardamos 30 min e calculamos os minutos que faltam no momento de mostrar.

import type { CandidatoUnir, TransitRouteOption } from '../types/perto';

const BASE = 'https://paragens.amp.pt/acarto2/get_horarios_prg';
const ZONA = 'Europe/Lisbon';
const COR_UNIR = '#CE9926'; // amarelo-torrado da UNIR
const VALIDADE_MS = 30 * 60_000;
const FALHA_MS = 2 * 60_000;

export interface PassagemUnir {
  linha: string;
  destino: string;
  /** Segundos desde a meia-noite do dia do horário */
  segundos: number;
  /** Instante da passagem (epoch em segundos) */
  epoch: number;
  parcial: boolean;
  sentido: string;
  /** Identificador da viagem na AMP (igual em todas as paragens da viagem) */
  viagem: string;
}

interface Entrada { t: number; ok: boolean; lista: PassagemUnir[]; nome?: string }
const cache = new Map<string, Entrada>();
const aDecorrer = new Map<string, Promise<Entrada>>();

/** Data (AAAA-MM-DD) e segundos desde a meia-noite em Lisboa */
function agoraLisboa(desvioDias = 0): { dia: string; segundos: number; meiaNoiteEpoch: number } {
  const agora = new Date(Date.now() + desvioDias * 86400_000);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(agora);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value || 0);
  const h = v('hour') % 24;
  const segundos = h * 3600 + v('minute') * 60 + v('second');
  const dia = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  return { dia, segundos, meiaNoiteEpoch: Math.floor(agora.getTime() / 1000) - segundos };
}

function limpar(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

async function pedir(codigo: string, desvioDias: number): Promise<Entrada> {
  const { dia, meiaNoiteEpoch } = agoraLisboa(desvioDias);
  const chave = `${codigo}|${dia}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.t < (c.ok ? VALIDADE_MS : FALHA_MS)) return c;
  const ja = aDecorrer.get(chave);
  if (ja) return ja;
  const p = (async (): Promise<Entrada> => {
    try {
      const r = await fetch(`${BASE}?dia=${dia}&id=${encodeURIComponent(codigo)}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let d: any = await r.json();
      if (typeof d === 'string') d = JSON.parse(d);
      if (Array.isArray(d)) throw new Error(limpar(d[0]?.erro) || 'resposta inválida');
      const lista: PassagemUnir[] = (Array.isArray(d?.horarios) ? d.horarios : []).map((x: any) => {
        const [hh, mm, ss] = String(x.chegada || '').split(':').map(Number);
        const segundos = Number.isFinite(hh) ? hh * 3600 + (mm || 0) * 60 + (ss || 0) : Number(x.hora) * 3600 + Number(x.minuto) * 60;
        return {
          linha: limpar(x.linha),
          destino: limpar(x.destino),
          segundos,
          epoch: meiaNoiteEpoch + segundos,
          parcial: /parcelar/i.test(String(x.abrev || '')),
          sentido: limpar(x.sentido),
          viagem: limpar(x.trip_id),
        };
      }).filter((x: PassagemUnir) => x.linha && Number.isFinite(x.segundos));
      lista.sort((a, b) => a.segundos - b.segundos);
      const e: Entrada = { t: Date.now(), ok: true, lista, nome: limpar(d?.designa) || undefined };
      cache.set(chave, e);
      return e;
    } catch {
      const e: Entrada = { t: Date.now(), ok: false, lista: c?.lista || [] };
      cache.set(chave, e);
      return e;
    } finally {
      aDecorrer.delete(chave);
    }
  })();
  aDecorrer.set(chave, p);
  return p;
}

export interface ResultadoUnir { ok: boolean; passagens: PassagemUnir[] }

/**
 * Próximas passagens nas paragens UNIR indicadas (códigos da AMP, ex. "vng:255").
 * Junta o dia seguinte quando já é tarde, para mostrar as primeiras da manhã.
 */
export async function passagensUnir(codigos: string[], max = 40): Promise<ResultadoUnir> {
  const lista = Array.from(new Set(codigos.map((c) => c.replace(/^unir:/, '').trim()).filter(Boolean))).slice(0, 3);
  if (!lista.length) return { ok: true, passagens: [] };
  const { segundos } = agoraLisboa();
  const hoje = await Promise.all(lista.map((c) => pedir(c, 0)));
  let todas = hoje.flatMap((e) => e.lista);
  const agora = Math.floor(Date.now() / 1000);
  let futuras = todas.filter((x) => x.epoch >= agora - 60);
  if (futuras.length < 6 && segundos > 20 * 3600) {
    const amanha = await Promise.all(lista.map((c) => pedir(c, 1)));
    todas = todas.concat(amanha.flatMap((e) => e.lista));
    futuras = todas.filter((x) => x.epoch >= agora - 60);
  }
  futuras.sort((a, b) => a.epoch - b.epoch);
  return { ok: hoje.some((e) => e.ok), passagens: futuras.slice(0, max) };
}

/** Converte para o formato de partida que a app mostra (minutos calculados agora) */
export function partidasParaMostrar(passagens: PassagemUnir[], corPorLinha?: Map<string, string>): any[] {
  const agora = Math.floor(Date.now() / 1000);
  return passagens
    .filter((x) => x.epoch >= agora - 60)
    .map((x) => {
      const min = Math.max(0, Math.round((x.epoch - agora) / 60));
      const hh = String(Math.floor((x.segundos % 86400) / 3600)).padStart(2, '0');
      const mm = String(Math.floor((x.segundos % 3600) / 60)).padStart(2, '0');
      const horaTxt = `${hh}:${mm}`;
      const amanha = x.epoch - agora > 0 && new Date(x.epoch * 1000).toLocaleDateString('pt-PT', { timeZone: ZONA }) !== new Date().toLocaleDateString('pt-PT', { timeZone: ZONA });
      const texto = min < 60 ? `${horaTxt} · Programado · daqui a ~${min} min` : amanha ? `amanhã às ${horaTxt}` : `${horaTxt} · Programado`;
      return {
        lineCode: x.linha,
        lineName: '',
        lineColor: corPorLinha?.get(x.linha) || COR_UNIR,
        destination: x.destino || 'UNIR',
        operatorName: x.parcial ? 'UNIR · percurso parcial' : 'UNIR',
        operatorId: 'unir',
        transportMode: 'Autocarro',
        departureTime: texto,
        displayText: texto,
        scheduledTime: horaTxt,
        countdown_minutes: min,
        etaMinutes: min,
        departureMinutes: min,
        dep_epoch_secs: x.epoch,
        isRealtime: false,
        state: 'PROGRAMADO',
        statusDescription: 'Horário da AMP',
      };
    });
}

/** Códigos UNIR de uma paragem da lista (unirIds, ou o próprio id "unir:...") */
export function codigosUnir(stop: { id?: string; unirIds?: string[] } | null | undefined): string[] {
  if (!stop) return [];
  if (stop.unirIds?.length) return stop.unirIds;
  if (stop.id?.startsWith('unir:')) return [stop.id.slice(5)];
  return [];
}

// ---------------------------------------------------------------------------------------------
// Planeador: completa uma ligação direta da UNIR (encontrada pelo servidor) com a hora real da
// AMP — a mesma viagem (trip_id) passa na paragem de origem e, mais tarde, na de destino.
// ---------------------------------------------------------------------------------------------

function hmDe(segundos: number): string {
  const s = ((segundos % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export async function viagemUnir(c: CandidatoUnir, destNome: string): Promise<TransitRouteOption | null> {
  const [o, d] = await Promise.all([pedir(c.origem.codigo, 0), pedir(c.destino.codigo, 0)]);
  if (!o.ok || !d.ok) return null;
  const agora = Math.floor(Date.now() / 1000);
  const chegadas = new Map<string, PassagemUnir>();
  for (const x of d.lista) if (x.linha === c.linha && x.viagem) chegadas.set(x.viagem, x);
  let melhor: { p: PassagemUnir; q: PassagemUnir } | null = null;
  for (const p of o.lista) {
    if (p.linha !== c.linha || !p.viagem) continue;
    if (p.epoch < agora + c.origem.minutos * 60 - 30) continue; // não dá para chegar à paragem a tempo
    const q = chegadas.get(p.viagem);
    if (!q || q.segundos <= p.segundos) continue;
    if (!melhor || q.epoch < melhor.q.epoch) melhor = { p, q };
  }
  if (!melhor) return null;
  const { p, q } = melhor;
  const chegadaFinal = q.epoch + c.destino.minutos * 60;
  const saida = p.epoch - c.origem.minutos * 60;
  const total = Math.max(1, Math.round((chegadaFinal - agora) / 60));
  const segsAgora = (epoch: number) => {
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(epoch * 1000)).split(':').map(Number);
    return (partes[0] % 24) * 3600 + partes[1] * 60;
  };
  const destino = p.destino || c.nome || '';
  return {
    id: `unir-${c.linha}-${p.viagem}`,
    type: 'fastest',
    title: 'Direto',
    badgeLabel: 'Direto',
    totalDurationMinutes: total,
    departureTime: hmDe(segsAgora(saida)),
    arrivalTime: hmDe(segsAgora(chegadaFinal)),
    walkingDistanceMeters: c.origem.metros + c.destino.metros,
    walkingMinutes: c.origem.minutos + c.destino.minutos,
    transfersCount: 0,
    legs: [
      { mode: 'WALK', instruction: `Ir a pé até ${c.origem.nome}`, durationMinutes: c.origem.minutos, distanceMeters: c.origem.metros },
      {
        mode: 'TRANSIT',
        instruction: `Apanhar a linha ${c.linha} da UNIR às ${hmDe(p.segundos)} em ${c.origem.nome}${destino ? `, sentido ${destino}` : ''}; sair em ${c.destino.nome} (${c.paragens} ${c.paragens === 1 ? 'paragem' : 'paragens'}) às ${hmDe(q.segundos)}`,
        transportMode: c.linha === '9901' || c.linha === '9902' ? 'Barco' : 'Autocarro',
        lineCode: c.linha,
        lineName: c.nome,
        lineColor: c.cor || COR_UNIR,
        operatorName: p.parcial ? 'UNIR · percurso parcial' : 'UNIR',
        fromStopName: c.origem.nome,
        toStopName: c.destino.nome,
        stopsCount: c.paragens,
        durationMinutes: Math.max(1, Math.round((q.segundos - p.segundos) / 60)),
        isRealtime: false,
        departureTime: hmDe(p.segundos),
        arrivalTime: hmDe(q.segundos),
      },
      { mode: 'WALK', instruction: `Ir a pé até ${destNome}`, durationMinutes: c.destino.minutos, distanceMeters: c.destino.metros },
    ],
    realtimeStatus: 'PROGRAMADO',
    realtimeLabel: 'Horário da AMP',
    relevantAlerts: [],
  };
}
