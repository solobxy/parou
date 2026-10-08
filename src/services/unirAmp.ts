// UNIR (Área Metropolitana do Porto): os horários vêm da AMP. Os servidores da AMP só aceitam
// ligações a partir de Portugal, por isso o pedido é feito pelo telemóvel de quem usa a app
// (o servidor da PAROU está fora do país). A AMP devolve o horário do dia inteiro de cada
// paragem; guardamos 30 min e calculamos os minutos que faltam no momento de mostrar.

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
