// Bússola do telemóvel: para onde o telemóvel aponta (graus a partir do norte, no sentido do relógio).
// Usado para desenhar o "cone" de direção junto ao ponto da tua posição no mapa.
// - Android: evento "deviceorientationabsolute" (referido ao norte magnético).
// - iPhone: "webkitCompassHeading"; o Safari só dá acesso depois de a pessoa permitir (tem de vir de um toque).
// Se o aparelho não tem sensor, ou a pessoa não permite, simplesmente não há cone.

type Ouvinte = (graus: number | null) => void;

const CHAVE_NEGADA = 'parou_bussola_negada';
const ouvintes = new Set<Ouvinte>();
let aOuvir = false;
let rumo: number | null = null; // já suavizado
let ultimoEnvio = 0;

const graus = (rad: number) => (rad * 180) / Math.PI;
const rad = (g: number) => (g * Math.PI) / 180;
const normalizar = (g: number) => ((g % 360) + 360) % 360;

function anguloDoEcra(): number {
  const a = typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number'
    ? screen.orientation.angle
    : Number((window as any).orientation) || 0;
  return normalizar(a);
}

/** Rumo da frente do telemóvel, ou null se o evento não traz norte. */
function rumoDoEvento(e: DeviceOrientationEvent): number | null {
  const iphone = (e as any).webkitCompassHeading;
  let r: number | null = null;
  if (typeof iphone === 'number' && Number.isFinite(iphone)) {
    r = iphone; // o iPhone já corrige a inclinação
  } else if (e.alpha != null && e.beta != null && e.gamma != null && (e.absolute || e.type === 'deviceorientationabsolute')) {
    const { alpha, beta, gamma } = e;
    if (Math.abs(beta) < 30) {
      // Telemóvel quase deitado: aponta a parte de cima do telemóvel
      r = normalizar(360 - alpha);
    } else {
      // Telemóvel de pé ou inclinado: aponta a traseira (compensa a inclinação)
      const x = rad(beta), y = rad(gamma), z = rad(alpha);
      const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
      const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
      if (vx === 0 && vy === 0) return null;
      r = normalizar(graus(Math.atan2(vx, vy)));
    }
  }
  if (r === null) return null;
  const ecra = anguloDoEcra();
  if (ecra === 180) r = normalizar(r + 180);
  else if (ecra !== 0) return null; // deitado de lado: sem cone (em vez de apontar para o lado errado)
  return r;
}

function aoOrientar(e: Event) {
  const novo = rumoDoEvento(e as DeviceOrientationEvent);
  if (novo === null) return;
  // Suavização circular, para o cone não tremer
  if (rumo === null) rumo = novo;
  else {
    let d = novo - rumo;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    rumo = normalizar(rumo + d * 0.3);
  }
  const agora = Date.now();
  if (agora - ultimoEnvio < 70) return;
  ultimoEnvio = agora;
  ouvintes.forEach((f) => { try { f(rumo); } catch {} });
}

function comecar() {
  if (aOuvir || typeof window === 'undefined') return;
  aOuvir = true;
  // O evento "absoluto" (Android) vem referido ao norte; se não existir, o normal (iPhone traz webkitCompassHeading)
  window.addEventListener('deviceorientationabsolute', aoOrientar as EventListener, true);
  window.addEventListener('deviceorientation', aoOrientar as EventListener, true);
}

export function bussolaSuportada(): boolean {
  return typeof window !== 'undefined' && ('DeviceOrientationEvent' in window);
}

function precisaDePermissao(): boolean {
  return typeof (window as any).DeviceOrientationEvent?.requestPermission === 'function';
}

/**
 * Liga a bússola. No iPhone tem de ser chamada a partir de um toque (pede autorização uma vez).
 * No Android liga logo. Devolve se ficou ligada.
 */
export async function ligarBussola(): Promise<boolean> {
  if (!bussolaSuportada()) return false;
  // Ouvir não custa nada e não pede nada: no iPhone os eventos só começam depois da licença,
  // no Chrome (que também tem requestPermission) chegam logo
  comecar();
  if (precisaDePermissao()) {
    try {
      try { if (localStorage.getItem(CHAVE_NEGADA) === '1') return rumo !== null; } catch {}
      const r = await (window as any).DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') {
        try { localStorage.setItem(CHAVE_NEGADA, '1'); } catch {}
        return false;
      }
    } catch {
      return rumo !== null; // sem toque da pessoa, o iPhone recusa: tenta-se no próximo toque
    }
    comecar();
  }
  return true;
}

/** Avisa quando o rumo muda (null = sem bússola). Liga logo a ouvir (só o iPhone precisa de licença, pedida num toque). */
export function observarRumo(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  // Antes só ligava quando o browser NÃO tinha requestPermission; o Chrome passou a ter essa função
  // e o cone deixou de aparecer. Agora liga sempre: onde falta licença (iPhone) simplesmente não chegam eventos.
  if (bussolaSuportada()) comecar();
  if (rumo !== null) cb(rumo);
  return () => { ouvintes.delete(cb); };
}

export function rumoAtual(): number | null {
  return rumo;
}
