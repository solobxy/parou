// Cópia dos favoritos e preferências no servidor, para nunca se perderem.
//
// O browser pode apagar o que a app guarda no telemóvel (o Safari apaga ao fim de 7 dias
// sem visitas; limpar os dados do browser também). Ao abrir, a app vai buscar a cópia
// do servidor e repõe o que faltar; depois, sempre que um favorito muda, envia a cópia.

const CHAVES = [
  'parou_user_favorites',
  'parou_favorite_line_ids',
  'parou_favorite_stops_v1',
  'parou_alertas_area',
  'parou_notification_preferences_v1',
  'parou_central_alerts_prefs_v1',
];
const CHAVE_ATUALIZADO = 'parou_dados_atualizado';
const URL = '/api/dados-utilizador';

let iniciado = false;
let ultimoEnviado: string | null = null;

function lerLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const k of CHAVES) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  } catch {}
  return out;
}

function lerAtualizadoLocal(): number {
  try { return Number(localStorage.getItem(CHAVE_ATUALIZADO) || 0) || 0; } catch { return 0; }
}

function avisarApp() {
  try {
    window.dispatchEvent(new CustomEvent('parou_dados_repostos'));
    window.dispatchEvent(new CustomEvent('parou_favorites_updated'));
  } catch {}
}

/** Junta duas listas JSON (favoritos) sem perder nenhum item; a mais recente ganha nos repetidos. */
function juntarListas(localTxt: string, servidorTxt: string): string {
  try {
    const a = JSON.parse(localTxt);
    const b = JSON.parse(servidorTxt);
    if (!Array.isArray(a) || !Array.isArray(b)) return servidorTxt;
    const chave = (x: any) => (x && typeof x === 'object' ? String(x.id ?? JSON.stringify(x)) : String(x));
    const mapa = new Map<string, any>();
    for (const x of b) mapa.set(chave(x), x);
    for (const x of a) if (!mapa.has(chave(x))) mapa.set(chave(x), x);
    return JSON.stringify(Array.from(mapa.values()));
  } catch {
    return servidorTxt;
  }
}

function enviar(aSair = false) {
  const local = lerLocal();
  // Telemóvel sem nada guardado (ex.: dados apagados): nunca apaga a cópia do servidor
  if (Object.keys(local).length === 0) return;
  const texto = JSON.stringify(local);
  if (texto === ultimoEnviado) return;
  const atualizado = Date.now();
  try { localStorage.setItem(CHAVE_ATUALIZADO, String(atualizado)); } catch {}
  const corpo = JSON.stringify({ atualizado, dados: local });
  if (aSair && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      if (navigator.sendBeacon(URL, new Blob([corpo], { type: 'application/json' }))) ultimoEnviado = texto;
    } catch {}
    return;
  }
  fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true, credentials: 'same-origin' })
    .then((r) => { if (r.ok) ultimoEnviado = texto; })
    .catch(() => {});
}

async function buscarCopia(tentativa = 0): Promise<void> {
  let servidor: { atualizado: number; dados: Record<string, string> } | null = null;
  try {
    const r = await fetch(URL, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (r.ok) servidor = await r.json();
  } catch {}

  if (!servidor) {
    // Sem resposta (sem rede?): tenta mais tarde. Até lá não envia nada, para não
    // estragar a cópia do servidor com um telemóvel que perdeu os dados.
    if (tentativa < 6) setTimeout(() => buscarCopia(tentativa + 1), Math.min(60000, 5000 * 2 ** tentativa));
    return;
  }

  const local = lerLocal();
  const dadosServidor = servidor.dados || {};
  if (Object.keys(dadosServidor).length > 0) {
    const servidorMaisRecente = (servidor.atualizado || 0) > lerAtualizadoLocal();
    let mudou = false;
    try {
      for (const k of CHAVES) {
        const vServidor = dadosServidor[k];
        if (typeof vServidor !== 'string') continue;
        const vLocal = local[k];
        let novo: string | undefined;
        if (vLocal === undefined) novo = vServidor; // o telemóvel perdeu isto: repõe
        else if (servidorMaisRecente && vLocal !== vServidor) {
          // Listas de favoritos: junta as duas (nunca se perde um favorito); o resto: fica o mais recente
          novo = vLocal.trim().startsWith('[') ? juntarListas(vLocal, vServidor) : vServidor;
        }
        if (novo !== undefined && novo !== vLocal) {
          localStorage.setItem(k, novo);
          mudou = true;
        }
      }
      if (servidorMaisRecente) localStorage.setItem(CHAVE_ATUALIZADO, String(servidor.atualizado));
    } catch {}
    if (mudou) avisarApp();
  }
  ultimoEnviado = JSON.stringify(dadosServidor) === JSON.stringify(lerLocal()) ? JSON.stringify(lerLocal()) : null;

  // A partir daqui, qualquer mudança nos favoritos é copiada para o servidor
  enviar();
  setInterval(() => enviar(), 4000);
  window.addEventListener('parou_favorites_updated', () => setTimeout(() => enviar(), 300));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviar(true); });
  window.addEventListener('pagehide', () => enviar(true));
}

/** Chamar uma vez ao abrir a app. */
export function iniciarCopiaDados() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  // Pede ao browser para não apagar os dados desta app quando falta espaço
  try { (navigator as any).storage?.persist?.().catch?.(() => {}); } catch {}
  buscarCopia();
}
