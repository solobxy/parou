// Partilhar a viagem: cria a ligação no servidor, guarda o segredo só neste telemóvel e manda a posição enquanto a app
// está aberta (no máximo de 15 em 15 s). Termina ao chegar, ao carregar em «Parar» ou quando o servidor a dá por acabada.
import type { TransitRouteOption } from '../types/perto';

const CHAVE = 'parou_partilha_viagem';
export const EVENTO_PARTILHA = 'parou_partilha_mudou';

export interface PartilhaAtiva { id: string; segredo: string; url: string; expira: number; destino: string; chegada: string }

export function partilhaAtiva(): PartilhaAtiva | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (!p || typeof p.id !== 'string' || !(p.expira > Date.now())) return null;
    return p;
  } catch {
    return null;
  }
}
function guardar(p: PartilhaAtiva | null) {
  try {
    if (p) localStorage.setItem(CHAVE, JSON.stringify(p));
    else localStorage.removeItem(CHAVE);
  } catch { /* sem armazenamento */ }
  try { window.dispatchEvent(new Event(EVENTO_PARTILHA)); } catch { /* sem janela */ }
}

/** "07:53" (hoje; se já passou há muito, amanhã) → instante */
function instante(hhmm: string, diasDepois = 0): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  const d = new Date();
  if (!m) return Date.now() + 3600_000;
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let ms = d.getTime() + diasDepois * 86400_000;
  if (!diasDepois && ms < Date.now() - 2 * 3600_000) ms += 86400_000;
  return ms;
}

export type ResultadoPartilha = { ok: true; partilha: PartilhaAtiva } | { ok: false; erro: string };

export async function criarPartilha(
  route: TransitRouteOption,
  destino: { nome: string; lat: number; lon: number },
  pos?: { lat: number; lon: number; acc: number } | null,
): Promise<ResultadoPartilha> {
  try {
    const trocos = route.legs.filter((l) => l.mode === 'TRANSIT').map((l) => ({
      modo: l.transportMode || '', linha: l.lineCode || '', cor: l.lineColor, de: l.fromStopName || '', para: l.toStopName || '',
      sai: l.departureTime || '', chega: l.arrivalTime || '',
    }));
    const r = await fetch('/api/partilha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destino, chegada: instante(route.arrivalTime, route.arrivalDayOffset || 0), trocos, ...(pos ? { pos } : {}) }),
    });
    if (!r.ok) return { ok: false, erro: r.status === 429 ? 'muitas' : 'erro' };
    const j = await r.json();
    const p: PartilhaAtiva = { id: j.id, segredo: j.segredo, url: j.url, expira: j.expira, destino: destino.nome, chegada: route.arrivalTime };
    guardar(p);
    return { ok: true, partilha: p };
  } catch {
    return { ok: false, erro: 'rede' };
  }
}

let ultimoEnvio = 0;
/** Manda a posição (no máximo de 15 em 15 s, ou já se `forcar`). Acaba a partilha se o servidor disser que acabou. */
export async function enviarPosicao(lat: number, lon: number, acc: number, forcar = false): Promise<void> {
  const p = partilhaAtiva();
  if (!p) return;
  if (!forcar && Date.now() - ultimoEnvio < 15_000) return;
  ultimoEnvio = Date.now();
  try {
    const r = await fetch(`/api/partilha/${p.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segredo: p.segredo, lat, lon, acc }),
    });
    if (r.status === 404 || r.status === 403) { guardar(null); return; }
    const j = await r.json().catch(() => null);
    if (j?.estado === 'chegou') guardar(null);
    else if (j?.expira) guardar({ ...p, expira: j.expira });
  } catch { /* sem rede: tenta no próximo */ }
}

export async function pararPartilha(): Promise<void> {
  const p = partilhaAtiva();
  guardar(null);
  if (!p) return;
  try {
    await fetch(`/api/partilha/${p.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segredo: p.segredo, parar: true }) });
  } catch { /* acaba sozinha no servidor */ }
}

/** Abre a folha de partilha do telemóvel (WhatsApp, SMS…) ou, sem ela, copia a ligação */
export async function enviarLigacao(p: PartilhaAtiva, texto: string): Promise<'partilhado' | 'copiado' | 'cancelado'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'PAROU', text: texto, url: p.url });
      return 'partilhado';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'cancelado';
  }
  try {
    await navigator.clipboard.writeText(`${texto} ${p.url}`);
    return 'copiado';
  } catch {
    return 'cancelado';
  }
}
