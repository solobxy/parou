// Diagnóstico da localização (26/11/2026: «A localizar…» sem fim num Android real, que não se reproduz em simulação).
// Regista os pedidos ao GPS e as respostas (só tempos, tipo de pedido e código de erro — nunca a posição) e, se a app
// ficar presa a pedir a localização, manda um resumo ao servidor (uma vez por visita), pelo canal dos erros do browser.
import { reportarErro } from '../components/ProtecaoErros';

interface Evento { t: number; e: string }
const eventos: Evento[] = [];
const inicio = typeof performance !== 'undefined' ? performance.now() : 0;
const marca = (e: string) => {
  eventos.push({ t: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - inicio), e });
  if (eventos.length > 80) eventos.shift();
};
let enviado = false;

/** Embrulha o GPS do browser para registar cada pedido e cada resposta (chamar uma vez, antes de a app pedir a posição) */
export function ligarDiagnosticoGps(): void {
  try {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    const g: any = navigator.geolocation;
    if (!g || g.__diag) return;
    const gcp = g.getCurrentPosition.bind(g);
    const wp = g.watchPosition.bind(g);
    const cw = g.clearWatch.bind(g);
    const tipo = (o?: PositionOptions) => `${o?.enableHighAccuracy ? 'H' : 'L'}${o?.timeout ? `/${Math.round(o.timeout / 1000)}s` : ''}`;
    let n = 0;
    g.getCurrentPosition = (ok: PositionCallback, err?: PositionErrorCallback | null, o?: PositionOptions) => {
      const id = ++n;
      marca(`g${id}:${tipo(o)}`);
      return gcp((p: GeolocationPosition) => { marca(`g${id}:ok:${Math.round(p.coords.accuracy)}m`); ok(p); },
        (x: GeolocationPositionError) => { marca(`g${id}:erro${x.code}`); err?.(x); }, o);
    };
    g.watchPosition = (ok: PositionCallback, err?: PositionErrorCallback | null, o?: PositionOptions) => {
      const id = ++n;
      let primeiras = 0;
      marca(`w${id}:${tipo(o)}`);
      const r = wp((p: GeolocationPosition) => { if (primeiras++ < 3) marca(`w${id}:ok:${Math.round(p.coords.accuracy)}m`); ok(p); },
        (x: GeolocationPositionError) => { marca(`w${id}:erro${x.code}`); err?.(x); }, o);
      marca(`w${id}=#${r}`);
      return r;
    };
    g.clearWatch = (id: number) => { marca(`x#${id}`); cw(id); };
    g.__diag = true;
    // A página escondeu-se ou perdeu o foco (ex.: a barra das definições rápidas por cima)? Fica no registo; e, de volta,
    // se a localização continua parada, manda-se o estado
    document.addEventListener('visibilitychange', () => { marca(`vis:${document.visibilityState}`); if (document.visibilityState === 'visible') relatarParada('voltou a ver-se', 3000); });
    window.addEventListener('blur', () => marca('foco:0'));
    window.addEventListener('focus', () => { marca('foco:1'); relatarParada('voltou o foco', 3000); });
  } catch { /* sem diagnóstico */ }
}

/** Junta ao registo um acontecimento da app (ex.: a autorização que o browser diz ter: «perm:prompt») */
export function notaGps(e: string): void {
  marca(e);
  // a autorização mudou com a localização parada: se a app não reagir, o registo seguinte mostra-o
  if (e.startsWith('perm:')) relatarParada('a autorização mudou', 3000);
}

// Localização parada com o ecrã à vista: manda o estado exato (26/11/2026: num telemóvel real a app ficava no convite com
// a localização já ligada e nenhum registo chegava ao servidor). Só estado técnico e tempos, nunca a posição. No máximo
// 3 por visita.
let contexto: () => string = () => '';
/** A app diz como se lê o que está guardado no telemóvel (já deu a localização? desligou-a na app?) */
export function contextoGps(f: () => string): void {
  contexto = f;
}
let relatosParada = 0;
let esperaParada: ReturnType<typeof setTimeout> | null = null;
function relatarParada(motivo: string, espera: number): void {
  if (!paradaDesde || relatosParada >= 3 || esperaParada) return;
  esperaParada = setTimeout(async () => {
    esperaParada = null;
    // entretanto ligou-se: não há nada para contar
    if (!paradaDesde || typeof document === 'undefined') return;
    relatosParada++;
    let perm = '?';
    try { perm = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state || '?'; } catch { /* sem Permissions API */ }
    let foco = '?';
    try { foco = document.hasFocus() ? '1' : '0'; } catch { /* sem foco */ }
    let ctx = '';
    try { ctx = contexto(); } catch { /* sem contexto */ }
    reportarErro('gps', `parada há ${Math.round((Date.now() - paradaDesde) / 1000)} s (${motivo}) | permissão ${perm} | ${document.visibilityState} | foco ${foco} | ${ctx}`, eventos.slice(-45).map((x) => `${x.t}:${x.e}`).join(' '));
  }, espera);
}

let desdePedir = 0;
let mudancas: number[] = [];
// Desde quando a localização está parada (convite, recusada ou sem sinal; 0 = não está) e quanto tempo esteve parada
// até a app começar a pedi-la (a espera pelo GPS não conta como «parada»)
let paradaDesde = 0;
let paradaMs = 0;
let avisouLigouSozinha = false;
/** O estado da localização na app mudou: regista e vê se ficou presa a pedir */
export function estadoGps(estado: string, motivo?: string | null): void {
  marca(`st:${estado}${motivo ? `/${motivo}` : ''}`);
  const agora = Date.now();
  // A localização esteve parada mais de 2 s e passou a ativa (a pessoa ligou-a no telemóvel, ou tocou no botão): 5 s depois
  // manda o registo, uma vez por visita, para se medir em telemóveis reais quanto demora cada passo (a simulação não o mostra).
  if (estado === 'idle' || estado === 'denied' || estado === 'unavailable') {
    if (!paradaDesde) paradaDesde = agora;
    paradaMs = 0;
    relatarParada('ao abrir ou ao parar', 4000);
  } else if (estado === 'requesting') {
    if (paradaDesde && !paradaMs) paradaMs = agora - paradaDesde;
  } else if (estado === 'active') {
    const esteve = paradaDesde ? (paradaMs || agora - paradaDesde) : 0;
    let toque = false;
    try { toque = (navigator as any).userActivation?.isActive === true; } catch { /* browser sem userActivation */ }
    if (esteve > 2000 && !avisouLigouSozinha) {
      avisouLigouSozinha = true;
      setTimeout(() => {
        const vis = typeof document !== 'undefined' ? document.visibilityState : '?';
        reportarErro('gps', `ligou depois de ${Math.round(esteve / 1000)} s parada | toque ${toque ? 1 : 0} | ${vis}`, eventos.slice(-45).map((x) => `${x.t}:${x.e}`).join(' '));
      }, 5000);
    }
    paradaDesde = 0;
    paradaMs = 0;
  }
  mudancas = [...mudancas.filter((x) => agora - x < 30_000), agora];
  if (estado === 'requesting') { if (!desdePedir) desdePedir = agora; } else desdePedir = 0;
  if (mudancas.length >= 8) enviar('muitas mudanças de estado em 30 s');
}

/** Chamado de tempos a tempos: a pedir há mais de 15 s sem resposta */
export function vigiarGps(): void {
  if (desdePedir && Date.now() - desdePedir > 15_000) enviar('a pedir a localização há mais de 15 s');
}

async function enviar(motivo: string): Promise<void> {
  if (enviado) return;
  enviado = true;
  let perm = '?';
  try { perm = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state || '?'; } catch { /* sem Permissions API */ }
  const vis = typeof document !== 'undefined' ? document.visibilityState : '?';
  reportarErro('gps', `${motivo} | permissão ${perm} | ${vis}`, eventos.map((x) => `${x.t}:${x.e}`).join(' '));
}
